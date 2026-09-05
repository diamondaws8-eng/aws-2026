import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { teachers, gradeLevels, classes, students } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import GradeSelector from './grade-selector'

export const dynamic = 'force-dynamic'

export default async function TeacherClassesPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/teacher/login')
  
  const [teacher] = await db.select().from(teachers).where(eq(teachers.userId, session.user.id)).limit(1)
  if (!teacher) redirect('/teacher/login')

  // Fetch grades, classes, students
  const gradesData = await db.select().from(gradeLevels).where(eq(gradeLevels.schoolId, teacher.schoolId)).orderBy(gradeLevels.orderIndex)
  const classesData = await db.select().from(classes).where(eq(classes.schoolId, teacher.schoolId))
  const studentsData = await db.select().from(students).where(eq(students.schoolId, teacher.schoolId))

  const gradesWithClasses = gradesData.map(grade => {
    const gradeClasses = classesData.filter(c => c.gradeLevelId === grade.id)
    return {
      id: grade.id,
      name: grade.name,
      orderIndex: grade.orderIndex,
      classes: gradeClasses.map(c => ({
        id: c.id,
        name: c.name,
        studentCount: studentsData.filter(s => s.classId === c.id).length
      }))
    }
  })

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground mb-2">الفصول الدراسية</h1>
        <p className="text-muted-foreground">اختر المرحلة الدراسية ثم الفصل المطلوب</p>
      </div>

      {gradesWithClasses.length === 0 ? (
        <div className="text-center p-8 bg-muted/50 rounded-2xl border border-border">
          <p className="text-muted-foreground">لم تُضف الإدارة أي مراحل دراسية بعد</p>
        </div>
      ) : (
        <GradeSelector grades={gradesWithClasses} />
      )}
    </div>
  )
}
