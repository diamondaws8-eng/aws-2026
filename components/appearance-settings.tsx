'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Check, Moon, Sun, Palette } from 'lucide-react'
import { PALETTES, usePalette } from '@/components/palette-picker'

/**
 * How the interface looks for this person, on this device: the accent colour
 * of every portal and day or night mode. Lives on each portal's settings page
 * so it has room to breathe — a popover in the sidebar's header was clipped
 * by the header itself.
 */
export function AppearanceSettings() {
  const [palette, setPalette] = usePalette()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const isDark = mounted && theme === 'dark'

  return (
    <section className="rounded-3xl border border-border bg-card p-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Palette className="size-5" /></div>
        <div>
          <h2 className="text-lg font-bold">مظهر الواجهة</h2>
          <p className="text-xs text-muted-foreground mt-0.5">يُحفظ على هذا الجهاز ولا يؤثر في غيرك</p>
        </div>
      </div>

      <div>
        <p className="text-sm font-semibold mb-2">اللون</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" role="listbox" aria-label="اللون">
          {PALETTES.map((p) => {
            const active = palette === p.id
            return (
              <button
                key={p.id}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => setPalette(p.id)}
                className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm transition-colors ${active ? 'border-primary bg-primary/5 font-bold ring-2 ring-primary/30' : 'border-border hover:bg-muted'}`}
              >
                <span className="size-6 shrink-0 rounded-full ring-1 ring-black/10" style={{ background: p.swatch }} aria-hidden />
                <span className="flex-1 text-start">{p.label}</span>
                {active && <Check className="size-4 text-primary" />}
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <p className="text-sm font-semibold mb-2">الوضع</p>
        <div className="inline-flex rounded-xl border border-border p-1 bg-muted/40" role="radiogroup" aria-label="الوضع">
          {([['light', 'نهاري', Sun], ['dark', 'داكن', Moon]] as const).map(([id, label, Icon]) => {
            const active = mounted && (id === 'dark' ? isDark : !isDark)
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setTheme(id)}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${active ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <Icon className="size-4" /> {label}
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}
