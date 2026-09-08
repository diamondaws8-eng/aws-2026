'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { students, dailyRecords, lessonRecords, subjects, teachers, user, classes, gradeLevels, gradeEntries, account } from '@/lib/db/schema'
import { eq, and, sql, desc } from 'drizzle-orm'
import { hashPassword } from 'better-auth/crypto'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { getStudentPointsTotal, getStudentTeacherPointsTotal, getManualPoints, deriveLessonEntries } from '@/lib/points'

// ─── Auth helper ──────────────────────────────────────────────────────────────
export async function requireParent() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/parent/login')
  return session.user
}

// ─── First-login password setup ───────────────────────────────────────────────
// Only usable while the account is still flagged, so it can never be used to
// bypass the normal "enter your current password" flow later on.
export async function setOwnParentPassword(newPassword: string, confirmPassword: string) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return { ok: false as const, error: 'انتهت الجلسة، سجّل الدخول من جديد' }

  const [me] = await db
    .select({ mustChange: user.mustChangePassword })
    .from(user)
    .where(eq(user.id, session.user.id))
    .limit(1)
  if (!me?.mustChange) return { ok: false as const, error: 'لا حاجة لتغيير كلمة المرور' }

  if (newPassword !== confirmPassword) {
    return { ok: false as const, error: 'كلمتا المرور غير متطابقتين' }
  }
  if (newPassword.length < 6) {
    return { ok: false as const, error: 'كلمة المرور يجب أن تكون 6 أحرف أو أرقام على الأقل' }
  }
  if (newPassword === '12345678') {
    return { ok: false as const, error: 'لا يمكن استخدام كلمة المرور الافتراضية — اختر كلمة خاصة بك' }
  }

  try {
    const hashed = await hashPassword(newPassword)
    await db.update(account).set({ password: hashed, updatedAt: new Date() })
      .where(and(eq(account.userId, session.user.id), eq(account.providerId, 'credential')))
    await db.update(user)
      .set({ mustChangePassword: false, updatedAt: new Date() })
      .where(eq(user.id, session.user.id))
    return { ok: true as const }
  } catch (error) {
    console.error('Set Parent Password Error:', error)
    return { ok: false as const, error: 'حدث خطأ أثناء حفظ كلمة المرور' }
  }
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

  // Total points — each day's record plus manual awards (see lib/points.ts)
  const totalPoints = await getStudentPointsTotal(studentId)

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
        subjectPoints = await getStudentTeacherPointsTotal(studentId, student.classId!, sub.teacherUserId)
      }

      // Attendance per teacher's records
      let presentCount = 0, absentCount = 0
      if (sub.teacherUserId) {
        // Attendance belongs to the whole day, not to one subject — so what a
        // subject reports is how many of ITS lessons the child attended, taken
        // from the register on the days this teacher assessed them.
        const attRows = await db
          .select({
            status: dailyRecords.attendanceStatus,
            count: sql<number>`COUNT(*)`,
          })
          .from(lessonRecords)
          .innerJoin(
            dailyRecords,
            and(
              eq(dailyRecords.studentId, lessonRecords.studentId),
              eq(dailyRecords.date, lessonRecords.date),
            )
          )
          .where(
            and(
              eq(lessonRecords.studentId, studentId),
              eq(lessonRecords.classId, student.classId!),
              eq(lessonRecords.teacherUserId, sub.teacherUserId)
            )
          )
          .groupBy(dailyRecords.attendanceStatus)

        // Same definition the admin dashboard uses: a latecomer attended, and
        // إذن is an excused absence. Counting only 'present' dropped both from
        // the parent's totals, so the two portals disagreed about the same day.
        attRows.forEach(r => {
          if (r.status === 'present' || r.status === 'late') presentCount += Number(r.count)
          if (r.status === 'absent' || r.status === 'excused') absentCount += Number(r.count)
        })
      }

      // Latest teacher note
      let latestNote: string | null = null
      if (sub.teacherUserId) {
        const [noteRow] = await db
          .select({ note: lessonRecords.teacherNote, date: lessonRecords.date })
          .from(lessonRecords)
          .where(
            and(
              eq(lessonRecords.studentId, studentId),
              eq(lessonRecords.classId, student.classId!),
              eq(lessonRecords.teacherUserId, sub.teacherUserId),
              sql`${lessonRecords.teacherNote} IS NOT NULL`
            )
          )
          .orderBy(desc(lessonRecords.date))
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

  // This teacher's own lessons, each carrying the day's shared attendance so
  // the page can show "غاب في هذه الحصة" beside the teacher's marks.
  const lessons = await db
    .select({
      id: lessonRecords.id,
      date: lessonRecords.date,
      behavior: lessonRecords.behavior,
      homeworkStatus: lessonRecords.homeworkStatus,
      materialsStatus: lessonRecords.materialsStatus,
      participationStatus: lessonRecords.participationStatus,
      teacherNote: lessonRecords.teacherNote,
      pointsEarned: lessonRecords.pointsEarned,
      attendanceStatus: dailyRecords.attendanceStatus,
    })
    .from(lessonRecords)
    .leftJoin(
      dailyRecords,
      and(
        eq(dailyRecords.studentId, lessonRecords.studentId),
        eq(dailyRecords.date, lessonRecords.date),
      )
    )
    .where(
      and(
        eq(lessonRecords.studentId, studentId),
        eq(lessonRecords.teacherUserId, subject.teacherUserId)
      )
    )
    .orderBy(desc(lessonRecords.date))

  const records = lessons.map((l) => ({ ...l, attendanceStatus: l.attendanceStatus ?? 'present' }))

  // Rebuild the breakdown from the very records above — deriving it from the
  // same rows the page renders means the two can never disagree, and it costs
  // no extra query no matter how many days the student has.
  const { getSchoolSettings } = await import('@/app/admin/(dashboard)/settings/actions-settings')
  const settings = await getSchoolSettings(student.schoolId)
  // Only this teacher's half: the attendance point belongs to the day, not to
  // any one subject, so counting it here would award it once per subject.
  const derived = records.flatMap((r) => deriveLessonEntries(r, settings))
  const manual = await getManualPoints(studentId, { teacherUserId: subject.teacherUserId })
  const points = [...derived, ...manual].sort((a, b) => b.date.localeCompare(a.date))

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
