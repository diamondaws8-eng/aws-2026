import { db } from '@/lib/db'
import { classes, students, notifications, gradeLevels } from '@/lib/db/schema'
import { eq, desc, and, or, isNull, gt, sql } from 'drizzle-orm'
import NotificationsClient from './notifications-client'
import { requireAdminAccess, canViewGrade } from '@/lib/admin-access'
import { NotificationBell } from '@/components/notification-bell'
import { parentActivation } from '@/lib/notifications'
import { UserRoundX } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function NotificationsPage() {
  const access = await requireAdminAccess()
  const school = access.school

  // Sending is only half the story: a family still holding the starter
  // password never reaches the portal, so their copy of a notice is written
  // and never read. Say so before the message is written, not after.
  const reach = await parentActivation(school.id)

  const [allClasses, gradeRows] = await Promise.all([
    db.select().from(classes).where(eq(classes.schoolId, school.id)),
    db.select({ id: gradeLevels.id, name: gradeLevels.name, order: gradeLevels.orderIndex })
      .from(gradeLevels).where(eq(gradeLevels.schoolId, school.id)),
  ])
  const classesList = allClasses.filter((c) => canViewGrade(access, c.gradeLevelId))
  const visibleClassIds = new Set(classesList.map((c) => c.id))
  // The picker names the stage too: two buildings can both have a «1\1».
  const gradeById = new Map(gradeRows.map((g) => [g.id, g]))
  const classOptions = [...classesList]
    .sort((a, b) =>
      (gradeById.get(a.gradeLevelId)?.order ?? 0) - (gradeById.get(b.gradeLevelId)?.order ?? 0) ||
      a.name.localeCompare(b.name))
    .map((c) => ({ id: c.id, name: `${gradeById.get(c.gradeLevelId)?.name ?? ''} — ${c.name}` }))

  const allStudents = await db
    .select({ id: students.id, fullName: students.fullName, classId: students.classId })
    .from(students)
    .where(and(eq(students.schoolId, school.id), eq(students.status, 'active')))
  const studentsList = access.viewAllGrades
    ? allStudents
    : allStudents.filter((s) => s.classId && visibleClassIds.has(s.classId))


  const allNotifs = await db.select()
    .from(notifications)
    .where(
      and(
        eq(notifications.schoolId, school.id),
        or(isNull(notifications.expiresAt), gt(notifications.expiresAt, sql`now()`))
      )
    )
    .orderBy(desc(notifications.createdAt))
    .limit(60)

  // The classes and students above are scoped to this account's grades, but the
  // sent list was not — so a deputy responsible for one stage could read notices
  // written about a pupil in another, body and all.
  const classOfStudent = new Map(allStudents.map((s) => [s.id, s.classId]))
  const notifs = allNotifs
    .filter((notice) => {
      if (access.viewAllGrades) return true
      // Addressed to the whole school: everyone in the portal may see it.
      if (!notice.classId && !notice.studentId) return true
      if (notice.classId) return visibleClassIds.has(notice.classId)
      const classId = notice.studentId ? classOfStudent.get(notice.studentId) : null
      return !!classId && visibleClassIds.has(classId)
    })
    .slice(0, 30)

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-foreground">التنبيهات</h1>
          <p className="text-muted-foreground mt-1">إرسال التنبيهات لأولياء الأمور</p>
        </div>
        <NotificationBell />
      </div>

      {reach.total - reach.activated > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <UserRoundX className="size-5 shrink-0 mt-0.5" />
          <div className="text-sm leading-6">
            <p className="font-bold">
              {reach.total - reach.activated} من أصل {reach.total} من أولياء الأمور لم يفعّلوا حساباتهم بعد
            </p>
            <p className="mt-0.5">
              الحساب لا يُفتح إلا بعد أن يدخل ولي الأمر ويختار كلمة مرور خاصة به. قبل ذلك لا تظهر له أي إشعارات —
              لا التنبيهات ولا رسائل الغياب. يصل الآن إلى {reach.activated} ولي أمر فقط.
            </p>
          </div>
        </div>
      )}

      <NotificationsClient
        schoolId={school.id}
        userId={access.userId}
        classes={classOptions}
        students={studentsList}
        notifications={notifs}
        canSend={access.canEdit}
      />
    </div>
  )
}
