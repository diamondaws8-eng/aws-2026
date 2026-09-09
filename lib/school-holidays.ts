/**
 * Reading the teaching calendar — the school's, and any stage that keeps its
 * own.
 *
 * Deliberately not in a 'use server' file: every export from one of those is a
 * public HTTP endpoint, and a reader taking a schoolId would hand anyone who
 * knows an id that school's calendar. This module is imported by server
 * components and libraries, which are not reachable from the network.
 *
 * Nothing is obliged to have its own calendar. A stage with no opinion on
 * Saturday inherits the school's, and a holiday with no stage closes the whole
 * school. The override exists for the building that genuinely differs — a girls'
 * side that teaches Saturday while the boys' side rests — and stays invisible
 * to every school that never needs it.
 */

import { cache } from 'react'
import { db } from '@/lib/db'
import { schools, schoolHolidays, gradeLevels } from '@/lib/db/schema'
import { eq, and, asc, or, isNull } from 'drizzle-orm'
import { DEFAULT_SCHOOL_DAYS, type Holiday, type SchoolDaysConfig } from '@/lib/school-days'

export type StoredHoliday = Holiday & { id: string; gradeLevelId: string | null }

/** Every holiday on file, school-wide ones and stage-specific ones alike. */
export const listSchoolHolidays = cache(async (schoolId: string): Promise<StoredHoliday[]> => {
  return db
    .select({
      id: schoolHolidays.id,
      name: schoolHolidays.name,
      startDate: schoolHolidays.startDate,
      endDate: schoolHolidays.endDate,
      gradeLevelId: schoolHolidays.gradeLevelId,
    })
    .from(schoolHolidays)
    .where(eq(schoolHolidays.schoolId, schoolId))
    .orderBy(asc(schoolHolidays.startDate))
})

/** What each stage has chosen for itself, if anything. */
export const listStageCalendars = cache(async (schoolId: string) => {
  return db
    .select({
      id: gradeLevels.id,
      name: gradeLevels.name,
      saturdayIsSchoolDay: gradeLevels.saturdayIsSchoolDay,
    })
    .from(gradeLevels)
    .where(eq(gradeLevels.schoolId, schoolId))
    .orderBy(asc(gradeLevels.orderIndex))
})

/**
 * Everything needed to answer "is this a teaching day".
 *
 * Pass a stage to get that stage's answer; omit it for the school's. Cached per
 * request, so a layout, its page and any helper below it share one lookup.
 */
export const getSchoolDaysConfig = cache(async (
  schoolId: string,
  gradeLevelId?: string | null,
): Promise<SchoolDaysConfig> => {
  const [[school], holidays] = await Promise.all([
    db.select({ sat: schools.saturdayIsSchoolDay }).from(schools).where(eq(schools.id, schoolId)).limit(1),
    // School-wide holidays always apply; a stage adds its own on top.
    gradeLevelId
      ? db
          .select({
            name: schoolHolidays.name,
            startDate: schoolHolidays.startDate,
            endDate: schoolHolidays.endDate,
          })
          .from(schoolHolidays)
          .where(and(
            eq(schoolHolidays.schoolId, schoolId),
            or(isNull(schoolHolidays.gradeLevelId), eq(schoolHolidays.gradeLevelId, gradeLevelId)),
          ))
      : db
          .select({
            name: schoolHolidays.name,
            startDate: schoolHolidays.startDate,
            endDate: schoolHolidays.endDate,
          })
          .from(schoolHolidays)
          .where(and(eq(schoolHolidays.schoolId, schoolId), isNull(schoolHolidays.gradeLevelId))),
  ])
  if (!school) return DEFAULT_SCHOOL_DAYS

  let saturdayIsSchoolDay = school.sat
  if (gradeLevelId) {
    const [stage] = await db
      .select({ sat: gradeLevels.saturdayIsSchoolDay })
      .from(gradeLevels)
      .where(eq(gradeLevels.id, gradeLevelId))
      .limit(1)
    // Only an explicit true/false overrides. Null is not an answer, it is the
    // absence of one — and the school's answer stands.
    if (stage && stage.sat !== null) saturdayIsSchoolDay = stage.sat
  }

  return { saturdayIsSchoolDay, holidays }
})
