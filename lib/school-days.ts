/**
 * Which days the school actually teaches on — no database import.
 *
 * Nothing in the system knew about weekends. It survived that because a day
 * with no records is drawn as a gap rather than as 0%, so Friday never showed
 * a false figure. What it could not survive was counting: a 14-day window
 * always contains four weekend days, so the dashboard reported "4 of 14 days
 * with no recording" at a school that had recorded every single school day.
 *
 * Friday is fixed. Saturday is the school's own call — some weeks are taught,
 * some are not — so it is a setting, not a constant.
 */

/** 0 = Sunday … 6 = Saturday, read in UTC so the string's own day is used. */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay()
}

export const FRIDAY = 5
export const SATURDAY = 6

export type Holiday = { name: string; startDate: string; endDate: string }

export type SchoolDaysConfig = {
  saturdayIsSchoolDay: boolean
  /** Inclusive ranges, YYYY-MM-DD. */
  holidays: Holiday[]
}

export const DEFAULT_SCHOOL_DAYS: SchoolDaysConfig = {
  saturdayIsSchoolDay: false,
  holidays: [],
}

/** The holiday covering this date, when there is one. */
export function holidayOn(date: string, cfg: SchoolDaysConfig): Holiday | null {
  return cfg.holidays.find((h) => date >= h.startDate && date <= h.endDate) ?? null
}

export function isSchoolDay(date: string, cfg: SchoolDaysConfig): boolean {
  const day = weekdayOf(date)
  if (day === FRIDAY) return false
  if (day === SATURDAY && !cfg.saturdayIsSchoolDay) return false
  return !holidayOn(date, cfg)
}

/** Why a date is not taught on — for telling the reader instead of leaving a blank. */
export function nonSchoolDayReason(date: string, cfg: SchoolDaysConfig): string | null {
  const day = weekdayOf(date)
  if (day === FRIDAY) return 'الجمعة'
  if (day === SATURDAY && !cfg.saturdayIsSchoolDay) return 'السبت'
  return holidayOn(date, cfg)?.name ?? null
}

/**
 * The last `count` teaching days ending at `endDate` (inclusive if it is one),
 * ascending.
 *
 * The walk backwards is capped: a school that marked a whole year as holiday
 * would otherwise spin forever looking for a day that does not exist.
 */
export function lastSchoolDays(count: number, cfg: SchoolDaysConfig, endDate: string): string[] {
  const out: string[] = []
  const cursor = new Date(`${endDate}T00:00:00Z`)
  const maxLookback = count * 7 + 400

  for (let i = 0; i < maxLookback && out.length < count; i++) {
    const iso = cursor.toISOString().slice(0, 10)
    if (isSchoolDay(iso, cfg)) out.push(iso)
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }

  return out.reverse()
}

/** Teaching days inside an inclusive range — what a term report counts against. */
export function countSchoolDaysBetween(from: string, to: string, cfg: SchoolDaysConfig): number {
  let n = 0
  const cursor = new Date(`${from}T00:00:00Z`)
  const end = new Date(`${to}T00:00:00Z`)
  while (cursor <= end) {
    if (isSchoolDay(cursor.toISOString().slice(0, 10), cfg)) n++
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return n
}
