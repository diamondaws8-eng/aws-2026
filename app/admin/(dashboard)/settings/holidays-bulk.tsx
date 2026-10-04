'use client'

import { useId, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarPlus, X } from 'lucide-react'
import { addSchoolHolidaysBulk, type HolidayRow } from './actions-school-days'
import { CALENDAR_REGION_LABELS, officialCalendarFor, type CalendarRegion } from '@/lib/official-calendar'
import { StatusMsg } from './settings-ui'

type BulkRow = {
  key: string
  include: boolean
  name: string
  startDate: string
  endDate: string
  review: boolean
  onFile: boolean
}

const REGIONS = Object.keys(CALENDAR_REGION_LABELS) as CalendarRegion[]

/**
 * The whole year's holidays in one sitting, typed by hand or filled from the
 * announced calendar.
 *
 * The announced dates are a starting point and no more: education departments
 * move single days, so every line stays editable and nothing is written until
 * the save button is pressed.
 */
export function HolidaysBulk({
  academicYear,
  defaultRegion,
  scopeId,
  scopeLabel,
  existing,
  onAdded,
}: {
  academicYear: string
  defaultRegion: CalendarRegion
  /** Null adds to the school's calendar; a stage id to that stage's own. */
  scopeId: string | null
  scopeLabel: string
  /** The holidays already on file for this calendar. */
  existing: { startDate: string; endDate: string }[]
  onAdded: (rows: HolidayRow[]) => void
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [region, setRegion] = useState<CalendarRegion>(defaultRegion)
  const [rows, setRows] = useState<BulkRow[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const regionId = useId()

  // Keys come from a counter, not the index: removing a line must not hand
  // its inputs to the line below it.
  const nextKey = useRef(0)
  const newKey = () => `row-${nextKey.current++}`

  const hasPreset = REGIONS.some((r) => officialCalendarFor(academicYear, r) !== null)
  const preset = officialCalendarFor(academicYear, region)
  const included = rows.filter((r) => r.include && !r.onFile)

  const patchRow = (key: string, change: Partial<BulkRow>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...change } : r)))

  const fillFromOfficial = () => {
    if (!preset) return
    // Filling replaces what is on screen — including dates already corrected
    // against the department's circular and lines typed by hand.
    if (rows.length > 0 && !window.confirm('تُستبدَل السطور الحالية كلها بسطور التقويم المعلن، ويضيع ما عدّلته فيها. متابعة؟')) return
    setRows(preset.holidays.map((h) => {
      const onFile = existing.some((e) => e.startDate === h.startDate && e.endDate === h.endDate)
      return {
        key: newKey(),
        include: !h.review && !onFile,
        name: h.name,
        startDate: h.startDate,
        endDate: h.endDate,
        review: !!h.review,
        onFile,
      }
    }))
    setMsg(null)
  }

  const addRow = () => {
    const key = newKey()
    setRows((prev) => [
      ...prev,
      { key, include: true, name: '', startDate: '', endDate: '', review: false, onFile: false },
    ])
  }

  const handleSave = async () => {
    if (included.some((r) => !r.name.trim() || !r.startDate)) {
      setMsg({ ok: false, text: 'أكمل الاسم وتاريخ البداية لكل سطر محدد' })
      return
    }
    // Named by what the line says, not by a number: the server counts only the
    // lines it was sent, which is not their position on this screen.
    const backwards = included.find((r) => r.endDate && r.endDate < r.startDate)
    if (backwards) {
      setMsg({ ok: false, text: `«${backwards.name.trim()}»: تاريخ النهاية قبل تاريخ البداية` })
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      const res = await addSchoolHolidaysBulk({
        items: included.map((r) => ({
          name: r.name.trim(),
          startDate: r.startDate,
          endDate: r.endDate || r.startDate,
        })),
        gradeLevelId: scopeId,
      })
      if (res.ok) {
        onAdded(res.added)
        setMsg({
          ok: true,
          text: res.added.length === 0
            ? 'كل الإجازات المحددة موجودة من قبل — لم يُضَف شيء'
            : `عدد الإجازات المضافة: ${res.added.length}${res.skipped > 0 ? ` — وتُخطّي ما كان موجوداً من قبل (${res.skipped})` : ''}`,
        })
        setRows([])
        setOpen(false)
        router.refresh()
      } else {
        setMsg({ ok: false, text: res.error })
      }
    } catch {
      setMsg({ ok: false, text: 'حدث خطأ غير متوقع' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-4 max-w-3xl">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => { setOpen((o) => !o); setMsg(null) }}
          aria-expanded={open}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-muted hover:bg-muted/70 text-foreground font-semibold text-sm rounded-xl transition-colors"
        >
          <CalendarPlus className="size-4" /> إضافة إجازات العام دفعة واحدة
        </button>
        {!open && msg && <StatusMsg ok={msg.ok} text={msg.text} />}
      </div>

      {open && (
        <div className="mt-3 p-4 rounded-2xl border border-border bg-muted/20 space-y-4">
          {hasPreset ? (
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-52">
                <label htmlFor={regionId} className="block text-xs font-semibold mb-1.5">التقويم المتَّبع</label>
                <select
                  id={regionId}
                  value={region}
                  onChange={(e) => setRegion(e.target.value as CalendarRegion)}
                  disabled={busy}
                  className="w-full p-3 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary text-sm"
                >
                  {REGIONS.map((r) => (
                    <option key={r} value={r}>{CALENDAR_REGION_LABELS[r]}</option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={fillFromOfficial}
                disabled={!preset || busy}
                className="rounded-xl px-4 py-3 text-sm font-semibold bg-background border border-border hover:bg-muted disabled:opacity-50"
              >
                تعبئة من التقويم الدراسي المعلن {academicYear}
              </button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              لا يوجد تقويم معلن مخزَّن لهذا العام — أضف السطور بيدك.
            </p>
          )}

          {rows.length > 0 && (
            <div className="space-y-2">
              {rows.map((r) => {
                const frozen = r.onFile || busy
                return (
                  <div
                    key={r.key}
                    className={`rounded-xl border p-3 ${
                      r.onFile
                        ? 'border-border bg-muted/40'
                        : r.review
                          ? 'border-amber-200 bg-amber-50/50 dark:bg-amber-950/10 dark:border-amber-800'
                          : 'border-border bg-background'
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="checkbox"
                        checked={r.include}
                        disabled={frozen}
                        onChange={(e) => patchRow(r.key, { include: e.target.checked })}
                        aria-label={`حفظ: ${r.name || 'سطر جديد'}`}
                        className="size-5 accent-primary shrink-0"
                      />
                      <input
                        type="text"
                        value={r.name}
                        disabled={frozen}
                        onChange={(e) => patchRow(r.key, { name: e.target.value })}
                        placeholder="اسم الإجازة"
                        aria-label="اسم الإجازة"
                        maxLength={120}
                        className="flex-1 min-w-40 p-2.5 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary text-sm disabled:opacity-60"
                      />
                      <button
                        type="button"
                        onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))}
                        disabled={busy}
                        aria-label="حذف السطر"
                        className="shrink-0 sm:order-last p-2 rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-50"
                      >
                        <X className="size-4" />
                      </button>
                      <label className="flex items-center gap-2 basis-full sm:basis-auto text-xs font-semibold">
                        من
                        <input
                          type="date"
                          value={r.startDate}
                          disabled={frozen}
                          onChange={(e) => patchRow(r.key, { startDate: e.target.value })}
                          className="flex-1 sm:flex-none p-2.5 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary text-sm font-normal disabled:opacity-60"
                        />
                      </label>
                      <label className="flex items-center gap-2 basis-full sm:basis-auto text-xs font-semibold">
                        إلى
                        <input
                          type="date"
                          value={r.endDate}
                          min={r.startDate || undefined}
                          disabled={frozen}
                          onChange={(e) => patchRow(r.key, { endDate: e.target.value })}
                          className="flex-1 sm:flex-none p-2.5 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary text-sm font-normal disabled:opacity-60"
                        />
                      </label>
                    </div>
                    {(r.onFile || r.review) && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {r.onFile && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                            مضافة من قبل
                          </span>
                        )}
                        {r.review && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100">
                            تُراجَع على تعميم إدارة التعليم
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <button
            type="button"
            onClick={addRow}
            disabled={busy}
            className="text-xs bg-muted hover:bg-muted/70 font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
          >
            + سطر
          </button>

          <p className="text-xs text-muted-foreground leading-6">
            {hasPreset && 'هذه تواريخ التقويم الدراسي كما أعلنتها وزارة التعليم. راجعها على تعميم إدارة التعليم لديكم وعدّل ما يختلف قبل الحفظ — '}
            لا يُحفظ شيء حتى تضغط الزر. تُضاف إلى: {scopeLabel}.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={busy || included.length === 0}
              className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm disabled:opacity-50"
            >
              {busy ? 'جاري الحفظ...' : `حفظ الإجازات المحددة (${included.length})`}
            </button>
            {msg && <StatusMsg ok={msg.ok} text={msg.text} />}
          </div>
        </div>
      )}
    </div>
  )
}
