import { db } from '@/lib/db'
import { gradeLevels, classes, students, dailyRecords } from '@/lib/db/schema'
import { eq, and, count, inArray } from 'drizzle-orm'
import { today as schoolToday } from '@/lib/utils'
import { redirect } from 'next/navigation'
import GradeSelector from './grade-selector'
import { requireTeacher, getTeacherVisibleClassIds } from '@/lib/teacher-access'
import { NotificationBell } from '@/components/notification-bell'

export const dynamic = 'force-dynamic'

export default async function TeacherClassesPage() {
  let teacher
  try {
    teacher = await requireTeacher()
  } catch {
    redirect('/teacher/login')
  }

  // Fetch grades, classes, and a head-count per class. Only the count is
  // needed here, so only the count is fetched — pulling every pupil row in the
  // school (nine hundred of them, with phone numbers) to add them up was work
  // the database does in one line.
  const gradesData = await db.select().from(gradeLevels).where(eq(gradeLevels.schoolId, teacher.schoolId)).orderBy(gradeLevels.orderIndex)
  const classesData = await db.select().from(classes).where(eq(classes.schoolId, teacher.schoolId))
  const countRows = await db
    .select({ classId: students.classId, n: count() })
    .from(students)
    .where(and(eq(students.schoolId, teacher.schoolId), eq(students.status, 'active')))
    .groupBy(students.classId)
  const countByClass = new Map(countRows.map((r) => [r.classId, Number(r.n)]))

  // A class stays visible to everyone until the admin assigns it a subject —
  // see lib/teacher-access.ts for why this can't be unconditional yet.
  const visibleClassIds = await getTeacherVisibleClassIds(teacher.schoolId, teacher.userId)
  const visibleClasses = classesData.filter(c => visibleClassIds.has(c.id))

  /**
   * Which classes already hold a register for today — by any teacher, since
   * attendance is shared. A class that has one is opened to be corrected,
   * and correcting what families were already told deserves a pause first.
   */
  const todayStr = schoolToday()
  const allClassIds = [...visibleClassIds]
  const recordedRows = allClassIds.length
    ? await db
        .selectDistinct({ classId: dailyRecords.classId })
        .from(dailyRecords)
        .where(and(inArray(dailyRecords.classId, allClassIds), eq(dailyRecords.date, todayStr)))
    : []
  const recordedToday = new Set(recordedRows.map((r) => r.classId))

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
          studentCount: countByClass.get(c.id) ?? 0,
          // Already has today's register — opening it is an edit, not a first entry.
          recordedToday: recordedToday.has(c.id),
        }))
      }
    })
    // A stage with none of the teacher's own classes has nothing to show here.
    .filter(g => g.classes.length > 0)

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-2">الفصول الدراسية</h1>
          <p className="text-muted-foreground">اختر المرحلة الدراسية ثم الفصل المطلوب</p>
        </div>
        <NotificationBell />
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
