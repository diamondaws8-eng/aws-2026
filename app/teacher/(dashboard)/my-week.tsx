import { CalendarDays } from 'lucide-react'
import { lessonsOnWeekday, type SchoolSlot } from '@/lib/timetable'
import { WEEKDAY_NAMES, periodOrdinal, timetableDays } from '@/lib/timetable-rules'
import { SATURDAY, weekdayOf } from '@/lib/school-days'

/**
 * «جدولي الأسبوعي» — this teacher's own week, read off the school's timetable.
 *
 * Days run down the card as rows, not across it as a grid: most teachers open
 * this on a phone, and six columns at that width leave a lesson four letters.
 *
 * It is a statement of the fixed week, not of this week's calendar — a holiday
 * on Tuesday does not empty Tuesday's row. The day's own card above it is the
 * one that knows about holidays.
 */
export function MyWeek({
  slots,
  teacherUserId,
  classNames,
  today,
}: {
  slots: SchoolSlot[]
  teacherUserId: string
  /**
   * The classes this teacher may open, each under the name to print. A lesson
   * in any other class is left out: the timetable never shows a teacher a
   * class that lib/teacher-access.ts would not let them into.
   */
  classNames: ReadonlyMap<string, string>
  today: string
}) {
  const week = timetableDays(true).map((weekday) => ({
    weekday,
    lessons: lessonsOnWeekday(slots, teacherUserId, weekday).filter((l) => classNames.has(l.classId)),
  }))
  // No lesson anywhere: the timetable is not written yet, or holds nothing of
  // this teacher's. An empty week would only look like a week off.
  if (week.every((d) => d.lessons.length === 0)) return null

  // Saturday is a row only for a teacher who is actually given a lesson on it.
  // Most stages do not teach it, and a permanent «السبت — لا حصص» would read
  // as a day they are expected in.
  const days = week.filter((d) => d.weekday !== SATURDAY || d.lessons.length > 0)
  const todayWeekday = weekdayOf(today)

  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <div className="flex items-center gap-3 mb-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <CalendarDays className="size-4" />
        </span>
        <h2 className="text-lg font-bold">جدولي الأسبوعي</h2>
      </div>
      <ul className="space-y-1">
        {days.map((d) => {
          const isToday = d.weekday === todayWeekday
          return (
            <li
              key={d.weekday}
              className={`flex items-start gap-3 rounded-xl px-2 py-2 ${isToday ? 'bg-primary/5 ring-1 ring-primary/25' : ''}`}
            >
              <span className="w-16 shrink-0 pt-1 text-sm font-bold">
                {WEEKDAY_NAMES[d.weekday]}
                {isToday && <span className="block text-[11px] font-semibold text-primary">اليوم</span>}
              </span>
              {d.lessons.length === 0 ? (
                <span className="pt-1 text-xs text-muted-foreground">لا حصص</span>
              ) : (
                <ul className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                  {d.lessons.map((l) => (
                    <li
                      key={`${l.period}|${l.classId}`}
                      className={`rounded-lg border px-2 py-1 text-xs leading-5 ${isToday ? 'border-primary/25 bg-card' : 'border-border bg-muted/40'}`}
                    >
                      <span className="font-bold">{periodOrdinal(l.period)}</span>
                      {' · '}
                      {classNames.get(l.classId)}
                      {' · '}
                      {l.subjectName}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
