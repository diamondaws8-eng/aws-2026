import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

interface PageHeaderProps {
  title: string
  description?: string
  backHref?: string
  backLabel?: string
  action?: React.ReactNode
}

export function PageHeader({ title, description, backHref, backLabel, action }: PageHeaderProps) {
  return (
    <header className="mb-8">
      {backHref && (
        <Link
          href={backHref}
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {backLabel ?? 'رجوع'}
        </Link>
      )}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </header>
  )
}
