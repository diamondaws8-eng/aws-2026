import { cache } from 'react'
import { db } from '@/lib/db'
import { timetableSlots, subjects, teachers } from '@/lib/db/schema'
import { asc, eq } from 'drizzle-orm'
import { weekdayOf } from '@/lib/school-days'

/**
 * Reading the weekly timetable.
 *
 * Deliberately not in a 'use server' file: every export from one of those is a
 * public HTTP endpoint, and the readers here take ids and trust them. The
 * caller has already established whose school, class or teacher is asked about.
 *
 * One rule runs through everything below, and through every screen that uses
 * it: THE TIMETABLE ONLY SPEAKS WHERE IT HAS SOMETHING WRITTEN. A class with
 * no timetable is not governed by one, and neither is a day its timetable
 * leaves empty, nor a teacher its timetable never names. In each of those
 * cases the class behaves exactly as it did before timetables — offered to its
 * teachers every school day — so a week entered half-way, a Saturday switched
 * on after the week was written, or a subject assigned after it, costs no
 * teacher a class and no class its register. See `governs` below.
 */

/** One lesson of the school's week, with the teacher its subject is assigned to. */
export type SchoolSlot = {
  classId: string
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number
  /** 1 = the first lesson of the day. */
  period: number
  subjectId: string
  subjectName: string
  /** Null while the subject has nobody assigned — the lesson is then nobody's. */
  teacherUserId: string | null
}

/**
 * The whole school's timetable in one read, cached for the request.
 *
 * A school of forty classes, six days and eight lessons is under two thousand
 * narrow rows; every question asked below is a filter over them, and the
 * pages that ask several of those questions pay for one query between them.
 * A slot whose subject has been deleted drops out here (the join), so a
 * timetable can never name a lesson that no longer exists.
 */
export const getSchoolTimetable = cache(async (schoolId: string): Promise<SchoolSlot[]> => {
  return db
    .select({
      classId: timetableSlots.classId,
      weekday: timetableSlots.weekday,
      period: timetableSlots.period,
      subjectId: timetableSlots.subjectId,
      subjectName: subjects.name,
      teacherUserId: subjects.teacherUserId,
    })
    .from(timetableSlots)
    .innerJoin(subjects, eq(subjects.id, timetableSlots.subjectId))
    .where(eq(timetableSlots.schoolId, schoolId))
    .orderBy(asc(timetableSlots.weekday), asc(timetableSlots.period))
})

/** One class's week, each lesson with its teacher's name — for the editor and for printing. */
export type ClassSlot = SchoolSlot & { teacherName: string | null }

export async function getClassTimetable(classId: string): Promise<ClassSlot[]> {
  return db
    .select({
      classId: timetableSlots.classId,
      weekday: timetableSlots.weekday,
      period: timetableSlots.period,
      subjectId: timetableSlots.subjectId,
      subjectName: subjects.name,
      teacherUserId: subjects.teacherUserId,
      teacherName: teachers.fullName,
    })
    .from(timetableSlots)
    .innerJoin(subjects, eq(subjects.id, timetableSlots.subjectId))
    .leftJoin(teachers, eq(teachers.userId, subjects.teacherUserId))
    .where(eq(timetableSlots.classId, classId))
    .orderBy(asc(timetableSlots.weekday), asc(timetableSlots.period))
}

// ── Questions asked of the slots — pure, so pages can ask many for one read ──

/** Classes whose week has been written down. Any other class is not governed by a timetable. */
export function scheduledClassIds(slots: SchoolSlot[]): Set<string> {
  return new Set(slots.map((s) => s.classId))
}

/** One lesson a teacher gives on a particular day. */
export type TeacherLesson = { classId: string; period: number; subjectId: string; subjectName: string }

/** What one teacher teaches on one weekday, in the order the day runs. */
export function lessonsOnWeekday(slots: SchoolSlot[], teacherUserId: string, weekday: number): TeacherLesson[] {
  return slots
    .filter((s) => s.teacherUserId === teacherUserId && s.weekday === weekday)
    .map((s) => ({ classId: s.classId, period: s.period, subjectId: s.subjectId, subjectName: s.subjectName }))
    .sort((a, b) => a.period - b.period)
}

/** The same for a date. The calendar (holidays, the weekend) is the caller's business, not the timetable's. */
export function lessonsOn(slots: SchoolSlot[], teacherUserId: string, date: string): TeacherLesson[] {
  return lessonsOnWeekday(slots, teacherUserId, weekdayOf(date))
}

/**
 * Does the timetable have anything to say about this teacher, in this class,
 * on this weekday?
 *
 * Only when both are true: the class has a lesson written for that weekday
 * (anybody's), and the teacher is given a lesson in the class somewhere in
 * the week. Without the first, the day was simply never filled in — a week
 * typed as far as Monday, or a Saturday the stage began teaching after its
 * timetables were written — and a school day with no lessons in a class does
 * not exist. Without the second, the timetable has never heard of this
 * teacher there — a subject assigned after the week was written — and its
 * silence is not «no lesson».
 */
export function governs(slots: SchoolSlot[], teacherUserId: string, classId: string, weekday: number): boolean {
  let dayWritten = false
  let teacherNamed = false
  for (const s of slots) {
    if (s.classId !== classId) continue
    if (s.weekday === weekday) dayWritten = true
    if (s.teacherUserId === teacherUserId) teacherNamed = true
    if (dayWritten && teacherNamed) return true
  }
  return false
}

/**
 * Is this class this teacher's on this date?
 *
 * Yes when the timetable gives the teacher a lesson there that weekday — and
 * yes, too, wherever the timetable does not govern (see above): there is then
 * nothing to go by, and the class stays theirs that day as it was before
 * timetables. It never widens what a teacher may reach: whether the class is
 * theirs at all is still decided by lib/teacher-access.ts.
 */
export function teachesOn(slots: SchoolSlot[], teacherUserId: string, classId: string, date: string): boolean {
  const weekday = weekdayOf(date)
  if (!governs(slots, teacherUserId, classId, weekday)) return true
  return slots.some((s) => s.classId === classId && s.weekday === weekday && s.teacherUserId === teacherUserId)
}

/**
 * Of the classes a teacher may open, the ones that are theirs on this date:
 * those the timetable puts them in that day, and those with no timetable yet.
 */
export function classesOn(slots: SchoolSlot[], teacherUserId: string, classIds: Iterable<string>, date: string): string[] {
  return [...classIds].filter((id) => teachesOn(slots, teacherUserId, id, date))
}

/** Two classes at once: a teacher the timetable puts in more than one room in the same lesson. */
export type TeacherClash = { teacherUserId: string; weekday: number; period: number; classIds: string[] }

export function teacherClashes(slots: SchoolSlot[]): TeacherClash[] {
  const at = new Map<string, Set<string>>()
  for (const s of slots) {
    if (!s.teacherUserId) continue
    const key = `${s.teacherUserId}|${s.weekday}|${s.period}`
    at.set(key, (at.get(key) ?? new Set()).add(s.classId))
  }
  const clashes: TeacherClash[] = []
  for (const [key, classIds] of at) {
    if (classIds.size < 2) continue
    const [teacherUserId, weekday, period] = key.split('|')
    clashes.push({ teacherUserId, weekday: Number(weekday), period: Number(period), classIds: [...classIds] })
  }
  return clashes
}
