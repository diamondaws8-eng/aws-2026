import { db } from '@/lib/db'
import { classes, gradeLevels, subjects, teachers } from '@/lib/db/schema'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { requireAdminAccess, canViewGrade, canEditGrade } from '@/lib/admin-access'
import { NotificationBell } from '@/components/notification-bell'
import { getSchoolDaysConfig } from '@/lib/school-holidays'
import { getSchoolTimetable } from '@/lib/timetable'
import { timetableDays } from '@/lib/timetable-rules'
import { isUuid } from '@/lib/utils'
import TimetableClient, { type TimetableSubject, type BusyElsewhere } from './timetable-client'

export const dynamic = 'force-dynamic'

/**
 * The weekly timetable, one class at a time.
 *
 * What is written here is what each day then shows a teacher: the lessons the
 * timetable gives them that day, and no others. It is entered once by whoever
 * runs the stage, stays for the term, and is edited when the term's plan
 * changes. A class nobody has written a timetable for is offered to its
 * teachers every day, as it always was.
 */
export default async function TimetablePage({
  searchParams,
}: {
  searchParams: Promise<{ classId?: string }>
}) {
  const access = await requireAdminAccess()
  const school = access.school
  const params = await searchParams

  const [allClasses, gradeRows, slots] = await Promise.all([
    db.select({ id: classes.id, name: classes.name, gradeLevelId: classes.gradeLevelId })
      .from(classes).where(eq(classes.schoolId, school.id)),
    db.select({ id: gradeLevels.id, name: gradeLevels.name, order: gradeLevels.orderIndex })
      .from(gradeLevels).where(eq(gradeLevels.schoolId, school.id)),
    getSchoolTimetable(school.id),
  ])
  const gradeById = new Map(gradeRows.map((g) => [g.id, g]))
  const labelOf = (c: { name: string; gradeLevelId: string }) => `${gradeById.get(c.gradeLevelId)?.name ?? ''} — ${c.name}`
  const visible = allClasses
    .filter((c) => canViewGrade(access, c.gradeLevelId))
    .sort((a, b) =>
      (gradeById.get(a.gradeLevelId)?.order ?? 0) - (gradeById.get(b.gradeLevelId)?.order ?? 0) ||
      a.name.localeCompare(b.name))

  // How much of each class's week is written — so the list itself says which
  // classes still have no timetable.
  const lessonsIn = new Map<string, number>()
  for (const s of slots) lessonsIn.set(s.classId, (lessonsIn.get(s.classId) ?? 0) + 1)

  const selected = (isUuid(params.classId) ? visible.find((c) => c.id === params.classId) : null) ?? visible[0] ?? null

  let subjectList: TimetableSubject[] = []
  let busy: BusyElsewhere[] = []
  let days = timetableDays(false)
  if (selected) {
    const [subjectRows, schoolDays] = await Promise.all([
      db.select({ id: subjects.id, name: subjects.name, teacherUserId: subjects.teacherUserId })
        .from(subjects).where(eq(subjects.classId, selected.id)).orderBy(asc(subjects.name)),
      getSchoolDaysConfig(school.id, selected.gradeLevelId),
    ])
    const teacherIds = [...new Set(subjectRows.map((s) => s.teacherUserId).filter((v): v is string => !!v))]
    const teacherRows = teacherIds.length
      ? await db.select({ userId: teachers.userId, fullName: teachers.fullName })
          .from(teachers).where(and(eq(teachers.schoolId, school.id), inArray(teachers.userId, teacherIds)))
      : []
    const nameOf = new Map(teacherRows.map((t) => [t.userId, t.fullName]))
    subjectList = subjectRows.map((s) => ({
      id: s.id,
      name: s.name,
      teacherUserId: s.teacherUserId,
      teacherName: s.teacherUserId ? nameOf.get(s.teacherUserId) ?? null : null,
    }))

    // Where this class's teachers already are, in the rest of the school — so
    // the editor can say «له حصة في …» in the cell while it is being chosen,
    // not only after saving.
    const classLabel = new Map(allClasses.map((c) => [c.id, labelOf(c)]))
    const mine = new Set(teacherIds)
    busy = slots
      .filter((s) => s.classId !== selected.id && !!s.teacherUserId && mine.has(s.teacherUserId))
      .map((s) => ({
        teacherUserId: s.teacherUserId as string,
        weekday: s.weekday,
        period: s.period,
        classLabel: classLabel.get(s.classId) ?? '',
      }))

    // Saturday has a column for a stage that teaches on it — and for a class
    // whose timetable already holds a Saturday lesson, so a lesson written
    // before the stage stopped teaching Saturdays can still be seen and removed.
    const hasSaturdayLesson = slots.some((s) => s.classId === selected.id && s.weekday === 6)
    days = timetableDays(schoolDays.saturdayIsSchoolDay || hasSaturdayLesson)
  }

  const scheduledCount = visible.filter((c) => lessonsIn.has(c.id)).length

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">الجدول الأسبوعي</h1>
          <p className="text-muted-foreground mt-1">
            حصص كل فصل على أيام الأسبوع — يُكتب مرة ويبقى طوال الفصل الدراسي، ويُعدَّل متى تغيّر.
            يرى كل معلم في يومه الحصص التي يعطيه الجدول إياها فقط.
          </p>
        </div>
        <NotificationBell />
      </div>

      <TimetableClient
        // A different class is a different week: the editor starts clean.
        key={selected?.id ?? 'none'}
        classes={visible.map((c) => ({ id: c.id, label: labelOf(c), lessons: lessonsIn.get(c.id) ?? 0 }))}
        classId={selected?.id ?? null}
        classLabel={selected ? labelOf(selected) : ''}
        days={days}
        subjects={subjectList}
        slots={selected ? slots.filter((s) => s.classId === selected.id).map((s) => ({ weekday: s.weekday, period: s.period, subjectId: s.subjectId })) : []}
        busy={busy}
        editable={!!selected && canEditGrade(access, selected.gradeLevelId)}
        scheduledCount={scheduledCount}
      />
    </div>
  )
}
