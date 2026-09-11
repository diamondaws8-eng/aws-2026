'use client'

import { useEffect, useState } from 'react'
import { Check, Palette } from 'lucide-react'

/**
 * The colour of the whole system, chosen by the person using it.
 *
 * A palette sets the accent every portal paints with — buttons, the active
 * nav entry, the gradient header — and is remembered on this device. «رمادي»
 * is the default: calm, prints well, and reads the same in every portal.
 * «ألوان البوابات» restores the older look where each portal had its own hue.
 */
export const PALETTES = [
  { id: 'slate', label: 'رمادي', swatch: '#475569' },
  { id: 'indigo', label: 'نيلي', swatch: '#4f46e5' },
  { id: 'emerald', label: 'أخضر', swatch: '#059669' },
  { id: 'teal', label: 'فيروزي', swatch: '#0891b2' },
  { id: 'violet', label: 'بنفسجي', swatch: '#7c3aed' },
  { id: 'amber', label: 'ذهبي', swatch: '#b45309' },
  { id: 'rose', label: 'وردي', swatch: '#be123c' },
  { id: 'portal', label: 'ألوان البوابات', swatch: 'linear-gradient(135deg,#4f46e5,#059669,#0891b2,#7c3aed)' },
] as const

export type PaletteId = (typeof PALETTES)[number]['id']
export const DEFAULT_PALETTE: PaletteId = 'slate'
export const PALETTE_KEY = 'aws-palette'

const isPalette = (v: string | null): v is PaletteId => !!v && PALETTES.some((p) => p.id === v)

/** Runs before paint, so the first frame already wears the remembered palette. */
export const PALETTE_BOOT_SCRIPT = `(function(){try{var v=localStorage.getItem('${PALETTE_KEY}');var ok=${JSON.stringify(PALETTES.map((p) => p.id))};document.documentElement.setAttribute('data-palette',ok.indexOf(v)>=0?v:'${DEFAULT_PALETTE}')}catch(e){document.documentElement.setAttribute('data-palette','${DEFAULT_PALETTE}')}})()`

export function usePalette(): [PaletteId, (id: PaletteId) => void] {
  const [palette, setPaletteState] = useState<PaletteId>(DEFAULT_PALETTE)
  useEffect(() => {
    const current = document.documentElement.getAttribute('data-palette')
    if (isPalette(current)) setPaletteState(current)
  }, [])
  const setPalette = (id: PaletteId) => {
    setPaletteState(id)
    document.documentElement.setAttribute('data-palette', id)
    try { localStorage.setItem(PALETTE_KEY, id) } catch { /* private mode: the choice lasts the visit */ }
  }
  return [palette, setPalette]
}

export function PalettePicker({ buttonClassName }: { buttonClassName?: string } = {}) {
  const [palette, setPalette] = usePalette()
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={buttonClassName ?? 'p-2.5 rounded-full bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary'}
        aria-label="ألوان الواجهة"
        title="ألوان الواجهة"
        aria-expanded={open}
      >
        <Palette className="w-5 h-5" />
      </button>
      {open && (
        <div className="absolute z-50 mt-2 end-0 w-56 rounded-2xl border border-border bg-popover p-2 shadow-xl" role="listbox" aria-label="اختيار اللون">
          {PALETTES.map((p) => (
            <button
              key={p.id}
              type="button"
              role="option"
              aria-selected={palette === p.id}
              onClick={() => { setPalette(p.id); setOpen(false) }}
              className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-sm transition-colors hover:bg-muted ${palette === p.id ? 'font-bold' : ''}`}
            >
              <span className="size-5 shrink-0 rounded-full ring-1 ring-black/10" style={{ background: p.swatch }} aria-hidden />
              <span className="flex-1 text-start">{p.label}</span>
              {palette === p.id && <Check className="size-4 text-primary" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
