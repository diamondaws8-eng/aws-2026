import { requireAdminAccess, canViewGrade } from '@/lib/admin-access'
import { db } from '@/lib/db'
import { students, classes, gradeLevels, user, parentActivationLog } from '@/lib/db/schema'
import { eq, and, asc, sql, isNull } from 'drizzle-orm'
import { DEFAULT_ACTIVATION_MESSAGE } from '@/lib/parent-activation'
import { ActivationClient } from './activation-client'

export const dynamic = 'force-dynamic'

export default async function ParentActivationPage() {
  const access = await requireAdminAccess()
  const schoolId = access.school.id

  const [rows, outreach, orphanRows] = await Promise.all([
    db
      .select({
        studentName: students.fullName,
        className: classes.name,
        gradeName: gradeLevels.name,
        gradeLevelId: classes.gradeLevelId,
        parentPhone: students.parentPhone,
        parentUserId: students.parentUserId,
        loginEmail: user.email,
        mustChange: user.mustChangePassword,
      })
      .from(students)
      .leftJoin(classes, eq(students.classId, classes.id))
      .leftJoin(gradeLevels, eq(classes.gradeLevelId, gradeLevels.id))
      .innerJoin(user, eq(user.id, students.parentUserId))
      .where(eq(students.schoolId, schoolId))
      .orderBy(asc(students.fullName)),

    db
      .select({
        parentUserId: parentActivationLog.parentUserId,
        times: sql<number>`COUNT(*)`.mapWith(Number),
        lastAt: sql<Date>`MAX(${parentActivationLog.sentAt})`,
      })
      .from(parentActivationLog)
      .where(eq(parentActivationLog.schoolId, schoolId))
      .groupBy(parentActivationLog.parentUserId),

    // A pupil with no parent account at all cannot be invited to activate one.
    // Counted separately so the campaign's own figures stay honest instead of
    // quietly leaving these families out of both the total and the remainder.
    db
      .select({ n: sql<number>`COUNT(*)`.mapWith(Number) })
      .from(students)
      .where(and(eq(students.schoolId, schoolId), isNull(students.parentUserId))),
  ])

  const contacted = new Map(outreach.map((o) => [o.parentUserId, o]))

  // One row per family, not per pupil: three siblings share one account and one
  // phone, and messaging that number three times is how a campaign annoys the
  // people it is trying to persuade.
  type Family = {
    parentUserId: string
    phone: string
    loginEmail: string
    activated: boolean
    children: { name: string; className: string | null; gradeName: string | null }[]
    timesContacted: number
    lastContactedAt: string | null
  }
  const families = new Map<string, Family>()

  for (const r of rows) {
    if (!r.parentUserId) continue
    if (!canViewGrade(access, r.gradeLevelId)) continue

    let f = families.get(r.parentUserId)
    if (!f) {
      const log = contacted.get(r.parentUserId)
      f = {
        parentUserId: r.parentUserId,
        phone: r.parentPhone ?? '',
        loginEmail: r.loginEmail,
        activated: !r.mustChange,
        children: [],
        timesContacted: log?.times ?? 0,
        lastContactedAt: log?.lastAt ? new Date(log.lastAt).toISOString() : null,
      }
      families.set(r.parentUserId, f)
    }
    // The number is stored per pupil; siblings usually match, but if one row is
    // blank the family is still reachable through the other.
    if (!f.phone && r.parentPhone) f.phone = r.parentPhone
    f.children.push({ name: r.studentName, className: r.className, gradeName: r.gradeName })
  }

  const list = [...families.values()].sort((a, b) => {
    // Never-contacted first: that is the queue the person actually works down.
    if (a.activated !== b.activated) return a.activated ? 1 : -1
    if (a.timesContacted !== b.timesContacted) return a.timesContacted - b.timesContacted
    return (a.children[0]?.name ?? '').localeCompare(b.children[0]?.name ?? '', 'ar')
  })

  // Progress per stage, so the chase can be handed to the person who owns it.
  const byGrade = new Map<string, { gradeName: string; total: number; activated: number }>()
  for (const f of list) {
    const seen = new Set<string>()
    for (const c of f.children) {
      const key = c.gradeName ?? 'بلا مرحلة'
      if (seen.has(key)) continue
      seen.add(key)
      const g = byGrade.get(key) ?? { gradeName: key, total: 0, activated: 0 }
      g.total += 1
      if (f.activated) g.activated += 1
      byGrade.set(key, g)
    }
  }

  return (
    <ActivationClient
      schoolName={access.school.name}
      families={list}
      gradeStats={[...byGrade.values()].sort((a, b) => b.total - a.total)}
      studentsWithoutParentAccount={orphanRows[0]?.n ?? 0}
      initialMessage={access.school.parentActivationMessage ?? DEFAULT_ACTIVATION_MESSAGE}
      isDefaultMessage={!access.school.parentActivationMessage}
      canEditMessage={access.canManageSchoolSettings}
    />
  )
}
