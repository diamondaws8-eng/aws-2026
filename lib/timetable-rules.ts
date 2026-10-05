/**
 * The shape of a school week's timetable — names and limits only, no database
 * import, so the editor in the browser and the action on the server read the
 * same rules.
 */

/** As many lessons as a day is ever given a row for. */
export const MAX_PERIODS = 10

/** How many rows a new, empty timetable opens with. */
export const DEFAULT_PERIODS = 7

/** 0 = Sunday … 6 = Saturday, the numbering lib/school-days.ts uses. */
export const WEEKDAY_NAMES: Record<number, string> = {
  0: 'الأحد',
  1: 'الاثنين',
  2: 'الثلاثاء',
  3: 'الأربعاء',
  4: 'الخميس',
  5: 'الجمعة',
  6: 'السبت',
}

/**
 * The days a timetable has a column for, in the order the school week runs.
 * Friday never; Saturday only for a stage that teaches on it — and then last,
 * because the week here opens on Sunday.
 */
export function timetableDays(saturdayIsSchoolDay: boolean): number[] {
  return saturdayIsSchoolDay ? [0, 1, 2, 3, 4, 6] : [0, 1, 2, 3, 4]
}

const ORDINALS = ['الأولى', 'الثانية', 'الثالثة', 'الرابعة', 'الخامسة', 'السادسة', 'السابعة', 'الثامنة', 'التاسعة', 'العاشرة']

/** «الحصة الثالثة». */
export const periodName = (period: number): string => `الحصة ${ORDINALS[period - 1] ?? period}`

/** «الثالثة» — for a list that already says these are lessons. */
export const periodOrdinal = (period: number): string => ORDINALS[period - 1] ?? String(period)

/** One cell as the editor sends it. */
export type SlotInput = { weekday: number; period: number; subjectId: string }

export const isTimetableWeekday = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 6 && v !== 5

export const isPeriod = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= MAX_PERIODS

/**
 * A week as one string — the same week always the same string, whatever order
 * its cells were filled in. The editor sends the fingerprint of the week it
 * opened with every save, and the server refuses when the stored week no
 * longer matches it: somebody else has written this class's timetable since.
 */
export function slotsFingerprint(slots: SlotInput[]): string {
  return slots
    .map((s) => `${s.weekday}|${s.period}=${s.subjectId}`)
    .sort()
    .join(';')
}
