import { db } from '@/lib/db'
import { auditLog } from '@/lib/db/schema'
import { eq, desc, and, gte } from 'drizzle-orm'
import type { AdminAccess } from '@/lib/admin-access'
import type { TeacherAccess } from '@/lib/teacher-access'

/** Actions worth recording — anything destructive, credential-related or school-wide. */
export type AuditAction =
  | 'student.delete'
  | 'student.parentPasswordReset'
  | 'class.delete'
  | 'gradeLevel.delete'
  | 'gradeLevel.rename'
  | 'subject.delete'
  | 'teacher.create'
  | 'teacher.delete'
  | 'teacher.passwordReset'
  | 'staff.create'
  | 'staff.update'
  | 'staff.delete'
  | 'staff.passwordReset'
  | 'settings.update'
  | 'backup.export'
  | 'backup.restore'
  | 'parents.requirePasswordChange'
  | 'teacher.dailyRecords.backdated'
  | 'teacher.points.manual'
  | 'teacher.grades.save'
  | 'case.raised'
  | 'case.resolvedPrivately'
  | 'case.parentInformed'
  | 'case.escalated'
  | 'case.dismissed'
  | 'case.noteRead'
  | 'case.adminHandled'
  | 'case.returned'

export const AUDIT_LABELS: Record<AuditAction, string> = {
  'student.delete': 'حذف طالب',
  'student.parentPasswordReset': 'إعادة تعيين كلمة مرور ولي أمر',
  'class.delete': 'حذف فصل',
  'gradeLevel.delete': 'حذف مرحلة دراسية',
  'gradeLevel.rename': 'تعديل اسم مرحلة دراسية',
  'subject.delete': 'حذف مادة',
  'teacher.create': 'إضافة معلم',
  'teacher.delete': 'حذف معلم',
  'teacher.passwordReset': 'إعادة تعيين كلمة مرور معلم',
  'staff.create': 'إضافة عضو إداري',
  'staff.update': 'تعديل صلاحيات عضو إداري',
  'staff.delete': 'حذف عضو إداري',
  'staff.passwordReset': 'إعادة تعيين كلمة مرور عضو إداري',
  'settings.update': 'تعديل إعدادات المدرسة',
  'backup.export': 'تنزيل نسخة احتياطية',
  'backup.restore': 'استعادة نسخة احتياطية',
  'parents.requirePasswordChange': 'إلزام أولياء الأمور بتغيير كلمة المرور',
  'teacher.dailyRecords.backdated': 'تعديل سجل يوم سابق',
  'teacher.points.manual': 'منح نقاط يدوية',
  'teacher.grades.save': 'حفظ درجات اختبار',
  'case.raised': 'رفع حالة سلوكية',
  'case.resolvedPrivately': 'حُلّت مع الطالب دون إبلاغ ولي الأمر',
  'case.parentInformed': 'إبلاغ ولي الأمر بحالة سلوكية',
  'case.escalated': 'تصعيد حالة سلوكية',
  'case.dismissed': 'إغلاق حالة سلوكية',
  'case.noteRead': 'اطّلاع على ملاحظات الموجه السرية',
  'case.adminHandled': 'الإدارة عالجت حالة سلوكية',
  'case.returned': 'إعادة حالة إلى الموجه',
}

/**
 * Records an action. Never throws — a failure to log must not roll back or
 * block the operation the user actually asked for.
 */
type AuditActor = { schoolId: string; userId: string; name: string; role: string }

async function writeAudit(
  actor: AuditActor,
  action: AuditAction,
  entityName?: string | null,
  details?: Record<string, unknown>,
) {
  try {
    await db.insert(auditLog).values({
      schoolId: actor.schoolId,
      actorUserId: actor.userId,
      actorName: actor.name,
      actorRole: actor.role,
      action,
      entityName: entityName ?? null,
      details: details ? JSON.stringify(details) : null,
    })
  } catch (error) {
    console.error('Audit log write failed:', action, error)
  }
}

export async function logAudit(
  access: AdminAccess,
  action: AuditAction,
  entityName?: string | null,
  details?: Record<string, unknown>,
) {
  return writeAudit(
    { schoolId: access.school.id, userId: access.userId, name: access.name, role: access.role },
    action,
    entityName,
    details,
  )
}

/**
 * Same trail, written from the counsellor portal. A counsellor is neither an
 * administrator nor a teacher, and the decisions recorded here — above all
 * "settled without telling the family" — are exactly the ones a school may be
 * asked to account for later.
 */
export async function logCounselorAudit(
  access: { schoolId: string; userId: string; name: string },
  action: AuditAction,
  entityName?: string | null,
  details?: Record<string, unknown>,
) {
  return writeAudit(
    { schoolId: access.schoolId, userId: access.userId, name: access.name, role: 'counselor' },
    action,
    entityName,
    details,
  )
}

/**
 * Same trail, written from the teacher portal. A teacher is not an AdminAccess
 * and never gains one, so the actor is recorded with its own role — the audit
 * page shows it beside the administrators' entries.
 */
export async function logTeacherAudit(
  access: TeacherAccess,
  action: AuditAction,
  entityName?: string | null,
  details?: Record<string, unknown>,
) {
  return writeAudit(
    { schoolId: access.schoolId, userId: access.userId, name: access.fullName, role: 'teacher' },
    action,
    entityName,
    details,
  )
}

/** Most recent entries for a school, newest first. */
export async function getAuditLog(schoolId: string, limit = 200, sinceDays?: number) {
  const filters = [eq(auditLog.schoolId, schoolId)]
  if (sinceDays) {
    const since = new Date()
    since.setDate(since.getDate() - sinceDays)
    filters.push(gte(auditLog.createdAt, since))
  }
  return db
    .select()
    .from(auditLog)
    .where(and(...filters))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit)
}
