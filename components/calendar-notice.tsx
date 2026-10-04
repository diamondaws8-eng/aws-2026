import { CalendarDays, CalendarOff, Laptop } from 'lucide-react'
import type { CalendarNotice as CalendarNoticeData } from '@/lib/school-holidays'
import { daysInRange, isWeeklyRest } from '@/lib/school-days'
import { formatDayGregorianAr, formatRangeAr, dayCountAr } from '@/lib/utils'

/**
 * Where today sits in the school calendar, and the closures ahead.
 *
 * The calendar is a state, not an event. A notice about a suspension is read
 * once or never — a parent who has not activated the account has no bell at
 * all — while the page is what a family opens. So it is told here, and nothing
 * is drawn on an ordinary school day with no closure in sight.
 *
 * No hooks, and only a type from the server-only calendar module: a server
 * page and a client one can both render it.
 */
export function CalendarNotice({ notice, today }: { notice: CalendarNoticeData; today: string }) {
  const closed = notice.today
  const { upcoming } = notice
  if (!closed && upcoming.length === 0) return null

  const remote = !!closed?.remote
  // A closure whose last day is today has no «حتى» worth printing.
  const endsLater = closed?.until && closed.until > today ? closed.until : null

  return (
    <div
      className={`rounded-2xl border p-4 ${
        remote ? 'border-sky-200 bg-sky-50' : closed ? 'border-border bg-muted/40' : 'border-border bg-card'
      }`}
    >
      {closed && (
        <div className="flex items-start gap-3">
          <span
            className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ${
              remote ? 'bg-sky-100 text-sky-700' : 'bg-muted text-muted-foreground'
            }`}
          >
            {remote ? <Laptop className="size-4" /> : <CalendarOff className="size-4" />}
          </span>
          <div className="min-w-0">
            {remote ? (
              <>
                <p className="text-sm font-bold text-sky-900">الدراسة اليوم عن بُعد</p>
                <p className="text-sm leading-6 text-sky-800 break-words">{closed.reason}</p>
                {endsLater && (
                  <p className="text-sm font-semibold text-sky-800">حتى {formatDayGregorianAr(endsLater)}</p>
                )}
                <p className="mt-1 text-xs leading-5 text-sky-700">
                  لا يُسجَّل حضور ولا غياب بعد إعلان تعليق الدراسة الحضورية.
                </p>
              </>
            ) : isWeeklyRest(closed.reason) ? (
              <>
                <p className="text-sm font-bold">اليوم {closed.reason} — إجازة نهاية الأسبوع</p>
                {/* A weekend inside a longer closure says so: the week's rest
                    alone would read as «back in class on Sunday». And a
                    suspension is named as one — lessons go on from home. */}
                {closed.within && closed.until && (
                  <p className="mt-0.5 text-xs leading-5 text-muted-foreground break-words">
                    {closed.within.remote
                      ? `${closed.within.name} — حتى ${formatDayGregorianAr(closed.until)}`
                      : `ضمن ${closed.within.name}، وتنتهي ${formatDayGregorianAr(closed.until)}`}
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="text-sm font-bold break-words">
                  {closed.reason.trimStart().startsWith('إجازة') ? `اليوم ${closed.reason}` : `اليوم إجازة: ${closed.reason}`}
                </p>
                {endsLater && (
                  <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                    تنتهي {formatDayGregorianAr(endsLater)}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {upcoming.length > 0 && (
        <div className={closed ? `mt-3 border-t pt-3 ${remote ? 'border-sky-200' : 'border-border'}` : undefined}>
          <h2 className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
            <CalendarDays className="size-4" />
            قادم في التقويم
          </h2>
          {/* Wraps rather than truncates: on a phone the name takes the first
              line and the dates the second, and neither is cut. */}
          <ul className="mt-2 space-y-1.5">
            {upcoming.map((h, i) => (
              <li key={`${h.startDate}:${i}`} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
                <span className="min-w-0 font-semibold break-words">{h.name}</span>
                {h.remote && (
                  <span className="shrink-0 rounded-md border border-sky-200 bg-sky-100 px-1.5 py-0.5 text-[11px] font-bold text-sky-700">
                    عن بُعد
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  {formatRangeAr(h.startDate, h.endDate)} · {dayCountAr(daysInRange(h.startDate, h.endDate))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
