import { db } from '@/lib/db'
import { classes, gradeLevels, students, dailyRecords, teachers, schoolStaff } from '@/lib/db/schema'
import { and, eq, asc } from 'drizzle-orm'
import { requireAdminAccess, canViewGrade, canEditGrade } from '@/lib/admin-access'
import { NotificationBell } from '@/components/notification-bell'
import { today, isValidDateString } from '@/lib/utils'
import AttendanceClient, { type RegisterRow } from './attendance-client'

export const dynamic = 'force-dynamic'

/**
 * The register as the administration sees it: one class, one day, every pupil
 * with what the teachers recorded and who recorded any absence. Corrections
 * are made from here — see actions-attendance.ts for what that means.
 */
export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ classId?: string; date?: string }>
}) {
  const access = await requireAdminAccess()
  const school = access.school
  const params = await searchParams

  const [allClasses, gradeRows] = await Promise.all([
    db.select().from(classes).where(eq(classes.schoolId, school.id)),
    db.select({ id: gradeLevels.id, name: gradeLevels.name, order: gradeLevels.orderIndex })
      .from(gradeLevels).where(eq(gradeLevels.schoolId, school.id)),
  ])
  const gradeById = new Map(gradeRows.map((g) => [g.id, g]))
  const visible = allClasses
    .filter((c) => canViewGrade(access, c.gradeLevelId))
    .sort((a, b) =>
      (gradeById.get(a.gradeLevelId)?.order ?? 0) - (gradeById.get(b.gradeLevelId)?.order ?? 0) ||
      a.name.localeCompare(b.name))
  const classOptions = visible.map((c) => ({
    id: c.id,
    label: `${gradeById.get(c.gradeLevelId)?.name ?? ''} — ${c.name}`,
  }))

  const todayStr = today()
  const date = isValidDateString(params.date) && params.date <= todayStr ? params.date : todayStr
  const selected = visible.find((c) => c.id === params.classId) ?? visible[0] ?? null

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
      const owner = r?.teacherName ? `المعلم ${r.teacherName}` : r?.staffName ? `الإدارة (${r.staffName})` : null
      return {
        id: p.id,
        fullName: p.fullName,
        status: (r?.status as RegisterRow['status']) ?? null,
        owner: r && (r.status === 'absent' || r.status === 'excused') ? owner : null,
        ownerAt: r?.markedAt ? r.markedAt.toISOString() : null,
      }
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">سجل الحضور</h1>
          <p className="text-muted-foreground mt-1">
            ما سجّله المعلمون لكل فصل في كل يوم — وتصحيحه من الإدارة عند الحاجة
          </p>
        </div>
        <NotificationBell />
      </div>

      <AttendanceClient
        classes={classOptions}
        classId={selected?.id ?? null}
        date={date}
        today={todayStr}
        rows={rows}
        editable={!!selected && canEditGrade(access, selected.gradeLevelId)}
      />
    </div>
  )
}
