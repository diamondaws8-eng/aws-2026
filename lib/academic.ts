/**
 * The academic calendar — labels and validation only, no database import.
 *
 * Needed on the server (stamping a mark) and in the browser (telling a teacher
 * where their marks are about to land), so this file follows lib/case-status.ts
 * and stays free of anything that drags the Postgres driver into the client.
 */

/**
 * Three are offered because the ministry has used both two and three, and a
 * school that changes should not need a deployment. A school using two simply
 * never selects the third.
 */
export const SEMESTERS = ['first', 'second', 'third'] as const
export type Semester = (typeof SEMESTERS)[number]

export const SEMESTER_LABELS: Record<Semester, string> = {
  first: 'الفصل الدراسي الأول',
  second: 'الفصل الدراسي الثاني',
  third: 'الفصل الدراسي الثالث',
}

export const isSemester = (v: string): v is Semester => (SEMESTERS as readonly string[]).includes(v)

/** An unrecognised stored value is shown as-is rather than blanked. */
export function semesterLabel(v: string | null | undefined): string {
  return v && isSemester(v) ? SEMESTER_LABELS[v] : (v ?? '—')
}

/** "الفصل الدراسي الأول — ١٤٤٨" — what a mark is stamped with, in full. */
export function termLabel(semester: string | null | undefined, academicYear: string | null | undefined): string {
  return `${semesterLabel(semester)} — ${academicYear ?? '—'}`
}
