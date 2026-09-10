'use server'

import { db } from '@/lib/db'
import { dailyRecords, students, classes, gradeLevels } from '@/lib/db/schema'
import { and, eq, inArray } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getAdminAccess, canEditGrade } from '@/lib/admin-access'
import { logAudit } from '@/lib/audit'
import { today, isValidDateString, formatDateAr, ATTENDANCE_STATUS } from '@/lib/utils'
import { attendancePointsFor } from '@/lib/points'
import { notify, notifiedTodayFor } from '@/lib/notifications'

export type AttendanceStatus = keyof typeof ATTENDANCE_STATUS
const STATUSES = Object.keys(ATTENDANCE_STATUS) as AttendanceStatus[]
const isOut = (s: string | null | undefined) => s === 'absent' || s === 'excused'

export type Correction = { studentId: string; status: AttendanceStatus }

export type CorrectResult =
  | { ok: true; changed: number; unchanged: number; notified: number }
  | { ok: false; error: string }

/**
 * The administration's last word on a day's register.
 *
 * Teachers share one attendance status per pupil per day, and the first
 * teacher to record an absence owns it; a colleague can only turn it into a
 * late arrival. That leaves one hole: a wrong mark by a teacher who is not
 * around, or a family's excuse arriving at the office. This is that hole. It
 * writes over any lock, so it is limited to accounts allowed to edit the
 * stage, needs a written reason, and leaves a line in the audit log naming
 * every pupil and what changed. An absence set here is owned by the
 * administrator: no teacher can undo it, only record the pupil arriving late.
 */
export async function correctAttendance(
  classId: string,
  date: string,
  changes: Correction[],
  reason: string,
): Promise<CorrectResult> {
  const access = await getAdminAccess()
  if (!access) return { ok: false, error: 'غير مصرح لك بهذا الإجراء' }
  if (!isValidDateString(date)) return { ok: false, error: 'تاريخ غير صالح' }
  if (date > today()) return { ok: false, error: 'لا يمكن تصحيح يوم لم يأتِ بعد' }

  const reasonText = String(reason ?? '').trim().slice(0, 300)
  if (!reasonText) return { ok: false, error: 'سبب التصحيح مطلوب — يُحفظ في سجل التدقيق' }

  const [cls] = await db
    .select({ id: classes.id, name: classes.name, gradeLevelId: classes.gradeLevelId, schoolId: classes.schoolId, gradeName: gradeLevels.name })
    .from(classes)
    .leftJoin(gradeLevels, eq(gradeLevels.id, classes.gradeLevelId))
    .where(eq(classes.id, classId))
    .limit(1)
  if (!cls || cls.schoolId !== access.school.id) return { ok: false, error: 'الفصل غير موجود' }
  if (!canEditGrade(access, cls.gradeLevelId)) return { ok: false, error: 'ليس لديك صلاحية التعديل على هذه المرحلة' }

  // Only well-formed entries, one per pupil, and only pupils really in this class.
  const wanted = new Map<string, AttendanceStatus>()
  for (const c of Array.isArray(changes) ? changes : []) {
    if (c && typeof c.studentId === 'string' && STATUSES.includes(c.status)) wanted.set(c.studentId, c.status)
  }
  if (wanted.size === 0) return { ok: true, changed: 0, unchanged: 0, notified: 0 }

  const pupils = await db
    .select({ id: students.id, fullName: students.fullName, parentUserId: students.parentUserId })
    .from(students)
    .where(and(eq(students.schoolId, access.school.id), eq(students.classId, classId), inArray(students.id, [...wanted.keys()])))
  if (pupils.length === 0) return { ok: false, error: 'لا يوجد طالب من هؤلاء في هذا الفصل' }

  const { getSchoolSettings } = await import('../settings/actions-settings')
  const settings = await getSchoolSettings(access.school.id)

  const existing = await db
    .select({ studentId: dailyRecords.studentId, attendanceStatus: dailyRecords.attendanceStatus })
    .from(dailyRecords)
    .where(and(eq(dailyRecords.classId, classId), eq(dailyRecords.date, date), inArray(dailyRecords.studentId, pupils.map((p) => p.id))))
  const previous = new Map(existing.map((r) => [r.studentId, r.attendanceStatus]))

  const now = new Date()
  const applied: { id: string; fullName: string; parentUserId: string | null; from: string | null; to: AttendanceStatus }[] = []
  let unchanged = 0
  for (const p of pupils) {
    const to = wanted.get(p.id)!
    const from = previous.get(p.id) ?? null
    if (from === to) { unchanged++; continue }
    applied.push({ id: p.id, fullName: p.fullName, parentUserId: p.parentUserId, from, to })
  }
  if (applied.length === 0) return { ok: true, changed: 0, unchanged, notified: 0 }

  // One statement, no lock condition: the administration overrides the lock,
  // and takes ownership of any absence it writes.
  await db
    .insert(dailyRecords)
    .values(applied.map((a) => ({
      schoolId: access.school.id,
      classId,
      studentId: a.id,
      teacherUserId: access.userId,
      date,
      attendanceStatus: a.to,
      pointsEarned: attendancePointsFor({ attendanceStatus: a.to, date }, settings),
      absenceMarkedBy: isOut(a.to) ? access.userId : null,
      absenceMarkedAt: isOut(a.to) ? now : null,
    })))
    .onConflictDoUpdate({
      target: [dailyRecords.studentId, dailyRecords.classId, dailyRecords.date],
      set: {
        teacherUserId: access.userId,
        attendanceStatus: sqlExcluded('attendance_status'),
        pointsEarned: sqlExcluded('points_earned'),
        absenceMarkedBy: sqlExcluded('absence_marked_by'),
        absenceMarkedAt: sqlExcluded('absence_marked_at'),
        updatedAt: now,
      },
    })

  const label = (s: string | null) => (s ? ATTENDANCE_STATUS[s as AttendanceStatus]?.label ?? s : 'غير مسجَّل')
  await logAudit(access, 'admin.attendance.correct', `${cls.gradeName ? `${cls.gradeName} — ` : ''}فصل ${cls.name} — ${date}`, {
    classId,
    date,
    count: applied.length,
    changes: applied.map((a) => `${a.fullName}: من ${label(a.from)} إلى ${label(a.to)}`).join('، '),
    reason: reasonText,
  })

  // The same two promises the teachers' save keeps: a family hears a plain
  // absence once, from the school first, and hears the correction if it had
  // been told. Only for today — news about an earlier day helps nobody.
  let notified = 0
  if (date === today()) {
    const newlyAbsent = applied.filter((a) => a.to === 'absent' && !isOut(a.from) && !!a.parentUserId)
    const backIn = applied.filter((a) => isOut(a.from) && !isOut(a.to) && !!a.parentUserId)
    const alreadyTold = await notifiedTodayFor(access.school.id, 'absence', newlyAbsent.map((a) => a.id))
    const told = await notifiedTodayFor(access.school.id, 'absence', backIn.map((a) => a.id))
    const corrected = await notifiedTodayFor(access.school.id, 'attendance_corrected', backIn.map((a) => a.id))
    notified = await notify([
      ...newlyAbsent
        .filter((a) => !alreadyTold.has(a.id))
        .map((a) => ({
          schoolId: access.school.id,
          recipientUserId: a.parentUserId!,
          kind: 'absence' as const,
          title: `غياب: ${a.fullName}`,
          body: `تم تسجيل غياب ${a.fullName} اليوم ${formatDateAr(date)}. إن كان هناك عذر فيرجى التواصل مع المدرسة.`,
          href: '/parent',
          entityId: a.id,
          actorName: access.name,
        })),
      ...backIn
        .filter((a) => told.has(a.id) && !corrected.has(a.id))
        .map((a) => ({
          schoolId: access.school.id,
          recipientUserId: a.parentUserId!,
          kind: 'attendance_corrected' as const,
          title: a.to === 'late' ? `وصول متأخر: ${a.fullName}` : `تصحيح: ${a.fullName} حاضر اليوم`,
          body: a.to === 'late'
            ? `وصل ${a.fullName} إلى المدرسة اليوم ${formatDateAr(date)} متأخراً، وعُدِّل تسجيل الغياب السابق إلى «حاضر (متأخر)».`
            : `عُدِّل تسجيل غياب ${a.fullName} اليوم ${formatDateAr(date)}: الطالب حاضر، ونعتذر عن الإشعار السابق.`,
          href: '/parent',
          entityId: a.id,
          actorName: access.name,
        })),
    ])
  }

  revalidatePath('/admin/attendance')
  revalidatePath('/admin')
  return { ok: true, changed: applied.length, unchanged, notified }
}

// Drizzle's `excluded.<column>` reference for an upsert, kept out of the
// statement above so the column list reads as a list.
import { sql } from 'drizzle-orm'
function sqlExcluded(column: string) {
  return sql.raw(`excluded.${column}`)
}
