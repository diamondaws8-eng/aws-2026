import { db } from '@/lib/db'
import { gradeLevels, classes, students, lessonRecords } from '@/lib/db/schema'
import { eq, and, count, inArray } from 'drizzle-orm'
import { today as schoolToday } from '@/lib/utils'
import { getSchoolDaysConfig } from '@/lib/school-holidays'
import { nonSchoolDayReason } from '@/lib/school-days'
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
   * Which classes THIS teacher has already recorded today. Attendance is
   * shared, but a teacher's own duty is their lesson marks, and the dashboard
   * and lib/missed-days.ts both measure it by lesson_records — so this must
   * too, or a colleague's period would show as this teacher's done work and
   * offer them «تعديل» for a lesson they never entered.
   */
  const todayStr = schoolToday()
  const allClassIds = [...visibleClassIds]
  const recordedRows = allClassIds.length
    ? await db
        .selectDistinct({ classId: lessonRecords.classId })
        .from(lessonRecords)
        .where(and(
          eq(lessonRecords.teacherUserId, teacher.userId),
          inArray(lessonRecords.classId, allClassIds),
          eq(lessonRecords.date, todayStr),
        ))
    : []
  const recordedToday = new Set(recordedRows.map((r) => r.classId))
  // A Friday, a Saturday the stage does not teach on, or a holiday: the card
  // says so instead of pressing for a register that the roster will lock.
  const offByGrade = new Map<string, string | null>()
  for (const g of gradesData) {
    offByGrade.set(g.id, nonSchoolDayReason(todayStr, await getSchoolDaysConfig(teacher.schoolId, g.id)))
  }

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
          // Already carries this teacher's marks for today — opening it is an edit.
          recordedToday: recordedToday.has(c.id),
          offToday: offByGrade.get(grade.id) ?? null,
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
