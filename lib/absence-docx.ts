import type { DailyAbsence, SheetIdentity } from '@/lib/daily-absence'
import { ABSENCE_STATUS_LABEL } from '@/lib/daily-absence-labels'
import { IDENTITY_HEADER_LINES, IDENTITY_FOOTER_LINE, SCHOOL_IDENTITY } from '@/lib/school-identity'
import { SHEET_TITLE, SHEET_COLUMNS, totalsLine, classSummary, stageGroups, stageCaption } from '@/lib/absence-export'

/**
 * The Word shape of the daily absence sheet.
 *
 * A4 in twentieths of a point (DXA): every table is laid out on fixed column
 * widths that add up to the text width, so Word never squeezes a column into
 * a ribbon of one word per line. No server imports — the browser builds it.
 */
const PAGE_W = 11906, PAGE_H = 16838, MARGIN_X = 720, MARGIN_Y = 600
const TEXT_W = PAGE_W - 2 * MARGIN_X
const split = (parts: number[]) => {
  const sum = parts.reduce((a, b) => a + b, 0)
  const w = parts.map((x) => Math.floor((x / sum) * TEXT_W))
  w[w.length - 1] += TEXT_W - w.reduce((a, b) => a + b, 0)
  return w
}

export async function buildAbsenceDocx(
  data: DailyAbsence,
  identity: SheetIdentity,
  images?: { ministry?: Uint8Array | ArrayBuffer; school?: Uint8Array | ArrayBuffer },
) {
  const docx = await import('docx')
  const { Document, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, ImageRun, BorderStyle, ShadingType, TableLayoutType } = docx
  const INK = SCHOOL_IDENTITY.ink.replace('#', '')
  type Align = (typeof AlignmentType)[keyof typeof AlignmentType]
  type Borders = NonNullable<NonNullable<ConstructorParameters<typeof TableCell>[0]>['borders']>

  const text = (t: string, o: { bold?: boolean; size?: number; color?: string } = {}) =>
    new TextRun({ text: t, bold: o.bold, size: o.size ?? 22, color: o.color, rightToLeft: true, font: 'Arial' })
  const para = (t: string, o: { bold?: boolean; size?: number; align?: Align; after?: number; before?: number; color?: string } = {}) =>
    new Paragraph({ children: [text(t, o)], alignment: o.align ?? AlignmentType.RIGHT, bidirectional: true, spacing: { after: o.after ?? 60, before: o.before ?? 0 } })
  const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
  const noBorders: Borders = { top: none, bottom: none, left: none, right: none }
  const box = (style: (typeof BorderStyle)[keyof typeof BorderStyle], color: string, size = 4): Borders =>
    ({ top: { style, size, color }, bottom: { style, size, color }, left: { style, size, color }, right: { style, size, color } })
  const grid = box(BorderStyle.SINGLE, '94A3B8')
  const cell = (children: InstanceType<typeof Paragraph>[], width: number, o: { shade?: string; borders?: Borders; valign?: 'top' | 'center' | 'bottom'; pad?: number } = {}) =>
    new TableCell({
      children, width: { size: width, type: WidthType.DXA },
      shading: o.shade ? { type: ShadingType.CLEAR, fill: o.shade, color: 'auto' } : undefined,
      borders: o.borders ?? grid, verticalAlign: o.valign ?? 'center',
      margins: { top: o.pad ?? 60, bottom: o.pad ?? 60, left: 100, right: 100 },
    })
  const tcell = (t: string, width: number, o: { bold?: boolean; shade?: string; align?: Align; color?: string; size?: number } = {}) =>
    cell([new Paragraph({ children: [text(t, { bold: o.bold, size: o.size ?? 20, color: o.color })], alignment: o.align ?? AlignmentType.RIGHT, bidirectional: true })], width, { shade: o.shade })
  const table = (widths: number[], rows: InstanceType<typeof TableRow>[]) =>
    new Table({ rows, columnWidths: widths, width: { size: TEXT_W, type: WidthType.DXA }, layout: TableLayoutType.FIXED, visuallyRightToLeft: true })
  const image = (bytes: Uint8Array | ArrayBuffer, w: number, h: number) =>
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: 'png', data: bytes, transformation: { width: w, height: h } })] })
  const spacer = (after: number) => new Paragraph({ children: [], spacing: { after, before: 0 } })

  const children: InstanceType<typeof Paragraph | typeof Table>[] = []

  // Letterhead: ministry chain on the right, the Ministry's mark in the middle, the school's mark on the left.
  const lw = split([46, 27, 27])
  children.push(table(lw, [new TableRow({ children: [
    cell(IDENTITY_HEADER_LINES.map((l, i) => para(l, { size: i === 3 ? 17 : 21, bold: i < 2, after: 30, color: INK })), lw[0], { borders: noBorders }),
    cell(images?.ministry ? [image(images.ministry, 118, 60)] : [para(SCHOOL_IDENTITY.ministry, { align: AlignmentType.CENTER, color: INK })], lw[1], { borders: noBorders }),
    cell(images?.school ? [image(images.school, 84, 92)] : [para(identity.schoolName, { align: AlignmentType.CENTER, color: INK })], lw[2], { borders: noBorders }),
  ] })]))
  children.push(new Paragraph({ children: [], spacing: { after: 80 }, border: { bottom: { style: BorderStyle.DOUBLE, size: 8, color: INK, space: 1 } } }))

  children.push(para(identity.schoolName, { bold: true, size: 26, align: AlignmentType.CENTER, after: 40, before: 100, color: INK }))
  children.push(para(SHEET_TITLE, { bold: true, size: 36, align: AlignmentType.CENTER, after: 140 }))

  // Meta grid.
  const mw = split([30, 22, 26, 22])
  const meta = (label: string, value: string, w: number) =>
    cell([para(label, { size: 16, color: '64748B', after: 20, align: AlignmentType.CENTER }), para(value, { bold: true, size: 20, after: 0, align: AlignmentType.CENTER })], w, { shade: 'F8FAFC', borders: box(BorderStyle.SINGLE, 'CBD5E1') })
  children.push(table(mw, [new TableRow({ children: [
    meta('اليوم والتاريخ الهجري', `${data.dates.weekday} ${data.dates.hijri}`, mw[0]),
    meta('التاريخ الميلادي', data.dates.gregorian, mw[1]),
    meta('العام الدراسي', `${identity.academicYear}${identity.termLabel ? ` — ${identity.termLabel}` : ''}`, mw[2]),
    meta('النطاق', identity.scopeLabel, mw[3]),
  ] })]))
  children.push(spacer(80))

  // Summary strip.
  const t = data.totals
  const sw = split([1, 1, 1, 1])
  const stat = (label: string, value: string, w: number, color?: string) =>
    cell([para(value, { bold: true, size: 30, align: AlignmentType.CENTER, after: 0, color }), para(label, { size: 16, align: AlignmentType.CENTER, after: 0, color: '64748B' })], w, { shade: 'EEF2F6', borders: box(BorderStyle.SINGLE, 'FFFFFF', 12) })
  children.push(table(sw, [new TableRow({ children: [
    stat('غائب', String(t.absent), sw[0], 'B91C1C'),
    stat('بإذن', String(t.excused), sw[1], '1D4ED8'),
    stat('طلاب النطاق', String(t.pupils), sw[2]),
    stat('فصول لم يُرصد حضورها', String(t.unrecordedClasses), sw[3], t.unrecordedClasses ? 'B45309' : undefined),
  ] })]))
  if (data.dayOff) children.push(para(`يوم إجازة (${data.dayOff}) — لا سجل متوقع`, { bold: true, align: AlignmentType.CENTER, color: 'B45309', before: 120 }))
  if (data.stages.length === 0) children.push(para('لا فصول ضمن نطاقك', { align: AlignmentType.CENTER, before: 120 }))

  const cw = split([6, 34, 13, 15, 20, 12]) // م · الاسم · الحالة · الجوال · رصده · ملاحظات
  const bw = split([62, 38])
  for (const stage of data.stages) {
    children.push(spacer(120))
    children.push(table(bw, [new TableRow({ children: [
      cell([para(stage.gradeName, { bold: true, size: 24, color: 'FFFFFF', after: 0 })], bw[0], { shade: INK, borders: noBorders }),
      cell([para(stageCaption(stage), { bold: true, size: 20, color: 'FFFFFF', after: 0, align: AlignmentType.LEFT })], bw[1], { shade: INK, borders: noBorders }),
    ] })]))
    for (const c of stage.classes) {
      const s = classSummary(c, stage.dayOff)
      if (s.kind !== 'listed') continue
      children.push(spacer(80))
      children.push(table(bw, [new TableRow({ children: [
        cell([para(`فصل ${c.className}`, { bold: true, size: 22, after: 0 })], bw[0], { shade: 'EEF2F6', borders: box(BorderStyle.SINGLE, 'CBD5E1') }),
        cell([para(s.text, { bold: true, size: 20, after: 0, align: AlignmentType.LEFT })], bw[1], { shade: 'EEF2F6', borders: box(BorderStyle.SINGLE, 'CBD5E1') }),
      ] })]))
      children.push(table(cw, [
        new TableRow({ tableHeader: true, children: SHEET_COLUMNS.map((h, i) => tcell(h, cw[i], { bold: true, shade: 'F1F5F9', align: i === 1 || i === 4 ? AlignmentType.RIGHT : AlignmentType.CENTER })) }),
        ...c.rows.map((r, i) => new TableRow({ children: [
          tcell(String(i + 1), cw[0], { align: AlignmentType.CENTER }),
          tcell(r.fullName, cw[1], { bold: true }),
          tcell(ABSENCE_STATUS_LABEL[r.status], cw[2], { align: AlignmentType.CENTER, bold: true, color: r.status === 'absent' ? 'B91C1C' : '1D4ED8' }),
          tcell(r.parentPhone ?? '', cw[3], { align: AlignmentType.CENTER }),
          tcell(r.markedBy ?? '', cw[4], { size: 18 }),
          tcell('', cw[5]),
        ] })),
      ]))
    }
    const g = stageGroups(stage)
    if (g.clear.length || g.unrecorded.length || g.empty.length) children.push(spacer(60))
    if (g.clear.length) children.push(para(`فصول بلا غياب: ${g.clear.join('، ')}`, { size: 20, color: '166534', after: 30 }))
    if (g.unrecorded.length) children.push(para(`فصول لم يُرصد حضورها بعد: ${g.unrecorded.join('، ')}`, { size: 20, color: 'B45309', after: 30 }))
    if (g.empty.length) children.push(para(`فصول بلا طلاب: ${g.empty.join('، ')}`, { size: 20, color: '64748B', after: 30 }))
  }

  children.push(new Paragraph({ children: [text(totalsLine(data), { bold: true })], alignment: AlignmentType.RIGHT, bidirectional: true, spacing: { before: 160, after: 200 }, border: { top: { style: BorderStyle.SINGLE, size: 6, color: INK, space: 4 } } }))

  // Signatures: officer, principal, stamp.
  const gw = split([37, 37, 26])
  const sig = (title: string, name: string | null, w: number) => cell([
    para(title, { bold: true, size: 22, after: 140, color: INK, align: AlignmentType.CENTER }),
    para(`الاسم: ${name ?? '........................'}`, { after: 140 }),
    para('التوقيع: ........................', { after: 40 }),
  ], w, { borders: box(BorderStyle.SINGLE, 'CBD5E1'), valign: 'top', pad: 120 })
  children.push(table(gw, [new TableRow({ children: [
    sig('مسؤول الغياب', null, gw[0]),
    sig('مدير المدرسة', identity.principalName, gw[1]),
    cell([para('ختم المدرسة', { bold: true, size: 20, align: AlignmentType.CENTER, color: '64748B', after: 0 })], gw[2], { borders: box(BorderStyle.DASHED, '94A3B8'), pad: 420 }),
  ] })]))
  // Footer contacts.
  children.push(new Paragraph({ children: [text(IDENTITY_FOOTER_LINE, { size: 18, color: INK })], alignment: AlignmentType.CENTER, bidirectional: true, spacing: { before: 240 }, border: { top: { style: BorderStyle.DOUBLE, size: 8, color: INK, space: 6 } } }))

  const doc = new Document({
    creator: SCHOOL_IDENTITY.company,
    title: `${SHEET_TITLE} ${data.date}`,
    styles: { default: { document: { run: { font: 'Arial', size: 22, rightToLeft: true } } } },
    sections: [{ properties: { page: { size: { width: PAGE_W, height: PAGE_H }, margin: { top: MARGIN_Y, bottom: MARGIN_Y, left: MARGIN_X, right: MARGIN_X } } }, children }],
  })
  return { docx, doc }
}
