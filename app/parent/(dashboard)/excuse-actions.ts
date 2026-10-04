'use server'

import { db } from '@/lib/db'
import { absenceExcuses, students, dailyRecords, classes } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getUnlockedParent } from '@/lib/parent-access'
import { staffCoveringGrade } from '@/lib/counselor-access'
import { notify, wholeSchoolManagers } from '@/lib/notifications'
import { today, isValidDateString, formatDayGregorianAr, dayCountAr, arabicDigits, isUuid } from '@/lib/utils'
import { shiftDate } from '@/lib/school-days'
import { EXCUSE_WINDOW_DAYS, EXCUSE_MAX_LENGTH, EXCUSE_MIN_LENGTH } from '@/lib/excuse-rules'

export type SubmitExcuseResult = { ok: true } | { ok: false; error: string }

/**
 * A family's reason for a day their child was marked absent.
 *
 * The absence notice asks for the excuse and this is where it is given: on
 * the absent day itself, in the parent's own words, to whoever runs the
 * child's stage. Nothing on the register changes here — the day stays a plain
 * absence until the office accepts.
 *
 * Only a day the register holds as «غائب» can be excused: a day already
 * marked «إذن» needs nothing, and a day the child attended has nothing to
 * explain. Until the office answers, sending again rewrites the same excuse;
 * once it has answered, that answer stands.
 */
export async function submitAbsenceExcuse(
  studentId: string,
  date: string,
  reason: string,
): Promise<SubmitExcuseResult> {
  const parent = await getUnlockedParent()
  if (!parent) return { ok: false, error: 'انتهت الجلسة، سجّل الدخول من جديد' }

  if (!isValidDateString(date)) return { ok: false, error: 'تاريخ غير صالح' }
  const todayStr = today()
  if (date > todayStr) return { ok: false, error: 'لا يمكن تقديم عذر ليوم لم يأتِ بعد' }
  if (date < shiftDate(todayStr, -EXCUSE_WINDOW_DAYS)) {
    return {
      ok: false,
      error: `مضى على هذا الغياب أكثر من ${dayCountAr(EXCUSE_WINDOW_DAYS)} — يُرجى التواصل مع المدرسة مباشرة`,
    }
  }

  const text = String(reason ?? '').trim()
  if (text.length < EXCUSE_MIN_LENGTH) return { ok: false, error: 'اكتب سبب الغياب' }
  if (text.length > EXCUSE_MAX_LENGTH) {
    return { ok: false, error: `سبب الغياب طويل — الحد الأقصى لعدد الأحرف: ${arabicDigits(EXCUSE_MAX_LENGTH)}` }
  }

  // The id comes from the browser; the pupil counts only if it is this parent's.
  if (!isUuid(studentId)) return { ok: false, error: 'الطالب غير موجود في حسابك' }
  const [pupil] = await db
    .select({ id: students.id, fullName: students.fullName, schoolId: students.schoolId, status: students.status })
    .from(students)
    .where(and(eq(students.id, studentId), eq(students.parentUserId, parent.id)))
    .limit(1)
  if (!pupil || pupil.status !== 'active') return { ok: false, error: 'الطالب غير موجود في حسابك' }

  const register = await db
    .select({ classId: dailyRecords.classId, status: dailyRecords.attendanceStatus })
    .from(dailyRecords)
    .where(and(eq(dailyRecords.studentId, pupil.id), eq(dailyRecords.date, date)))
  const absence = register.find((r) => r.status === 'absent')
  if (!absence) {
    return {
      ok: false,
      error: register.some((r) => r.status === 'excused')
        ? 'غياب هذا اليوم مسجَّل بعذر من قبل — لا حاجة إلى تقديم عذر'
        : 'لا يوجد غياب مسجَّل للطالب في هذا اليوم',
    }
  }

  const [existing] = await db
    .select({ status: absenceExcuses.status })
    .from(absenceExcuses)
    .where(and(eq(absenceExcuses.studentId, pupil.id), eq(absenceExcuses.date, date)))
    .limit(1)
  if (existing && existing.status !== 'pending') return { ok: false, error: 'سبق الرد على عذر هذا اليوم' }

  // One statement, and the database holds the rule: the office can answer
  // between the read above and this write, and a rewrite arriving after the
  // answer must not reopen it. No row back means exactly that happened.
  const [saved] = await db
    .insert(absenceExcuses)
    .values({
      schoolId: pupil.schoolId,
      studentId: pupil.id,
      classId: absence.classId,
      parentUserId: parent.id,
      date,
      reason: text,
    })
    .onConflictDoUpdate({
      target: [absenceExcuses.studentId, absenceExcuses.date],
      set: { reason: text },
      setWhere: eq(absenceExcuses.status, 'pending'),
    })
    .returning({ id: absenceExcuses.id })
  if (!saved) return { ok: false, error: 'سبق الرد على عذر هذا اليوم' }

  // The office hears about an excuse once. A rewrite changes what they will
  // read when they open it, and a bell for every corrected word would teach
  // them to stop looking.
  if (!existing) {
    const [cls] = await db
      .select({ gradeLevelId: classes.gradeLevelId })
      .from(classes)
      .where(eq(classes.id, absence.classId))
      .limit(1)
    // Whoever runs the stage and can act on it; when nobody has been given
    // the stage yet, the people who answer for the whole school.
    const covering = (await staffCoveringGrade(pupil.schoolId, cls?.gradeLevelId ?? null)).map((s) => s.userId)
    const recipients = covering.length > 0 ? covering : await wholeSchoolManagers(pupil.schoolId)

    await notify(
      [...new Set(recipients)].map((userId) => ({
        schoolId: pupil.schoolId,
        recipientUserId: userId,
        kind: 'excuse_submitted' as const,
        title: 'عذر غياب من ولي أمر',
        body: `${pupil.fullName} — ${formatDayGregorianAr(date)}: ${text.slice(0, 200)}`,
        href: '/admin/excuses',
        entityId: pupil.id,
        // The account's own name says nothing about whose parent this is.
        actorName: `ولي أمر ${pupil.fullName}`,
      })),
    )
  }

  revalidatePath('/parent', 'layout')
  return { ok: true }
}
