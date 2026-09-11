import { getCounselorAccess, getCounselorClassIds } from '@/lib/counselor-access'
import { redirect } from 'next/navigation'
import { listCases } from '@/lib/behavior-cases'
import { EmptyState } from '@/components/empty-state'
import { ScrollText } from 'lucide-react'
import { NotificationBell } from '@/components/notification-bell'
import { CaseArchiveTable } from '@/components/case-archive-table'

export const dynamic = 'force-dynamic'

export default async function CounselorArchivePage() {
  const access = await getCounselorAccess()
  if (!access) redirect('/counselor/login')
  const classIds = access.allGrades ? null : await getCounselorClassIds(access)

  const cases = await listCases({
    schoolId: access.schoolId,
    classIds,
    statuses: ['resolved_privately', 'parent_informed', 'escalated', 'admin_handled', 'dismissed'],
    limit: 200,
  })

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">أرشيف الحالات</h1>
          <p className="text-muted-foreground mt-1">كل حالة أُغلقت وكيف انتهت</p>
        </div>
        <NotificationBell />
      </div>

      {cases.length === 0 ? (
        <EmptyState icon={ScrollText} title="الأرشيف فارغ" description="لم تُغلق أي حالة بعد" />
      ) : (
        <CaseArchiveTable
          rows={cases.map((c) => ({
            id: c.id,
            studentName: c.studentName,
            className: c.className,
            gradeName: c.gradeName,
            teacherName: c.teacherName,
            date: c.date,
            status: c.status,
            escalatedToName: c.escalatedToName,
          }))}
        />
      )}
    </div>
  )
}
