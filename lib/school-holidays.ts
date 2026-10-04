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
import {
  DEFAULT_SCHOOL_DAYS, nonSchoolDayReason, isRemoteSuspensionName,
  type Holiday, type SchoolDaysConfig,
} from '@/lib/school-days'

export type StoredHoliday = Holiday & { id: string; gradeLevelId: string | null; kind: string }

/** Every holiday on file, school-wide ones and stage-specific ones alike. */
export const listSchoolHolidays = cache(async (schoolId: string): Promise<StoredHoliday[]> => {
  return db
    .select({
      id: schoolHolidays.id,
      name: schoolHolidays.name,
      startDate: schoolHolidays.startDate,
      endDate: schoolHolidays.endDate,
      gradeLevelId: schoolHolidays.gradeLevelId,
      kind: schoolHolidays.kind,
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
    db
      .select({
        name: schoolHolidays.name,
        startDate: schoolHolidays.startDate,
        endDate: schoolHolidays.endDate,
        kind: schoolHolidays.kind,
      })
      .from(schoolHolidays)
      .where(and(
        eq(schoolHolidays.schoolId, schoolId),
        gradeLevelId
          ? or(isNull(schoolHolidays.gradeLevelId), eq(schoolHolidays.gradeLevelId, gradeLevelId))
          : isNull(schoolHolidays.gradeLevelId),
      ))
      // An order, so two overlapping ranges are always read the same way round.
      .orderBy(asc(schoolHolidays.startDate), asc(schoolHolidays.endDate)),
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

// ── What a family or a teacher is told about the calendar ────────────────────

export type CalendarNotice = {
  /**
   * Why today is not taught, or null on an ordinary school day.
   *
   * `within` names the holiday or suspension today falls inside when the
   * reason itself is the weekly rest: a Friday in the middle of a suspended
   * week is still «الجمعة», but the family needs to know lessons are not back
   * in the building on Sunday.
   */
  today: {
    reason: string
    remote: boolean
    until: string | null
    within: { name: string; remote: boolean } | null
    /**
     * Today is a holiday, but a suspension covering it runs on past the
     * holiday's end: lessons are then at home again, not back in the building.
     * The last day of that suspension, or null.
     */
    thenRemoteUntil: string | null
  } | null
  /** Closures still ahead, soonest first — holidays and suspensions alike. */
  upcoming: { name: string; startDate: string; endDate: string; remote: boolean }[]
}

/**
 * Today's status and what is coming, for one stage (or the whole school).
 *
 * The calendar used to be something only the register knew: a family learned
 * that tomorrow was a holiday from the school gate, and that lessons had moved
 * online from a neighbour. Everything needed to tell them was already here.
 */
export async function getCalendarNotice(
  schoolId: string,
  gradeLevelId: string | null | undefined,
  today: string,
  horizonDays = 30,
  limit = 4,
): Promise<CalendarNotice> {
  const cfg = await getSchoolDaysConfig(schoolId, gradeLevelId ?? null)

  const reason = nonSchoolDayReason(today, cfg)
  const covering = reason
    ? cfg.holidays.filter((h) => today >= h.startDate && today <= h.endDate)
    : []
  // The same precedence holidayOn uses: a real holiday before a suspension.
  const cover = covering.find((h) => h.kind !== 'remote') ?? covering[0] ?? null
  // «حتى الخميس»: the latest end among the ranges of the kind being named. A
  // one-day holiday inside a week of remote lessons ends when it ends — given
  // the suspension's last day it would read as a holiday through Thursday,
  // and the child would miss three days of lessons at home.
  const until = covering
    .filter((h) => (h.kind === 'remote') === (cover?.kind === 'remote'))
    .reduce<string | null>((max, h) => (max && max > h.endDate ? max : h.endDate), null)
  const remoteEnd = covering
    .filter((h) => h.kind === 'remote')
    .reduce<string | null>((max, h) => (max && max > h.endDate ? max : h.endDate), null)
  const thenRemoteUntil = cover && cover.kind !== 'remote' && remoteEnd && until && remoteEnd > until ? remoteEnd : null

  const horizon = new Date(`${today}T00:00:00Z`)
  horizon.setUTCDate(horizon.getUTCDate() + horizonDays)
  const horizonStr = horizon.toISOString().slice(0, 10)

  const upcoming = cfg.holidays
    .filter((h) => h.startDate > today && h.startDate <= horizonStr)
    .slice(0, limit)
    .map((h) => ({
      name: h.name,
      startDate: h.startDate,
      endDate: h.endDate,
      remote: h.kind === 'remote' || isRemoteSuspensionName(h.name),
    }))

  return {
    today: reason
      ? {
          reason,
          remote: isRemoteSuspensionName(reason),
          until,
          thenRemoteUntil,
          within: cover && cover.name !== reason
            ? { name: cover.name, remote: cover.kind === 'remote' || isRemoteSuspensionName(cover.name) }
            : null,
        }
      : null,
    upcoming,
  }
}
