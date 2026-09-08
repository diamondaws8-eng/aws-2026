import { db } from '@/lib/db'
import { dailyRecords, lessonRecords } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

/**
 * Merges the shared register with one teacher's own assessment for a day.
 *
 * This lives in lib on purpose. It used to be exported from a `'use server'`
 * file, which makes every export a public HTTP endpoint — so anyone who knew a
 * class id could read a whole class's attendance without a session. Callers
 * authorise first (see requireTeacherForClass / getTeacherClassAccess) and then
 * call this; it does no checking of its own and must never be re-exported from
 * a server-action file.
 */
export async function getRosterForDay(classId: string, date: string, teacherUserId: string) {
  const [attendance, mine] = await Promise.all([
    db.select({
        studentId: dailyRecords.studentId,
        attendanceStatus: dailyRecords.attendanceStatus,
        pointsEarned: dailyRecords.pointsEarned,
      })
      .from(dailyRecords)
      .where(and(eq(dailyRecords.classId, classId), eq(dailyRecords.date, date))),
    db.select({
        studentId: lessonRecords.studentId,
        behavior: lessonRecords.behavior,
        homeworkStatus: lessonRecords.homeworkStatus,
        materialsStatus: lessonRecords.materialsStatus,
        participationStatus: lessonRecords.participationStatus,
        teacherNote: lessonRecords.teacherNote,
        pointsEarned: lessonRecords.pointsEarned,
      })
      .from(lessonRecords)
      .where(and(
        eq(lessonRecords.classId, classId),
        eq(lessonRecords.date, date),
        eq(lessonRecords.teacherUserId, teacherUserId),
      )),
  ])

  const byStudent = new Map(mine.map((m) => [m.studentId, m]))
  const seen = new Set<string>()
  const merged = attendance.map((a) => {
    seen.add(a.studentId)
    const m = byStudent.get(a.studentId)
    return {
      studentId: a.studentId,
      attendanceStatus: a.attendanceStatus,
      behavior: m?.behavior ?? null,
      homeworkStatus: m?.homeworkStatus ?? null,
      materialsStatus: m?.materialsStatus ?? null,
      participationStatus: m?.participationStatus ?? null,
      teacherNote: m?.teacherNote ?? null,
      pointsEarned: a.pointsEarned + (m?.pointsEarned ?? 0),
      /** false = this teacher has not filled their own row for the day yet. */
      mine: !!m,
    }
  })

  // A teacher's own row can exist before the register does (rare, but possible
  // if attendance was cleared) — never drop it.
  for (const m of mine) {
    if (seen.has(m.studentId)) continue
    merged.push({
      studentId: m.studentId,
      attendanceStatus: 'present',
      behavior: m.behavior,
      homeworkStatus: m.homeworkStatus,
      materialsStatus: m.materialsStatus,
      participationStatus: m.participationStatus,
      teacherNote: m.teacherNote,
      pointsEarned: m.pointsEarned,
      mine: true,
    })
  }
  return merged
}
