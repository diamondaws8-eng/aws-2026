/**
 * Reading the school's teaching calendar.
 *
 * Deliberately not in a 'use server' file: every export from one of those is a
 * public HTTP endpoint, and a reader taking a schoolId would hand anyone who
 * knows an id that school's calendar. This module is imported by server
 * components and libraries, which are not reachable from the network.
 */

import { cache } from 'react'
import { db } from '@/lib/db'
import { schools, schoolHolidays } from '@/lib/db/schema'
import { eq, asc } from 'drizzle-orm'
import { DEFAULT_SCHOOL_DAYS, type Holiday, type SchoolDaysConfig } from '@/lib/school-days'

export type StoredHoliday = Holiday & { id: string }

export const listSchoolHolidays = cache(async (schoolId: string): Promise<StoredHoliday[]> => {
  return db
    .select({
      id: schoolHolidays.id,
      name: schoolHolidays.name,
      startDate: schoolHolidays.startDate,
      endDate: schoolHolidays.endDate,
    })
    .from(schoolHolidays)
    .where(eq(schoolHolidays.schoolId, schoolId))
    .orderBy(asc(schoolHolidays.startDate))
})

/**
 * Everything needed to answer "is this a teaching day". Cached per request, so
 * a layout, its page and any helper below it share one pair of queries.
 */
export const getSchoolDaysConfig = cache(async (schoolId: string): Promise<SchoolDaysConfig> => {
  const [[school], holidays] = await Promise.all([
    db.select({ sat: schools.saturdayIsSchoolDay }).from(schools).where(eq(schools.id, schoolId)).limit(1),
    listSchoolHolidays(schoolId),
  ])
  if (!school) return DEFAULT_SCHOOL_DAYS
  return { saturdayIsSchoolDay: school.sat, holidays }
})
