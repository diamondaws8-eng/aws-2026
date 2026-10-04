/**
 * What the family's form and the server must agree on about an absence excuse
 * — no database import, so the browser reads the same limits the action
 * enforces.
 */

/**
 * How many days back an absence can still be excused from the portal. Long
 * enough for a medical report to follow a week in bed; short enough that last
 * month's register is not reopened from a phone — an older day goes through
 * the office in person.
 */
export const EXCUSE_WINDOW_DAYS = 14

export const EXCUSE_MAX_LENGTH = 500

/**
 * Three letters, because «مرض» is three and is an answer. A longer minimum
 * left the commonest one-word excuses unsendable, behind a greyed-out button
 * that did not say why.
 */
export const EXCUSE_MIN_LENGTH = 3

export type ExcuseStatus = 'pending' | 'accepted' | 'rejected'

export const EXCUSE_STATUS_LABELS: Record<ExcuseStatus, string> = {
  pending: 'العذر قيد المراجعة',
  accepted: 'قُبل العذر',
  rejected: 'لم يُقبل العذر',
}
