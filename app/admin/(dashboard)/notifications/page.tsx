import { db } from '@/lib/db'
import { classes, students, notifications } from '@/lib/db/schema'
import { eq, desc, and, or, isNull, gt, sql } from 'drizzle-orm'
import NotificationsClient from './notifications-client'
import { requireAdminAccess, canViewGrade } from '@/lib/admin-access'

export const dynamic = 'force-dynamic'

export default async function NotificationsPage() {
  const access = await requireAdminAccess()
  const school = access.school

  const allClasses = await db.select().from(classes).where(eq(classes.schoolId, school.id))
  const classesList = allClasses.filter((c) => canViewGrade(access, c.gradeLevelId))
  const visibleClassIds = new Set(classesList.map((c) => c.id))

  const allStudents = await db
    .select({ id: students.id, fullName: students.fullName, classId: students.classId })
    .from(students)
    .where(eq(students.schoolId, school.id))
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
      </div>

      <NotificationsClient
        schoolId={school.id}
        userId={access.userId}
        classes={classesList}
        students={studentsList}
        notifications={notifs}
        canSend={access.canEdit}
      />
    </div>
  )
}
