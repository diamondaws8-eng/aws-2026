import { CheckCircle2, XCircle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// ── Section Card ─────────────────────────────────────────────────────────────
export function Section({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="relative overflow-hidden bg-card border border-border rounded-3xl shadow-sm">
      <div className="absolute -top-16 -left-12 size-40 rounded-full bg-primary/5 blur-3xl pointer-events-none" />
      <div className="relative px-6 py-4 border-b border-border bg-muted/30 flex items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-4.5" />
        </div>
        <h2 className="font-bold text-base">{title}</h2>
      </div>
      <div className="relative p-6">{children}</div>
    </div>
  )
}

// ── Status message (with icon) ─────────────────────────────────────────────────
export function StatusMsg({ ok, text }: { ok: boolean; text: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-semibold animate-in fade-in ${ok ? 'text-emerald-600' : 'text-red-600'}`}>
      {ok ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
      {text}
    </span>
  )
}
