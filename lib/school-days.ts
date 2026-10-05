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

/**
 * 'remote' is a day the building is shut and lessons go on from home. To the
 * register it is a holiday in every respect; only its name differs.
 */
export type HolidayKind = 'holiday' | 'remote'

export const isHolidayKind = (v: unknown): v is HolidayKind => v === 'holiday' || v === 'remote'

export type Holiday = { name: string; startDate: string; endDate: string; kind?: string | null }

export type SchoolDaysConfig = {
  saturdayIsSchoolDay: boolean
  /** Inclusive ranges, YYYY-MM-DD. */
  holidays: Holiday[]
}

export const DEFAULT_SCHOOL_DAYS: SchoolDaysConfig = {
  saturdayIsSchoolDay: false,
  holidays: [],
}

/**
 * The holiday covering this date, when there is one.
 *
 * A suspension can be laid over a week that already holds a real holiday —
 * National Day inside a week of rain. That day is then the holiday, not the
 * suspension, whichever row the database happens to return first.
 */
export function holidayOn(date: string, cfg: SchoolDaysConfig): Holiday | null {
  const covering = cfg.holidays.filter((h) => date >= h.startDate && date <= h.endDate)
  // Before the school went live comes before everything: a holiday entered in
  // advance for those weeks does not make them the school's own days.
  return covering.find((h) => h.kind === 'setup') ?? covering.find((h) => h.kind !== 'remote') ?? covering[0] ?? null
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

// ── Before the school goes live ──────────────────────────────────────────────

/** Every day, while the school is still being set up. */
export const NOT_LIVE_LABEL = 'لم يبدأ التشغيل الفعلي للمنصة بعد'
/** The days before the first real one, once it has been named. */
export const BEFORE_LIVE_LABEL = 'قبل بداية التشغيل الفعلي'

export const isSetupClosure = (reason: string | null | undefined): boolean =>
  reason === NOT_LIVE_LABEL || reason === BEFORE_LIVE_LABEL

/**
 * The closure that keeps every day before the launch from being a teaching
 * day.
 *
 * Laid over the calendar rather than checked screen by screen: the roster,
 * the office's register, the dashboards, the missed-day reminders and the
 * family's page all ask the calendar whether a day is taught, so one entry
 * here closes all of them at once — and none can be forgotten. `liveSince`
 * null means the school has not been launched: every day is closed.
 */
export function launchClosure(liveSince: string | null | undefined): Holiday | null {
  if (!liveSince) return { name: NOT_LIVE_LABEL, startDate: '0000-01-01', endDate: '9999-12-31', kind: 'setup' }
  const d = new Date(`${liveSince}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return null
  d.setUTCDate(d.getUTCDate() - 1)
  return { name: BEFORE_LIVE_LABEL, startDate: '0000-01-01', endDate: d.toISOString().slice(0, 10), kind: 'setup' }
}

// ── Naming a suspension ──────────────────────────────────────────────────────

/**
 * Every suspension is stored under a name that begins with this, so the name
 * alone says what the day is wherever it is printed — a list, an export, an
 * audit line — without each of those having to be taught about kinds.
 */
export const REMOTE_SUSPENSION_LABEL = 'تعليق الدراسة الحضورية (عن بُعد)'

/**
 * The name a suspension is filed under, with the reason when one was given.
 * A colon, not a dash: the name is dropped into sentences that carry on with
 * a dash of their own — «… — لا سجل متوقع».
 */
export function remoteSuspensionName(reason?: string | null): string {
  const why = String(reason ?? '').trim()
  return why ? `${REMOTE_SUSPENSION_LABEL}: ${why}` : REMOTE_SUSPENSION_LABEL
}

export function isRemoteSuspensionName(reason: string | null | undefined): boolean {
  return !!reason && reason.startsWith(REMOTE_SUSPENSION_LABEL)
}

/** True for the two weekly rest days, which read differently from a named holiday. */
export function isWeeklyRest(reason: string | null | undefined): boolean {
  return reason === 'الجمعة' || reason === 'السبت'
}

/**
 * A name that already says what it is. The announced calendar calls every
 * entry «إجازة …», and wrapping that in the word again prints
 * «يوم إجازة (إجازة الخريف)» on an official sheet. Typed by hand it is as
 * often «اجازة» without the hamza, which is the same word.
 */
export const saysHoliday = (reason: string) => /^\s*[إأا]جاز[ةه]/.test(reason)
// The setup closure is not a holiday either: «يوم إجازة (لم يبدأ التشغيل…)»
// would tell a teacher the school was on leave.
const namesItself = (reason: string) => isRemoteSuspensionName(reason) || saysHoliday(reason) || isSetupClosure(reason)

/**
 * A closed day in one phrase, from the reason nonSchoolDayReason gave.
 *
 * «يوم إجازة (عيد الفطر)» for a holiday or the weekly rest. A suspension is
 * named as itself: calling a day of remote lessons a holiday would tell
 * families there was no school at all.
 */
export function closedDayPhrase(reason: string): string {
  return namesItself(reason) ? reason : `يوم إجازة (${reason})`
}

/**
 * The same, as a heading for today: «اليوم الجمعة», «إجازة: عيد الفطر», or the
 * name alone when it speaks for itself.
 */
export function closedTodayHeading(reason: string): string {
  if (isWeeklyRest(reason)) return `اليوم ${reason}`
  return namesItself(reason) ? reason : `إجازة: ${reason}`
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

/** Calendar days in an inclusive range — «٩ أيام». */
export function daysInRange(from: string, to: string): number {
  const ms = new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()
  return Math.floor(ms / 86_400_000) + 1
}

/** `date` moved by `days` (negative goes back), as YYYY-MM-DD. */
export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
