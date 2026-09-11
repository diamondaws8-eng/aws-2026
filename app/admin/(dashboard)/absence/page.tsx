import { requireAdminAccess } from '@/lib/admin-access'
import { NotificationBell } from '@/components/notification-bell'
import { DailyAbsenceReport } from '@/components/daily-absence-report'
import { getDailyAbsence, getSheetIdentity } from '@/lib/daily-absence'
import { resolveAbsenceScope } from '@/lib/daily-absence-scope'
import { today, isValidDateString } from '@/lib/utils'

export const dynamic = 'force-dynamic'

/**
 * The daily absence sheet for the administration — the reader's own stages
 * only, the same cut every other admin page uses, narrowed further by the
 * stages and classes picked on the page. Picking can never widen.
 */
export default async function AdminAbsencePage({ searchParams }: { searchParams: Promise<{ date?: string; stage?: string | string[]; class?: string | string[] }> }) {
  const access = await requireAdminAccess()
  const school = access.school
  const params = await searchParams
  const todayStr = today()
  const date = params.date && isValidDateString(params.date) && params.date <= todayStr ? params.date : todayStr

  const scope = await resolveAbsenceScope({ schoolId: school.id, permittedGradeIds: access.viewAllGrades ? null : access.gradeIds, params })
  const [data, identity] = await Promise.all([
    getDailyAbsence(school.id, date, scope.classIds),
    getSheetIdentity(school.id, scope.scopeLabel),
  ])

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="no-print flex justify-between items-start gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">كشف الغياب اليومي</h1>
          <p className="text-muted-foreground mt-1">
            كل من كان خارج المدرسة في اليوم، فصلاً فصلاً — للطباعة بترويسة المدرسة وتوقيع مسؤول الغياب ومدير المدرسة
          </p>
        </div>
        <NotificationBell />
      </div>
      <DailyAbsenceReport data={data} identity={identity} basePath="/admin/absence" scope={scope} today={todayStr} />
    </div>
  )
}
