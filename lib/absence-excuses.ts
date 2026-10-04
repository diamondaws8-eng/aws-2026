import { db } from '@/lib/db'
import { absenceExcuses, students, classes, gradeLevels, dailyRecords } from '@/lib/db/schema'
import { and, asc, desc, eq, gte, inArray, ne, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { ExcuseStatus } from '@/lib/excuse-rules'

/**
 * Reading absence excuses — for the family that wrote them and the office
 * that answers them.
 *
 * Deliberately not in a 'use server' file: every export from one of those is a
 * public HTTP endpoint, and both readers here take an id and trust it. The
 * caller has already established whose pupil, or whose school, is being asked
 * about.
 */

// The column is plain text. Anything unexpected reads as still waiting — never
// as an answer nobody gave.
const asStatus = (v: string): ExcuseStatus => (v === 'accepted' || v === 'rejected' ? v : 'pending')

/** One pupil's excuses on or after `since`, newest day first. */
export async function excusesForStudent(
  studentId: string,
  since: string,
): Promise<{ date: string; status: ExcuseStatus; reason: string; decisionNote: string | null }[]> {
  const rows = await db
    .select({
      date: absenceExcuses.date,
      status: absenceExcuses.status,
      reason: absenceExcuses.reason,
      decisionNote: absenceExcuses.decisionNote,
    })
    .from(absenceExcuses)
    .where(and(eq(absenceExcuses.studentId, studentId), gte(absenceExcuses.date, since)))
    .orderBy(desc(absenceExcuses.date))

  return rows.map((r) => ({ ...r, status: asStatus(r.status) }))
}

export type OfficeExcuse = {
  id: string
  date: string
  reason: string
  status: ExcuseStatus
  decisionNote: string | null
  decidedByName: string | null
  decidedAt: string | null
  createdAt: string
  studentId: string
  studentName: string
  classId: string | null
  className: string | null
  gradeLevelId: string | null
  gradeName: string | null
  parentPhone: string | null
  /** What the register says about that day now — null when it holds no row for it. */
  dayStatus: string | null
}

/** The class the pupil sits in today, beside the class of the absent day. */
const currentClass = alias(classes, 'current_class')

/**
 * Every excuse still waiting, oldest first — the family that has waited
 * longest is answered first — then the fifty most recently answered.
 *
 * The stage is that of the class the pupil was in on the absent day. When
 * that class has since been deleted, the pupil's present class answers
 * instead, so the excuse still lands on a desk; with neither, the stage is
 * null and only somebody who covers the whole school is shown the row. The
 * action that decides an excuse resolves the stage the same way.
 *
 * A pupil since deleted simply drops out: there is no day left to excuse.
 *
 * `stageIds` is the reader's own stages, or null for somebody who sees the
 * whole school. It is applied here, before the fifty are cut: cut first, a
 * deputy of one stage was shown whatever part of the school's latest fifty
 * happened to be theirs — often nothing at all.
 */
export async function listExcusesForOffice(schoolId: string, stageIds: string[] | null): Promise<OfficeExcuse[]> {
  if (stageIds && stageIds.length === 0) return []
  const stage = sql`COALESCE(${classes.gradeLevelId}, ${currentClass.gradeLevelId})`
  const inScope = stageIds ? inArray(stage, stageIds) : undefined
  const read = () =>
    db
      .select({
        id: absenceExcuses.id,
        date: absenceExcuses.date,
        reason: absenceExcuses.reason,
        status: absenceExcuses.status,
        decisionNote: absenceExcuses.decisionNote,
        decidedByName: absenceExcuses.decidedByName,
        decidedAt: absenceExcuses.decidedAt,
        createdAt: absenceExcuses.createdAt,
        studentId: students.id,
        studentName: students.fullName,
        parentPhone: students.parentPhone,
        dayClassId: classes.id,
        dayClassName: classes.name,
        currentClassId: currentClass.id,
        currentClassName: currentClass.name,
        gradeLevelId: gradeLevels.id,
        gradeName: gradeLevels.name,
        // The register as it stands, not as it stood when the excuse was sent:
        // a teacher may have recorded a late arrival since, or the office
        // corrected the day by hand. The later row wins, as everywhere else.
        dayStatus: sql<string | null>`(
          SELECT d.attendance_status FROM ${dailyRecords} d
          WHERE d.student_id = ${absenceExcuses.studentId} AND d.date = ${absenceExcuses.date}
          ORDER BY d.updated_at DESC LIMIT 1
        )`,
      })
      .from(absenceExcuses)
      .innerJoin(students, eq(students.id, absenceExcuses.studentId))
      .leftJoin(classes, eq(classes.id, absenceExcuses.classId))
      .leftJoin(currentClass, eq(currentClass.id, students.classId))
      .leftJoin(gradeLevels, eq(gradeLevels.id, stage))

  const [pending, decided] = await Promise.all([
    read()
      .where(and(eq(absenceExcuses.schoolId, schoolId), eq(absenceExcuses.status, 'pending'), inScope))
      .orderBy(asc(absenceExcuses.createdAt)),
    read()
      .where(and(eq(absenceExcuses.schoolId, schoolId), ne(absenceExcuses.status, 'pending'), inScope))
      .orderBy(desc(absenceExcuses.decidedAt))
      .limit(50),
  ])

  return [...pending, ...decided].map((r) => ({
    id: r.id,
    date: r.date,
    reason: r.reason,
    status: asStatus(r.status),
    decisionNote: r.decisionNote,
    decidedByName: r.decidedByName,
    decidedAt: r.decidedAt ? r.decidedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    studentId: r.studentId,
    studentName: r.studentName,
    classId: r.dayClassId ?? r.currentClassId,
    className: r.dayClassId ? r.dayClassName : r.currentClassName,
    gradeLevelId: r.gradeLevelId,
    gradeName: r.gradeName,
    parentPhone: r.parentPhone,
    dayStatus: r.dayStatus,
  }))
}
