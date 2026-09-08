import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

/**
 * Way back to the portal picker from any login screen.
 * The arrow points right because the page reads right-to-left.
 */
export function BackToPortals() {
  return (
    <Link
      href="/"
      className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground"
    >
      <ArrowRight className="size-4" />
      اختيار بوابة أخرى
    </Link>
  )
}
