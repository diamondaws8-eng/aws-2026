import { requireAdminAccess, canViewGrade, canEditGrade } from '@/lib/admin-access'
import { NotificationBell } from '@/components/notification-bell'
import { listExcusesForOffice } from '@/lib/absence-excuses'
import ExcusesClient, { type ExcuseRow } from './excuses-client'

export const dynamic = 'force-dynamic'

/**
 * What families have written about their children's absences, for the people
 * who run each stage: the reader's own stages only, the same cut every other
 * admin page uses. An excuse whose stage can no longer be worked out is shown
 * only to somebody who sees the whole school. Whoever may read a stage but not
 * edit it sees the excuses without the means to answer them.
 */
export default async function ExcusesPage() {
  const access = await requireAdminAccess()

  const rows: ExcuseRow[] = (await listExcusesForOffice(access.school.id, access.viewAllGrades ? null : access.gradeIds))
    .filter((r) => canViewGrade(access, r.gradeLevelId))
    .map((r) => ({
      id: r.id,
      studentName: r.studentName,
      gradeName: r.gradeName,
      className: r.className,
      date: r.date,
      reason: r.reason,
      status: r.status,
      parentPhone: r.parentPhone,
      createdAt: r.createdAt,
      decisionNote: r.decisionNote,
      decidedByName: r.decidedByName,
      decidedAt: r.decidedAt,
      dayStatus: r.dayStatus,
      canDecide: canEditGrade(access, r.gradeLevelId),
    }))

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">أعذار الغياب</h1>
          <p className="text-muted-foreground mt-1">
            ما يرسله أولياء الأمور عن أيام الغياب — القبول يحوّل الغياب إلى غياب بعذر.
          </p>
        </div>
        <NotificationBell />
      </div>

      <ExcusesClient rows={rows} />
    </div>
  )
}
