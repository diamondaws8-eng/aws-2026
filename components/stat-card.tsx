import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

interface StatCardProps {
  label: string
  value: string | number
  icon?: LucideIcon
  trend?: { value: number; label: string }
  accent?: 'default' | 'blue' | 'emerald' | 'amber' | 'violet' | 'red'
  className?: string
}

const accentMap = {
  default: { icon: 'bg-muted text-foreground', badge: 'bg-muted text-muted-foreground' },
  blue:    { icon: 'bg-blue-100 text-blue-600',    badge: 'bg-blue-50 text-blue-600' },
  emerald: { icon: 'bg-emerald-100 text-emerald-600', badge: 'bg-emerald-50 text-emerald-600' },
  amber:   { icon: 'bg-amber-100 text-amber-600',  badge: 'bg-amber-50 text-amber-600' },
  violet:  { icon: 'bg-violet-100 text-violet-600', badge: 'bg-violet-50 text-violet-600' },
  red:     { icon: 'bg-red-100 text-red-600',      badge: 'bg-red-50 text-red-600' },
}

export function StatCard({ label, value, icon: Icon, trend, accent = 'default', className }: StatCardProps) {
  const colors = accentMap[accent]
  return (
    <div className={cn('rounded-2xl border border-border bg-card p-5', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight">{value}</p>
          {trend && (
            <p className="mt-2 text-xs text-muted-foreground">{trend.label}</p>
          )}
        </div>
        {Icon && (
          <div className={cn('flex size-11 shrink-0 items-center justify-center rounded-xl', colors.icon)}>
            <Icon className="size-5" />
          </div>
        )}
      </div>
    </div>
  )
}
