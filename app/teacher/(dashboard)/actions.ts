'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { dailyRecords, studentPoints, gradeEntries, subjects } from '@/lib/db/schema'
import { eq, and, desc, sql, inArray } from 'drizzle-orm'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'

// ── Save full daily records for a class ──────────────────────────────────────
export type DailyStudentRecord = {
  studentId: string
  attendanceStatus: 'present' | 'absent' | 'late' | 'excused'
  behavior: 'excellent' | 'good' | 'normal' | 'issue' | null
  homeworkStatus: 'done' | 'missing' | 'na' | null
  materialsStatus: 'brought' | 'missing' | 'na' | null
  participationStatus: 'active' | 'inactive' | 'na' | null
  teacherNote?: string
}

export async function saveDailyRecords(
  classId: string,
  schoolId: string,
  date: string,
  records: DailyStudentRecord[]
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Unauthorized')

  const { getSchoolSettings } = await import('@/app/admin/(dashboard)/settings/actions-settings')
  const settings = await getSchoolSettings(schoolId)
  const f = settings.features
  const p = settings.points

  for (const rec of records) {
    // Calculate points based on settings
    let attPts = 0; let attReason = ''
    if (f.attendance !== false) {
      if (rec.attendanceStatus === 'present') { attPts = p.attendance_present ?? 1; attReason = 'حضور الحصة' }
      else if (rec.attendanceStatus === 'late') { attPts = p.attendance_late ?? 0; attReason = 'تأخر' }
      else if (rec.attendanceStatus === 'absent') { attPts = p.attendance_absent ?? -1; attReason = 'غياب بدون عذر' }
    }

    let behPts = 0; let behReason = ''
    if (f.behavior !== false && rec.behavior) {
      if (rec.behavior === 'excellent') { behPts = p.behavior_excellent ?? 2; behReason = 'سلوك ممتاز' }
      else if (rec.behavior === 'good') { behPts = p.behavior_good ?? 1; behReason = 'سلوك جيد' }
      else if (rec.behavior === 'issue') { behPts = p.behavior_bad ?? -2; behReason = 'ملاحظة سلوكية' }
    }

    let hwPts = 0; let hwReason = ''
    if (f.homework !== false && rec.homeworkStatus) {
      if (rec.homeworkStatus === 'done') { hwPts = p.homework_done ?? 1; hwReason = 'إنجاز الواجب' }
      else if (rec.homeworkStatus === 'missing') { hwPts = p.homework_notdone ?? -1; hwReason = 'لم ينجز الواجب' }
    }

    let matPts = 0; let matReason = ''
    if (f.materials !== false && rec.materialsStatus) {
      if (rec.materialsStatus === 'brought') { matPts = p.materials_brought ?? 1; matReason = 'إحضار الأدوات' }
      else if (rec.materialsStatus === 'missing') { matPts = p.materials_missing ?? -1; matReason = 'لم يحضر الأدوات' }
    }

    let partPts = 0; let partReason = ''
    if (f.participation !== false && rec.participationStatus) {
      if (rec.participationStatus === 'active') { partPts = p.participation_active ?? 2; partReason = 'مشاركة متفاعلة' }
      else if (rec.participationStatus === 'inactive') { partPts = p.participation_inactive ?? 0; partReason = 'غير مشارك' }
    }

    const totalPoints = attPts + behPts + hwPts + matPts + partPts

    // Upsert daily record
    const existing = await db
      .select({ id: dailyRecords.id })
      .from(dailyRecords)
      .where(and(eq(dailyRecords.studentId, rec.studentId), eq(dailyRecords.classId, classId), eq(dailyRecords.date, date)))
      .limit(1)

    let recordId: string

    if (existing.length > 0) {
      // Update existing
      await db.update(dailyRecords).set({
        attendanceStatus: rec.attendanceStatus,
        behavior: rec.behavior,
        homeworkStatus: rec.homeworkStatus,
        materialsStatus: rec.materialsStatus,
        participationStatus: rec.participationStatus,
        teacherNote: rec.teacherNote || null,
        pointsEarned: totalPoints,
        updatedAt: new Date(),
      }).where(eq(dailyRecords.id, existing[0].id))
      recordId = existing[0].id

      // Remove old auto-generated points for this day
      await db.delete(studentPoints).where(
        and(
          eq(studentPoints.studentId, rec.studentId),
          eq(studentPoints.classId, classId),
          eq(studentPoints.date, date),
          eq(studentPoints.dailyRecordId, recordId)
        )
      )
    } else {
      // Insert new
      const [inserted] = await db.insert(dailyRecords).values({
        schoolId,
        classId,
        studentId: rec.studentId,
        teacherUserId: session.user.id,
        date,
        attendanceStatus: rec.attendanceStatus,
        behavior: rec.behavior,
        homeworkStatus: rec.homeworkStatus,
        materialsStatus: rec.materialsStatus,
        participationStatus: rec.participationStatus,
        teacherNote: rec.teacherNote || null,
        pointsEarned: totalPoints,
      }).returning({ id: dailyRecords.id })
      recordId = inserted.id
    }

    // Insert point entries
    const pointEntries: typeof studentPoints.$inferInsert[] = []

    if (attPts !== 0) {
      pointEntries.push({
        schoolId, studentId: rec.studentId, classId, teacherUserId: session.user.id,
        points: attPts, reason: attReason, type: 'attendance', date, dailyRecordId: recordId,
      })
    }

    if (behPts !== 0) {
      pointEntries.push({
        schoolId, studentId: rec.studentId, classId, teacherUserId: session.user.id,
        points: behPts, reason: behReason, type: 'behavior', date, dailyRecordId: recordId,
      })
    }

    if (hwPts !== 0) {
      pointEntries.push({
        schoolId, studentId: rec.studentId, classId, teacherUserId: session.user.id,
        points: hwPts, reason: hwReason, type: 'homework', date, dailyRecordId: recordId,
      })
    }

    if (matPts !== 0) {
      pointEntries.push({
        schoolId, studentId: rec.studentId, classId, teacherUserId: session.user.id,
        points: matPts, reason: matReason, type: 'materials', date, dailyRecordId: recordId,
      })
    }

    if (partPts !== 0) {
      pointEntries.push({
        schoolId, studentId: rec.studentId, classId, teacherUserId: session.user.id,
        points: partPts, reason: partReason, type: 'participation', date, dailyRecordId: recordId,
      })
    }

    if (pointEntries.length > 0) {
      await db.insert(studentPoints).values(pointEntries)
    }
  }

  revalidatePath(`/teacher/classes/${classId}`)
  return { ok: true }
}

// ── Add manual points ─────────────────────────────────────────────────────────
export async function addManualPoints(
  studentId: string,
  classId: string,
  schoolId: string,
  points: number,
  reason: string
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Unauthorized')

  const today = new Date().toISOString().split('T')[0]

  await db.insert(studentPoints).values({
    schoolId,
    studentId,
    classId,
    teacherUserId: session.user.id,
    points,
    reason,
    type: 'manual',
    date: today,
  })

  revalidatePath(`/teacher/classes/${classId}`)
  return { ok: true }
}

// ── Get daily records for a class on a date ───────────────────────────────────
export async function getDailyRecords(classId: string, date: string) {
  return db
    .select()
    .from(dailyRecords)
    .where(and(eq(dailyRecords.classId, classId), eq(dailyRecords.date, date)))
}

// ── Get student total points ──────────────────────────────────────────────────
export async function getStudentTotalPoints(studentId: string) {
  const result = await db
    .select({ total: sql<number>`COALESCE(SUM(${studentPoints.points}), 0)` })
    .from(studentPoints)
    .where(eq(studentPoints.studentId, studentId))
  return result[0]?.total ?? 0
}

// ── Get all students' points in a class ──────────────────────────────────────
export async function getClassPointsSummary(classId: string) {
  return db
    .select({
      studentId: studentPoints.studentId,
      total: sql<number>`COALESCE(SUM(${studentPoints.points}), 0)`,
    })
    .from(studentPoints)
    .where(eq(studentPoints.classId, classId))
    .groupBy(studentPoints.studentId)
}

// ── Get student points history ────────────────────────────────────────────────
export async function getStudentPointsHistory(studentId: string) {
  return db
    .select()
    .from(studentPoints)
    .where(eq(studentPoints.studentId, studentId))
    .orderBy(desc(studentPoints.createdAt))
    .limit(100)
}

// ── Save grades (existing but moved here) ────────────────────────────────────
export async function saveGrades(input: {
  classId: string
  schoolId: string
  subjectId: string
  examName: string
  maxScore: number
  entries: { studentId: string; score: number }[]
}) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Unauthorized')

  const semester = 'first'
  const academicYear = '1446'

  for (const entry of input.entries) {
    await db.insert(gradeEntries).values({
      schoolId: input.schoolId,
      studentId: entry.studentId,
      subjectId: input.subjectId,
      teacherUserId: session.user.id,
      examName: input.examName,
      examType: 'quiz',
      score: entry.score,
      maxScore: input.maxScore,
      semester,
      academicYear,
    })
  }

  revalidatePath(`/teacher/classes/${input.classId}`)
  return { ok: true }
}

// ── Get saved grades for a class ──────────────────────────────────────────────
export async function getSavedGrades(classId: string) {
  const classSubjects = await db
    .select({ id: subjects.id })
    .from(subjects)
    .where(eq(subjects.classId, classId))
    
  if (classSubjects.length === 0) return []
  
  const subjectIds = classSubjects.map(s => s.id)
  
  return db
    .select()
    .from(gradeEntries)
    .where(inArray(gradeEntries.subjectId, subjectIds))
    .orderBy(desc(gradeEntries.createdAt))
}
