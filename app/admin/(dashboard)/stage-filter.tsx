'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Layers, X } from 'lucide-react'

/**
 * Narrows the dashboard to one stage or a few.
 *
 * The list handed to this component is already only what the signed-in account
 * is permitted to see, and the server intersects the chosen ids with that same
 * list before reading anything. So this is a reading convenience: it can hide
 * stages, never reveal one.
 */
export function StageFilter({
  stages,
  selected,
}: {
  stages: { id: string; name: string }[]
  selected: string[]
}) {
  const pathname = usePathname()
  const params = useSearchParams()

  // One stage is never worth a filter bar.
  if (stages.length < 2) return null

  const hrefFor = (ids: string[]) => {
    const next = new URLSearchParams(params.toString())
    next.delete('stage')
    for (const id of ids) next.append('stage', id)
    const qs = next.toString()
    return qs ? `${pathname}?${qs}` : pathname
  }

  // Clicking a chip toggles it, so several stages can be read side by side.
  const toggled = (id: string) =>
    selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]

  const showingAll = selected.length === 0

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
          <Layers className="size-4" />
          اعرض:
        </span>

        <Link
          href={hrefFor([])}
          className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
            showingAll ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/70'
          }`}
        >
          كل مراحلي
        </Link>

        {stages.map((s) => {
          const on = selected.includes(s.id)
          return (
            <Link
              key={s.id}
              href={hrefFor(toggled(s.id))}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                on ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/70'
              }`}
            >
              {s.name}
              {on && <X className="size-3.5" />}
            </Link>
          )
        })}
      </div>

      <p className="mt-2.5 text-xs text-muted-foreground">
        {showingAll
          ? `كل الأرقام في هذه الصفحة تخص ${stages.length} مراحل — اختر مرحلة لتركّز عليها وحدها.`
          : `كل الأرقام في هذه الصفحة تخص المرحلة المختارة فقط: الحضور، والنقاط، والرسائل، ولوحة الصدارة.`}
      </p>
    </div>
  )
}
