import Link from 'next/link'
import { CalendarX, ArrowLeft, AlertTriangle } from 'lucide-react'
import { getDailyAbsence } from '@/lib/daily-absence'

/**
 * The day's absence at a glance, with the sheet one click away. Sits on the
 * administrator's and the counsellor's front pages, cut to their own stages.
 *
 * Async so it can stream inside a <Suspense>: its three round trips must not
 * delay the rest of the page.
 */
export async function AbsenceTodayCard({ schoolId, date, classIds, href }: { schoolId: string; date: string; classIds: string[] | null; href: string }) {
  const data = await getDailyAbsence(schoolId, date, classIds)
  const t = data.totals
  const away = t.absent + t.excused
  const off = data.dayOff
  return (
    <Link
      href={href}
      className={`flex items-center gap-4 rounded-2xl border p-4 transition-colors ${
        off ? 'border-border bg-muted/40 hover:bg-muted' : away ? 'border-red-200 bg-red-50 hover:bg-red-100' : 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100'
      }`}
    >
      <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${off ? 'bg-muted text-muted-foreground' : away ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
        <CalendarX className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold">كشف الغياب اليومي</span>
        <span className="block text-xs text-muted-foreground mt-0.5">
          {off ? `اليوم ${off} — لا سجل متوقع` : `غائب ${t.absent} · بإذن ${t.excused} · من ${t.pupils} طالباً`}
          {!off && t.unrecordedClasses > 0 && (
            <span className="inline-flex items-center gap-1 text-amber-700 font-semibold"> · <AlertTriangle className="size-3" /> {t.unrecordedClasses} فصل لم يُرصد بعد</span>
          )}
        </span>
      </span>
      <span className="inline-flex items-center gap-1 text-xs font-bold text-primary shrink-0">افتح الكشف <ArrowLeft className="size-3.5" /></span>
    </Link>
  )
}

export function AbsenceTodayCardSkeleton() {
  return <div className="h-[76px] rounded-2xl border border-border bg-card skeleton" aria-busy="true" />
}
