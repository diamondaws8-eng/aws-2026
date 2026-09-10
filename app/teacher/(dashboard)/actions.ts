'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { dailyRecords, lessonRecords, studentPoints, gradeEntries, subjects, parentWhatsappMessages, students, classes, teachers, behaviorCases, schools } from '@/lib/db/schema'
import { eq, and, desc, sql, inArray, isNotNull } from 'drizzle-orm'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { today as schoolToday, isValidDateString, formatDateAr } from '@/lib/utils'
import { attendancePointsFor, lessonPointsFor, getStudentPointsTotal, getClassPointsTotals, getStudentPointsHistory as buildPointsHistory } from '@/lib/points'
import { requireTeacher, requireTeacherForClass } from '@/lib/teacher-access'
import { logTeacherAudit } from '@/lib/audit'

/** A rejected input comes back as a value: a production build strips the text of a thrown error. */
export type ActionResult = { ok: true } | { ok: false; error: string }

/**
 * The two statuses that mean "not in school". Which of them it is (بعذر or not)
 * is a detail of the same fact, so they lock and unlock together.
 */
const OUT_OF_SCHOOL = ['absent', 'excused'] as const
type OutOfSchool = (typeof OUT_OF_SCHOOL)[number]
const isOutOfSchool = (status: string): status is OutOfSchool =>
  (OUT_OF_SCHOOL as readonly string[]).includes(status)

/** An absence another teacher had already recorded, which this save could not override. */
export type BlockedAbsence = {
  studentId: string
  studentName: string
  teacherName: string
  status: string
  at: string | null
}

export type SaveDailyResult = { ok: true; blocked: BlockedAbsence[] } | { ok: false; error: string }

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
): Promise<SaveDailyResult> {
  // The school comes from the teacher's own record, never from the browser.
  const access = await requireTeacherForClass(classId)
  const { userId, schoolId } = access

  // The date column is plain text and this action is a public endpoint, so the
  // browser refusing to open a future day is a convenience, not a rule.
  if (!isValidDateString(date)) return { ok: false, error: 'تاريخ غير صالح' }
  if (date > schoolToday()) return { ok: false, error: 'لا يمكن التسجيل ليوم لم يأتِ بعد' }

  const { getSchoolSettings } = await import('@/app/admin/(dashboard)/settings/actions-settings')
  const settings = await getSchoolSettings(schoolId)

  if (records.length === 0) return { ok: true, blocked: [] }

  // Student ids come from the browser too — keep only those really in this class.
  const enrolled = await db
    .select({ id: students.id })
    .from(students)
    .where(and(eq(students.classId, classId), inArray(students.id, records.map(r => r.studentId))))
  const enrolledIds = new Set(enrolled.map(s => s.id))
  records = records.filter(r => enrolledIds.has(r.studentId))
  if (records.length === 0) return { ok: true, blocked: [] }

  // What is already on the register decides what this save may still change.
  const existing = await db
    .select({
      studentId: dailyRecords.studentId,
      attendanceStatus: dailyRecords.attendanceStatus,
      absenceMarkedBy: dailyRecords.absenceMarkedBy,
      absenceMarkedAt: dailyRecords.absenceMarkedAt,
    })
    .from(dailyRecords)
    .where(and(eq(dailyRecords.classId, classId), eq(dailyRecords.date, date)))
  const previous = new Map(existing.map((r) => [r.studentId, r]))

  // Families are told about an absence once — by whoever first writes it. See
  // the notify block after the register is saved.
  const newlyAbsentIds: string[] = []

  // ── 1. The register: one shared row a day, whoever writes it ───────────────
  const attendanceRows = records.map((rec) => {
    const prev = previous.get(rec.studentId)
    const standingAbsence = !!prev && isOutOfSchool(prev.attendanceStatus) && !!prev.absenceMarkedBy
    // "New" means the register did not already show this pupil out of school —
    // not merely that the lock is unset, because rows written before the lock
    // column existed carry no owner and would otherwise be announced twice.
    const alreadyOut = !!prev && isOutOfSchool(prev.attendanceStatus)
    if (rec.attendanceStatus === 'absent' && !alreadyOut) newlyAbsentIds.push(rec.studentId)

    let attendanceStatus = rec.attendanceStatus
    let absenceMarkedBy: string | null = null
    let absenceMarkedAt: Date | null = null

    if (standingAbsence && prev!.absenceMarkedBy !== userId) {
      // A student who left the school is gone for every later period too, so the
      // record stands exactly as it was written — no other teacher may mark them
      // present, late, or change the excuse. Only its author can.
      attendanceStatus = prev!.attendanceStatus as typeof attendanceStatus
      absenceMarkedBy = prev!.absenceMarkedBy
      absenceMarkedAt = prev!.absenceMarkedAt
    } else if (isOutOfSchool(attendanceStatus)) {
      // Any teacher may send a pupil out — a child can ask to leave in the third
      // period as easily as the first — and from that moment it is theirs.
      absenceMarkedBy = standingAbsence ? prev!.absenceMarkedBy : userId
      absenceMarkedAt = standingAbsence ? prev!.absenceMarkedAt : new Date()
    }
    // Anything else leaves both null — that is how the owner undoes an absence.

    return {
      schoolId,
      classId,
      studentId: rec.studentId,
      teacherUserId: userId,
      date,
      attendanceStatus,
      // Attendance scores once a day, so only that half lives here.
      pointsEarned: attendancePointsFor({ ...rec, attendanceStatus, date }, settings),
      absenceMarkedBy,
      absenceMarkedAt,
    }
  })

  /**
   * One statement for the whole class: the unique index on
   * (student, class, date) decides insert vs. update, so two teachers saving at
   * the same moment can never create a second row for the same day.
   *
   * The condition on the update is what makes the absence lock survive that
   * same moment. The check above reads the register first and then writes, and
   * between those two steps a colleague can mark a pupil absent: this save was
   * built from a register that no longer exists, and an unconditional overwrite
   * would erase their lock — the one guarantee the whole flow rests on. So the
   * database itself refuses the write unless the row is unlocked or the lock is
   * already this teacher's. Milliseconds wide, but a bell rings and nineteen
   * teachers save at once, every period of every day.
   */
  await db
    .insert(dailyRecords)
    .values(attendanceRows)
    .onConflictDoUpdate({
      target: [dailyRecords.studentId, dailyRecords.classId, dailyRecords.date],
      set: {
        teacherUserId: sql`excluded.teacher_user_id`,
        attendanceStatus: sql`excluded.attendance_status`,
        pointsEarned: sql`excluded.points_earned`,
        absenceMarkedBy: sql`excluded.absence_marked_by`,
        absenceMarkedAt: sql`excluded.absence_marked_at`,
        updatedAt: new Date(),
      },
      setWhere: sql`${dailyRecords.absenceMarkedBy} IS NULL OR ${dailyRecords.absenceMarkedBy} = excluded.teacher_user_id`,
    })

  /**
   * What the register actually says now — not what we predicted it would say.
   *
   * The blocked list used to be built from the read taken before the write, so
   * it could only report locks that already existed when this save began. Read
   * back instead: anything that did not end up as the teacher asked was
   * refused, whether the lock was there a minute ago or arrived a moment ago.
   */
  const after = await db
    .select({ studentId: dailyRecords.studentId, attendanceStatus: dailyRecords.attendanceStatus })
    .from(dailyRecords)
    .where(and(eq(dailyRecords.classId, classId), eq(dailyRecords.date, date)))
  const stored = new Map(after.map((r) => [r.studentId, r.attendanceStatus]))
  const blockedIds = records
    .filter((r) => {
      const now = stored.get(r.studentId)
      return !!now && now !== r.attendanceStatus
    })
    .map((r) => r.studentId)

  // ── 2. This teacher's own assessment, untouched by anyone else ─────────────
  // Which subject the row belongs to, when the admin has assigned one.
  const [ownSubject] = await db
    .select({ id: subjects.id })
    .from(subjects)
    .where(and(eq(subjects.classId, classId), eq(subjects.teacherUserId, userId)))
    .limit(1)

  const lessonRows = records.map((rec) => ({
    schoolId,
    classId,
    studentId: rec.studentId,
    teacherUserId: userId,
    subjectId: ownSubject?.id ?? null,
    date,
    behavior: rec.behavior,
    homeworkStatus: rec.homeworkStatus,
    materialsStatus: rec.materialsStatus,
    participationStatus: rec.participationStatus,
    teacherNote: rec.teacherNote || null,
    pointsEarned: lessonPointsFor({ ...rec, date }, settings),
  }))

  await db
    .insert(lessonRecords)
    .values(lessonRows)
    .onConflictDoUpdate({
      target: [lessonRecords.studentId, lessonRecords.teacherUserId, lessonRecords.date],
      set: {
        classId: sql`excluded.class_id`,
        subjectId: sql`excluded.subject_id`,
        behavior: sql`excluded.behavior`,
        homeworkStatus: sql`excluded.homework_status`,
        materialsStatus: sql`excluded.materials_status`,
        participationStatus: sql`excluded.participation_status`,
        teacherNote: sql`excluded.teacher_note`,
        pointsEarned: sql`excluded.points_earned`,
        updatedAt: new Date(),
      },
    })

  // ── 3. The family hears it from the school first ──────────────────────────
  // Only for today, and only for a plain absence: an authorised leave is
  // already known at home, and announcing a correction to a day three weeks ago
  // would fill three hundred pockets with news nobody can act on.
  if (newlyAbsentIds.length > 0 && date === schoolToday()) {
    const { notify, notifiedTodayFor } = await import('@/lib/notifications')
    // The owner of an absence may undo it and a later period write a fresh one;
    // the family should still hear it once.
    const alreadyTold = await notifiedTodayFor(schoolId, 'absence', newlyAbsentIds)
    const absentees = await db
      .select({ id: students.id, fullName: students.fullName, parentUserId: students.parentUserId })
      .from(students)
      .where(and(eq(students.classId, classId), inArray(students.id, newlyAbsentIds)))

    await notify(
      absentees
        .filter((s) => !!s.parentUserId && !alreadyTold.has(s.id))
        .map((s) => ({
          schoolId,
          recipientUserId: s.parentUserId!,
          kind: 'absence' as const,
          title: `غياب: ${s.fullName}`,
          body: `تم تسجيل غياب ${s.fullName} اليوم ${formatDateAr(date)}. إن كان هناك عذر فيرجى التواصل مع المدرسة.`,
          href: '/parent',
          entityId: s.id,
          actorName: access.fullName,
        })),
    )
  }

  // Saving an earlier day overwrites values nobody kept a copy of, so it leaves
  // a trail. Today's save needs none: the row itself carries the teacher who
  // wrote it and the moment it was written.
  if (date !== schoolToday()) {
    const [cls] = await db.select({ name: classes.name }).from(classes).where(eq(classes.id, classId)).limit(1)
    await logTeacherAudit(access, 'teacher.dailyRecords.backdated', `فصل ${cls?.name ?? ''} — ${date}`, {
      classId,
      date,
      students: attendanceRows.length,
    })
  }

  revalidatePath(`/teacher/classes/${classId}`)
  return { ok: true, blocked: await describeAbsences(classId, date, blockedIds) }
}

/** Names for the students whose standing absence overrode what was submitted. */
async function describeAbsences(classId: string, date: string, studentIds: string[]): Promise<BlockedAbsence[]> {
  if (studentIds.length === 0) return []
  const rows = await db
    .select({
      studentId: dailyRecords.studentId,
      studentName: students.fullName,
      teacherName: teachers.fullName,
      status: dailyRecords.attendanceStatus,
      at: dailyRecords.absenceMarkedAt,
    })
    .from(dailyRecords)
    .innerJoin(students, eq(students.id, dailyRecords.studentId))
    .leftJoin(teachers, eq(teachers.userId, dailyRecords.absenceMarkedBy))
    .where(and(
      eq(dailyRecords.classId, classId),
      eq(dailyRecords.date, date),
      inArray(dailyRecords.studentId, studentIds),
    ))
  return rows.map((r) => ({
    studentId: r.studentId,
    studentName: r.studentName,
    teacherName: r.teacherName ?? 'معلم آخر',
    status: r.status,
    at: r.at ? r.at.toISOString() : null,
  }))
}

/**
 * Absences on this day that were recorded by somebody else — the roster locks
 * these students so the teacher sees why before trying to change them.
 */
export type AbsenceLock = { studentId: string; teacherName: string; status: string; at: string | null }

export async function getAbsenceLocks(classId: string, date: string): Promise<AbsenceLock[]> {
  const { userId } = await requireTeacherForClass(classId)
  if (!isValidDateString(date)) return []

  const rows = await db
    .select({
      studentId: dailyRecords.studentId,
      markedBy: dailyRecords.absenceMarkedBy,
      status: dailyRecords.attendanceStatus,
      at: dailyRecords.absenceMarkedAt,
      teacherName: teachers.fullName,
    })
    .from(dailyRecords)
    .leftJoin(teachers, eq(teachers.userId, dailyRecords.absenceMarkedBy))
    .where(and(
      eq(dailyRecords.classId, classId),
      eq(dailyRecords.date, date),
      inArray(dailyRecords.attendanceStatus, [...OUT_OF_SCHOOL]),
      isNotNull(dailyRecords.absenceMarkedBy),
    ))

  return rows
    .filter((r) => r.markedBy !== userId)
    .map((r) => ({
      studentId: r.studentId,
      teacherName: r.teacherName ?? 'معلم آخر',
      status: r.status,
      at: r.at ? r.at.toISOString() : null,
    }))
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
  const { userId } = await requireTeacherForClass(classId)
  const { getRosterForDay } = await import('@/lib/daily-roster')
  return getRosterForDay(classId, date, userId)
}

/**
 * What one teacher sees when they open a day: the shared attendance plus their
 * OWN assessment. A colleague's behaviour or homework marks are none of their
 * business — each teacher judges the lesson they taught.
 */

// ── Get student total points ──────────────────────────────────────────────────
export async function getStudentTotalPoints(studentId: string) {
  const { schoolId } = await requireTeacher()
  await requireStudentAccessible(studentId, schoolId)
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
  await requireStudentAccessible(studentId, schoolId)
  const { getSchoolSettings } = await import('@/app/admin/(dashboard)/settings/actions-settings')
  const settings = await getSchoolSettings(schoolId)
  return buildPointsHistory(studentId, settings)
}

/**
 * A student id from the browser is only usable inside the caller's own school
 * — and, once the student's class has an assigned subject, only for the
 * teacher(s) assigned to it (the same rule that guards the class itself).
 */
async function requireStudentAccessible(studentId: string, schoolId: string) {
  const [row] = await db
    .select({ id: students.id, classId: students.classId })
    .from(students)
    .where(and(eq(students.id, studentId), eq(students.schoolId, schoolId)))
    .limit(1)
  if (!row) throw new Error('غير مصرح ببيانات هذا الطالب')
  if (row.classId) await requireTeacherForClass(row.classId)
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

  // A subject id on its own says nothing — it could name another class's
  // subject, or a colleague's subject in this same class.
  const [subject] = await db
    .select({ id: subjects.id, name: subjects.name })
    .from(subjects)
    .where(and(
      eq(subjects.id, input.subjectId),
      eq(subjects.classId, input.classId),
      eq(subjects.schoolId, schoolId),
      eq(subjects.teacherUserId, userId),
    ))
    .limit(1)
  if (!subject) return { ok: false, error: 'المادة المختارة ليست من موادك في هذا الفصل' }

  const examName = String(input.examName ?? '').trim().slice(0, 120)
  if (!examName) return { ok: false, error: 'اسم الاختبار مطلوب' }

  const examType: ExamType = EXAM_TYPES.includes(input.examType as ExamType)
    ? (input.examType as ExamType)
    : 'quiz'

  const maxScore = Number(input.maxScore)
  if (!Number.isInteger(maxScore) || maxScore < 1 || maxScore > 1000) {
    return { ok: false, error: 'الدرجة القصوى يجب أن تكون رقماً صحيحاً بين 1 و 1000' }
  }

  // Both of these used to be constants: semester 'first' forever, and the year
  // hard-coded to '1446' while this school is in 1448. Every mark was therefore
  // filed under a year the school has never been in, and — because the replace
  // below matches on (subject, exam name, term, year) — the second term's
  // "اختبار قصير ١" would have overwritten the first term's instead of being a
  // second exam. They come from the school row now.
  const [school] = await db
    .select({ semester: schools.currentSemester, academicYear: schools.academicYear })
    .from(schools)
    .where(eq(schools.id, schoolId))
    .limit(1)
  if (!school) return { ok: false, error: 'تعذّر تحديد العام الدراسي — راجع الإدارة' }
  const semester = school.semester
  const academicYear = school.academicYear

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
// Scoped to the caller's own subjects — a colleague teaching another subject
// in the same class should not see these exam scores.
export async function getSavedGrades(classId: string) {
  const { userId } = await requireTeacherForClass(classId)
  const classSubjects = await db
    .select({ id: subjects.id })
    .from(subjects)
    .where(and(eq(subjects.classId, classId), eq(subjects.teacherUserId, userId)))
    
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

// ── Behaviour cases ──────────────────────────────────────────────────────────
/**
 * A teacher no longer opens WhatsApp to a family about a problem. They raise a
 * case, and the student counsellor reads it before anything reaches a home —
 * because a note written in a bad moment cannot be taken back, and in some
 * houses it lands on the child. Praise still goes straight to the parent:
 * there is no reason to put a gate in front of thanks.
 */
export async function raiseBehaviorCase(input: {
  studentId: string
  classId: string
  note: string
}): Promise<ActionResult> {
  const access = await requireTeacherForClass(input.classId)
  const { userId, schoolId } = access

  const note = String(input.note ?? '').trim().slice(0, 2000)
  if (note.length < 5) {
    return { ok: false, error: 'اكتب ما حدث — الموجه لا يستطيع الحكم على حالة بلا وصف' }
  }

  const [student] = await db
    .select({ id: students.id, fullName: students.fullName })
    .from(students)
    .where(and(eq(students.id, input.studentId), eq(students.classId, input.classId)))
    .limit(1)
  if (!student) return { ok: false, error: 'الطالب ليس في هذا الفصل' }

  const [ownSubject] = await db
    .select({ id: subjects.id })
    .from(subjects)
    .where(and(eq(subjects.classId, input.classId), eq(subjects.teacherUserId, userId)))
    .limit(1)

  const [created] = await db.insert(behaviorCases).values({
    schoolId,
    studentId: input.studentId,
    classId: input.classId,
    subjectId: ownSubject?.id ?? null,
    raisedByUserId: userId,
    teacherNote: note,
    date: schoolToday(),
    status: 'open',
    // Unowned until a counsellor opens it; the deputy overview surfaces
    // anything left sitting here.
    ownerUserId: null,
  }).returning({ id: behaviorCases.id })
  const caseId = created?.id ?? null

  await logTeacherAudit(access, 'case.raised', student.fullName, { classId: input.classId })

  // Somebody has to be told, or the case sits in a queue nobody knows about.
  const { notify, counselorsForClass } = await import('@/lib/notifications')
  const counselors = await counselorsForClass(schoolId, input.classId)
  await notify(counselors.map((userId) => ({
    schoolId,
    recipientUserId: userId,
    kind: 'case_raised' as const,
    title: `حالة جديدة: ${student.fullName}`,
    body: note.slice(0, 300),
    href: '/counselor',
    entityId: caseId,
    actorName: access.fullName,
  })))

  revalidatePath(`/teacher/classes/${input.classId}`)
  return { ok: true }
}

/**
 * The status of the cases this teacher raised for a class — never the
 * counsellor's notes. A teacher who hears nothing back assumes they were
 * ignored and goes around the system.
 */
export async function getMyCaseStatuses(classId: string, date: string) {
  const { userId } = await requireTeacherForClass(classId)
  if (!isValidDateString(date)) return []

  const rows = await db
    .select({
      studentId: behaviorCases.studentId,
      status: behaviorCases.status,
      date: behaviorCases.date,
    })
    .from(behaviorCases)
    .where(and(
      eq(behaviorCases.classId, classId),
      eq(behaviorCases.raisedByUserId, userId),
    ))
    .orderBy(desc(behaviorCases.createdAt))

  return rows
}
