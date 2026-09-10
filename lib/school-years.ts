/**
 * Reading the school's years, and reading any one of them back.
 *
 * Not in a 'use server' file: every export from one of those is a public HTTP
 * endpoint, and a reader taking a schoolId would hand anyone who knows an id a
 * year's worth of that school's figures.
 *
 * The archive is a lens, not a warehouse. Nothing is copied anywhere: a year is
 * a pair of dates, and every record already carries the date it happened on.
 */

import { cache } from 'react'
import { db } from '@/lib/db'
import {
  schoolYears, dailyRecords, lessonRecords, studentPoints,
  behaviorCases, parentWhatsappMessages, gradeEntries, students,
} from '@/lib/db/schema'
import { eq, and, gte, lte, sql, desc, isNull } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'

export type YearRow = {
  id: string
  label: string
  startDate: string
  endDate: string | null
  closedAt: Date | null
  closedByName: string | null
  summary: string | null
}

/** Newest first. The open year, when there is one, sorts to the top. */
export const listSchoolYears = cache(async (schoolId: string): Promise<YearRow[]> => {
  return db
    .select({
      id: schoolYears.id,
      label: schoolYears.label,
      startDate: schoolYears.startDate,
      endDate: schoolYears.endDate,
      closedAt: schoolYears.closedAt,
      closedByName: schoolYears.closedByName,
      summary: schoolYears.summary,
    })
    .from(schoolYears)
    .where(eq(schoolYears.schoolId, schoolId))
    .orderBy(desc(schoolYears.startDate))
})

/** The year still running, if the school has opened one. */
export const currentSchoolYear = cache(async (schoolId: string): Promise<YearRow | null> => {
  const [row] = await db
    .select({
      id: schoolYears.id,
      label: schoolYears.label,
      startDate: schoolYears.startDate,
      endDate: schoolYears.endDate,
      closedAt: schoolYears.closedAt,
      closedByName: schoolYears.closedByName,
      summary: schoolYears.summary,
    })
    .from(schoolYears)
    .where(and(eq(schoolYears.schoolId, schoolId), isNull(schoolYears.closedAt)))
    .orderBy(desc(schoolYears.startDate))
    .limit(1)
  return row ?? null
})

export type YearSummary = {
  schoolDaysRecorded: number
  present: number
  absent: number
  late: number
  excused: number
  lessonEntries: number
  points: number
  cases: number
  parentMessages: number
  grades: number
  pupilsWithRecords: number
}

/**
 * Everything that happened between two dates, counted from the live tables.
 *
 * `to` may be null for a year still running, which then means "up to today".
 */
export async function summariseYear(
  schoolId: string,
  from: string,
  to: string | null,
): Promise<YearSummary> {
  // Every one of these tables keeps its own `date` column, so the range clause
  // is written once and handed whichever column is being counted.
  const within = (col: AnyPgColumn) =>
    to ? and(gte(col, from), lte(col, to)) : gte(col, from)

  const [daily, lessons, pts, cases, msgs, marks] = await Promise.all([
    db.select({
        days: sql<number>`COUNT(DISTINCT ${dailyRecords.date})`.mapWith(Number),
        pupils: sql<number>`COUNT(DISTINCT ${dailyRecords.studentId})`.mapWith(Number),
        present: sql<number>`COUNT(*) FILTER (WHERE ${dailyRecords.attendanceStatus} = 'present')`.mapWith(Number),
        absent: sql<number>`COUNT(*) FILTER (WHERE ${dailyRecords.attendanceStatus} = 'absent')`.mapWith(Number),
        late: sql<number>`COUNT(*) FILTER (WHERE ${dailyRecords.attendanceStatus} = 'late')`.mapWith(Number),
        excused: sql<number>`COUNT(*) FILTER (WHERE ${dailyRecords.attendanceStatus} = 'excused')`.mapWith(Number),
        pointsA: sql<number>`COALESCE(SUM(${dailyRecords.pointsEarned}), 0)`.mapWith(Number),
      })
      .from(dailyRecords)
      .where(and(eq(dailyRecords.schoolId, schoolId), within(dailyRecords.date))),

    db.select({
        entries: sql<number>`COUNT(*)`.mapWith(Number),
        pointsL: sql<number>`COALESCE(SUM(${lessonRecords.pointsEarned}), 0)`.mapWith(Number),
      })
      .from(lessonRecords)
      .where(and(eq(lessonRecords.schoolId, schoolId), within(lessonRecords.date))),

    db.select({ v: sql<number>`COALESCE(SUM(${studentPoints.points}), 0)`.mapWith(Number) })
      .from(studentPoints)
      .where(and(eq(studentPoints.schoolId, schoolId), within(studentPoints.date))),

    db.select({ n: sql<number>`COUNT(*)`.mapWith(Number) })
      .from(behaviorCases)
      .where(and(eq(behaviorCases.schoolId, schoolId), within(behaviorCases.date))),

    db.select({ n: sql<number>`COUNT(*)`.mapWith(Number) })
      .from(parentWhatsappMessages)
      .where(and(eq(parentWhatsappMessages.schoolId, schoolId), within(parentWhatsappMessages.date))),

    // Marks carry no date of their own — they are stamped with the year label,
    // so they are counted through createdAt instead.
    db.select({ n: sql<number>`COUNT(*)`.mapWith(Number) })
      .from(gradeEntries)
      .where(and(
        eq(gradeEntries.schoolId, schoolId),
        sql`${gradeEntries.createdAt}::date >= ${from}::date`,
        to ? sql`${gradeEntries.createdAt}::date <= ${to}::date` : sql`true`,
      )),
  ])

  const d = daily[0]
  return {
    schoolDaysRecorded: d?.days ?? 0,
    present: d?.present ?? 0,
    absent: d?.absent ?? 0,
    late: d?.late ?? 0,
    excused: d?.excused ?? 0,
    lessonEntries: lessons[0]?.entries ?? 0,
    points: (d?.pointsA ?? 0) + (lessons[0]?.pointsL ?? 0) + (pts[0]?.v ?? 0),
    cases: cases[0]?.n ?? 0,
    parentMessages: msgs[0]?.n ?? 0,
    grades: marks[0]?.n ?? 0,
    pupilsWithRecords: d?.pupils ?? 0,
  }
}

/** Pupils who left in a given year — the leavers list belongs to its year. */
export async function graduatesOfYear(schoolId: string, label: string) {
  return db
    .select({ id: students.id, fullName: students.fullName, graduatedAt: students.graduatedAt })
    .from(students)
    .where(and(
      eq(students.schoolId, schoolId),
      eq(students.status, 'graduated'),
      eq(students.graduationYear, label),
    ))
    .orderBy(students.fullName)
}
