import Link from 'next/link'
import { AlertTriangle, Info, ArrowLeft, ShieldCheck } from 'lucide-react'
import type { HealthItem } from '@/lib/data-health'

/**
 * The dashboard's to-do list for the school itself: gaps the system found in
 * its own data, each with the page that closes it. Disappears when empty.
 */
export function DataHealthCard({ items }: { items: HealthItem[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 flex items-center gap-3 text-sm text-emerald-800">
        <ShieldCheck className="size-5 shrink-0" />
        بيانات المدرسة مكتملة: كل فصل له معلم، والأرقام سليمة، والعام مسجَّل، والنسخة الاحتياطية حديثة.
      </div>
    )
  }
  const warns = items.filter((i) => i.level === 'warn').length
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div>
          <h2 className="font-bold text-lg">ما ينقص المدرسة قبل التشغيل</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {warns ? `${warns} يحتاج قراراً` : 'ملاحظات فقط'} · يختفي كل بند بمجرد معالجته
          </p>
        </div>
      </div>
      <ul className="space-y-2.5">
        {items.map((it) => (
          <li
            key={it.title}
            className={`rounded-xl border p-3.5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between ${
              it.level === 'warn' ? 'border-amber-200 bg-amber-50' : 'border-border bg-muted/40'
            }`}
          >
            <div className="flex items-start gap-3 min-w-0">
              <span className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ${
                it.level === 'warn' ? 'bg-amber-100 text-amber-700' : 'bg-primary/10 text-primary'
              }`}>
                {it.level === 'warn' ? <AlertTriangle className="size-4" /> : <Info className="size-4" />}
              </span>
              <div className="min-w-0">
                <p className="font-semibold text-sm">{it.title}</p>
                {it.detail && <p className="text-xs leading-6 text-muted-foreground mt-0.5 break-words">{it.detail}</p>}
              </div>
            </div>
            <Link
              href={it.href}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground min-h-10 sm:min-h-0"
            >
              {it.action} <ArrowLeft className="size-3.5" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
