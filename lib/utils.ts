import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

/** Returns today as YYYY-MM-DD */
export function today(): string {
  return new Date().toISOString().split('T')[0]
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

export function parentEmail(phone: string): string {
  return `${phone.replace(/\D/g, '')}@parent.midad.local`
}
