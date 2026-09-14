import { db } from '@/lib/db'
import { classes, gradeLevels, students, subjects, teachers, schools } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import ClassRoster from './class-roster'
import { today as schoolToday } from '@/lib/utils'
import { getSchoolDaysConfig } from '@/lib/school-holidays'
import { getClassPointsTotals } from '@/lib/points'
import { getTeacherClassAccess } from '@/lib/teacher-access'
import { termLabel } from '@/lib/academic'

export const dynamic = 'force-dynamic'

export default async function ClassPage({
  params,
  searchParams,
}: {
  params: Promise<{ classId: string }>
  searchParams?: Promise<{ date?: string }>
}) {
  const { classId } = await params
  const asked = (await searchParams)?.date

  // The grades tab is not offered any more (the school records no marks
  // here); its panel and actions stay, so flipping this flag brings it back.
  // While it is off, the two queries that only fed it are not run.
  const GRADES_TAB_ENABLED = false
  const today = schoolToday()
  /**
   * A day asked for by the link from «لم يُسجَّل أمس». Only a real past day is
   * honoured — a future date, or anything that is not a date at all, falls
   * back to today rather than showing a register that cannot be saved.
   */
  const startDate = asked && /^\d{4}-\d{2}-\d{2}$/.test(asked) && asked <= today ? asked : today

  // This page is the one a teacher opens every lesson, so it asks the database
  // in two rounds instead of thirteen one-after-another trips. Round one: the
  // permission check and the class row are independent lookups, and the module
  // loads alongside them. Reading the class row before the guard returns costs
  // one discarded read for a request that is about to be redirected; nothing
  // from it is used until the guard below has passed.
  //
  // A class id is just a URL segment — proves nothing on its own. The check
  // also enforces the per-subject restriction once the admin has assigned one
  // (see lib/teacher-access.ts for the rollout-safe fallback).
  const [result, [classInfo], [roster, actions, settingsMod]] = await Promise.all([
    getTeacherClassAccess(classId),
    db.select().from(classes).where(eq(classes.id, classId)).limit(1),
    Promise.all([
      import('@/lib/daily-roster'),
      import('../../actions'),
      import('@/app/admin/(dashboard)/settings/actions-settings'),
    ]),
  ])
  if (result.status === 'no-session') redirect('/teacher/login')
  if (result.status === 'forbidden') redirect('/teacher/classes')
  const { userId, schoolId, fullName } = result.access
  if (!classInfo) redirect('/teacher/classes')

  // Round two: everything else depends on the class and the teacher, never on
  // each other, so it all travels together.
  const [
    [gradeLevel],
    [school],
    [teacher],
    studentList,
    subjectList,
    todayRecords,
    totalsByStudent,
    savedGrades,
    absenceLocks,
    schoolSettings,
    schoolDays,
  ] = await Promise.all([
    db.select().from(gradeLevels).where(eq(gradeLevels.id, classInfo.gradeLevelId)).limit(1),
    db.select().from(schools).where(eq(schools.id, schoolId)).limit(1),
    db.select().from(teachers).where(eq(teachers.userId, userId)).limit(1),
    db.select().from(students).where(eq(students.classId, classId)),
    // The grades tab only ever writes under the caller's own subject (see
    // saveGrades) — the dropdown offers exactly that set, not a colleague's.
    GRADES_TAB_ENABLED
      ? db.select().from(subjects).where(and(eq(subjects.classId, classId), eq(subjects.teacherUserId, userId)))
      : Promise.resolve([]),
    // Shared attendance + this teacher's own assessment for the day.
    roster.getRosterForDay(classId, startDate, userId),
    // Points come from each day's record plus manual awards (see lib/points.ts)
    getClassPointsTotals(classId),
    GRADES_TAB_ENABLED ? actions.getSavedGrades(classId) : Promise.resolve([]),
    // Students another teacher already marked absent today: the roster shows
    // why instead of letting this teacher silently overwrite it.
    actions.getAbsenceLocks(classId, startDate),
    settingsMod.getSchoolSettings(classInfo.schoolId),
    // Fridays, the stage's Saturdays and holidays — so the roster can say
    // «يوم إجازة» under the date.
    getSchoolDaysConfig(classInfo.schoolId, classInfo.gradeLevelId),
  ])

  const pointsSummary = Object.entries(totalsByStudent).map(([studentId, total]) => ({ studentId, total }))

  return (
    <div className="flex flex-col min-h-screen">
      <ClassRoster
        classInfo={{
          id: classId,
          name: classInfo.name,
          gradeName: gradeLevel?.name || '',
          schoolId: classInfo.schoolId,
        }}
        students={studentList.map(s => ({
          id: s.id,
          fullName: s.fullName,
          parentPhone: s.parentPhone,
          gender: s.gender,
        }))}
        teacherName={teacher?.fullName || fullName}
        schoolName={school?.name || ''}
        subjects={subjectList.map(s => ({ id: s.id, name: s.name }))}
        initialDate={today}
        startDate={startDate}
        initialRecords={todayRecords}
        pointsSummary={pointsSummary.map(p => ({
          studentId: p.studentId,
          total: Number(p.total),
        }))}
        absenceLocks={absenceLocks}
        savedGrades={savedGrades}
        schoolSettings={schoolSettings}
        schoolDays={schoolDays}
        termLabel={termLabel(school?.currentSemester, school?.academicYear)}
        teacherTemplates={teacher?.whatsappTemplates ? JSON.parse(teacher.whatsappTemplates as string) : { positive: [], negative: [] }}
      />
    </div>
  )
}
