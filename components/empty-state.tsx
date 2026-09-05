import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/30 px-6 py-14 text-center', className)}>
      {Icon && (
        <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <Icon className="size-7" />
        </div>
      )}
      <h3 className="text-base font-bold text-foreground">{title}</h3>
      {description && (
        <p className="mt-2 max-w-xs text-sm leading-6 text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}
