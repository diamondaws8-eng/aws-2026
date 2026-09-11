'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Printer, FileSpreadsheet, FileText, ChevronRight, ChevronLeft, Loader2, CalendarX, AlertTriangle, Globe, Mail, Phone, AtSign, MapPin } from 'lucide-react'
import type { DailyAbsence, SheetIdentity } from '@/lib/daily-absence'
import { ABSENCE_STATUS_LABEL } from '@/lib/daily-absence-labels'
import { SCHOOL_IDENTITY, IDENTITY_HEADER_LINES, IDENTITY_FOOTER_ITEMS } from '@/lib/school-identity'
import { SHEET_TITLE, SHEET_COLUMNS, sheetFileStem, buildAbsenceWorkbook, buildAbsenceDocx, classSummary, stageGroups, totalsLine } from '@/lib/absence-export'

type Props = {
  data: DailyAbsence
  identity: SheetIdentity
  /** Where the date navigation goes: /admin/absence or /counselor/absence (query kept). */
  basePath: string
  /** Extra query to keep while changing the date, e.g. the stage filter. */
  keepQuery?: Record<string, string[]>
  today: string
}

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

const FOOTER_ICON = { web: Globe, mail: Mail, phone: Phone, social: AtSign, city: MapPin } as const

/**
 * The daily absence sheet — on screen, on paper, and as a file.
 *
 * The screen and the printout are the same element: print CSS strips the
 * portal around it and leaves the sheet, so what the officer sees is what
 * comes out of the printer, letterhead and signatures included.
 */
export function DailyAbsenceReport({ data, identity, basePath, keepQuery = {}, today }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState<'xlsx' | 'docx' | null>(null)
  const [error, setError] = useState('')
  const [draftDate, setDraftDate] = useState(data.date)
  const minDate = `${Number(today.slice(0, 4)) - 1}-01-01`

  const go = (d: string) => {
    const q = new URLSearchParams()
    for (const [k, vs] of Object.entries(keepQuery)) for (const v of vs) q.append(k, v)
    q.set('date', d)
    router.push(`${basePath}?${q.toString()}`)
  }
  // The picker navigates on commit, not on every keystroke: a half-typed
  // year is a valid date to the browser and would load a sheet for year 2.
  const commitDate = () => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(draftDate) && draftDate >= minDate && draftDate <= today && draftDate !== data.date) go(draftDate)
    else setDraftDate(data.date)
  }

  const download = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }
  const exportExcel = async () => {
    setBusy('xlsx'); setError('')
    try {
      const { XLSX, wb } = await buildAbsenceWorkbook(data, identity)
      XLSX.writeFile(wb, `${sheetFileStem(data.date)}.xlsx`)
    } catch { setError('تعذّر إنشاء ملف Excel') } finally { setBusy(null) }
  }
  const exportWord = async () => {
    setBusy('docx'); setError('')
    try {
      const img = async (src: string) => { try { const r = await fetch(src); return r.ok ? await r.arrayBuffer() : undefined } catch { return undefined } }
      const [ministry, school] = await Promise.all([img(SCHOOL_IDENTITY.ministryLogo), img(SCHOOL_IDENTITY.schoolLogo)])
      const { docx, doc } = await buildAbsenceDocx(data, identity, { ministry, school })
      download(await docx.Packer.toBlob(doc), `${sheetFileStem(data.date)}.docx`)
    } catch { setError('تعذّر إنشاء ملف Word') } finally { setBusy(null) }
  }

  const t = data.totals

  return (
    <div className="space-y-4">
      {/* ── Controls: never printed ── */}
      <div className="no-print rounded-2xl border border-border bg-card p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl border border-border bg-muted/40 px-2 py-1">
            <button type="button" onClick={() => go(addDays(data.date, 1))} disabled={data.date >= today} className="size-9 rounded-lg hover:bg-muted disabled:opacity-30" title="اليوم التالي" aria-label="اليوم التالي"><ChevronRight className="size-4 mx-auto" /></button>
            <input
              type="date"
              value={draftDate}
              min={minDate}
              max={today}
              onChange={(e) => setDraftDate(e.target.value)}
              onBlur={commitDate}
              onKeyDown={(e) => { if (e.key === 'Enter') commitDate() }}
              className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
              aria-label="التاريخ"
            />
            <button type="button" onClick={() => go(addDays(data.date, -1))} disabled={data.date <= minDate} className="size-9 rounded-lg hover:bg-muted disabled:opacity-30" title="اليوم السابق" aria-label="اليوم السابق"><ChevronLeft className="size-4 mx-auto" /></button>
            {data.date !== today && (
              <button type="button" onClick={() => go(today)} className="h-9 rounded-lg px-3 text-xs font-bold text-primary hover:bg-primary/10">اليوم</button>
            )}
          </div>
          <div className="ms-auto flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground min-h-10">
              <Printer className="size-4" /> طباعة / PDF
            </button>
            <button type="button" onClick={exportExcel} disabled={busy !== null} className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-bold min-h-10 hover:bg-muted disabled:opacity-50">
              {busy === 'xlsx' ? <Loader2 className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4 text-emerald-600" />} Excel
            </button>
            <button type="button" onClick={exportWord} disabled={busy !== null} className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-bold min-h-10 hover:bg-muted disabled:opacity-50">
              {busy === 'docx' ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4 text-blue-600" />} Word
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-red-700">غائب {t.absent}</span>
          <span className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-blue-700">بإذن {t.excused}</span>
          <span className="rounded-lg border border-border bg-muted px-2.5 py-1 text-muted-foreground">{t.pupils} طالباً في {t.classes} فصلاً · {identity.scopeLabel}</span>
          {t.unrecordedClasses > 0 && (
            <span className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-700 inline-flex items-center gap-1"><AlertTriangle className="size-3.5" /> {t.unrecordedClasses} فصل لم يُرصد حضوره بعد</span>
          )}
          {data.dayOff && (
            <span className="rounded-lg border border-border bg-muted px-2.5 py-1 text-muted-foreground inline-flex items-center gap-1"><CalendarX className="size-3.5" /> يوم إجازة ({data.dayOff})</span>
          )}
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <p className="text-[11px] text-muted-foreground">«طباعة / PDF» تفتح نافذة الطباعة؛ اختر فيها «حفظ كـ PDF» لحفظ الملف. يخرج الكشف كما تراه أدناه: الترويسة والتوقيعات وختم المدرسة.</p>
      </div>

      {/* ── The sheet itself: screen and paper ── */}
      <div className="absence-sheet mx-auto w-full max-w-[210mm] rounded-2xl border border-border shadow-sm p-6 sm:p-8" dir="rtl">
        {/* Letterhead */}
        <div className="flex items-center justify-between gap-4">
          <div className="sheet-ink text-[12.5px] leading-6 font-semibold">
            {IDENTITY_HEADER_LINES.map((l, i) => <p key={l} className={i === 3 ? 'text-[11px] font-medium' : ''}>{l}</p>)}
          </div>
          <img src={SCHOOL_IDENTITY.ministryLogo} alt={SCHOOL_IDENTITY.ministry} className="h-16 w-auto object-contain" />
          <img src={SCHOOL_IDENTITY.schoolLogo} alt={identity.schoolName} className="h-[74px] w-auto object-contain" />
        </div>
        <div className="sheet-rule border-b-[3px] border-double mt-3" />

        {/* Title */}
        <div className="text-center mt-4">
          <p className="sheet-ink text-base font-bold">{identity.schoolName}</p>
          <h2 className="text-[26px] font-black mt-0.5 tracking-tight">{SHEET_TITLE}</h2>
        </div>

        {/* Meta */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4 text-[12px]">
          {[
            ['اليوم والتاريخ الهجري', `${data.dates.weekday} ${data.dates.hijri}`],
            ['التاريخ الميلادي', data.dates.gregorian],
            ['العام الدراسي', `${identity.academicYear}${identity.termLabel ? ` — ${identity.termLabel}` : ''}`],
            ['النطاق', identity.scopeLabel],
          ].map(([k, v]) => (
            <div key={k} className="sheet-box rounded-lg px-3 py-2">
              <p className="sheet-muted text-[10.5px]">{k}</p>
              <p className="font-bold mt-0.5">{v}</p>
            </div>
          ))}
        </div>

        {/* Summary strip */}
        <div className="grid grid-cols-4 gap-2 mt-3">
          {[
            ['غائب', t.absent, 'sheet-absent'],
            ['بإذن', t.excused, 'sheet-excused'],
            ['طلاب النطاق', t.pupils, 'sheet-ink'],
            ['فصول لم يُرصد حضورها', t.unrecordedClasses, t.unrecordedClasses ? 'sheet-warn' : 'sheet-muted'],
          ].map(([k, v, cls]) => (
            <div key={String(k)} className="sheet-band-light rounded-lg px-2 py-2 text-center">
              <p className={`text-xl font-black leading-6 ${cls}`}>{v}</p>
              <p className="sheet-muted text-[10.5px] mt-0.5">{k}</p>
            </div>
          ))}
        </div>
        {data.dayOff && <p className="sheet-warn text-center text-sm font-bold mt-3">يوم إجازة ({data.dayOff}) — لا سجل متوقع</p>}
        {data.stages.length === 0 && <p className="text-center text-sm mt-8">لا فصول ضمن نطاقك</p>}

        {data.stages.map((stage) => {
          const groups = stageGroups(stage)
          return (
            <section key={stage.gradeId} className="stage-block mt-5">
              <div className="sheet-band rounded-lg px-3 py-1.5 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-[15px] font-black">{stage.gradeName}</h3>
                <span className="text-[12px] font-bold">{stage.dayOff ? `يوم إجازة (${stage.dayOff}) — لا سجل متوقع` : `غائب ${stage.absent} · بإذن ${stage.excused}`}</span>
              </div>

              {stage.classes.map((c) => {
                const s = classSummary(c, stage.dayOff)
                if (s.kind !== 'listed') return null
                return (
                  <div key={c.classId} className="mt-3 break-inside-avoid">
                    <div className="sheet-band-light rounded-t-lg px-3 py-1 flex flex-wrap justify-between gap-2 text-[13px]">
                      <span className="font-black">فصل {c.className}</span>
                      <span className="font-semibold">{s.text}</span>
                    </div>
                    <table className="w-full text-[12.5px] border-collapse">
                      <thead>
                        <tr>
                          {SHEET_COLUMNS.map((h, i) => (
                            <th key={h} className={`border border-slate-300 px-2 py-1 font-bold ${i === 1 || i === 4 ? 'text-right' : 'text-center'}`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {c.rows.map((r, i) => (
                          <tr key={r.studentId}>
                            <td className="border border-slate-300 px-2 py-1 text-center">{i + 1}</td>
                            <td className="border border-slate-300 px-2 py-1 font-bold">{r.fullName}</td>
                            <td className={`border border-slate-300 px-2 py-1 text-center ${r.status === 'absent' ? 'sheet-absent' : 'sheet-excused'}`}>{ABSENCE_STATUS_LABEL[r.status]}</td>
                            <td className="border border-slate-300 px-2 py-1 text-center" dir="ltr">{r.parentPhone ?? '—'}</td>
                            <td className="border border-slate-300 px-2 py-1 text-[11px]">{r.markedBy ?? '—'}</td>
                            <td className="border border-slate-300 px-2 py-1 min-w-[80px]"></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              })}

              <div className="mt-2 space-y-0.5 text-[12px]">
                {groups.clear.length > 0 && <p><span className="font-bold text-emerald-800">فصول بلا غياب:</span> {groups.clear.join('، ')}</p>}
                {groups.unrecorded.length > 0 && <p className="sheet-warn"><span className="font-bold">فصول لم يُرصد حضورها بعد:</span> {groups.unrecorded.join('، ')}</p>}
                {groups.empty.length > 0 && <p className="sheet-muted"><span className="font-bold">فصول بلا طلاب:</span> {groups.empty.join('، ')}</p>}
              </div>
            </section>
          )
        })}

        <p className="sheet-rule mt-5 pt-2 border-t text-[13px] font-bold">{totalsLine(data)}</p>

        {/* Signatures */}
        <div className="grid grid-cols-[1fr_1fr_0.8fr] gap-3 mt-6 text-[12.5px] break-inside-avoid">
          <div className="sheet-box rounded-lg p-3 space-y-3">
            <p className="sheet-ink font-black">مسؤول الغياب</p>
            <p>الاسم: ........................</p>
            <p>التوقيع: ........................</p>
          </div>
          <div className="sheet-box rounded-lg p-3 space-y-3">
            <p className="sheet-ink font-black">مدير المدرسة</p>
            <p>الاسم: {identity.principalName ?? '........................'}</p>
            <p>التوقيع: ........................</p>
          </div>
          <div className="rounded-lg border border-dashed border-slate-400 p-3 flex items-center justify-center">
            <p className="sheet-muted font-bold">ختم المدرسة</p>
          </div>
        </div>

        {/* Footer */}
        <div className="sheet-rule border-t-[3px] border-double mt-6 pt-2 flex flex-wrap justify-center gap-x-5 gap-y-1 text-[11px] sheet-ink" dir="ltr">
          {IDENTITY_FOOTER_ITEMS.map((it) => { const Icon = FOOTER_ICON[it.kind]; return <span key={it.text} className="inline-flex items-center gap-1"><Icon className="size-3" /> {it.text}</span> })}
        </div>
      </div>
    </div>
  )
}
