import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { classes, gradeLevels, students, subjects, teachers, schools, dailyRecords, studentPoints } from '@/lib/db/schema'
import { eq, and, sql } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import ClassRoster from './class-roster'

export const dynamic = 'force-dynamic'

export default async function ClassPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/teacher/login')

  const [classInfo] = await db.select().from(classes).where(eq(classes.id, classId)).limit(1)
  if (!classInfo) redirect('/teacher/classes')

  const [gradeLevel] = await db.select().from(gradeLevels).where(eq(gradeLevels.id, classInfo.gradeLevelId)).limit(1)
  const [school] = await db.select().from(schools).where(eq(schools.id, classInfo.schoolId)).limit(1)

  const [teacher] = await db.select().from(teachers).where(eq(teachers.userId, session.user.id)).limit(1)

  const studentList = await db
    .select()
    .from(students)
    .where(eq(students.classId, classId))

  const subjectList = await db
    .select()
    .from(subjects)
    .where(eq(subjects.classId, classId))

  const today = new Date().toISOString().split('T')[0]

  // Get today's daily records
  const todayRecords = await db
    .select()
    .from(dailyRecords)
    .where(and(eq(dailyRecords.classId, classId), eq(dailyRecords.date, today)))

  // Get points summary for all students in class
  const pointsSummary = await db
    .select({
      studentId: studentPoints.studentId,
      total: sql<number>`COALESCE(SUM(${studentPoints.points}), 0)`,
    })
    .from(studentPoints)
    .where(eq(studentPoints.classId, classId))
    .groupBy(studentPoints.studentId)

  // Get saved grades
  const { getSavedGrades } = await import('../../actions')
  const savedGrades = await getSavedGrades(classId)

  // Get school settings
  const { getSchoolSettings } = await import('@/app/admin/(dashboard)/settings/actions-settings')
  const schoolSettings = await getSchoolSettings(classInfo.schoolId)

  return (
    <div className="flex flex-col h-screen overflow-hidden">
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
        }))}
        teacherName={teacher?.fullName || session.user.name}
        schoolName={school?.name || ''}
        subjects={subjectList.map(s => ({ id: s.id, name: s.name }))}
        initialDate={today}
        initialRecords={todayRecords.map(r => ({
          studentId: r.studentId,
          attendanceStatus: r.attendanceStatus,
          behavior: r.behavior,
          homeworkStatus: r.homeworkStatus,
          materialsStatus: r.materialsStatus,
          participationStatus: r.participationStatus,
          teacherNote: r.teacherNote,
          pointsEarned: r.pointsEarned,
        }))}
        pointsSummary={pointsSummary.map(p => ({
          studentId: p.studentId,
          total: Number(p.total),
        }))}
        savedGrades={savedGrades}
        schoolSettings={schoolSettings}
        teacherTemplates={teacher?.whatsappTemplates ? JSON.parse(teacher.whatsappTemplates as string) : { positive: [], negative: [] }}
      />
    </div>
  )
}
