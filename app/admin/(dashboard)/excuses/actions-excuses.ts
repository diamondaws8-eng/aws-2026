'use server'

import { db } from '@/lib/db'
import { absenceExcuses, students, classes, dailyRecords } from '@/lib/db/schema'
import { and, eq, inArray } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getAdminAccess, canEditGrade } from '@/lib/admin-access'
import { logAudit } from '@/lib/audit'
import { notify } from '@/lib/notifications'
import { attendancePointsFor } from '@/lib/points'
import { formatRangeAr, isUuid } from '@/lib/utils'

export type DecideExcuseResult =
  /** `excused` = the register now holds the day as «إذن». false = the answer was recorded, the register left as it was. */
  | { ok: true; excused: boolean }
  /** `changed` = the family rewrote the excuse after the page was opened; reload and read it. */
  | { ok: false; error: string; changed?: boolean }

const REWRITTEN = 'عدّل ولي الأمر نص العذر بعد فتح هذه الصفحة — اقرأ النص الجديد ثم ردّ عليه'

/**
 * The office's answer to a family's excuse.
 *
 * Accepting is a correction of the register — the one the attendance screen
 * already makes by hand, absent to «إذن» — so it asks for the same right, edit
 * access to the stage, and writes the day the same way: the administrator
 * becomes the owner of the absence, and no teacher can undo it. The excuse and
 * the register change together or not at all; a day excused with the excuse
 * still reading «قيد المراجعة» would be answered twice.
 *
 * Declining changes nothing on the register, and must say why: the note is the
 * only thing the family is told.
 *
 * `seenReason` is the text the card showed. A family may rewrite an excuse
 * until it is answered, and the office is not rung for a rewrite — so without
 * it an answer could land on words nobody at the school had read, and an
 * answer is final.
 */
export async function decideAbsenceExcuse(
  id: string,
  accept: boolean,
  note: string,
  seenReason: string,
): Promise<DecideExcuseResult> {
  const access = await getAdminAccess()
  if (!access) return { ok: false, error: 'غير مصرح لك بهذا الإجراء' }
  if (!isUuid(id)) return { ok: false, error: 'العذر غير موجود' }
  const accepted = accept === true

  const [excuse] = await db
    .select()
    .from(absenceExcuses)
    .where(and(eq(absenceExcuses.id, id), eq(absenceExcuses.schoolId, access.school.id)))
    .limit(1)
  if (!excuse) return { ok: false, error: 'العذر غير موجود' }

  const [pupil] = await db
    .select({ fullName: students.fullName, classId: students.classId, parentUserId: students.parentUserId })
    .from(students)
    .where(and(eq(students.id, excuse.studentId), eq(students.schoolId, access.school.id)))
    .limit(1)
  if (!pupil) return { ok: false, error: 'الطالب لم يعد مسجَّلاً في المدرسة' }

  // The stage of the class the pupil was absent from. A class deleted since
  // leaves the pupil's present class to answer; with neither there is no
  // stage to hold a right over, and only somebody who edits every stage may
  // decide. The office list resolves the stage the same way.
  const classIds = [excuse.classId, pupil.classId].filter((v): v is string => !!v)
  const classRows = classIds.length
    ? await db
        .select({ id: classes.id, gradeLevelId: classes.gradeLevelId })
        .from(classes)
        .where(and(eq(classes.schoolId, access.school.id), inArray(classes.id, classIds)))
    : []
  const gradeOf = (classId: string | null) => classRows.find((c) => c.id === classId)?.gradeLevelId ?? null
  const gradeLevelId = gradeOf(excuse.classId) ?? gradeOf(pupil.classId)
  if (!canEditGrade(access, gradeLevelId)) return { ok: false, error: 'ليس لديك صلاحية التعديل على هذه المرحلة' }

  if (excuse.status !== 'pending') return { ok: false, error: 'سبق الرد على هذا العذر' }
  if (excuse.reason !== seenReason) return { ok: false, error: REWRITTEN, changed: true }

  const noteText = String(note ?? '').trim().slice(0, 300)
  if (!accepted && !noteText) return { ok: false, error: 'اكتب سبب عدم القبول — يصل لولي الأمر' }

  // What an excused day is worth at this school. Read before the transaction
  // opens, so it holds its connection for the writes alone.
  const { getSchoolSettings } = await import('../settings/actions-settings')
  const excusedPoints = accepted
    ? attendancePointsFor({ attendanceStatus: 'excused', date: excuse.date }, await getSchoolSettings(access.school.id))
    : 0

  const now = new Date()
  const outcome = await db.transaction(async (tx) => {
    // Conditional on still being pending: two people can press at the same
    // moment, and the family must get one answer.
    const [mine] = await tx
      .update(absenceExcuses)
      .set({
        status: accepted ? 'accepted' : 'rejected',
        decidedByUserId: access.userId,
        decidedByName: access.name,
        decidedAt: now,
        decisionNote: noteText || null,
      })
      // …and on still saying what was read: a rewrite can arrive between the
      // check above and this line.
      .where(and(
        eq(absenceExcuses.id, excuse.id),
        eq(absenceExcuses.status, 'pending'),
        eq(absenceExcuses.reason, excuse.reason),
      ))
      .returning({ id: absenceExcuses.id })
    if (!mine) return null
    if (!accepted) return { excused: false }

    const day = and(
      eq(dailyRecords.schoolId, access.school.id),
      eq(dailyRecords.studentId, excuse.studentId),
      eq(dailyRecords.date, excuse.date),
    )
    // Only a day still held as a plain absence. The pupil was already out of
    // school, so the lesson rows were cleared when the absence was written
    // and there is nothing more to clear.
    const turned = await tx
      .update(dailyRecords)
      .set({
        teacherUserId: access.userId,
        attendanceStatus: 'excused',
        pointsEarned: excusedPoints,
        absenceMarkedBy: access.userId,
        absenceMarkedAt: now,
        updatedAt: now,
      })
      .where(and(day, eq(dailyRecords.attendanceStatus, 'absent')))
      .returning({ id: dailyRecords.id })
    if (turned.length > 0) return { excused: true }

    // Somebody corrected the day before the excuse was answered. The register
    // is theirs and stays as they left it; the family is told the day is
    // excused only if that is what it now says.
    const [already] = await tx
      .select({ id: dailyRecords.id })
      .from(dailyRecords)
      .where(and(day, eq(dailyRecords.attendanceStatus, 'excused')))
      .limit(1)
    return { excused: !!already }
  })
  if (!outcome) {
    const [current] = await db
      .select({ status: absenceExcuses.status })
      .from(absenceExcuses)
      .where(eq(absenceExcuses.id, excuse.id))
      .limit(1)
    return current?.status === 'pending'
      ? { ok: false, error: REWRITTEN, changed: true }
      : { ok: false, error: 'سبق الرد على هذا العذر' }
  }

  await logAudit(access, accepted ? 'excuse.accept' : 'excuse.reject', pupil.fullName, {
    date: excuse.date,
    reason: excuse.reason.slice(0, 200),
    note: noteText,
  })

  if (pupil.parentUserId) {
    const when = formatRangeAr(excuse.date, excuse.date)
    await notify([{
      schoolId: access.school.id,
      recipientUserId: pupil.parentUserId,
      kind: 'excuse_decided',
      title: accepted ? 'قُبل عذر الغياب' : 'لم يُقبل عذر الغياب',
      body: accepted
        ? `قُبل عذر غياب ${pupil.fullName} ${when}${outcome.excused ? ' وسُجِّل الغياب بعذر' : ''}.${noteText ? ` رد المدرسة: ${noteText}` : ''}`
        : `لم يُقبل عذر غياب ${pupil.fullName} ${when}. رد المدرسة: ${noteText}`,
      href: `/parent?child=${excuse.studentId}`,
      entityId: excuse.studentId,
      actorName: access.name,
    }])
  }

  revalidatePath('/admin/excuses')
  revalidatePath('/admin/attendance')
  return { ok: true, excused: outcome.excused }
}
