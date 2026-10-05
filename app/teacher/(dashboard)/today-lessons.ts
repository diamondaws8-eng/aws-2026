import { governs, lessonsOn, type SchoolSlot, type TeacherLesson } from '@/lib/timetable'
import { weekdayOf } from '@/lib/school-days'
import { periodName, periodOrdinal } from '@/lib/timetable-rules'

/**
 * Which of a teacher's classes are a given day's.
 *
 * The home page's «سجل اليوم» asks this; the rule itself — where the timetable
 * governs and where it is silent — is `governs` in lib/timetable.ts, the same
 * one the missed-days reminder and the office's attendance page go by, so the
 * three can never disagree about whose day a class is.
 *
 * Pure, over slots the caller has already read: no query of its own, and it
 * never widens what a teacher may reach. It is handed the classes the teacher
 * can open and only ever sorts those.
 */

export type ClassDay = {
  /** This teacher's lessons in the class that day, in the order the day runs. */
  lessons: TeacherLesson[]
  /** The timetable governs this teacher's day in the class (lib/timetable.ts `governs`). */
  scheduled: boolean
  /**
   * Whether the class belongs in that day's list. False only where the
   * timetable governs and holds no lesson of this teacher's that day: the
   * class stays reachable, but it is not that day's work.
   */
  today: boolean
}

export function classDays(input: {
  slots: SchoolSlot[]
  teacherUserId: string
  /** The classes this teacher may open. A lesson anywhere else is not theirs to see. */
  classIds: Iterable<string>
  date: string
  /** Classes this teacher has already recorded on that date. */
  recorded: ReadonlySet<string>
  /**
   * False for a teacher on the rollout fallback list (lib/teacher-access.ts):
   * they hold no subject, and the classes they see are merely open, not
   * theirs. The timetable gives lessons to teachers through their subjects, so
   * it has nothing to say about such a teacher — and reading its silence as
   * "no lesson today" would empty the day of every teacher in a school that
   * wrote its timetable before assigning its subjects.
   */
  followsTimetable: boolean
}): Map<string, ClassDay> {
  const { slots, teacherUserId, date, recorded, followsTimetable } = input
  const weekday = weekdayOf(date)

  const lessonsByClass = new Map<string, TeacherLesson[]>()
  if (followsTimetable) {
    // Already in period order, so each class's list is too.
    for (const lesson of lessonsOn(slots, teacherUserId, date)) {
      lessonsByClass.set(lesson.classId, [...(lessonsByClass.get(lesson.classId) ?? []), lesson])
    }
  }

  const days = new Map<string, ClassDay>()
  for (const classId of input.classIds) {
    const lessons = lessonsByClass.get(classId) ?? []
    const scheduled = followsTimetable && governs(slots, teacherUserId, classId, weekday)
    days.set(classId, {
      lessons,
      scheduled,
      // Where the timetable does not govern — no timetable, a day it leaves
      // empty, a teacher it never names — the class is every school day's, as
      // it always was. One the teacher has in fact recorded that day is that day's too,
      // whatever the timetable says — a swapped lesson, a colleague covered —
      // because a list of the day's records that left out one saved an hour
      // ago would read as a record lost.
      today: !scheduled || lessons.length > 0 || recorded.has(classId),
    })
  }
  return days
}

// Past any period a day can hold; finite, so two of them still subtract to 0.
const AFTER_LESSONS = 1_000_000

/**
 * The order a day's list runs in: the timetable's lessons by their first
 * period, then the classes with no timetable, then anything recorded outside
 * it. For Array.sort, which keeps the caller's own order between equals.
 */
export function byDayOrder(a: ClassDay, b: ClassDay): number {
  return dayRank(a) - dayRank(b)
}

function dayRank(day: ClassDay): number {
  if (day.lessons.length) return day.lessons[0].period
  return day.scheduled ? AFTER_LESSONS + 1 : AFTER_LESSONS
}

/**
 * «الحصة الثانية · رياضيات» — what a class's card says about the day.
 *
 * Two lessons in one class are named on the one card, because a teacher
 * records a class once a day (lesson_records is unique per pupil, teacher and
 * date) and two cards would promise two registers.
 */
export function lessonsLabel(lessons: TeacherLesson[]): string {
  // By subject, so a double lesson reads «الحصتان الثانية والثالثة · رياضيات»
  // instead of naming the subject twice.
  const bySubject = new Map<string, { name: string; periods: number[] }>()
  for (const lesson of lessons) {
    const group = bySubject.get(lesson.subjectId) ?? { name: lesson.subjectName, periods: [] }
    group.periods.push(lesson.period)
    bySubject.set(lesson.subjectId, group)
  }
  return [...bySubject.values()].map((g) => `${periodsPhrase(g.periods)} · ${g.name}`).join('، ')
}

function periodsPhrase(periods: number[]): string {
  if (periods.length === 1) return periodName(periods[0])
  // Arabic counts two differently from three: «الحصتان» then «الحصص».
  return `${periods.length === 2 ? 'الحصتان' : 'الحصص'} ${periods.map(periodOrdinal).join(' و')}`
}
