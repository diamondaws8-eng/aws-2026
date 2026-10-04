import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import type { ChildWeek } from '@/lib/parent-portal'
import { formatRangeAr } from '@/lib/utils'

/**
 * The week so far, in one card.
 *
 * The year's totals sit above it and answer a different question. What a
 * parent opens the portal to ask is «how was this week» — and until now the
 * answer was a list of days with one word beside each.
 *
 * No hooks, and only a type from the server-only reader: a server page and a
 * client one can both render it.
 */
export function ParentWeekCard({ week, childId }: { week: ChildWeek; childId: string }) {
  const { attendance } = week
  const registerDays = attendance.present + attendance.late + attendance.absent + attendance.excused
  if (registerDays === 0 && week.lessons === 0 && week.bonus === 0) return null

  // Only what there is something to say about: a row of zeros is four lines
  // of reading that tell a parent nothing.
  const remarks = [
    { label: 'واجبات لم تُنجَز', value: week.homeworkMissing, tone: 'text-red-700' },
    { label: 'أدوات لم تُحضَر', value: week.materialsMissing, tone: 'text-red-700' },
    { label: 'ملاحظات سلوكية', value: week.behaviorIssues, tone: 'text-red-700' },
    { label: 'ملاحظات المعلمين', value: week.notes, tone: 'text-amber-700' },
  ].filter((r) => r.value > 0)

  return (
    <div className="bg-card border border-border rounded-3xl p-5 shadow-sm">
      <h2 className="font-bold text-lg">هذا الأسبوع</h2>
      <p className="text-xs text-muted-foreground mt-0.5">{formatRangeAr(week.from, week.to)}</p>

      {/* Two across, the label beside its number: four across on a phone
          leaves about 70px a tile and «أيام حضور» breaks under the figure. */}
      {registerDays > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
          {[
            { label: 'أيام حضور', value: attendance.present, emoji: '✅', color: 'text-emerald-600 bg-emerald-50 border-emerald-100' },
            { label: 'أيام غياب', value: attendance.absent,  emoji: '❌', color: 'text-red-600 bg-red-50 border-red-100' },
            { label: 'أيام تأخر', value: attendance.late,    emoji: '⏰', color: 'text-amber-600 bg-amber-50 border-amber-100' },
            { label: 'أيام إذن',  value: attendance.excused, emoji: '📋', color: 'text-blue-600 bg-blue-50 border-blue-100' },
          ].map((stat) => (
            <div key={stat.label} className={`flex items-center justify-between gap-2 rounded-2xl border px-3 py-2 ${stat.color}`}>
              <span className="text-xs font-semibold">{stat.emoji} {stat.label}</span>
              <span className="text-lg font-black">{stat.value}</span>
            </div>
          ))}
        </div>
      )}

      <p className="text-sm mt-4">
        <span className="text-muted-foreground">النقاط: </span>
        {/* Left-to-right on its own, or the sign lands after the number. */}
        <span dir="ltr" className="font-black text-primary">{week.points > 0 ? '+' : ''}{week.points}</span>
        {week.possible > 0 && <span className="text-muted-foreground"> من {week.possible} ممكنة</span>}
      </p>
      {/* Apart from the line above: given by hand, they are not part of what
          was «possible», and added in they print a total above its own ceiling. */}
      {week.bonus !== 0 && (
        <p className="text-sm mt-1">
          <span className="text-muted-foreground">نقاط إضافية من المعلمين: </span>
          <span dir="ltr" className={`font-black ${week.bonus > 0 ? 'text-emerald-600' : 'text-red-600'}`}>{week.bonus > 0 ? '+' : ''}{week.bonus}</span>
        </p>
      )}

      {remarks.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {remarks.map((r) => (
            <li key={r.label} className="text-sm">
              <span className="text-muted-foreground">{r.label}: </span>
              <span className={`font-bold ${r.tone}`}>{r.value}</span>
            </li>
          ))}
        </ul>
      ) : week.lessons > 0 ? (
        <p className="mt-3 text-sm font-semibold text-emerald-700">لا ملاحظات هذا الأسبوع ✅</p>
      ) : null}

      {/* What each teacher recorded is a page of its own; the week only counts it. */}
      <Link
        href={`/parent/day/${week.to}?child=${childId}`}
        className="mt-2 inline-flex items-center gap-1 min-h-10 text-sm font-bold text-primary"
      >
        تفاصيل اليوم
        <ChevronLeft className="size-4" />
      </Link>
    </div>
  )
}
