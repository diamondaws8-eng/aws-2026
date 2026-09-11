import { db } from '@/lib/db'
import { classes, gradeLevels, students, subjects, schoolStaff, schoolYears, auditLog } from '@/lib/db/schema'
import { and, eq, isNull, sql, desc } from 'drizzle-orm'
import { parentActivation } from '@/lib/notifications'

export type HealthItem = {
  level: 'warn' | 'info'
  title: string
  detail?: string
  href: string
  action: string
}

const parseIds = (raw: string | null): string[] => {
  try { const v = JSON.parse(raw ?? '[]'); return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [] } catch { return [] }
}

/**
 * The things a school forgets between setup and the first real week — and
 * that the system cannot fix on its own because each is a decision: which
 * teacher takes a class, which pupil belongs where, when the year started.
 * Shown on the dashboard until they are done, with the page that does them.
 */
export async function getDataHealth(schoolId: string): Promise<HealthItem[]> {
  const [gradeRows, classRows, pupilCounts, unassigned, duplicates, staffRows, openYear, lastBackup, activation] = await Promise.all([
    db.select({ id: gradeLevels.id, name: gradeLevels.name }).from(gradeLevels).where(eq(gradeLevels.schoolId, schoolId)),
    db.select({ id: classes.id, name: classes.name, gradeLevelId: classes.gradeLevelId, promotesTo: classes.promotesToClassId })
      .from(classes).where(eq(classes.schoolId, schoolId)),
    db.select({ classId: students.classId, n: sql<number>`count(*)`.mapWith(Number) })
      .from(students)
      .where(and(eq(students.schoolId, schoolId), eq(students.status, 'active')))
      .groupBy(students.classId),
    // Classes with no teacher assigned to any subject: open to every teacher
    // of the stage by the rollout fallback, and invisible to none.
    db.select({ id: classes.id })
      .from(classes)
      .where(and(
        eq(classes.schoolId, schoolId),
        sql`NOT EXISTS (SELECT 1 FROM ${subjects} s WHERE s.class_id = ${classes.id} AND s.teacher_user_id IS NOT NULL)`,
      )),
    db.select({ nationalId: students.nationalId, names: sql<string>`string_agg(${students.fullName}, '، ')` })
      .from(students)
      .where(and(eq(students.schoolId, schoolId), sql`${students.nationalId} IS NOT NULL AND ${students.nationalId} <> ''`))
      .groupBy(students.nationalId)
      .having(sql`count(*) > 1`)
      .limit(5),
    db.select({ role: schoolStaff.role, allGrades: schoolStaff.allGrades, gradeLevelIds: schoolStaff.gradeLevelIds })
      .from(schoolStaff).where(eq(schoolStaff.schoolId, schoolId)),
    db.select({ id: schoolYears.id }).from(schoolYears)
      .where(and(eq(schoolYears.schoolId, schoolId), isNull(schoolYears.closedAt))).limit(1),
    db.select({ at: auditLog.createdAt }).from(auditLog)
      .where(and(eq(auditLog.schoolId, schoolId), eq(auditLog.action, 'backup.export')))
      .orderBy(desc(auditLog.createdAt)).limit(1),
    parentActivation(schoolId),
  ])

  const gradeName = new Map(gradeRows.map((g) => [g.id, g.name]))
  const label = (c: { name: string; gradeLevelId: string }) => `${gradeName.get(c.gradeLevelId) ?? ''} — ${c.name}`
  const countOf = new Map(pupilCounts.map((r) => [r.classId, r.n]))
  const items: HealthItem[] = []

  const noTeacher = classRows.filter((c) => unassigned.some((u) => u.id === c.id))
  if (noTeacher.length) {
    items.push({
      level: 'warn',
      title: `${noTeacher.length} فصل بلا معلم مسند لأي مادة`,
      detail: noTeacher.slice(0, 6).map(label).join('، ') + (noTeacher.length > 6 ? '…' : '') + ' — يفتحها كل معلمي المرحلة حتى يُسند إليها معلم.',
      href: '/admin/grade-levels',
      action: 'إسناد المعلمين',
    })
  }

  const empty = classRows.filter((c) => (countOf.get(c.id) ?? 0) === 0)
  const crowded = classRows.filter((c) => (countOf.get(c.id) ?? 0) > 40)
  if (empty.length || crowded.length) {
    const parts: string[] = []
    if (crowded.length) parts.push('مكتظ: ' + crowded.map((c) => `${label(c)} (${countOf.get(c.id)})`).join('، '))
    if (empty.length) parts.push('فارغ: ' + empty.map(label).join('، '))
    items.push({
      level: crowded.length ? 'warn' : 'info',
      title: `${crowded.length ? `${crowded.length} فصل مكتظ` : ''}${crowded.length && empty.length ? ' و' : ''}${empty.length ? `${empty.length} فصل بلا طلاب` : ''}`,
      detail: parts.join(' · '),
      href: '/admin/students',
      action: 'مراجعة توزيع الطلاب',
    })
  }

  if (duplicates.length) {
    items.push({
      level: 'warn',
      title: `رقم هوية مكرر لأكثر من طالب (${duplicates.length})`,
      detail: duplicates.map((d) => `${d.nationalId}: ${d.names}`).join(' · '),
      href: '/admin/students',
      action: 'تصحيح الأرقام',
    })
  }

  const noPromotion = classRows.filter((c) => !c.promotesTo)
  if (noPromotion.length) {
    items.push({
      level: 'info',
      title: `${noPromotion.length} فصل بلا فصل ترحيل`,
      detail: 'طلاب هذه الفصول يُعدّون متخرّجين عند الترحيل السنوي ما لم يُحدَّد الفصل التالي.',
      href: '/admin/promote',
      action: 'تحديد الترحيل',
    })
  }

  if (!openYear.length) {
    items.push({
      level: 'warn',
      title: 'العام الدراسي الحالي غير مسجَّل في الأرشيف',
      detail: 'بلا تاريخ بداية للعام تُحسب النقاط والنسب من أول سجل مهما قدم، ولا يمكن إقفال العام في نهايته.',
      href: '/admin/archive',
      action: 'تسجيل العام وتاريخ بدايته',
    })
  }

  const counselors = staffRows.filter((s) => s.role === 'counselor')
  const uncovered = gradeRows.filter((g) => !counselors.some((c) => c.allGrades || parseIds(c.gradeLevelIds).includes(g.id)))
  if (uncovered.length && gradeRows.length) {
    items.push({
      level: 'warn',
      title: `${uncovered.length} مرحلة بلا موجه طلابي مسند`,
      detail: uncovered.map((g) => g.name).join('، ') + ' — الحالات المرفوعة فيها تصل للإدارة بدل موجه.',
      href: '/admin/staff',
      action: 'إسناد موجه',
    })
  }

  if (activation.total > 0 && activation.activated < activation.total) {
    items.push({
      level: 'info',
      title: `${activation.total - activation.activated} من ${activation.total} ولي أمر لم يفعّلوا حساباتهم`,
      detail: 'الإشعارات تُكتب لهم لكنهم لا يرونها حتى يدخلوا ويختاروا كلمة مرور.',
      href: '/admin/parent-activation',
      action: 'متابعة التفعيل',
    })
  }

  const days = lastBackup[0]?.at ? Math.floor((Date.now() - lastBackup[0].at.getTime()) / 86_400_000) : null
  if (days === null || days > 30) {
    items.push({
      level: days === null ? 'warn' : 'info',
      title: days === null ? 'لم تُؤخذ نسخة احتياطية بعد' : `آخر نسخة احتياطية منذ ${days} يوماً`,
      detail: 'نسخة شهرية على الأقل تحمي السجلات من أي عطل.',
      href: '/admin/settings',
      action: 'تحميل نسخة',
    })
  }

  return items
}
