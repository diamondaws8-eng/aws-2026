import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

/** The school's timezone — all "which day is it" decisions use this, not UTC. */
export const SCHOOL_TIME_ZONE = 'Asia/Riyadh'

/**
 * Formats a moment as YYYY-MM-DD in the school's timezone.
 * Using toISOString() here would be wrong: it reports UTC, so between midnight
 * and 3am local time it still returns the previous day.
 */
export function schoolDate(date: Date = new Date()): string {
  // 'en-CA' renders dates as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: SCHOOL_TIME_ZONE }).format(date)
}

/** Returns today as YYYY-MM-DD in the school's timezone */
export function today(): string {
  return schoolDate()
}

/**
 * True only for a real calendar day written as YYYY-MM-DD.
 * Dates reaching a server action come from the browser, and the `date` columns
 * are plain text — without this, '2026-02-31' or any string at all would be
 * stored and would then never match a query again.
 */
export function isValidDateString(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  // Rolls 2026-02-31 over to March, so the round-trip no longer matches.
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

/** Format YYYY-MM-DD → e.g. "الإثنين، ١ سبتمبر ٢٠٢٦" */
export function formatDateAr(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('ar-SA', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

/** Returns all days in a given month as YYYY-MM-DD strings */
export function getDaysInMonth(year: number, month: number): string[] {
  const days: string[] = []
  const daysCount = new Date(year, month, 0).getDate()
  for (let d = 1; d <= daysCount; d++) {
    days.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }
  return days
}

// ─── Percentage helpers ───────────────────────────────────────────────────────

/**
 * Rounds parts into whole percentages that still add up to exactly 100.
 * Rounding each part on its own is what makes a breakdown read 99% or 101%.
 */
export function wholePercents(values: number[], total: number): number[] {
  if (!total) return values.map(() => 0)
  const exact = values.map((v) => (v / total) * 100)
  const out = exact.map(Math.floor)
  let remainder = 100 - out.reduce((a, b) => a + b, 0)
  const byFraction = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac)
  for (const { i } of byFraction) {
    if (remainder <= 0) break
    out[i] += 1
    remainder -= 1
  }
  return out
}

// ─── Attendance helpers ───────────────────────────────────────────────────────

export const ATTENDANCE_STATUS = {
  present: { label: 'حاضر', color: 'bg-emerald-500', light: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  absent:  { label: 'غائب', color: 'bg-red-500',     light: 'bg-red-50 text-red-700 border-red-200' },
  late:    { label: 'متأخر', color: 'bg-amber-500',   light: 'bg-amber-50 text-amber-700 border-amber-200' },
  excused: { label: 'إذن',   color: 'bg-blue-500',    light: 'bg-blue-50 text-blue-700 border-blue-200' },
} as const

export type AttendanceStatus = keyof typeof ATTENDANCE_STATUS

// ─── Grade helpers ────────────────────────────────────────────────────────────

export const EXAM_TYPE_LABELS: Record<string, string> = {
  quiz: 'اختبار قصير',
  midterm: 'نصف الفصل',
  final: 'نهاية الفصل',
  assignment: 'واجب',
  oral: 'شفهي',
}

export const SEMESTER_LABELS: Record<string, string> = {
  first: 'الفصل الأول',
  second: 'الفصل الثاني',
}

/** Calculate percentage score */
export function scorePercent(score: number, max: number): number {
  if (max === 0) return 0
  return Math.round((score / max) * 100)
}

/** Return color class based on percentage */
export function gradeColor(pct: number): string {
  if (pct >= 90) return 'text-emerald-600'
  if (pct >= 75) return 'text-blue-600'
  if (pct >= 60) return 'text-amber-600'
  return 'text-red-600'
}

// ─── Parent phone → email ─────────────────────────────────────────────────────

/**
 * A Saudi mobile written any of the ways people actually write it — 0501234567,
 * 501234567, +966 50 123 4567, 966501234567 — reduced to the same nine digits.
 */
export function parentPhoneKey(phone: string | null | undefined): string {
  let digits = (phone ?? '').replace(/\D/g, '')
  if (digits.startsWith('966')) digits = digits.slice(3)
  if (digits.startsWith('0')) digits = digits.slice(1)
  return digits
}

/** The login address for a parent, from any spelling of their number. */
export function parentEmail(phone: string): string {
  return `${parentPhoneKey(phone)}@parent.midad.local`
}

/**
 * Every address an existing account might already be filed under.
 *
 * Accounts were created from the raw digits as typed, so most sit at
 * `5XXXXXXXX@…` while a few sit at `05XXXXXXXX@…`. Looking up only the
 * canonical form would miss the latter and create a second login for a family
 * that already has one; logging in with only one form is why a parent who typed
 * their number with the leading zero was told their password was wrong.
 */
export function parentEmailCandidates(phone: string | null | undefined): string[] {
  const raw = (phone ?? '').replace(/\D/g, '')
  const key = parentPhoneKey(phone)
  const forms = [key, raw, `0${key}`, `966${key}`].filter(Boolean)
  return [...new Set(forms)].map((d) => `${d}@parent.midad.local`)
}
