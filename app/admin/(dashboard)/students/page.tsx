import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { schools, students, classes, gradeLevels } from '@/lib/db/schema'
import { eq, asc } from 'drizzle-orm'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import StudentsClient from './students-client'

export const dynamic = 'force-dynamic'

export default async function StudentsPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/admin/login')
  
  const [school] = await db.select().from(schools).where(eq(schools.adminId, session.user.id)).limit(1)
  if (!school) redirect('/admin/setup')

  const studentsList = await db
    .select({
      id: students.id,
      fullName: students.fullName,
      nationalId: students.nationalId,
      parentPhone: students.parentPhone,
      className: classes.name,
      gradeName: gradeLevels.name,
      classId: students.classId
    })
    .from(students)
    .leftJoin(classes, eq(students.classId, classes.id))
    .leftJoin(gradeLevels, eq(classes.gradeLevelId, gradeLevels.id))
    .where(eq(students.schoolId, school.id))
    .orderBy(asc(students.fullName))

  const classesList = await db
    .select({
      id: classes.id,
      name: classes.name,
      gradeName: gradeLevels.name
    })
    .from(classes)
    .leftJoin(gradeLevels, eq(classes.gradeLevelId, gradeLevels.id))
    .where(eq(classes.schoolId, school.id))

  const formattedClasses = classesList.map(c => ({
    id: c.id,
    name: `${c.gradeName || 'مرحلة غير معروفة'} - ${c.name}`
  }))

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-foreground">الطلاب</h1>
          <p className="text-muted-foreground mt-1">إدارة بيانات الطلاب وأولياء الأمور</p>
        </div>
      </div>

      <StudentsClient students={studentsList} classes={formattedClasses} schoolId={school.id} />
    </div>
  )
}
