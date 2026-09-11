import type { DailyAbsence, SheetIdentity, AbsenceClass, AbsenceStage } from '@/lib/daily-absence'
import { ABSENCE_STATUS_LABEL } from '@/lib/daily-absence-labels'
import { IDENTITY_HEADER_LINES, IDENTITY_FOOTER_LINE, SCHOOL_IDENTITY } from '@/lib/school-identity'

/**
 * The same sheet in three shapes — for the printer, for a spreadsheet and for
 * a Word file — built from one data object so the three can never disagree.
 *
 * No server imports here on purpose: the browser builds the file the officer
 * downloads, and the test-bench builds the same file in Node to open it.
 */

export const SHEET_TITLE = 'كشف الغياب اليومي'
export const SHEET_COLUMNS = ['م', 'اسم الطالب', 'الحالة', 'جوال ولي الأمر', 'رصده', 'ملاحظات'] as const

export function sheetFileStem(date: string): string {
  return `كشف_الغياب_${date}`
}

export function dateLine(data: DailyAbsence): string {
  return `${data.dates.weekday} ${data.dates.hijri} — الموافق ${data.dates.gregorian}`
}

export function termLine(identity: SheetIdentity): string {
  return `العام الدراسي ${identity.academicYear}${identity.termLabel ? ` — ${identity.termLabel}` : ''}`
}

export function totalsLine(data: DailyAbsence): string {
  const t = data.totals
  return `الإجمالي: غائب ${t.absent} · بإذن ${t.excused} · من ${t.pupils} طالباً في ${t.classes} فصلاً${t.unrecordedClasses ? ` · فصول لم يُرصد حضورها: ${t.unrecordedClasses}` : ''}`
}

/** How a class reads on the sheet, and the three kinds of class that carry no table. */
export function classSummary(c: AbsenceClass, stageOff: string | null) {
  const absent = c.rows.filter((r) => r.status === 'absent').length
  const excused = c.rows.length - absent
  if (c.rows.length) return { kind: 'listed' as const, text: `غائب ${absent}${excused ? ` · بإذن ${excused}` : ''} من ${c.pupils} طالباً` }
  if (c.pupils === 0) return { kind: 'empty' as const, text: 'لا طلاب مسجّلين' }
  if (stageOff) return { kind: 'off' as const, text: `يوم إجازة (${stageOff})` }
  if (c.recorded === 0) return { kind: 'unrecorded' as const, text: 'لم يُرصد الحضور بعد' }
  return { kind: 'clear' as const, text: `لا غياب — رُصد ${c.recorded} من ${c.pupils}` }
}

/** The classes of a stage that carry no table, grouped into one line each. */
export function stageGroups(stage: AbsenceStage) {
  const by = { clear: [] as string[], unrecorded: [] as string[], empty: [] as string[] }
  for (const c of stage.classes) {
    const s = classSummary(c, stage.dayOff)
    if (s.kind === 'clear') by.clear.push(c.className)
    else if (s.kind === 'unrecorded') by.unrecorded.push(c.className)
    else if (s.kind === 'empty') by.empty.push(c.className)
  }
  return by
}

export function stageCaption(s: AbsenceStage): string {
  if (s.dayOff) return `يوم إجازة (${s.dayOff}) — لا سجل متوقع`
  return `غائب ${s.absent} · بإذن ${s.excused}`
}

// ── Excel ─────────────────────────────────────────────────────────────────────
export async function buildAbsenceWorkbook(data: DailyAbsence, identity: SheetIdentity) {
  const XLSX = await import('xlsx')
  const rows: (string | number)[][] = []
  for (const line of IDENTITY_HEADER_LINES) rows.push([line])
  rows.push([identity.schoolName])
  rows.push([])
  rows.push([SHEET_TITLE])
  rows.push([dateLine(data)])
  rows.push([termLine(identity)])
  rows.push([`النطاق: ${identity.scopeLabel}`])
  if (data.dayOff) rows.push([`يوم إجازة (${data.dayOff}) — لا سجل متوقع`])
  rows.push([])
  if (data.stages.length === 0) rows.push(['لا فصول ضمن نطاقك'])
  for (const stage of data.stages) {
    rows.push([`${stage.gradeName} — ${stageCaption(stage)}`])
    for (const c of stage.classes) {
      const s = classSummary(c, stage.dayOff)
      if (s.kind !== 'listed') continue
      rows.push([`فصل ${c.className} — ${s.text}`])
      rows.push([...SHEET_COLUMNS])
      c.rows.forEach((r, i) => rows.push([i + 1, r.fullName, ABSENCE_STATUS_LABEL[r.status], r.parentPhone ?? '', r.markedBy ?? '', '']))
      rows.push([])
    }
    const g = stageGroups(stage)
    if (g.clear.length) rows.push([`فصول بلا غياب: ${g.clear.join('، ')}`])
    if (g.unrecorded.length) rows.push([`فصول لم يُرصد حضورها بعد: ${g.unrecorded.join('، ')}`])
    if (g.empty.length) rows.push([`فصول بلا طلاب: ${g.empty.join('، ')}`])
    rows.push([])
  }
  rows.push([totalsLine(data)])
  rows.push([])
  rows.push(['مسؤول الغياب', '', '', 'مدير المدرسة', '', ''])
  rows.push(['الاسم:', '', 'التوقيع:', 'الاسم:', identity.principalName ?? '', 'التوقيع:'])
  rows.push([])
  rows.push([IDENTITY_FOOTER_LINE])

  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = [{ wch: 14 }, { wch: 38 }, { wch: 14 }, { wch: 16 }, { wch: 26 }, { wch: 22 }]
  const wb = XLSX.utils.book_new()
  wb.Workbook = { Views: [{ RTL: true }] }
  XLSX.utils.book_append_sheet(wb, ws, 'الغياب')
  return { XLSX, wb }
}

