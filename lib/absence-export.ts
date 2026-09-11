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

function stageCaption(s: AbsenceStage): string {
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

// ── Word ──────────────────────────────────────────────────────────────────────
export async function buildAbsenceDocx(
  data: DailyAbsence,
  identity: SheetIdentity,
  images?: { ministry?: Uint8Array | ArrayBuffer; school?: Uint8Array | ArrayBuffer },
) {
  const docx = await import('docx')
  const { Document, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, ImageRun, BorderStyle, ShadingType } = docx
  const INK = SCHOOL_IDENTITY.ink.replace('#', '')
  type Align = (typeof AlignmentType)[keyof typeof AlignmentType]

  const text = (t: string, o: { bold?: boolean; size?: number; color?: string } = {}) =>
    new TextRun({ text: t, bold: o.bold, size: o.size ?? 22, color: o.color, rightToLeft: true, font: 'Arial' })
  const para = (t: string, o: { bold?: boolean; size?: number; align?: Align; after?: number; before?: number; color?: string } = {}) =>
    new Paragraph({ children: [text(t, o)], alignment: o.align ?? AlignmentType.RIGHT, bidirectional: true, spacing: { after: o.after ?? 80, before: o.before ?? 0 } })
  type Borders = NonNullable<NonNullable<ConstructorParameters<typeof TableCell>[0]>['borders']>
  const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
  const noBorders: Borders = { top: none, bottom: none, left: none, right: none }
  const boxBorders = (style: (typeof BorderStyle)[keyof typeof BorderStyle], color: string): Borders => ({ top: { style, size: 4, color }, bottom: { style, size: 4, color }, left: { style, size: 4, color }, right: { style, size: 4, color } })
  const cell = (children: InstanceType<typeof Paragraph>[], o: { width: number; shade?: string; borders?: Borders; valign?: 'top' | 'center' | 'bottom' }) =>
    new TableCell({ children, width: { size: o.width, type: WidthType.PERCENTAGE }, shading: o.shade ? { type: ShadingType.CLEAR, fill: o.shade, color: 'auto' } : undefined, borders: o.borders, verticalAlign: o.valign })
  const tcell = (t: string, o: { bold?: boolean; width: number; shade?: string; align?: Align; color?: string }) =>
    cell([new Paragraph({ children: [text(t, { bold: o.bold, size: 20, color: o.color })], alignment: o.align ?? AlignmentType.RIGHT, bidirectional: true })], { width: o.width, shade: o.shade })
  const image = (data: Uint8Array | ArrayBuffer, w: number, h: number) =>
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: 'png', data, transformation: { width: w, height: h } })] })

  const children: InstanceType<typeof Paragraph | typeof Table>[] = []

  // Letterhead: ministry chain on the right, ministry mark in the middle, the school's mark on the left.
  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE }, visuallyRightToLeft: true,
    rows: [new TableRow({ children: [
      cell(IDENTITY_HEADER_LINES.map((l, i) => para(l, { size: i === 3 ? 18 : 20, bold: i < 2, after: 20, color: INK })), { width: 44, borders: noBorders, valign: 'center' }),
      cell(images?.ministry ? [image(images.ministry, 96, 77)] : [para(SCHOOL_IDENTITY.ministry, { align: AlignmentType.CENTER, color: INK })], { width: 26, borders: noBorders, valign: 'center' }),
      cell(images?.school ? [image(images.school, 92, 82)] : [para(identity.schoolName, { align: AlignmentType.CENTER, color: INK })], { width: 30, borders: noBorders, valign: 'center' }),
    ] })],
  }))
  children.push(new Paragraph({ children: [], spacing: { after: 60 }, border: { bottom: { style: BorderStyle.DOUBLE, size: 8, color: INK, space: 1 } } }))

  children.push(para(identity.schoolName, { bold: true, size: 26, align: AlignmentType.CENTER, after: 60, before: 120, color: INK }))
  children.push(para(SHEET_TITLE, { bold: true, size: 34, align: AlignmentType.CENTER, after: 120 }))
  // Meta grid: day and date, term, scope.
  const meta = (label: string, value: string) => cell([para(label, { size: 16, color: '64748B', after: 20 }), para(value, { bold: true, size: 20, after: 0 })], { width: 25, shade: 'F8FAFC' })
  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE }, visuallyRightToLeft: true,
    rows: [new TableRow({ children: [
      meta('اليوم والتاريخ الهجري', `${data.dates.weekday} ${data.dates.hijri}`),
      meta('التاريخ الميلادي', data.dates.gregorian),
      meta('العام الدراسي', `${identity.academicYear}${identity.termLabel ? ` — ${identity.termLabel}` : ''}`),
      meta('النطاق', identity.scopeLabel),
    ] })],
  }))
  children.push(para('', { after: 60 }))
  // Summary strip.
  const t = data.totals
  const stat = (label: string, value: string, color?: string) => cell([para(value, { bold: true, size: 28, align: AlignmentType.CENTER, after: 0, color }), para(label, { size: 16, align: AlignmentType.CENTER, after: 0, color: '64748B' })], { width: 25, shade: 'EEF2F6' })
  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE }, visuallyRightToLeft: true,
    rows: [new TableRow({ children: [stat('غائب', String(t.absent), 'B91C1C'), stat('بإذن', String(t.excused), '1D4ED8'), stat('طلاب المرحلة', String(t.pupils)), stat('فصول لم يُرصد حضورها', String(t.unrecordedClasses), t.unrecordedClasses ? 'B45309' : undefined)] })],
  }))
  if (data.dayOff) children.push(para(`يوم إجازة (${data.dayOff}) — لا سجل متوقع`, { bold: true, align: AlignmentType.CENTER, color: 'B45309', before: 120 }))
  if (data.stages.length === 0) children.push(para('لا فصول ضمن نطاقك', { align: AlignmentType.CENTER, before: 120 }))

  const widths = [6, 34, 14, 16, 18, 12]
  for (const stage of data.stages) {
    // Stage band.
    children.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE }, visuallyRightToLeft: true,
      rows: [new TableRow({ children: [
        cell([para(stage.gradeName, { bold: true, size: 24, color: 'FFFFFF', after: 0 })], { width: 60, shade: INK, borders: noBorders }),
        cell([para(stageCaption(stage), { bold: true, size: 20, color: 'FFFFFF', after: 0, align: AlignmentType.LEFT })], { width: 40, shade: INK, borders: noBorders }),
      ] })],
    }))
    children.push(para('', { after: 40 }))
    for (const c of stage.classes) {
      const s = classSummary(c, stage.dayOff)
      if (s.kind !== 'listed') continue
      children.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE }, visuallyRightToLeft: true,
        rows: [
          new TableRow({ children: [
            cell([para(`فصل ${c.className}`, { bold: true, size: 22, after: 0 })], { width: 50, shade: 'EEF2F6', borders: noBorders }),
            cell([para(s.text, { bold: true, size: 20, after: 0, align: AlignmentType.LEFT })], { width: 50, shade: 'EEF2F6', borders: noBorders }),
          ] }),
          new TableRow({ tableHeader: true, children: SHEET_COLUMNS.map((h, i) => tcell(h, { bold: true, width: widths[i], shade: 'F1F5F9', align: AlignmentType.CENTER })) }),
          ...c.rows.map((r, i) => new TableRow({ children: [
            tcell(String(i + 1), { width: widths[0], align: AlignmentType.CENTER }),
            tcell(r.fullName, { width: widths[1], bold: true }),
            tcell(ABSENCE_STATUS_LABEL[r.status], { width: widths[2], align: AlignmentType.CENTER, bold: true, color: r.status === 'absent' ? 'B91C1C' : '1D4ED8' }),
            tcell(r.parentPhone ?? '', { width: widths[3], align: AlignmentType.CENTER }),
            tcell(r.markedBy ?? '', { width: widths[4] }),
            tcell('', { width: widths[5] }),
          ] })),
        ],
      }))
      children.push(para('', { after: 100 }))
    }
    const g = stageGroups(stage)
    if (g.clear.length) children.push(para(`فصول بلا غياب: ${g.clear.join('، ')}`, { size: 20, color: '166534', after: 40 }))
    if (g.unrecorded.length) children.push(para(`فصول لم يُرصد حضورها بعد: ${g.unrecorded.join('، ')}`, { size: 20, color: 'B45309', after: 40 }))
    if (g.empty.length) children.push(para(`فصول بلا طلاب: ${g.empty.join('، ')}`, { size: 20, color: '64748B', after: 40 }))
    children.push(para('', { after: 80 }))
  }

  children.push(new Paragraph({ children: [text(totalsLine(data), { bold: true })], alignment: AlignmentType.RIGHT, bidirectional: true, spacing: { before: 80, after: 200 }, border: { top: { style: BorderStyle.SINGLE, size: 6, color: INK, space: 4 } } }))

  // Signatures: officer, principal, stamp.
  const sig = (title: string, name: string | null) => cell([
    para(title, { bold: true, size: 22, after: 160, color: INK }),
    para(`الاسم: ${name ?? '........................'}`, { after: 160 }),
    para('التوقيع: ........................', { after: 60 }),
  ], { width: 36, borders: boxBorders(BorderStyle.SINGLE, 'CBD5E1') })
  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE }, visuallyRightToLeft: true,
    rows: [new TableRow({ children: [
      sig('مسؤول الغياب', null),
      sig('مدير المدرسة', identity.principalName),
      cell([para('ختم المدرسة', { bold: true, size: 20, align: AlignmentType.CENTER, color: '64748B', after: 400 }), para('', { after: 200 })], { width: 28, borders: boxBorders(BorderStyle.DASHED, '94A3B8') }),
    ] })],
  }))
  // Footer contacts.
  children.push(new Paragraph({ children: [text(IDENTITY_FOOTER_LINE, { size: 18, color: INK })], alignment: AlignmentType.CENTER, bidirectional: true, spacing: { before: 240 }, border: { top: { style: BorderStyle.DOUBLE, size: 8, color: INK, space: 6 } } }))

  const doc = new Document({
    creator: SCHOOL_IDENTITY.company,
    title: `${SHEET_TITLE} ${data.date}`,
    styles: { default: { document: { run: { font: 'Arial', size: 22, rightToLeft: true } } } },
    sections: [{ properties: { page: { margin: { top: 600, bottom: 600, left: 760, right: 760 } } }, children }],
  })
  return { docx, doc }
}
