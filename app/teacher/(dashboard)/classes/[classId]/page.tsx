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

export default async function ClassPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params

  // A class id is just a URL segment — proves nothing on its own. This also
  // enforces the per-subject restriction once the admin has assigned one
  // (see lib/teacher-access.ts for the rollout-safe fallback).
  const result = await getTeacherClassAccess(classId)
  if (result.status === 'no-session') redirect('/teacher/login')
  if (result.status === 'forbidden') redirect('/teacher/classes')
  const { userId, schoolId, fullName } = result.access

  const [classInfo] = await db.select().from(classes).where(eq(classes.id, classId)).limit(1)
  if (!classInfo) redirect('/teacher/classes')

  const [gradeLevel] = await db.select().from(gradeLevels).where(eq(gradeLevels.id, classInfo.gradeLevelId)).limit(1)
  const [school] = await db.select().from(schools).where(eq(schools.id, schoolId)).limit(1)

  const [teacher] = await db.select().from(teachers).where(eq(teachers.userId, userId)).limit(1)

  const studentList = await db
    .select()
    .from(students)
    .where(eq(students.classId, classId))

  // The grades tab only ever writes under the caller's own subject (see
  // saveGrades) — the dropdown offers exactly that set, not a colleague's.
  const subjectList = await db
    .select()
    .from(subjects)
    .where(and(eq(subjects.classId, classId), eq(subjects.teacherUserId, userId)))

  const today = schoolToday()

  // Shared attendance + this teacher's own assessment for the day.
  const { getRosterForDay } = await import('@/lib/daily-roster')
  const todayRecords = await getRosterForDay(classId, today, userId)

  // Points come from each day's record plus manual awards (see lib/points.ts)
  const totalsByStudent = await getClassPointsTotals(classId)
  const pointsSummary = Object.entries(totalsByStudent).map(([studentId, total]) => ({ studentId, total }))

  // Get saved grades
  const { getSavedGrades, getAbsenceLocks } = await import('../../actions')
  const savedGrades = await getSavedGrades(classId)

  // Students another teacher already marked absent today: the roster shows why
  // instead of letting this teacher silently overwrite it.
  const absenceLocks = await getAbsenceLocks(classId, today)

  // Get school settings
  const { getSchoolSettings } = await import('@/app/admin/(dashboard)/settings/actions-settings')
  const schoolSettings = await getSchoolSettings(classInfo.schoolId)
  // Fridays, the stage's Saturdays and holidays — so the roster can say «يوم إجازة» under the date.
  const schoolDays = await getSchoolDaysConfig(classInfo.schoolId, classInfo.gradeLevelId)

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
