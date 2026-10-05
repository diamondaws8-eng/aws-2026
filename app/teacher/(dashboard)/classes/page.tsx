import { db } from '@/lib/db'
import { gradeLevels, classes, students, lessonRecords, subjects } from '@/lib/db/schema'
import { eq, and, count, inArray } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import GradeSelector from './grade-selector'
import { requireTeacher, getTeacherVisibleClassIds } from '@/lib/teacher-access'
import { getSchoolTimetable } from '@/lib/timetable'
import { getSchoolDaysConfig } from '@/lib/school-holidays'
import { nonSchoolDayReason } from '@/lib/school-days'
import { today as schoolToday } from '@/lib/utils'
import { classDays, byDayOrder, lessonsLabel } from '../today-lessons'
import { NotificationBell } from '@/components/notification-bell'

export const dynamic = 'force-dynamic'

/**
 * Where a teacher goes into a class — the one place.
 *
 * The home page used to carry a second list of today's classes, each a link
 * straight into the roster, beside this page's cards. Two doors into the same
 * room, and only this one stopped to say «سُجِّل اليوم بالفعل» before a
 * record already sent to families was reopened. So the door is here alone:
 * today's lessons first, in the order the day runs, each card saying whether
 * it has been recorded and asking before it is edited; the teacher's other
 * classes folded away beneath, still within reach for a day left unfinished.
 * The home page keeps the numbers and points here.
 */
export default async function TeacherClassesPage() {
  let teacher
  try {
    teacher = await requireTeacher()
  } catch {
    redirect('/teacher/login')
  }

  // A teacher opens this page before every lesson, so what does not depend on
  // anything else travels in one round instead of one trip after another.
  const [gradesData, classesData, countRows, visibleClassIds, slots] = await Promise.all([
    db.select({ id: gradeLevels.id, name: gradeLevels.name, orderIndex: gradeLevels.orderIndex })
      .from(gradeLevels).where(eq(gradeLevels.schoolId, teacher.schoolId)).orderBy(gradeLevels.orderIndex),
    db.select({ id: classes.id, name: classes.name, gradeLevelId: classes.gradeLevelId })
      .from(classes).where(eq(classes.schoolId, teacher.schoolId)),
    // Only the count is needed here, so only the count is fetched — pulling
    // every pupil row in the school to add them up was work the database does
    // in one line.
    db
      .select({ classId: students.classId, n: count() })
      .from(students)
      .where(and(eq(students.schoolId, teacher.schoolId), eq(students.status, 'active')))
      .groupBy(students.classId),
    // A class stays visible to everyone until the admin assigns it a subject —
    // see lib/teacher-access.ts for why this can't be unconditional yet.
    getTeacherVisibleClassIds(teacher.schoolId, teacher.userId),
    // The school's week, in one read: which of those classes are today's.
    getSchoolTimetable(teacher.schoolId),
  ])
  const countByClass = new Map(countRows.map((r) => [r.classId, Number(r.n)]))
  const visibleClasses = classesData.filter((c) => visibleClassIds.has(c.id))
  const myClassIds = visibleClasses.map((c) => c.id)

  const todayStr = schoolToday()
  // Only the stages this teacher has a class in.
  const stageIds = [...new Set(visibleClasses.map((c) => c.gradeLevelId))]
  const [recordedRows, mySubjectRows, offReasons] = await Promise.all([
    /**
     * Which classes THIS teacher has already recorded today. Attendance is
     * shared, but a teacher's own duty is their lesson marks, and the home
     * page and lib/missed-days.ts both measure it by lesson_records — so this
     * must too, or a colleague's period would show as this teacher's done
     * work and offer them «تعديل» for a lesson they never entered.
     */
    myClassIds.length
      ? db
          .selectDistinct({ classId: lessonRecords.classId })
          .from(lessonRecords)
          .where(and(
            eq(lessonRecords.teacherUserId, teacher.userId),
            inArray(lessonRecords.classId, myClassIds),
            eq(lessonRecords.date, todayStr),
          ))
      : Promise.resolve([] as { classId: string }[]),
    myClassIds.length
      ? db.select({ classId: subjects.classId, name: subjects.name }).from(subjects)
          .where(and(eq(subjects.teacherUserId, teacher.userId), inArray(subjects.classId, myClassIds)))
      : Promise.resolve([] as { classId: string; name: string }[]),
    // A Friday, a Saturday the stage does not teach on, or a holiday: the card
    // says so instead of pressing for a register that the roster will lock.
    Promise.all(stageIds.map(async (gid) => [gid, nonSchoolDayReason(todayStr, await getSchoolDaysConfig(teacher.schoolId, gid))] as const)),
  ])
  const recordedToday = new Set(recordedRows.map((r) => r.classId))
  const offByGrade = new Map(offReasons)
  const subjectsOf = new Map<string, string[]>()
  for (const s of mySubjectRows) subjectsOf.set(s.classId, [...(subjectsOf.get(s.classId) ?? []), s.name])

  /**
   * Which of the classes are today's — the same rule the home page counts by
   * (../today-lessons, over `governs` in lib/timetable.ts). A teacher with no
   * subject in their name sees what is open (the rollout fallback) and is not
   * read against a timetable that cannot name them.
   */
  const days = classDays({
    slots,
    teacherUserId: teacher.userId,
    classIds: myClassIds,
    date: todayStr,
    recorded: recordedToday,
    followsTimetable: mySubjectRows.length > 0,
  })

  const gradesWithClasses = gradesData
    .map((grade) => {
      const off = offByGrade.get(grade.id) ?? null
      const cards = visibleClasses
        .filter((c) => c.gradeLevelId === grade.id)
        .map((c) => {
          const day = days.get(c.id)
          return {
            id: c.id,
            name: c.name,
            studentCount: countByClass.get(c.id) ?? 0,
            subjects: subjectsOf.get(c.id) ?? [],
            // Already carries this teacher's marks for today — opening it is an edit.
            recordedToday: recordedToday.has(c.id),
            offToday: off,
            // «الحصة الثانية · رياضيات», when the timetable names today's lessons.
            lessonsToday: day && day.lessons.length ? lessonsLabel(day.lessons) : null,
            // Not today's work: the timetable governs and gives this teacher
            // no lesson in it today. On a day off nothing is anybody's work,
            // and the split would only hide classes for no reason.
            notToday: !off && !!day && !day.today,
            day,
          }
        })
        // Today's in the order the day runs; the stable sort keeps names in
        // order among classes the timetable says nothing about.
        .sort((a, b) => (a.day && b.day ? byDayOrder(a.day, b.day) : 0) || a.name.localeCompare(b.name))
        .map(({ day: _day, ...card }) => card)
      return { id: grade.id, name: grade.name, classes: cards }
    })
    // A stage with none of the teacher's own classes has nothing to show here.
    .filter((g) => g.classes.length > 0)

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-2">الفصول الدراسية</h1>
          <p className="text-muted-foreground">حصص اليوم أولاً بترتيبها — وبقية فصولك تحتها إن احتجت يوماً سابقاً</p>
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
