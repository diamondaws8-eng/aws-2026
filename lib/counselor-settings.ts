/**
 * The counsellor's own settings — shapes, bounds and parsing only.
 *
 * Read on the server, edited in the browser, and used inside the case decision
 * dialog, so this file follows lib/case-status.ts: pure data with no database
 * import. Anything that drags the Postgres driver in here fails the build the
 * moment a client component touches it.
 */

import { STALE_AFTER_DAYS } from '@/lib/case-status'

/**
 * One saved way of phrasing a message home. Titled, because a counsellor
 * choosing under pressure reads a name — not the first line of six.
 */
export type CounselorTemplate = { title: string; body: string }

export type CounselorCasePrefs = {
  /** Days before an untouched case is flagged late in this counsellor's inbox. */
  staleAfterDays: number
  /** How many cases make a pupil "repeated" — the pattern, not the incident. */
  repeatThreshold: number
}

export const DEFAULT_CASE_PREFS: CounselorCasePrefs = {
  staleAfterDays: STALE_AFTER_DAYS,
  repeatThreshold: 2,
}

export const MAX_TEMPLATES = 15
export const MAX_TEMPLATE_TITLE = 60
export const MAX_TEMPLATE_BODY = 1000

export const STALE_RANGE = { min: 1, max: 14 } as const
export const REPEAT_RANGE = { min: 2, max: 10 } as const

/** Every token a template may carry, and what it is replaced by. */
export const TEMPLATE_VARS = [
  { token: '{student}', label: 'اسم الطالب' },
  { token: '{class}', label: 'الفصل' },
  { token: '{counselor}', label: 'اسمك' },
  { token: '{school}', label: 'اسم المدرسة' },
] as const

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

/** Trimmed, titled and capped — this text ends up inside a WhatsApp message. */
export function cleanTemplates(list: unknown): CounselorTemplate[] {
  if (!Array.isArray(list)) return []
  return list
    .map((raw) => {
      const t = raw as Partial<CounselorTemplate> | null
      const title = typeof t?.title === 'string' ? t.title.trim().slice(0, MAX_TEMPLATE_TITLE) : ''
      const body = typeof t?.body === 'string' ? t.body.trim().slice(0, MAX_TEMPLATE_BODY) : ''
      return { title: title || 'قالب بلا اسم', body }
    })
    .filter((t) => t.body.length > 0)
    .slice(0, MAX_TEMPLATES)
}

export function parseTemplates(raw: string | null | undefined): CounselorTemplate[] {
  if (!raw) return []
  try {
    return cleanTemplates(JSON.parse(raw))
  } catch {
    return []
  }
}

export function cleanCasePrefs(input: unknown): CounselorCasePrefs {
  const o = (input ?? {}) as Partial<CounselorCasePrefs>
  return {
    staleAfterDays: clampInt(o.staleAfterDays, STALE_RANGE.min, STALE_RANGE.max, DEFAULT_CASE_PREFS.staleAfterDays),
    repeatThreshold: clampInt(o.repeatThreshold, REPEAT_RANGE.min, REPEAT_RANGE.max, DEFAULT_CASE_PREFS.repeatThreshold),
  }
}

export function parseCasePrefs(raw: string | null | undefined): CounselorCasePrefs {
  if (!raw) return { ...DEFAULT_CASE_PREFS }
  try {
    return cleanCasePrefs(JSON.parse(raw))
  } catch {
    return { ...DEFAULT_CASE_PREFS }
  }
}

/**
 * Fills a template. An unknown token is left exactly as written rather than
 * blanked, so a typo shows itself in the preview instead of quietly vanishing
 * from a message that is about to reach a family.
 */
export function applyTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{(student|class|counselor|school)\}/g, (token, key: string) => vars[key] || token)
}

/** ١ يوم / يومان / ٥ أيام — the count read the way it is said. */
export function daysLabel(n: number): string {
  if (n === 1) return 'يوم واحد'
  if (n === 2) return 'يومين'
  if (n <= 10) return `${n} أيام`
  return `${n} يوماً`
}
