/** Labels shared by the server sheet and the browser exports — no database import. */
export type AbsenceStatus = 'absent' | 'excused'

/**
 * «إذن» is what the register calls an excused day (lib/utils.ts
 * ATTENDANCE_STATUS); the sheet keeps that word so the officer reconciling
 * paper against screen reads the same thing in both places.
 */
export const ABSENCE_STATUS_LABEL: Record<AbsenceStatus, string> = {
  absent: 'غائب',
  excused: 'غائب بإذن',
}
