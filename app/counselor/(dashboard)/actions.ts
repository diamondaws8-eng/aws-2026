'use server'

import { db } from '@/lib/db'
import { behaviorCases, students, schoolStaff, classes, parentWhatsappMessages } from '@/lib/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { requireCounselor, requireCounselorForStudent, getCounselorClassIds } from '@/lib/counselor-access'
import { logCounselorAudit } from '@/lib/audit'
import { today as schoolToday } from '@/lib/utils'

/** A rejected input comes back as a value: a production build strips thrown messages. */
export type CaseResult = { ok: true } | { ok: false; error: string }

const MAX_NOTE = 2000

/** Proves the case is inside this counsellor's stages before it can be read or decided. */
async function requireOwnCase(caseId: string) {
  const access = await requireCounselor()
  const [row] = await db
    .select()
    .from(behaviorCases)
    .where(and(eq(behaviorCases.id, caseId), eq(behaviorCases.schoolId, access.schoolId)))
    .limit(1)
  if (!row) throw new Error('الحالة غير موجودة')

  if (!access.allGrades) {
    const allowed = await getCounselorClassIds(access)
    if (!allowed.includes(row.classId)) throw new Error('هذه الحالة خارج المراحل المسندة إليك')
  }
  return { access, row }
}

/**
 * The deputies this counsellor may hand a case to. A stage can have more than
 * one, so the choice is always explicit — never "the deputy of the stage".
 */
export async function getEscalationTargets(caseId: string) {
  const { access, row } = await requireOwnCase(caseId)

  const [cls] = await db
    .select({ gradeLevelId: classes.gradeLevelId })
    .from(classes)
    .where(eq(classes.id, row.classId))
    .limit(1)

  const staff = await db
    .select({
      userId: schoolStaff.userId,
      fullName: schoolStaff.fullName,
      role: schoolStaff.role,
      allGrades: schoolStaff.allGrades,
      gradeLevelIds: schoolStaff.gradeLevelIds,
    })
    .from(schoolStaff)
    .where(and(
      eq(schoolStaff.schoolId, access.schoolId),
      inArray(schoolStaff.role, ['deputy', 'principal', 'quality_manager']),
    ))

  // Only somebody whose own scope covers this pupil's stage can act on the case.
  return staff
    .filter((s) => {
      if (s.allGrades) return true
      if (!cls?.gradeLevelId) return false
      try {
        const ids = JSON.parse(s.gradeLevelIds ?? '[]')
        return Array.isArray(ids) && ids.includes(cls.gradeLevelId)
      } catch {
        return false
      }
    })
    .map((s) => ({ userId: s.userId, fullName: s.fullName, role: s.role }))
}

/** Settle it with the pupil. The family is deliberately not told. */
export async function resolveCasePrivately(caseId: string, counselorNote: string): Promise<CaseResult> {
  const { access, row } = await requireOwnCase(caseId)
  const note = String(counselorNote ?? '').trim().slice(0, MAX_NOTE)
  if (!note) return { ok: false, error: 'اكتب ما تم مع الطالب — السجل بلا ملاحظة لا يفيد أحداً' }

  await db.update(behaviorCases).set({
    status: 'resolved_privately',
    counselorNote: note,
    decidedByUserId: access.userId,
    decidedAt: new Date(),
    ownerUserId: null,
    updatedAt: new Date(),
  }).where(eq(behaviorCases.id, caseId))

  const [student] = await db.select({ fullName: students.fullName }).from(students).where(eq(students.id, row.studentId)).limit(1)

  // Deciding NOT to tell a family is a decision the school may one day have to
  // account for, so it is recorded — the note itself is not.
  await logCounselorAudit(access, 'case.resolvedPrivately', student?.fullName ?? '', {
    caseId,
    date: row.date,
  })

  revalidatePath('/counselor')
  return { ok: true }
}

/** Close it as nothing that needed acting on. */
export async function dismissCase(caseId: string, counselorNote: string): Promise<CaseResult> {
  const { access, row } = await requireOwnCase(caseId)
  const note = String(counselorNote ?? '').trim().slice(0, MAX_NOTE)
  if (!note) return { ok: false, error: 'اكتب سبب الإغلاق' }

  await db.update(behaviorCases).set({
    status: 'dismissed',
    counselorNote: note,
    decidedByUserId: access.userId,
    decidedAt: new Date(),
    ownerUserId: null,
    updatedAt: new Date(),
  }).where(eq(behaviorCases.id, caseId))

  const [student] = await db.select({ fullName: students.fullName }).from(students).where(eq(students.id, row.studentId)).limit(1)
  await logCounselorAudit(access, 'case.dismissed', student?.fullName ?? '', { caseId, date: row.date })

  revalidatePath('/counselor')
  return { ok: true }
}

/**
 * Tell the family. The counsellor writes the message themselves — the point of
 * the whole flow is that what arrives at a home has been through someone
 * trained to phrase it.
 */
export async function informParent(caseId: string, message: string, counselorNote: string): Promise<CaseResult> {
  const { access, row } = await requireOwnCase(caseId)
  const text = String(message ?? '').trim()
  if (text.length < 10) return { ok: false, error: 'نص الرسالة قصير جداً' }

  await db.update(behaviorCases).set({
    status: 'parent_informed',
    counselorNote: String(counselorNote ?? '').trim().slice(0, MAX_NOTE) || null,
    decidedByUserId: access.userId,
    decidedAt: new Date(),
    ownerUserId: null,
    parentMessageSent: true,
    updatedAt: new Date(),
  }).where(eq(behaviorCases.id, caseId))

  // Keeps the admin dashboard's message figures whole now that the negative
  // ones come from here instead of the teacher's screen.
  await db.insert(parentWhatsappMessages).values({
    schoolId: access.schoolId,
    classId: row.classId,
    studentId: row.studentId,
    teacherUserId: access.userId,
    type: 'negative',
    date: schoolToday(),
  })

  const [student] = await db.select({ fullName: students.fullName }).from(students).where(eq(students.id, row.studentId)).limit(1)
  await logCounselorAudit(access, 'case.parentInformed', student?.fullName ?? '', { caseId, date: row.date })

  revalidatePath('/counselor')
  return { ok: true }
}

/** Hand it to a named deputy — never to "the stage". */
export async function escalateCase(caseId: string, toUserId: string, counselorNote: string): Promise<CaseResult> {
  const { access, row } = await requireOwnCase(caseId)

  const targets = await getEscalationTargets(caseId)
  const target = targets.find((t) => t.userId === toUserId)
  if (!target) return { ok: false, error: 'اختر مسؤولاً من قائمة المسؤولين عن مرحلة هذا الطالب' }

  await db.update(behaviorCases).set({
    status: 'escalated',
    counselorNote: String(counselorNote ?? '').trim().slice(0, MAX_NOTE) || null,
    decidedByUserId: access.userId,
    decidedAt: new Date(),
    escalatedToUserId: toUserId,
    escalatedAt: new Date(),
    // Ownership moves with the case: from here the named person must act.
    ownerUserId: toUserId,
    updatedAt: new Date(),
  }).where(eq(behaviorCases.id, caseId))

  const [student] = await db.select({ fullName: students.fullName }).from(students).where(eq(students.id, row.studentId)).limit(1)
  await logCounselorAudit(access, 'case.escalated', student?.fullName ?? '', {
    caseId,
    date: row.date,
    to: target.fullName,
  })

  revalidatePath('/counselor')
  return { ok: true }
}

/** The full picture for one pupil, so a case is judged in context and not alone. */
export async function getStudentCaseHistory(studentId: string) {
  const access = await requireCounselor()
  await requireCounselorForStudent(access, studentId)

  return db
    .select({
      id: behaviorCases.id,
      date: behaviorCases.date,
      status: behaviorCases.status,
      teacherNote: behaviorCases.teacherNote,
      counselorNote: behaviorCases.counselorNote,
      createdAt: behaviorCases.createdAt,
    })
    .from(behaviorCases)
    .where(eq(behaviorCases.studentId, studentId))
    .orderBy(behaviorCases.createdAt)
}
