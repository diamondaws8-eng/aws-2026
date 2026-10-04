/**
 * The academic calendar — labels and validation only, no database import.
 *
 * Needed on the server (stamping a mark) and in the browser (telling a teacher
 * where their marks are about to land), so this file follows lib/case-status.ts
 * and stays free of anything that drags the Postgres driver into the client.
 */

/**
 * Two: the school year is a first term and a second, and nothing after it.
 * A third used to be offered here for the years the ministry ran three; it
 * only left a choice on the settings page that no day of this school's year
 * belongs to, and a mark stamped with it would sit in a term that never was.
 */
export const SEMESTERS = ['first', 'second'] as const
export type Semester = (typeof SEMESTERS)[number]

export const SEMESTER_LABELS: Record<Semester, string> = {
  first: 'الفصل الدراسي الأول',
  second: 'الفصل الدراسي الثاني',
}

export const isSemester = (v: string): v is Semester => (SEMESTERS as readonly string[]).includes(v)

/**
 * Terms that can no longer be chosen but may still be written on an old mark —
 * one restored from a backup of a three-term year. It keeps its name; it is
 * simply not on offer.
 */
const RETIRED_SEMESTER_LABELS: Record<string, string> = {
  third: 'الفصل الدراسي الثالث',
}

/** An unrecognised stored value is shown as-is rather than blanked. */
export function semesterLabel(v: string | null | undefined): string {
  if (!v) return '—'
  return isSemester(v) ? SEMESTER_LABELS[v] : (RETIRED_SEMESTER_LABELS[v] ?? v)
}

/** "الفصل الدراسي الأول — ١٤٤٨" — what a mark is stamped with, in full. */
export function termLabel(semester: string | null | undefined, academicYear: string | null | undefined): string {
  return `${semesterLabel(semester)} — ${academicYear ?? '—'}`
}
