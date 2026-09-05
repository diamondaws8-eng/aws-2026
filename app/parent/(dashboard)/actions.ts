'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { students, dailyRecords, studentPoints, subjects, teachers, user, classes, gradeLevels, gradeEntries } from '@/lib/db/schema'
import { eq, and, sql, desc } from 'drizzle-orm'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { authClient } from '@/lib/auth-client'

// ─── Auth helper ──────────────────────────────────────────────────────────────
export async function requireParent() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/parent/login')
  return session.user
}

// ─── Get all children for this parent ────────────────────────────────────────
export async function getMyChildren() {
  const user = await requireParent()
  return db
    .select({
      id: students.id,
      fullName: students.fullName,
      classId: students.classId,
      gender: students.gender,
    })
    .from(students)
    .where(eq(students.parentUserId, user.id))
}

// ─── Get comprehensive student data ──────────────────────────────────────────
export async function getStudentDashboard(studentId: string) {
  const parentUser = await requireParent()

  // Verify ownership
  const [student] = await db
    .select()
    .from(students)
    .where(and(eq(students.id, studentId), eq(students.parentUserId, parentUser.id)))
    .limit(1)

  if (!student) return null

  // Get class info
  let classInfo = null
  let gradeName = ''
  if (student.classId) {
    const [cls] = await db.select().from(classes).where(eq(classes.id, student.classId)).limit(1)
    if (cls) {
      classInfo = cls
      const [gl] = await db.select().from(gradeLevels).where(eq(gradeLevels.id, cls.gradeLevelId)).limit(1)
      gradeName = gl?.name || ''
    }
  }

  // Total points
  const [pointsRow] = await db
    .select({ total: sql<number>`COALESCE(SUM(${studentPoints.points}), 0)` })
    .from(studentPoints)
    .where(eq(studentPoints.studentId, studentId))
  const totalPoints = Number(pointsRow?.total ?? 0)

  // Attendance summary from daily_records
  const attendanceRows = await db
    .select({
      status: dailyRecords.attendanceStatus,
      count: sql<number>`COUNT(*)`,
    })
    .from(dailyRecords)
    .where(eq(dailyRecords.studentId, studentId))
    .groupBy(dailyRecords.attendanceStatus)

  const attendance = { present: 0, absent: 0, late: 0, excused: 0 }
  attendanceRows.forEach(r => {
    const k = r.status as keyof typeof attendance
    if (k in attendance) attendance[k] = Number(r.count)
  })

  // Recent daily records (last 10)
  const recentRecords = await db
    .select()
    .from(dailyRecords)
    .where(eq(dailyRecords.studentId, studentId))
    .orderBy(desc(dailyRecords.date))
    .limit(10)

  // Subject cards — all subjects in the student's class with teacher info
  let subjectCards: {
    id: string
    name: string
    teacherName: string | null
    points: number
    presentCount: number
    absentCount: number
    latestNote: string | null
  }[] = []

  if (student.classId) {
    const subjectList = await db
      .select({
        id: subjects.id,
        name: subjects.name,
        teacherUserId: subjects.teacherUserId,
      })
      .from(subjects)
      .where(eq(subjects.classId, student.classId))

    for (const sub of subjectList) {
      // Teacher name
      let teacherName: string | null = null
      if (sub.teacherUserId) {
        const [t] = await db
          .select({ fullName: teachers.fullName })
          .from(teachers)
          .where(eq(teachers.userId, sub.teacherUserId))
          .limit(1)
        teacherName = t?.fullName ?? null
      }

      // Points per subject (from records where this teacher recorded)
      let subjectPoints = 0
      if (sub.teacherUserId) {
        const [pRow] = await db
          .select({ total: sql<number>`COALESCE(SUM(${studentPoints.points}), 0)` })
          .from(studentPoints)
          .where(
            and(
              eq(studentPoints.studentId, studentId),
              eq(studentPoints.classId, student.classId!),
              eq(studentPoints.teacherUserId, sub.teacherUserId)
            )
          )
        subjectPoints = Number(pRow?.total ?? 0)
      }

      // Attendance per teacher's records
      let presentCount = 0, absentCount = 0
      if (sub.teacherUserId) {
        const attRows = await db
          .select({
            status: dailyRecords.attendanceStatus,
            count: sql<number>`COUNT(*)`,
          })
          .from(dailyRecords)
          .where(
            and(
              eq(dailyRecords.studentId, studentId),
              eq(dailyRecords.classId, student.classId!),
              eq(dailyRecords.teacherUserId, sub.teacherUserId)
            )
          )
          .groupBy(dailyRecords.attendanceStatus)

        attRows.forEach(r => {
          if (r.status === 'present') presentCount = Number(r.count)
          if (r.status === 'absent') absentCount = Number(r.count)
        })
      }

      // Latest teacher note
      let latestNote: string | null = null
      if (sub.teacherUserId) {
        const [noteRow] = await db
          .select({ note: dailyRecords.teacherNote, date: dailyRecords.date })
          .from(dailyRecords)
          .where(
            and(
              eq(dailyRecords.studentId, studentId),
              eq(dailyRecords.classId, student.classId!),
              eq(dailyRecords.teacherUserId, sub.teacherUserId),
              sql`${dailyRecords.teacherNote} IS NOT NULL`
            )
          )
          .orderBy(desc(dailyRecords.date))
          .limit(1)
        latestNote = noteRow?.note ?? null
      }

      subjectCards.push({ id: sub.id, name: sub.name, teacherName, points: subjectPoints, presentCount, absentCount, latestNote })
    }
  }

  return {
    student,
    classInfo,
    gradeName,
    totalPoints,
    attendance,
    recentRecords,
    subjectCards,
  }
}

// ─── Get notifications ────────────────────────────────────────────────────────
export async function getMyNotifications(studentId: string) {
  const { notifications, students } = await import('@/lib/db/schema')
  const { or, isNull, gt, sql } = await import('drizzle-orm')

  const [student] = await db.select().from(students).where(eq(students.id, studentId)).limit(1)
  if (!student) return []

  return db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.schoolId, student.schoolId),
        or(
          isNull(notifications.expiresAt),
          gt(notifications.expiresAt, sql`now()`)
        ),
        or(
          eq(notifications.studentId, studentId), // Specifically for this student
          and(
            eq(notifications.classId, student.classId || ''), 
            isNull(notifications.studentId) // For the whole class
          ),
          and(
            isNull(notifications.classId), 
            isNull(notifications.studentId) // For the whole school
          )
        )
      )
    )
    .orderBy(desc(notifications.createdAt))
    .limit(20)
}

// ─── Change password ──────────────────────────────────────────────────────────
export async function changeParentPassword(currentPassword: string, newPassword: string) {
  // Done on client side with authClient.changePassword
  return { ok: true }
}

// ─── Get Subject Details ──────────────────────────────────────────────────────
export async function getSubjectDetails(studentId: string, subjectId: string) {
  const parentUser = await requireParent()

  // Verify ownership
  const [student] = await db
    .select()
    .from(students)
    .where(and(eq(students.id, studentId), eq(students.parentUserId, parentUser.id)))
    .limit(1)

  if (!student || !student.classId) return null

  // Get subject info
  const [subject] = await db
    .select()
    .from(subjects)
    .where(eq(subjects.id, subjectId))
    .limit(1)

  if (!subject || subject.classId !== student.classId || !subject.teacherUserId) return null

  // Get teacher info
  const [teacher] = await db
    .select()
    .from(teachers)
    .where(eq(teachers.userId, subject.teacherUserId))
    .limit(1)

  // Get all daily records for this student from this teacher
  const records = await db
    .select()
    .from(dailyRecords)
    .where(
      and(
        eq(dailyRecords.studentId, studentId),
        eq(dailyRecords.teacherUserId, subject.teacherUserId)
      )
    )
    .orderBy(desc(dailyRecords.date))

  // Get all points details for this student from this teacher
  const points = await db
    .select()
    .from(studentPoints)
    .where(
      and(
        eq(studentPoints.studentId, studentId),
        eq(studentPoints.teacherUserId, subject.teacherUserId)
      )
    )
    .orderBy(desc(studentPoints.createdAt))

  // Get grade entries for this student in this subject
  const grades = await db
    .select()
    .from(gradeEntries)
    .where(
      and(
        eq(gradeEntries.studentId, studentId),
        eq(gradeEntries.subjectId, subjectId)
      )
    )
    .orderBy(desc(gradeEntries.createdAt))

  return {
    student,
    subject,
    teacher,
    records,
    points,
    grades,
  }
}
