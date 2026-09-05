import { cn, gradeColor, scorePercent } from '@/lib/utils'

interface GradeBadgeProps {
  score: number
  maxScore: number
  size?: 'sm' | 'md' | 'lg'
  showPercent?: boolean
}

export function GradeBadge({ score, maxScore, size = 'md', showPercent = false }: GradeBadgeProps) {
  const pct = scorePercent(score, maxScore)
  const color = gradeColor(pct)

  const sizes = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
    lg: 'text-base px-3 py-1.5',
  }

  return (
    <span className={cn('inline-flex items-center gap-1 rounded-lg font-bold', sizes[size], color)}>
      {score}/{maxScore}
      {showPercent && <span className="text-xs opacity-70">({pct}%)</span>}
    </span>
  )
}

interface ProgressBarProps {
  value: number   // 0–100
  label?: string
  color?: 'emerald' | 'blue' | 'amber' | 'red' | 'auto'
}

export function ProgressBar({ value, label, color = 'auto' }: ProgressBarProps) {
  const auto = color === 'auto'
  const barColor = auto
    ? value >= 90 ? 'bg-emerald-500'
    : value >= 75 ? 'bg-blue-500'
    : value >= 60 ? 'bg-amber-500'
    : 'bg-red-500'
    : { emerald: 'bg-emerald-500', blue: 'bg-blue-500', amber: 'bg-amber-500', red: 'bg-red-500' }[color]

  return (
    <div className="w-full">
      {label && (
        <div className="mb-1 flex justify-between text-xs text-muted-foreground">
          <span>{label}</span>
          <span className="font-semibold">{value}%</span>
        </div>
      )}
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full transition-all', barColor)}
          style={{ width: `${Math.min(100, value)}%` }}
        />
      </div>
    </div>
  )
}
