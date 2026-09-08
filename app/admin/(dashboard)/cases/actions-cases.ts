'use server'

import { db } from '@/lib/db'
import { behaviorCases, students, classes, parentWhatsappMessages } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getAdminAccess, canEditGrade } from '@/lib/admin-access'
import { logAudit } from '@/lib/audit'
import { today as schoolToday } from '@/lib/utils'

export type CaseActionResult = { ok: true } | { ok: false; error: string }

/** Same as the counsellor's: the address is built here so the tab can be opened
 *  inside the click that saved the decision, which is what keeps it unblocked. */
export type InformResult = { ok: true; waUrl: string | null } | { ok: false; error: string }

function toMsisdn(raw: string | null | undefined): string {
  const d = (raw ?? '').replace(/\D/g, '')
  if (!d) return ''
  if (d.startsWith('966')) return d
  if (d.startsWith('0')) return `966${d.slice(1)}`
  return `966${d}`
}

const MAX_NOTE = 2000

/**
 * A case handed to the administration must be actionable by them, not just
 * readable. Anything less and the counsellor's escalation is a dead end: they
 * pass it on and nobody is required to do anything with it.
 *
 * Who may act: the person it was named to, or anyone whose grade scope covers
 * the pupil — a deputy on leave should not block their own stage.
 */
type AdminCaseGuard =
  | { ok: false; error: string }
  | { ok: true; access: NonNullable<Awaited<ReturnType<typeof getAdminAccess>>>; row: typeof behaviorCases.$inferSelect }

async function requireCaseForAdmin(caseId: string): Promise<AdminCaseGuard> {
  const access = await getAdminAccess()
  if (!access || !access.canEdit) return { ok: false, error: 'غير مصرح لك بهذا الإجراء' }

  const [row] = await db
    .select()
    .from(behaviorCases)
    .where(and(eq(behaviorCases.id, caseId), eq(behaviorCases.schoolId, access.school.id)))
    .limit(1)
  if (!row) return { ok: false, error: 'الحالة غير موجودة' }

  if (row.escalatedToUserId !== access.userId) {
    const [cls] = await db
      .select({ gradeLevelId: classes.gradeLevelId })
      .from(classes)
      .where(eq(classes.id, row.classId))
      .limit(1)
    if (!canEditGrade(access, cls?.gradeLevelId ?? null)) {
      return { ok: false, error: 'هذه الحالة خارج المراحل المسندة إليك' }
    }
  }

  return { ok: true, access, row }
}

async function studentName(studentId: string) {
  const [s] = await db.select({ fullName: students.fullName }).from(students).where(eq(students.id, studentId)).limit(1)
  return s?.fullName ?? ''
}

/** The administration dealt with it. The case ends here. */
export async function adminHandleCase(caseId: string, note: string): Promise<CaseActionResult> {
  const guard = await requireCaseForAdmin(caseId)
  if (!guard.ok) return guard
  const { access, row } = guard

  const adminNote = String(note ?? '').trim().slice(0, MAX_NOTE)
  if (!adminNote) return { ok: false, error: 'اكتب ما تم في الحالة' }

  await db.update(behaviorCases).set({
    status: 'admin_handled',
    adminNote,
    decidedByUserId: access.userId,
    decidedAt: new Date(),
    ownerUserId: null,
    updatedAt: new Date(),
  }).where(eq(behaviorCases.id, caseId))

  await logAudit(access, 'case.adminHandled', await studentName(row.studentId), { caseId, date: row.date })
  revalidatePath('/admin/cases')
  return { ok: true }
}

/** Tell the family, in the administration's own words. */
export async function adminInformParent(caseId: string, message: string, note: string): Promise<InformResult> {
  const guard = await requireCaseForAdmin(caseId)
  if (!guard.ok) return guard
  const { access, row } = guard

  const text = String(message ?? '').trim()
  if (text.length < 10) {
    return { ok: false, error: 'نص الرسالة قصير جداً' }
  }

  const [target] = await db
    .select({ parentPhone: students.parentPhone })
    .from(students)
    .where(eq(students.id, row.studentId))
    .limit(1)
  const msisdn = toMsisdn(target?.parentPhone)

  await db.update(behaviorCases).set({
    status: 'parent_informed',
    adminNote: String(note ?? '').trim().slice(0, MAX_NOTE) || null,
    decidedByUserId: access.userId,
    decidedAt: new Date(),
    ownerUserId: null,
    parentMessageSent: true,
    updatedAt: new Date(),
  }).where(eq(behaviorCases.id, caseId))

  await db.insert(parentWhatsappMessages).values({
    schoolId: access.school.id,
    classId: row.classId,
    studentId: row.studentId,
    teacherUserId: access.userId,
    type: 'negative',
    date: schoolToday(),
  })

  await logAudit(access, 'case.parentInformed', await studentName(row.studentId), { caseId, date: row.date })
  revalidatePath('/admin/cases')
  return {
    ok: true,
    waUrl: msisdn ? `https://wa.me/${msisdn}?text=${encodeURIComponent(text)}` : null,
  }
}

/**
 * Hand it back. The administration decided this belongs with the counsellor
 * after all, and says why — otherwise the case bounces silently.
 */
export async function returnCaseToCounselor(caseId: string, note: string): Promise<CaseActionResult> {
  const guard = await requireCaseForAdmin(caseId)
  if (!guard.ok) return guard
  const { access, row } = guard

  const adminNote = String(note ?? '').trim().slice(0, MAX_NOTE)
  if (!adminNote) return { ok: false, error: 'اكتب سبب الإعادة حتى يعرف الموجه ما المطلوب' }

  await db.update(behaviorCases).set({
    status: 'open',
    adminNote,
    escalatedToUserId: null,
    escalatedAt: null,
    decidedByUserId: access.userId,
    decidedAt: new Date(),
    ownerUserId: null,
    updatedAt: new Date(),
  }).where(eq(behaviorCases.id, caseId))

  await logAudit(access, 'case.returned', await studentName(row.studentId), { caseId, date: row.date })
  revalidatePath('/admin/cases')
  return { ok: true }
}

/** The parent's number, fetched only when the administration chooses to write. */
export async function getCaseParentContact(caseId: string) {
  const guard = await requireCaseForAdmin(caseId)
  if (!guard.ok) return null
  const [s] = await db
    .select({ fullName: students.fullName, parentPhone: students.parentPhone })
    .from(students)
    .where(eq(students.id, guard.row.studentId))
    .limit(1)
  return s ?? null
}
