import { db } from '@/lib/db'
import { teachers, gradeLevels, classes, subjects } from '@/lib/db/schema'
import { eq, asc, sql } from 'drizzle-orm'
import TeachersClient from './teachers-client'
import { requireAdminAccess } from '@/lib/admin-access'
import { NotificationBell } from '@/components/notification-bell'

export const dynamic = 'force-dynamic'

export default async function TeachersPage() {
  const access = await requireAdminAccess()
  const school = access.school

  // Explicit columns: `select()` also carried the deprecated temp_password to
  // the browser, which is a path plaintext should never have even while empty.
  const teachersList = await db
    .select({
      id: teachers.id,
      schoolId: teachers.schoolId,
      userId: teachers.userId,
      fullName: teachers.fullName,
      phone: teachers.phone,
      createdAt: teachers.createdAt,
      allGrades: teachers.allGrades,
      gradeLevelIds: teachers.gradeLevelIds,
    })
    .from(teachers)
    .where(eq(teachers.schoolId, school.id))
    .orderBy(asc(teachers.fullName))

  // The stages a teacher can be given, and the classes inside them — the
  // form sets both when the account is created, so a new teacher is never
  // left with no subject and therefore no reason to be restricted.
  const [gradeRows, classRows, subjectRows] = await Promise.all([
    db.select({ id: gradeLevels.id, name: gradeLevels.name })
      .from(gradeLevels).where(eq(gradeLevels.schoolId, school.id))
      .orderBy(asc(gradeLevels.orderIndex)),
    db.select({ id: classes.id, name: classes.name, gradeLevelId: classes.gradeLevelId })
      .from(classes).where(eq(classes.schoolId, school.id)).orderBy(asc(classes.name)),
    db.select({ teacherUserId: subjects.teacherUserId, name: subjects.name })
      .from(subjects).where(eq(subjects.schoolId, school.id)),
  ])

  const subjectsByTeacher = new Map<string, string[]>()
  for (const r of subjectRows) {
    if (!r.teacherUserId) continue
    const list = subjectsByTeacher.get(r.teacherUserId) ?? []
    if (!list.includes(r.name)) list.push(r.name)
    subjectsByTeacher.set(r.teacherUserId, list)
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-foreground">المعلمون</h1>
          <p className="text-muted-foreground mt-1">إدارة حسابات المعلمين</p>
        </div>
        <NotificationBell />
      </div>

      <TeachersClient
        teachers={teachersList.map((t) => ({ ...t, subjectNames: subjectsByTeacher.get(t.userId) ?? [] }))}
        schoolId={school.id}
        canManage={access.canManageTeachers}
        gradeLevels={gradeRows}
        classes={classRows}
      />
    </div>
  )
}
