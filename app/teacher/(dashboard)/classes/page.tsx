import { db } from '@/lib/db'
import { gradeLevels, classes, students } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import GradeSelector from './grade-selector'
import { requireTeacher, getTeacherVisibleClassIds } from '@/lib/teacher-access'

export const dynamic = 'force-dynamic'

export default async function TeacherClassesPage() {
  let teacher
  try {
    teacher = await requireTeacher()
  } catch {
    redirect('/teacher/login')
  }

  // Fetch grades, classes, students
  const gradesData = await db.select().from(gradeLevels).where(eq(gradeLevels.schoolId, teacher.schoolId)).orderBy(gradeLevels.orderIndex)
  const classesData = await db.select().from(classes).where(eq(classes.schoolId, teacher.schoolId))
  const studentsData = await db.select().from(students).where(eq(students.schoolId, teacher.schoolId))

  // A class stays visible to everyone until the admin assigns it a subject —
  // see lib/teacher-access.ts for why this can't be unconditional yet.
  const visibleClassIds = await getTeacherVisibleClassIds(teacher.schoolId, teacher.userId)
  const visibleClasses = classesData.filter(c => visibleClassIds.has(c.id))

  const gradesWithClasses = gradesData
    .map(grade => {
      const gradeClasses = visibleClasses.filter(c => c.gradeLevelId === grade.id)
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
    // A stage with none of the teacher's own classes has nothing to show here.
    .filter(g => g.classes.length > 0)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground mb-2">الفصول الدراسية</h1>
        <p className="text-muted-foreground">اختر المرحلة الدراسية ثم الفصل المطلوب</p>
      </div>

      {gradesWithClasses.length === 0 ? (
        <div className="text-center p-8 bg-muted/50 rounded-2xl border border-border">
          <p className="text-muted-foreground">لا توجد فصول مسندة إليك بعد</p>
        </div>
      ) : (
        <GradeSelector grades={gradesWithClasses} />
      )}
    </div>
  )
}
