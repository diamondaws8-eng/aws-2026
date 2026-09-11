'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'
import { CASE_STATUS, type CaseStatus } from '@/lib/case-status'

const STATUS_STYLE: Record<CaseStatus, string> = {
  open: 'bg-amber-50 text-amber-700 border-amber-100',
  resolved_privately: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  parent_informed: 'bg-blue-50 text-blue-700 border-blue-100',
  escalated: 'bg-violet-50 text-violet-700 border-violet-100',
  admin_handled: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  dismissed: 'bg-slate-50 text-slate-700 border-slate-200',
}

type Row = {
  id: string
  studentId: string
  studentName: string
  className: string | null
  gradeName: string | null
  teacherName: string
  date: string
  status: CaseStatus
  escalatedToName: string | null
}

/**
 * The closed cases, with the one thing an archive of two hundred rows needs:
 * a box to type a pupil's name into. Filters by pupil, class, teacher or
 * outcome, on the rows already loaded — nothing goes back to the server.
 */
export function CaseArchiveTable({ rows }: { rows: Row[] }) {
  const [q, setQ] = useState('')
  const shown = useMemo(() => {
    const needle = q.trim()
    if (!needle) return rows
    return rows.filter((c) =>
      [c.studentName, c.className ?? '', c.gradeName ?? '', c.teacherName, CASE_STATUS[c.status], c.escalatedToName ?? '']
        .some((v) => v.includes(needle)),
    )
  }, [rows, q])

  return (
    <div className="space-y-3">
      <label className="relative block max-w-md">
        <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ابحث باسم الطالب أو الفصل أو المعلم أو النتيجة…"
          className="h-11 w-full rounded-xl border border-border bg-card pr-10 pl-3 text-sm"
        />
      </label>
      <p className="text-xs text-muted-foreground">{shown.length} من {rows.length} حالة</p>
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="bg-muted text-muted-foreground text-xs">
              <tr>
                <th className="p-3 font-semibold">الطالب</th>
                <th className="p-3 font-semibold">الفصل</th>
                <th className="p-3 font-semibold">المعلم</th>
                <th className="p-3 font-semibold">التاريخ</th>
                <th className="p-3 font-semibold">النتيجة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {shown.map((c) => (
                <tr key={c.id} className="hover:bg-muted/40">
                  <td className="p-3 font-semibold"><Link href={`/counselor/students/${c.studentId}`} className="hover:text-primary underline-offset-2 hover:underline">{c.studentName}</Link></td>
                  <td className="p-3 text-muted-foreground text-xs">
                    {c.gradeName ? `${c.gradeName} — ` : ''}{c.className ? `فصل ${c.className}` : '—'}
                  </td>
                  <td className="p-3 text-muted-foreground text-xs">{c.teacherName}</td>
                  <td className="p-3 text-muted-foreground text-xs whitespace-nowrap">{c.date}</td>
                  <td className="p-3">
                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${STATUS_STYLE[c.status]}`}>
                      {CASE_STATUS[c.status]}
                      {c.status === 'escalated' && c.escalatedToName ? ` — ${c.escalatedToName}` : ''}
                    </span>
                  </td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr><td colSpan={5} className="p-6 text-center text-sm text-muted-foreground">لا نتيجة تطابق البحث</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
