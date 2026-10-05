import { db } from '@/lib/db'
import { classes, gradeLevels, students, dailyRecords, teachers, schoolStaff, subjects } from '@/lib/db/schema'
import { and, eq, asc } from 'drizzle-orm'
import { requireAdminAccess, canViewGrade, canEditGrade } from '@/lib/admin-access'
import { NotificationBell } from '@/components/notification-bell'
import { today, isValidDateString } from '@/lib/utils'
import { getSchoolDaysConfig } from '@/lib/school-holidays'
import { nonSchoolDayReason } from '@/lib/school-days'
import { getSchoolTimetable, lessonsOn, teachesOn, type SchoolSlot, type TeacherLesson } from '@/lib/timetable'
import { MAX_PERIODS, periodName, periodOrdinal } from '@/lib/timetable-rules'
import AttendanceClient, { type RegisterRow, type LessonChip } from './attendance-client'

export const dynamic = 'force-dynamic'

/**
 * What the timetable gives a teacher in one class on one day, as a phrase:
 * «الحصة الثانية (رياضيات)». A subject met twice that day names both lessons —
 * «الحصتان الثانية والخامسة (رياضيات)» — and two subjects are listed apart.
 */
function lessonsPhrase(lessons: TeacherLesson[]): string {
  const bySubject = new Map<string, { name: string; periods: number[] }>()
  for (const l of lessons) {
    const entry = bySubject.get(l.subjectId) ?? { name: l.subjectName, periods: [] }
    entry.periods.push(l.period)
    bySubject.set(l.subjectId, entry)
  }
  return [...bySubject.values()]
    .map(({ name, periods }) => {
      const which = periods.length === 1
        ? periodName(periods[0])
        : `${periods.length === 2 ? 'الحصتان' : 'الحصص'} ${periods.map(periodOrdinal).join(' و')}`
      return `${which} (${name})`
    })
    .join(' · ')
}

/**
 * The register as the administration sees it: one class, one day, every pupil
 * with what the teachers recorded and who recorded any absence. Corrections
 * are made from here — see actions-attendance.ts for what that means.
 *
 * With a teacher picked, the class list becomes that teacher's day: the
 * classes the timetable puts them in on the chosen date. That is how the
 * office takes a register for a teacher who is away — pick the teacher, see
 * the day's lessons, open one. Without a teacher the page is what it always
 * was, every class the account may view.
 */
export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ classId?: string; date?: string; teacher?: string }>
}) {
  const access = await requireAdminAccess()
  const school = access.school
  const params = await searchParams
  // The timetable only matters once a teacher is asked for; the page most
  // people open — every class, no teacher — does not pay for reading it.
  const teacherParam = typeof params.teacher === 'string' && params.teacher ? params.teacher : null

  const [allClasses, gradeRows, taught, slots] = await Promise.all([
    db.select().from(classes).where(eq(classes.schoolId, school.id)),
    db.select({ id: gradeLevels.id, name: gradeLevels.name, order: gradeLevels.orderIndex })
      .from(gradeLevels).where(eq(gradeLevels.schoolId, school.id)),
    // Every subject somebody teaches, with that teacher's name: one read that
    // answers both «who can be picked» and «which classes are theirs». A
    // subject nobody holds, or held by an account that is no longer a teacher
    // of this school, drops out at the join.
    db
      .select({
        classId: subjects.classId,
        subjectName: subjects.name,
        teacherUserId: teachers.userId,
        teacherName: teachers.fullName,
      })
      .from(subjects)
      .innerJoin(teachers, and(eq(teachers.userId, subjects.teacherUserId), eq(teachers.schoolId, school.id)))
      .where(eq(subjects.schoolId, school.id)),
    teacherParam ? getSchoolTimetable(school.id) : Promise.resolve([] as SchoolSlot[]),
  ])
  const gradeById = new Map(gradeRows.map((g) => [g.id, g]))
  const visible = allClasses
    .filter((c) => canViewGrade(access, c.gradeLevelId))
    .sort((a, b) =>
      (gradeById.get(a.gradeLevelId)?.order ?? 0) - (gradeById.get(b.gradeLevelId)?.order ?? 0) ||
      a.name.localeCompare(b.name))
  const visibleIds = new Set(visible.map((c) => c.id))
  const classLabel = (c: (typeof visible)[number]) => `${gradeById.get(c.gradeLevelId)?.name ?? ''} — ${c.name}`

  const todayStr = today()
  const date = isValidDateString(params.date) && params.date <= todayStr ? params.date : todayStr

  // Who can be picked: a teacher holding a subject in a class this account may
  // view. A teacher of another stage is not offered to a deputy who could not
  // open any of their classes anyway.
  const teacherNames = new Map<string, string>()
  for (const s of taught) if (visibleIds.has(s.classId)) teacherNames.set(s.teacherUserId, s.teacherName)
  const teacherOptions = [...teacherNames]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ar'))
  // The id comes from the address bar. One that is not on the list above —
  // mistyped, a teacher of another stage, a teacher whose subject has just
  // been handed to somebody else — means no teacher at all.
  const teacher = teacherOptions.find((t) => t.id === teacherParam) ?? null

  let offered = visible
  let classOptions = visible.map((c) => ({ id: c.id, label: classLabel(c) }))
  let lessons: LessonChip[] = []
  if (teacher) {
    const held = new Map<string, string[]>()
    for (const s of taught) {
      if (s.teacherUserId !== teacher.id || !visibleIds.has(s.classId)) continue
      held.set(s.classId, [...(held.get(s.classId) ?? []), s.subjectName])
    }
    const thatDay = lessonsOn(slots, teacher.id, date)
    // The teacher's classes ON THIS DATE: the ones the timetable gives them a
    // lesson in that weekday, and the ones whose week has not been written
    // down yet — those are still theirs every day, as before timetables.
    const mine = visible
      .filter((c) => held.has(c.id) && teachesOn(slots, teacher.id, c.id, date))
      .map((c) => ({ cls: c, lessons: thatDay.filter((l) => l.classId === c.id) }))
      // In the order the day runs, classes without a timetable last. The sort
      // is stable, so within a lesson — and among those last — the stage order
      // above still holds.
      .sort((a, b) => (a.lessons[0]?.period ?? MAX_PERIODS + 1) - (b.lessons[0]?.period ?? MAX_PERIODS + 1))

    offered = mine.map((m) => m.cls)
    classOptions = mine.map(({ cls, lessons: own }) => ({
      id: cls.id,
      // No lesson of theirs that day, yet listed: the timetable is silent
      // there — no timetable at all, or nothing written about this teacher or
      // this weekday — so the class is theirs that day as it always was.
      label: `${classLabel(cls)} · ${own.length ? lessonsPhrase(own) : `${held.get(cls.id)!.join('، ')} (خارج الجدول)`}`,
    }))

    // The same day as chips, one per lesson. A class name such as «أ» repeats
    // from stage to stage, so a teacher who crosses stages gets the stage too.
    const mineById = new Map(mine.map((m) => [m.cls.id, m.cls]))
    const crossesStages = new Set(offered.map((c) => c.gradeLevelId)).size > 1
    const chipName = (c: (typeof visible)[number]) => (crossesStages ? classLabel(c) : c.name)
    lessons = [
      ...thatDay.flatMap((l) => {
        const cls = mineById.get(l.classId)
        return cls ? [{ classId: l.classId, period: l.period, className: chipName(cls), subject: l.subjectName }] : []
      }),
      ...mine
        .filter((m) => m.lessons.length === 0)
        .map((m) => ({ classId: m.cls.id, period: null, className: chipName(m.cls), subject: held.get(m.cls.id)!.join('، ') })),
    ]
  }

  // A class asked for by id that is not on offer — another stage's, or not
  // this teacher's that day — gives way to the first one that is.
  const selected = offered.find((c) => c.id === params.classId) ?? offered[0] ?? null

  let rows: RegisterRow[] = []
  if (selected) {
    const [pupils, register] = await Promise.all([
      db
        .select({ id: students.id, fullName: students.fullName })
        .from(students)
        .where(and(eq(students.classId, selected.id), eq(students.status, 'active')))
        .orderBy(asc(students.fullName)),
      db
        .select({
          studentId: dailyRecords.studentId,
          status: dailyRecords.attendanceStatus,
          markedAt: dailyRecords.absenceMarkedAt,
          markedBy: dailyRecords.absenceMarkedBy,
          teacherName: teachers.fullName,
          staffName: schoolStaff.fullName,
        })
        .from(dailyRecords)
        .leftJoin(teachers, eq(teachers.userId, dailyRecords.absenceMarkedBy))
        .leftJoin(schoolStaff, eq(schoolStaff.userId, dailyRecords.absenceMarkedBy))
        .where(and(eq(dailyRecords.classId, selected.id), eq(dailyRecords.date, date))),
    ])
    const byStudent = new Map(register.map((r) => [r.studentId, r]))
    rows = pupils.map((p) => {
      const r = byStudent.get(p.id)
      // The owner is in neither the teachers' table nor the staff's, so both
      // joins come back empty for an absence the owner recorded.
      const owner = r?.teacherName ? `المعلم ${r.teacherName}`
        : r?.staffName ? `الإدارة (${r.staffName})`
        : r?.markedBy && r.markedBy === school.adminId ? 'الإدارة (المالك)'
        : null
      return {
        id: p.id,
        fullName: p.fullName,
        status: (r?.status as RegisterRow['status']) ?? null,
        owner: r && (r.status === 'absent' || r.status === 'excused') ? owner : null,
        ownerAt: r?.markedAt ? r.markedAt.toISOString() : null,
      }
    })
  }

  // A Friday or a holiday has no register to read; say so rather than show
  // a class of pupils «غير مسجَّل» as if the teachers had forgotten.
  const dayOff = selected ? nonSchoolDayReason(date, await getSchoolDaysConfig(school.id, selected.gradeLevelId)) : null
  const editable = !!selected && canEditGrade(access, selected.gradeLevelId)

  // A class nobody has recorded on a teaching day is not a register to correct
  // but one still to take — and an account that may edit is told it can.
  const taking = editable && !dayOff && rows.length > 0 && rows.every((r) => r.status === null)

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">سجل الحضور</h1>
          <p className="text-muted-foreground mt-1">
            {taking
              ? teacher
                ? `لم يُسجَّل حضور هذا الفصل في هذا اليوم بعد — سجِّله من هنا نيابةً عن المعلم ${teacher.name}`
                : 'لم يُسجَّل حضور هذا الفصل في هذا اليوم بعد — يمكنك تسجيله من هنا نيابةً عن معلّمه'
              : 'ما سجّله المعلمون لكل فصل في كل يوم — وتصحيحه من الإدارة عند الحاجة'}
          </p>
        </div>
        <NotificationBell />
      </div>

      <AttendanceClient
        // A different teacher, class or day is a different register: pending
        // marks and a typed reason belong to the one they were made on.
        key={`${teacher?.id ?? ''}|${selected?.id ?? ''}|${date}`}
        teachers={teacherOptions}
        teacherId={teacher?.id ?? null}
        lessons={lessons}
        classes={classOptions}
        classId={selected?.id ?? null}
        date={date}
        today={todayStr}
        dayOff={dayOff}
        rows={rows}
        editable={editable}
      />
    </div>
  )
}
