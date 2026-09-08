'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { dailyRecords, studentPoints, gradeEntries, subjects, parentWhatsappMessages, students, classes } from '@/lib/db/schema'
import { eq, and, desc, sql, inArray } from 'drizzle-orm'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { today as schoolToday, isValidDateString } from '@/lib/utils'
import { totalPointsFor, getStudentPointsTotal, getClassPointsTotals, getStudentPointsHistory as buildPointsHistory } from '@/lib/points'
import { requireTeacher, requireTeacherForClass } from '@/lib/teacher-access'
import { logTeacherAudit } from '@/lib/audit'

/** A rejected input comes back as a value: a production build strips the text of a thrown error. */
export type ActionResult = { ok: true } | { ok: false; error: string }

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
  _schoolId: string,
  date: string,
  records: DailyStudentRecord[]
): Promise<ActionResult> {
  // The school comes from the teacher's own record, never from the browser.
  const access = await requireTeacherForClass(classId)
  const { userId, schoolId } = access

  // The date column is plain text and this action is a public endpoint, so the
  // browser refusing to open a future day is a convenience, not a rule.
  if (!isValidDateString(date)) return { ok: false, error: 'تاريخ غير صالح' }
  if (date > schoolToday()) return { ok: false, error: 'لا يمكن التسجيل ليوم لم يأتِ بعد' }

  const { getSchoolSettings } = await import('@/app/admin/(dashboard)/settings/actions-settings')
  const settings = await getSchoolSettings(schoolId)

  if (records.length === 0) return { ok: true }

  // Student ids come from the browser too — keep only those really in this class.
  const enrolled = await db
    .select({ id: students.id })
    .from(students)
    .where(and(eq(students.classId, classId), inArray(students.id, records.map(r => r.studentId))))
  const enrolledIds = new Set(enrolled.map(s => s.id))
  records = records.filter(r => enrolledIds.has(r.studentId))
  if (records.length === 0) return { ok: true }

  // The day's record stores both the statuses and the resulting total, so the
  // per-category breakdown never needs rows of its own (see lib/points.ts).
  const rows = records.map((rec) => ({
    schoolId,
    classId,
    studentId: rec.studentId,
    teacherUserId: userId,
    date,
    attendanceStatus: rec.attendanceStatus,
    behavior: rec.behavior,
    homeworkStatus: rec.homeworkStatus,
    materialsStatus: rec.materialsStatus,
    participationStatus: rec.participationStatus,
    teacherNote: rec.teacherNote || null,
    pointsEarned: totalPointsFor({ ...rec, date }, settings),
  }))

  // One statement for the whole class: the unique index on
  // (student, class, date) decides insert vs. update, so two teachers saving at
  // the same moment can never create a second row for the same day.
  await db
    .insert(dailyRecords)
    .values(rows)
    .onConflictDoUpdate({
      target: [dailyRecords.studentId, dailyRecords.classId, dailyRecords.date],
      set: {
        teacherUserId: sql`excluded.teacher_user_id`,
        attendanceStatus: sql`excluded.attendance_status`,
        behavior: sql`excluded.behavior`,
        homeworkStatus: sql`excluded.homework_status`,
        materialsStatus: sql`excluded.materials_status`,
        participationStatus: sql`excluded.participation_status`,
        teacherNote: sql`excluded.teacher_note`,
        pointsEarned: sql`excluded.points_earned`,
        updatedAt: new Date(),
      },
    })

  // Saving an earlier day overwrites values nobody kept a copy of, so it leaves
  // a trail. Today's save needs none: the row itself carries the teacher who
  // wrote it and the moment it was written.
  if (date !== schoolToday()) {
    const [cls] = await db.select({ name: classes.name }).from(classes).where(eq(classes.id, classId)).limit(1)
    await logTeacherAudit(access, 'teacher.dailyRecords.backdated', `فصل ${cls?.name ?? ''} — ${date}`, {
      classId,
      date,
      students: rows.length,
    })
  }

  revalidatePath(`/teacher/classes/${classId}`)
  return { ok: true }
}

// ── Add manual points ─────────────────────────────────────────────────────────
export async function addManualPoints(
  studentId: string,
  classId: string,
  _schoolId: string,
  points: number,
  reason: string
) {
  const access = await requireTeacherForClass(classId)
  const { userId, schoolId } = access

  const [enrolled] = await db
    .select({ id: students.id, fullName: students.fullName })
    .from(students)
    .where(and(eq(students.id, studentId), eq(students.classId, classId)))
    .limit(1)
  if (!enrolled) throw new Error('الطالب ليس في هذا الفصل')

  // A hand-typed award must stay within a sane range.
  if (!Number.isInteger(points) || Math.abs(points) > 100) throw new Error('عدد النقاط غير صالح')

  const today = schoolToday()

  await db.insert(studentPoints).values({
    schoolId,
    studentId,
    classId,
    teacherUserId: userId,
    points,
    reason,
    type: 'manual',
    date: today,
  })

  // Points given by hand are the one award no rule explains, so a principal
  // reviewing the log sees who gave them, to whom and why.
  await logTeacherAudit(access, 'teacher.points.manual', enrolled.fullName, {
    classId,
    points,
    reason,
    date: today,
  })

  revalidatePath(`/teacher/classes/${classId}`)
  return { ok: true }
}

// ── Get daily records for a class on a date ───────────────────────────────────
export async function getDailyRecords(classId: string, date: string) {
  await requireTeacherForClass(classId)
  return db
    .select()
    .from(dailyRecords)
    .where(and(eq(dailyRecords.classId, classId), eq(dailyRecords.date, date)))
}

// ── Get student total points ──────────────────────────────────────────────────
export async function getStudentTotalPoints(studentId: string) {
  const { schoolId } = await requireTeacher()
  await requireStudentInSchool(studentId, schoolId)
  return getStudentPointsTotal(studentId)
}

// ── Get all students' points in a class ──────────────────────────────────────
export async function getClassPointsSummary(classId: string) {
  await requireTeacherForClass(classId)
  const totals = await getClassPointsTotals(classId)
  return Object.entries(totals).map(([studentId, total]) => ({ studentId, total }))
}

// ── Get student points history ────────────────────────────────────────────────
// Rebuilt from each day's record plus any manual awards.
export async function getStudentPointsHistory(studentId: string, _schoolId: string) {
  const { schoolId } = await requireTeacher()
  await requireStudentInSchool(studentId, schoolId)
  const { getSchoolSettings } = await import('@/app/admin/(dashboard)/settings/actions-settings')
  const settings = await getSchoolSettings(schoolId)
  return buildPointsHistory(studentId, settings)
}

/** A student id from the browser is only usable inside the caller's own school. */
async function requireStudentInSchool(studentId: string, schoolId: string) {
  const [row] = await db
    .select({ id: students.id })
    .from(students)
    .where(and(eq(students.id, studentId), eq(students.schoolId, schoolId)))
    .limit(1)
  if (!row) throw new Error('غير مصرح ببيانات هذا الطالب')
}

// ── Save grades ──────────────────────────────────────────────────────────────
const EXAM_TYPES = ['quiz', 'midterm', 'final', 'assignment', 'oral'] as const
type ExamType = (typeof EXAM_TYPES)[number]

/**
 * Every id here arrives from the browser, so nothing is written before it is
 * proved to belong to the class the caller is allowed to teach: the subject
 * must be one of that class's own, and each score must belong to a pupil
 * actually enrolled in it.
 *
 * A rejected input comes back as a result rather than a thrown error — a
 * production build replaces thrown messages with a generic one, and the teacher
 * needs to read which score was out of range.
 */
export async function saveGrades(input: {
  classId: string
  schoolId: string
  subjectId: string
  examName: string
  examType?: string
  maxScore: number
  entries: { studentId: string; score: number }[]
}): Promise<ActionResult> {
  const access = await requireTeacherForClass(input.classId)
  const { userId, schoolId } = access

  if (!Array.isArray(input.entries) || input.entries.length === 0) return { ok: true }

  // A subject id on its own says nothing — it could name another class's subject.
  const [subject] = await db
    .select({ id: subjects.id, name: subjects.name })
    .from(subjects)
    .where(and(
      eq(subjects.id, input.subjectId),
      eq(subjects.classId, input.classId),
      eq(subjects.schoolId, schoolId),
    ))
    .limit(1)
  if (!subject) return { ok: false, error: 'المادة المختارة ليست من مواد هذا الفصل' }

  const examName = String(input.examName ?? '').trim().slice(0, 120)
  if (!examName) return { ok: false, error: 'اسم الاختبار مطلوب' }

  const examType: ExamType = EXAM_TYPES.includes(input.examType as ExamType)
    ? (input.examType as ExamType)
    : 'quiz'

  const maxScore = Number(input.maxScore)
  if (!Number.isInteger(maxScore) || maxScore < 1 || maxScore > 1000) {
    return { ok: false, error: 'الدرجة القصوى يجب أن تكون رقماً صحيحاً بين 1 و 1000' }
  }

  const semester = 'first'
  const academicYear = '1446'

  // The same student twice in one payload would otherwise become two rows.
  const byStudent = new Map<string, number>()
  for (const entry of input.entries) {
    const score = Number(entry.score)
    if (!Number.isInteger(score) || score < 0 || score > maxScore) {
      return { ok: false, error: `الدرجة يجب أن تكون رقماً صحيحاً بين 0 و ${maxScore}` }
    }
    byStudent.set(entry.studentId, score)
  }

  const enrolled = await db
    .select({ id: students.id })
    .from(students)
    .where(and(eq(students.classId, input.classId), inArray(students.id, [...byStudent.keys()])))
  const enrolledIds = new Set(enrolled.map(s => s.id))

  const rows = [...byStudent.entries()]
    .filter(([studentId]) => enrolledIds.has(studentId))
    .map(([studentId, score]) => ({
      schoolId,
      studentId,
      subjectId: input.subjectId,
      teacherUserId: userId,
      examName,
      examType,
      score,
      maxScore,
      semester,
      academicYear,
    }))
  if (rows.length === 0) return { ok: false, error: 'لا يوجد طالب من هذا الفصل في الدرجات المرسلة' }

  // Saving the same exam a second time used to append a whole second set of
  // rows, so a correction doubled the class. The exam is replaced instead.
  let replaced = 0
  await db.transaction(async (tx) => {
    const removed = await tx.delete(gradeEntries).where(and(
      eq(gradeEntries.subjectId, input.subjectId),
      eq(gradeEntries.examName, examName),
      eq(gradeEntries.semester, semester),
      eq(gradeEntries.academicYear, academicYear),
      inArray(gradeEntries.studentId, rows.map(r => r.studentId)),
    )).returning({ id: gradeEntries.id })
    replaced = removed.length
    await tx.insert(gradeEntries).values(rows)
  })

  await logTeacherAudit(access, 'teacher.grades.save', `${examName} — ${subject.name}`, {
    classId: input.classId,
    subjectId: input.subjectId,
    examType,
    maxScore,
    students: rows.length,
    replaced,
  })

  revalidatePath(`/teacher/classes/${input.classId}`)
  return { ok: true }
}

// ── Get saved grades for a class ──────────────────────────────────────────────
export async function getSavedGrades(classId: string) {
  await requireTeacherForClass(classId)
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

export async function logParentWhatsappMessage(input: {
  schoolId: string
  classId: string
  studentId: string
  type: 'positive' | 'negative'
}) {
  const { userId, schoolId } = await requireTeacherForClass(input.classId)
  if (input.type !== 'positive' && input.type !== 'negative') throw new Error('Invalid type')

  const [student] = await db
    .select({ id: students.id })
    .from(students)
    .where(and(eq(students.id, input.studentId), eq(students.schoolId, schoolId)))
    .limit(1)
  if (!student) throw new Error('Student not found')

  await db.insert(parentWhatsappMessages).values({
    schoolId,
    classId: input.classId,
    studentId: input.studentId,
    teacherUserId: userId,
    type: input.type,
    date: schoolToday(),
  })

  revalidatePath('/admin')
  return { ok: true }
}
