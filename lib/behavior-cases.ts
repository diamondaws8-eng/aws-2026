import { db } from '@/lib/db'
import { behaviorCases, students, classes, gradeLevels, teachers, schoolStaff, subjects } from '@/lib/db/schema'
import { eq, and, inArray, desc, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

/** school_staff appears twice in one query: the row's owner and its escalation target. */
const escalatedStaff = alias(schoolStaff, 'escalated_staff')

/**
 * A behaviour case moves through one owner at a time. The teacher who raises it
 * never owns it; the counsellor does, until they hand it to a named deputy.
 * Two people reviewing the same case would mean nobody owns it.
 *
 * The labels live in lib/case-status.ts so the client can import them without
 * dragging the database driver into the browser bundle.
 */
export { CASE_STATUS, isCaseStatus, STALE_AFTER_DAYS } from '@/lib/case-status'
export type { CaseStatus } from '@/lib/case-status'
import { isCaseStatus, type CaseStatus } from '@/lib/case-status'

export type CaseRow = {
  id: string
  studentId: string
  studentName: string
  className: string | null
  gradeName: string | null
  subjectName: string | null
  teacherName: string
  teacherNote: string
  date: string
  status: CaseStatus
  createdAt: Date
  decidedAt: Date | null
  escalatedToName: string | null
  parentMessageSent: boolean
}

/**
 * Cases with every name already resolved. `counselorNote` is deliberately not
 * selected: it is the one field the teacher and the deputy must never see, and
 * leaving it out of the shared reader means it cannot leak by accident.
 */
export async function listCases(opts: {
  schoolId: string
  classIds?: string[] | null
  statuses?: CaseStatus[]
  escalatedTo?: string
  raisedBy?: string
  limit?: number
}): Promise<CaseRow[]> {
  const filters = [eq(behaviorCases.schoolId, opts.schoolId)]
  if (opts.classIds) {
    if (opts.classIds.length === 0) return []
    filters.push(inArray(behaviorCases.classId, opts.classIds))
  }
  if (opts.statuses?.length) filters.push(inArray(behaviorCases.status, opts.statuses))
  if (opts.escalatedTo) filters.push(eq(behaviorCases.escalatedToUserId, opts.escalatedTo))
  if (opts.raisedBy) filters.push(eq(behaviorCases.raisedByUserId, opts.raisedBy))

  const rows = await db
    .select({
      id: behaviorCases.id,
      studentId: behaviorCases.studentId,
      studentName: students.fullName,
      className: classes.name,
      gradeName: gradeLevels.name,
      subjectName: subjects.name,
      teacherName: teachers.fullName,
      teacherNote: behaviorCases.teacherNote,
      date: behaviorCases.date,
      status: behaviorCases.status,
      createdAt: behaviorCases.createdAt,
      decidedAt: behaviorCases.decidedAt,
      escalatedToName: escalatedStaff.fullName,
      parentMessageSent: behaviorCases.parentMessageSent,
    })
    .from(behaviorCases)
    .leftJoin(students, eq(students.id, behaviorCases.studentId))
    .leftJoin(classes, eq(classes.id, behaviorCases.classId))
    .leftJoin(gradeLevels, eq(gradeLevels.id, classes.gradeLevelId))
    .leftJoin(subjects, eq(subjects.id, behaviorCases.subjectId))
    .leftJoin(teachers, eq(teachers.userId, behaviorCases.raisedByUserId))
    .leftJoin(escalatedStaff, eq(escalatedStaff.userId, behaviorCases.escalatedToUserId))
    .where(and(...filters))
    .orderBy(desc(behaviorCases.createdAt))
    .limit(opts.limit ?? 100)

  return rows.map((r) => ({
    ...r,
    studentName: r.studentName ?? 'طالب محذوف',
    teacherName: r.teacherName ?? 'معلم محذوف',
    status: (isCaseStatus(r.status) ? r.status : 'open') as CaseStatus,
  }))
}

/**
 * The head of a case: who, which class, which teacher, when — and no note.
 *
 * The administration watches for cases the counsellor has left sitting, and
 * that watching needs a name and a date, not the account of what the child did.
 * Selecting the note and simply not rendering it was not enough: it still left
 * the server inside the page payload, readable by anyone who looked. A case's
 * story stays with the counsellor until they hand it over.
 */
export type CaseHead = {
  id: string
  studentId: string
  studentName: string
  className: string | null
  gradeName: string | null
  teacherName: string
  date: string
  status: CaseStatus
  createdAt: Date
}

export async function listCaseHeads(opts: {
  schoolId: string
  classIds?: string[] | null
  statuses?: CaseStatus[]
  limit?: number
}): Promise<CaseHead[]> {
  const filters = [eq(behaviorCases.schoolId, opts.schoolId)]
  if (opts.classIds) {
    if (opts.classIds.length === 0) return []
    filters.push(inArray(behaviorCases.classId, opts.classIds))
  }
  if (opts.statuses?.length) filters.push(inArray(behaviorCases.status, opts.statuses))

  const rows = await db
    .select({
      id: behaviorCases.id,
      studentId: behaviorCases.studentId,
      studentName: students.fullName,
      className: classes.name,
      gradeName: gradeLevels.name,
      teacherName: teachers.fullName,
      date: behaviorCases.date,
      status: behaviorCases.status,
      createdAt: behaviorCases.createdAt,
    })
    .from(behaviorCases)
    .leftJoin(students, eq(students.id, behaviorCases.studentId))
    .leftJoin(classes, eq(classes.id, behaviorCases.classId))
    .leftJoin(gradeLevels, eq(gradeLevels.id, classes.gradeLevelId))
    .leftJoin(teachers, eq(teachers.userId, behaviorCases.raisedByUserId))
    .where(and(...filters))
    .orderBy(desc(behaviorCases.createdAt))
    .limit(opts.limit ?? 100)

  return rows.map((r) => ({
    ...r,
    studentName: r.studentName ?? 'طالب محذوف',
    teacherName: r.teacherName ?? 'معلم محذوف',
    status: (isCaseStatus(r.status) ? r.status : 'open') as CaseStatus,
  }))
}

/** Counts by status, for the deputy's overview — numbers, never contents. */
export async function countCasesByStatus(schoolId: string, classIds?: string[] | null) {
  const filters = [eq(behaviorCases.schoolId, schoolId)]
  if (classIds) {
    if (classIds.length === 0) return {} as Record<string, number>
    filters.push(inArray(behaviorCases.classId, classIds))
  }
  const rows = await db
    .select({ status: behaviorCases.status, count: sql<number>`COUNT(*)`.mapWith(Number) })
    .from(behaviorCases)
    .where(and(...filters))
    .groupBy(behaviorCases.status)
  return Object.fromEntries(rows.map((r) => [r.status, r.count])) as Record<string, number>
}

/**
 * How many cases each teacher raised. One teacher raising forty while their
 * colleagues raise three is not a pupil problem, and only somebody above both
 * of them is in a position to notice.
 */
export async function countCasesByTeacher(schoolId: string, classIds?: string[] | null) {
  const filters = [eq(behaviorCases.schoolId, schoolId)]
  if (classIds) {
    if (classIds.length === 0) return []
    filters.push(inArray(behaviorCases.classId, classIds))
  }
  const rows = await db
    .select({
      teacherUserId: behaviorCases.raisedByUserId,
      teacherName: teachers.fullName,
      total: sql<number>`COUNT(*)`.mapWith(Number),
      dismissed: sql<number>`COUNT(*) FILTER (WHERE ${behaviorCases.status} = 'dismissed')`.mapWith(Number),
    })
    .from(behaviorCases)
    .leftJoin(teachers, eq(teachers.userId, behaviorCases.raisedByUserId))
    .where(and(...filters))
    .groupBy(behaviorCases.raisedByUserId, teachers.fullName)
    .orderBy(desc(sql`COUNT(*)`))
  return rows.map((r) => ({ ...r, teacherName: r.teacherName ?? 'معلم محذوف' }))
}

/** Students carrying several open or recent cases — a pattern, not an incident. */
export async function countCasesByStudent(schoolId: string, classIds?: string[] | null, minimum = 2) {
  const filters = [eq(behaviorCases.schoolId, schoolId)]
  if (classIds) {
    if (classIds.length === 0) return []
    filters.push(inArray(behaviorCases.classId, classIds))
  }
  const rows = await db
    .select({
      studentId: behaviorCases.studentId,
      studentName: students.fullName,
      className: classes.name,
      total: sql<number>`COUNT(*)`.mapWith(Number),
      teachers: sql<number>`COUNT(DISTINCT ${behaviorCases.raisedByUserId})`.mapWith(Number),
    })
    .from(behaviorCases)
    .leftJoin(students, eq(students.id, behaviorCases.studentId))
    .leftJoin(classes, eq(classes.id, behaviorCases.classId))
    .where(and(...filters))
    .groupBy(behaviorCases.studentId, students.fullName, classes.name)
    .having(sql`COUNT(*) >= ${minimum}`)
    .orderBy(desc(sql`COUNT(*)`))
  return rows.map((r) => ({ ...r, studentName: r.studentName ?? 'طالب محذوف' }))
}
