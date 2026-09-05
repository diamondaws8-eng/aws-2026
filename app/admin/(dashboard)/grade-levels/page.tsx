import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { schools, gradeLevels, classes, subjects, teachers } from '@/lib/db/schema'
import { eq, asc } from 'drizzle-orm'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import GradeLevelsClient from './grade-levels-client'

export const dynamic = 'force-dynamic'

export default async function GradeLevelsPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/admin/login')

  const [school] = await db.select().from(schools).where(eq(schools.adminId, session.user.id)).limit(1)
  if (!school) redirect('/admin/setup')

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

  const gradesData = grades.map((g) => ({
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
      />
    </div>
  )
}
