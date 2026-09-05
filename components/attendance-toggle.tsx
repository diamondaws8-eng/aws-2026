'use client'
import { cn, ATTENDANCE_STATUS, type AttendanceStatus } from '@/lib/utils'

interface AttendanceToggleProps {
  studentId: string
  value: AttendanceStatus | null
  onChange: (studentId: string, status: AttendanceStatus) => void
  disabled?: boolean
}

const OPTIONS: { status: AttendanceStatus; label: string; short: string }[] = [
  { status: 'present', label: 'حاضر', short: '✓' },
  { status: 'absent',  label: 'غائب',  short: '✗' },
  { status: 'late',    label: 'متأخر', short: '⚠' },
  { status: 'excused', label: 'إذن',   short: '○' },
]

export function AttendanceToggle({ studentId, value, onChange, disabled }: AttendanceToggleProps) {
  return (
    <div className="flex gap-1.5">
      {OPTIONS.map(({ status, label, short }) => {
        const isSelected = value === status
        const colors = ATTENDANCE_STATUS[status]
        return (
          <button
            key={status}
            type="button"
            title={label}
            disabled={disabled}
            onClick={() => onChange(studentId, status)}
            className={cn(
              'flex size-9 items-center justify-center rounded-lg text-sm font-bold transition-all',
              isSelected
                ? `${colors.color} text-white shadow-sm scale-105`
                : 'bg-muted text-muted-foreground hover:bg-muted/70',
              disabled && 'cursor-not-allowed opacity-50',
            )}
          >
            {short}
          </button>
        )
      })}
    </div>
  )
}
