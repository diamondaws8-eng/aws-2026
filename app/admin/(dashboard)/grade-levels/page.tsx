import { db } from '@/lib/db'
import { gradeLevels, classes, subjects, teachers } from '@/lib/db/schema'
import { eq, asc } from 'drizzle-orm'
import GradeLevelsClient from './grade-levels-client'
import { requireAdminAccess, canEditGrade, canViewGrade } from '@/lib/admin-access'

export const dynamic = 'force-dynamic'

export default async function GradeLevelsPage() {
  const access = await requireAdminAccess()
  const school = access.school

  const grades = await db
    .select()
    .from(gradeLevels)
    .where(eq(gradeLevels.schoolId, school.id))
    .orderBy(asc(gradeLevels.orderIndex))

  const allClasses = await db
    .select()
    .from(classes)
    .where(eq(classes.schoolId, school.id))
    .orderBy(asc(classes.name))

  const allSubjects = await db
    .select()
    .from(subjects)
    .where(eq(subjects.schoolId, school.id))

  const allTeachers = await db
    .select()
    .from(teachers)
    .where(eq(teachers.schoolId, school.id))

  const visibleGrades = grades.filter((g) => canViewGrade(access, g.id))

  const gradesData = visibleGrades.map((g) => ({
    ...g,
    classes: allClasses
      .filter((c) => c.gradeLevelId === g.id)
      .map((cls) => ({
        ...cls,
        subjects: allSubjects
          .filter((s) => s.classId === cls.id)
          .map((s) => ({
            ...s,
            teacherName: allTeachers.find((t) => t.userId === s.teacherUserId)?.fullName ?? null,
          })),
      })),
  }))

  const editableGradeIds = visibleGrades.filter((g) => canEditGrade(access, g.id)).map((g) => g.id)

  const teacherOptions = allTeachers.map((t) => ({
    userId: t.userId,
    fullName: t.fullName,
  }))

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-foreground">المراحل والفصول</h1>
          <p className="text-muted-foreground mt-1">إدارة الهيكل الأكاديمي والمواد والمعلمين</p>
        </div>
      </div>
      <GradeLevelsClient
        grades={gradesData}
        schoolId={school.id}
        teacherOptions={teacherOptions}
        editableGradeIds={editableGradeIds}
        canCreateGrades={access.editAllGrades}
      />
    </div>
  )
}
