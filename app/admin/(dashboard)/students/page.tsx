import { db } from '@/lib/db'
import { students, classes, gradeLevels } from '@/lib/db/schema'
import { eq, and, asc } from 'drizzle-orm'
import StudentsClient from './students-client'
import { requireAdminAccess, canViewGrade, canEditGrade } from '@/lib/admin-access'
import { NotificationBell } from '@/components/notification-bell'

export const dynamic = 'force-dynamic'

export default async function StudentsPage() {
  const access = await requireAdminAccess()
  const school = access.school

  const studentsList = await db
    .select({
      id: students.id,
      fullName: students.fullName,
      nationalId: students.nationalId,
      parentPhone: students.parentPhone,
      parentUserId: students.parentUserId,
      // Both were missing. The edit form fell back to «ذكر» for a gender it
      // never received, so saving any change to a girl's record — a phone
      // number, a class — silently re-registered her as a boy.
      gender: students.gender,
      dateOfBirth: students.dateOfBirth,
      className: classes.name,
      gradeName: gradeLevels.name,
      gradeLevelId: classes.gradeLevelId,
      classId: students.classId
    })
    .from(students)
    .leftJoin(classes, eq(students.classId, classes.id))
    .leftJoin(gradeLevels, eq(classes.gradeLevelId, gradeLevels.id))
    .where(and(eq(students.schoolId, school.id), eq(students.status, 'active')))
    .orderBy(asc(students.fullName))

  const classesList = await db
    .select({
      id: classes.id,
      name: classes.name,
      gradeName: gradeLevels.name,
      gradeLevelId: classes.gradeLevelId,
    })
    .from(classes)
    .leftJoin(gradeLevels, eq(classes.gradeLevelId, gradeLevels.id))
    .where(eq(classes.schoolId, school.id))

  // Deputies only see the grades assigned to them; unassigned students stay
  // with the roles that can see the whole school.
  const visibleStudents = studentsList
    .filter((s) => canViewGrade(access, s.gradeLevelId))
    .map((s) => ({ ...s, canEdit: canEditGrade(access, s.gradeLevelId) }))

  const formattedClasses = classesList
    .filter((c) => canViewGrade(access, c.gradeLevelId))
    .map(c => ({
      id: c.id,
      name: `${c.gradeName || 'مرحلة غير معروفة'} - ${c.name}`,
      canEdit: canEditGrade(access, c.gradeLevelId),
    }))

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-foreground">الطلاب</h1>
          <p className="text-muted-foreground mt-1">إدارة بيانات الطلاب وأولياء الأمور</p>
        </div>
        <NotificationBell />
      </div>

      <StudentsClient
        students={visibleStudents}
        classes={formattedClasses}
        schoolId={school.id}
        canCreate={access.canEdit && formattedClasses.some(c => c.canEdit)}
      />
    </div>
  )
}
