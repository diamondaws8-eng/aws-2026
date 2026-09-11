import { db } from '@/lib/db'
import { classes, gradeLevels, students, dailyRecords, teachers, schoolStaff, schools } from '@/lib/db/schema'
import { and, eq, inArray } from 'drizzle-orm'
import { getSchoolDaysConfig } from '@/lib/school-holidays'
import { nonSchoolDayReason } from '@/lib/school-days'
import { SEMESTER_LABELS, isSemester } from '@/lib/academic'
import { ABSENCE_STATUS_LABEL, type AbsenceStatus } from '@/lib/daily-absence-labels'

export { ABSENCE_STATUS_LABEL, type AbsenceStatus }

/**
 * The day's absence, as the sheet on the attendance officer's desk.
 *
 * One line per pupil the register says was away — absent, or away with leave —
 * grouped by stage and class, with who marked it. Late arrivals are not on it:
 * a pupil who came in at the third lesson was in the building, and the sheet
 * is about who was not.
 *
 * Two things the sheet says out loud rather than leaving blank, because a
 * blank reads as «nobody was absent» when it may mean «nobody looked»:
 * a class with no register at all for the day is marked unrecorded, and a
 * date the stage does not teach on is named as such — per stage, because a
 * stage may keep its own Saturday and its own holidays.
 *
 * Scope is the caller's: pass the class ids the reader is allowed to see, or
 * null for the whole school. Nothing here decides who may read what.
 */

export type AbsenceRow = {
  studentId: string
  fullName: string
  status: AbsenceStatus
  parentPhone: string | null
  /** Who marked the absence — a teacher's or a staff member's name. */
  markedBy: string | null
}

export type AbsenceClass = {
  classId: string
  className: string
  /** Active pupils in the class today. */
  pupils: number
  /** Of those pupils, how many have a register entry for the day — 0 means the class was not taken. */
  recorded: number
  rows: AbsenceRow[]
}

export type AbsenceStage = {
  gradeId: string
  gradeName: string
  /** Why this stage does not teach on the date, when it does not. */
  dayOff: string | null
  classes: AbsenceClass[]
  absent: number
  excused: number
}

export type SheetDates = { hijri: string; gregorian: string; weekday: string }

export type DailyAbsence = {
  date: string
  /** The date written three ways, produced once on the server so screen, paper and files agree. */
  dates: SheetDates
  /** Set only when every stage in scope is off on this date. */
  dayOff: string | null
  stages: AbsenceStage[]
  totals: { absent: number; excused: number; pupils: number; classes: number; unrecordedClasses: number }
}

export type SheetIdentity = {
  schoolName: string
  principalName: string | null
  academicYear: string
  /** The term alone («الفصل الدراسي الأول»); the year is printed beside it once. */
  termLabel: string
  /** Which stages the sheet covers, in words — so a one-stage sheet is never taken for the school's. */
  scopeLabel: string
}

export function sheetDates(date: string): SheetDates {
  const d = new Date(`${date}T00:00:00`)
  return {
    hijri: d.toLocaleDateString('ar-SA-u-ca-islamic-umalqura', { year: 'numeric', month: 'long', day: 'numeric' }),
    gregorian: d.toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { year: 'numeric', month: 'long', day: 'numeric' }),
    weekday: d.toLocaleDateString('ar-SA', { weekday: 'long' }),
  }
}

const AWAY = new Set(['absent', 'excused'])

export async function getDailyAbsence(
  schoolId: string,
  date: string,
  classIds: string[] | null,
): Promise<DailyAbsence> {
  const dates = sheetDates(date)
  const empty: DailyAbsence = {
    date, dates, dayOff: null, stages: [],
    totals: { absent: 0, excused: 0, pupils: 0, classes: 0, unrecordedClasses: 0 },
  }
  if (classIds && classIds.length === 0) return empty

  const classRows = await db
    .select({ id: classes.id, name: classes.name, gradeId: gradeLevels.id, gradeName: gradeLevels.name, order: gradeLevels.orderIndex })
    .from(classes)
    .innerJoin(gradeLevels, eq(gradeLevels.id, classes.gradeLevelId))
    .where(and(eq(classes.schoolId, schoolId), classIds ? inArray(classes.id, classIds) : undefined))
  if (classRows.length === 0) {
    const cfg = await getSchoolDaysConfig(schoolId)
    return { ...empty, dayOff: nonSchoolDayReason(date, cfg) }
  }
  const ids = classRows.map((c) => c.id)
  const gradeIds = [...new Set(classRows.map((c) => c.gradeId))]

  const [activePupils, records, stageCfgs] = await Promise.all([
    db.select({ id: students.id, classId: students.classId })
      .from(students)
      .where(and(inArray(students.classId, ids), eq(students.status, 'active'))),
    db.select({ studentId: dailyRecords.studentId, classId: dailyRecords.classId, status: dailyRecords.attendanceStatus, markedBy: dailyRecords.absenceMarkedBy })
      .from(dailyRecords)
      .where(and(eq(dailyRecords.date, date), inArray(dailyRecords.classId, ids))),
    // Each stage answers for its own calendar (cached per request).
    Promise.all(gradeIds.map(async (g) => [g, nonSchoolDayReason(date, await getSchoolDaysConfig(schoolId, g))] as const)),
  ])
  const dayOffByGrade = new Map<string, string | null>(stageCfgs)

  // One status per pupil per day is the rule (see lib/daily-roster.ts); the
  // register holds a row per teacher, so fold them. Should the rows ever
  // disagree, an absence wins — the sheet errs towards a call home.
  const byStudent = new Map<string, { classId: string; status: string; markedBy: string | null }>()
  for (const r of records) {
    const prev = byStudent.get(r.studentId)
    if (!prev || (AWAY.has(r.status) && !AWAY.has(prev.status))) {
      byStudent.set(r.studentId, { classId: r.classId, status: r.status, markedBy: r.markedBy })
    }
  }

  // Pupils and «recorded» are counted over the same set — today's active
  // members of the class — so the caption's fraction is always a fraction.
  const activeByClass = new Map<string, string[]>()
  for (const p of activePupils) if (p.classId) activeByClass.set(p.classId, [...(activeByClass.get(p.classId) ?? []), p.id])
  const recordedByClass = new Map<string, number>()
  for (const [cid, pupils] of activeByClass) recordedByClass.set(cid, pupils.filter((id) => byStudent.has(id)).length)

  const awayIds = [...byStudent.entries()].filter(([, v]) => AWAY.has(v.status)).map(([id]) => id)
  const markerIds = [...new Set([...byStudent.values()].map((v) => v.markedBy).filter((v): v is string => !!v))]

  const [pupilRows, teacherNames, staffNames] = await Promise.all([
    awayIds.length
      ? db.select({ id: students.id, fullName: students.fullName, parentPhone: students.parentPhone }).from(students).where(inArray(students.id, awayIds))
      : Promise.resolve([] as { id: string; fullName: string; parentPhone: string | null }[]),
    markerIds.length
      ? db.select({ userId: teachers.userId, name: teachers.fullName }).from(teachers).where(inArray(teachers.userId, markerIds))
      : Promise.resolve([] as { userId: string; name: string }[]),
    markerIds.length
      ? db.select({ userId: schoolStaff.userId, name: schoolStaff.fullName }).from(schoolStaff).where(inArray(schoolStaff.userId, markerIds))
      : Promise.resolve([] as { userId: string; name: string }[]),
  ])
  const markerName = new Map<string, string>()
  for (const s of staffNames) markerName.set(s.userId, `الإدارة (${s.name})`)
  for (const t of teacherNames) markerName.set(t.userId, t.name)

  // A pupil is listed under the class the register put them in that day; one
  // moved since still belongs to the day they were absent from.
  const rowsPerClass = new Map<string, AbsenceRow[]>()
  for (const p of pupilRows) {
    const v = byStudent.get(p.id)
    if (!v) continue
    const list = rowsPerClass.get(v.classId) ?? []
    list.push({ studentId: p.id, fullName: p.fullName, status: v.status as AbsenceStatus, parentPhone: p.parentPhone, markedBy: v.markedBy ? (markerName.get(v.markedBy) ?? null) : null })
    rowsPerClass.set(v.classId, list)
  }

  const collator = new Intl.Collator('ar')
  const stageMap = new Map<string, AbsenceStage & { order: number }>()
  for (const c of classRows) {
    const rows = (rowsPerClass.get(c.id) ?? []).sort((a, b) => collator.compare(a.fullName, b.fullName))
    const cls: AbsenceClass = { classId: c.id, className: c.name, pupils: activeByClass.get(c.id)?.length ?? 0, recorded: recordedByClass.get(c.id) ?? 0, rows }
    const stage = stageMap.get(c.gradeId) ?? { gradeId: c.gradeId, gradeName: c.gradeName, dayOff: dayOffByGrade.get(c.gradeId) ?? null, order: c.order ?? 0, classes: [], absent: 0, excused: 0 }
    stage.classes.push(cls)
    stage.absent += rows.filter((r) => r.status === 'absent').length
    stage.excused += rows.filter((r) => r.status === 'excused').length
    stageMap.set(c.gradeId, stage)
  }
  const stages: AbsenceStage[] = [...stageMap.values()]
    .sort((a, b) => a.order - b.order || collator.compare(a.gradeName, b.gradeName))
    .map(({ order: _o, ...s }) => ({ ...s, classes: s.classes.sort((a, b) => collator.compare(a.className, b.className)) }))

  // A day off has no register to miss: those classes are not «unrecorded».
  const unrecordedClasses = stages.filter((s) => !s.dayOff).flatMap((s) => s.classes).filter((c) => c.pupils > 0 && c.recorded === 0).length
  const allOff = stages.length > 0 && stages.every((s) => s.dayOff)
  return {
    date, dates,
    dayOff: allOff ? stages[0].dayOff : null,
    stages,
    totals: {
      absent: stages.reduce((n, s) => n + s.absent, 0),
      excused: stages.reduce((n, s) => n + s.excused, 0),
      pupils: stages.flatMap((s) => s.classes).reduce((n, c) => n + c.pupils, 0),
      classes: classRows.length,
      unrecordedClasses,
    },
  }
}

/** The names the sheet is signed with, straight from the school row. The caller adds the scope. */
export async function getSheetIdentity(schoolId: string, scopeLabel: string): Promise<SheetIdentity> {
  const [s] = await db
    .select({ name: schools.name, principalName: schools.principalName, academicYear: schools.academicYear, semester: schools.currentSemester })
    .from(schools).where(eq(schools.id, schoolId)).limit(1)
  const semester = s?.semester
  return {
    schoolName: s?.name ?? '',
    principalName: s?.principalName?.trim() || null,
    academicYear: s?.academicYear ?? '',
    termLabel: semester && isSemester(semester) ? SEMESTER_LABELS[semester] : '',
    scopeLabel,
  }
}

/** «جميع المراحل» for a whole-school reader, else the stages actually on the sheet. */
export function scopeLabelFor(allStages: boolean, data: DailyAbsence): string {
  if (allStages) return 'جميع المراحل'
  return data.stages.length ? data.stages.map((s) => s.gradeName).join('، ') : 'المراحل المسندة إليك'
}
