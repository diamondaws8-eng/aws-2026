'use server'

import { db } from '@/lib/db'
import { classes, gradeLevels, subjects, teachers, timetableSlots } from '@/lib/db/schema'
import { and, eq, inArray, ne } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getAdminAccess, canEditGrade } from '@/lib/admin-access'
import { logAudit } from '@/lib/audit'
import { isUuid } from '@/lib/utils'
import {
  MAX_PERIODS, WEEKDAY_NAMES, isPeriod, isTimetableWeekday, periodName, slotsFingerprint, type SlotInput,
} from '@/lib/timetable-rules'

export type SaveTimetableResult =
  /** `clashes` are teachers the saved week puts in two classes at once — said, not refused. */
  | { ok: true; saved: number; clashes: string[] }
  /** `stale` = the stored week is no longer the one this editor opened. */
  | { ok: false; error: string; stale?: boolean }

/**
 * One class's whole week, written in one go.
 *
 * The editor sends every cell it shows, and what is stored afterwards is
 * exactly that: the class's old rows go and the new ones take their place in
 * one transaction, so a half-saved week — Monday from the new timetable,
 * Tuesday from the old — cannot exist. Sending an empty list clears the
 * timetable, and the class then behaves as it did before it had one.
 *
 * Whoever may edit the class's stage may write its timetable: the stage's
 * principal or deputy, or anybody above them.
 *
 * A teacher placed in two classes in the same lesson is reported back rather
 * than refused. It is nearly always a slip — but two classes joined for one
 * lesson is a real thing a school does, and the timetable is the school's to
 * state.
 *
 * `openedWith` is the fingerprint of the week the editor loaded (or last
 * saved). Because a save replaces the whole week, one made from a tab left
 * open since morning would otherwise wipe out the thirty-five lessons a
 * colleague entered at noon and report «حُفظ: ١ حصة». It is refused instead.
 */
export async function saveClassTimetable(classId: string, slots: SlotInput[], openedWith: string): Promise<SaveTimetableResult> {
  const access = await getAdminAccess()
  if (!access) return { ok: false, error: 'غير مصرح لك بهذا الإجراء' }
  if (!isUuid(classId)) return { ok: false, error: 'الفصل غير موجود' }

  const [cls] = await db
    .select({
      id: classes.id,
      name: classes.name,
      schoolId: classes.schoolId,
      gradeLevelId: classes.gradeLevelId,
      gradeName: gradeLevels.name,
    })
    .from(classes)
    .leftJoin(gradeLevels, eq(gradeLevels.id, classes.gradeLevelId))
    .where(eq(classes.id, classId))
    .limit(1)
  if (!cls || cls.schoolId !== access.school.id) return { ok: false, error: 'الفصل غير موجود' }
  if (!canEditGrade(access, cls.gradeLevelId)) return { ok: false, error: 'ليس لديك صلاحية التعديل على هذه المرحلة' }

  // Only well-formed cells, and one per day and lesson: whatever else arrives
  // is not something the editor could have sent.
  if (!Array.isArray(slots)) return { ok: false, error: 'بيانات الجدول غير صالحة' }
  if (slots.length > MAX_PERIODS * 7) return { ok: false, error: 'بيانات الجدول غير صالحة' }
  const wanted = new Map<string, { weekday: number; period: number; subjectId: string }>()
  for (const s of slots) {
    if (!s || !isTimetableWeekday(s.weekday) || !isPeriod(s.period) || !isUuid(s.subjectId)) {
      return { ok: false, error: 'في الجدول خانة غير صالحة — حدِّث الصفحة وأعد المحاولة' }
    }
    wanted.set(`${s.weekday}|${s.period}`, { weekday: s.weekday, period: s.period, subjectId: s.subjectId })
  }

  // A lesson is one of this class's own subjects. An id from another class
  // would hand that class's teacher a lesson in a room they do not teach.
  const classSubjects = await db
    .select({ id: subjects.id, name: subjects.name, teacherUserId: subjects.teacherUserId })
    .from(subjects)
    .where(eq(subjects.classId, classId))
  const subjectOf = new Map(classSubjects.map((s) => [s.id, s]))
  for (const cell of wanted.values()) {
    if (!subjectOf.has(cell.subjectId)) {
      return { ok: false, error: 'في الجدول مادة ليست من مواد هذا الفصل — حدِّث الصفحة وأعد المحاولة' }
    }
  }

  const rows = [...wanted.values()].map((cell) => ({ schoolId: access.school.id, classId, ...cell }))
  let stale = false
  try {
    await db.transaction(async (tx) => {
      const current = await tx
        .select({ weekday: timetableSlots.weekday, period: timetableSlots.period, subjectId: timetableSlots.subjectId })
        .from(timetableSlots)
        .where(eq(timetableSlots.classId, classId))
      if (slotsFingerprint(current) !== String(openedWith ?? '')) {
        stale = true
        return
      }
      await tx.delete(timetableSlots).where(eq(timetableSlots.classId, classId))
      if (rows.length) await tx.insert(timetableSlots).values(rows)
    })
  } catch (error) {
    // Two saves landing together: the second insert meets the first one's
    // rows. Nothing of this save was kept — say so, rather than throw.
    console.error('Save Timetable Error:', error)
    return { ok: false, error: 'تعذّر حفظ الجدول — حدِّث الصفحة وأعد المحاولة', stale: true }
  }
  if (stale) {
    return {
      ok: false,
      stale: true,
      error: 'تغيّر جدول هذا الفصل من حساب آخر منذ فتحت الصفحة — حدِّث الصفحة لترى الجدول الحالي، ثم أعد تعديلك',
    }
  }

  // Who is now in two rooms at once. Read after the write, against the rest of
  // the school as it stands.
  const clashes: string[] = []
  const teacherIds = [...new Set(rows.map((r) => subjectOf.get(r.subjectId)?.teacherUserId).filter((v): v is string => !!v))]
  if (teacherIds.length) {
    const [elsewhere, teacherRows] = await Promise.all([
      db
        .select({
          weekday: timetableSlots.weekday,
          period: timetableSlots.period,
          teacherUserId: subjects.teacherUserId,
          className: classes.name,
          gradeName: gradeLevels.name,
        })
        .from(timetableSlots)
        .innerJoin(subjects, eq(subjects.id, timetableSlots.subjectId))
        .innerJoin(classes, eq(classes.id, timetableSlots.classId))
        .leftJoin(gradeLevels, eq(gradeLevels.id, classes.gradeLevelId))
        .where(and(
          eq(timetableSlots.schoolId, access.school.id),
          ne(timetableSlots.classId, classId),
          inArray(subjects.teacherUserId, teacherIds),
        )),
      db
        .select({ userId: teachers.userId, fullName: teachers.fullName })
        .from(teachers)
        .where(inArray(teachers.userId, teacherIds)),
    ])
    const nameOf = new Map(teacherRows.map((t) => [t.userId, t.fullName]))
    for (const r of rows) {
      const teacherUserId = subjectOf.get(r.subjectId)?.teacherUserId
      if (!teacherUserId) continue
      for (const other of elsewhere) {
        if (other.teacherUserId !== teacherUserId || other.weekday !== r.weekday || other.period !== r.period) continue
        clashes.push(
          `${nameOf.get(teacherUserId) ?? 'معلم'}: ${WEEKDAY_NAMES[r.weekday]} ${periodName(r.period)} — له حصة أيضاً في ${other.gradeName ? `${other.gradeName} — ` : ''}${other.className}`,
        )
      }
    }
  }

  await logAudit(access, 'timetable.save', `${cls.gradeName ? `${cls.gradeName} — ` : ''}فصل ${cls.name}`, {
    lessons: rows.length,
    clashes: clashes.length,
  })

  revalidatePath('/admin/timetable')
  revalidatePath('/admin/attendance')
  revalidatePath('/teacher', 'layout')
  return { ok: true, saved: rows.length, clashes }
}
