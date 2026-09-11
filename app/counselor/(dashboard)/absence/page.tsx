import { redirect } from 'next/navigation'
import { getCounselorAccess, getCounselorClassIds } from '@/lib/counselor-access'
import { NotificationBell } from '@/components/notification-bell'
import { DailyAbsenceReport } from '@/components/daily-absence-report'
import { getDailyAbsence, getSheetIdentity, scopeLabelFor } from '@/lib/daily-absence'
import { today, isValidDateString } from '@/lib/utils'

export const dynamic = 'force-dynamic'

/**
 * The same sheet for the counsellor, cut to the stages they answer for.
 * Absence is where a case often starts, so it is theirs to read and print.
 */
export default async function CounselorAbsencePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const access = await getCounselorAccess()
  if (!access) redirect('/counselor/login')
  const params = await searchParams
  const todayStr = today()
  const date = params.date && isValidDateString(params.date) && params.date <= todayStr ? params.date : todayStr

  const classIds = access.allGrades ? null : await getCounselorClassIds(access)
  const data = await getDailyAbsence(access.schoolId, date, classIds)
  const identity = await getSheetIdentity(access.schoolId, scopeLabelFor(access.allGrades, data))

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="no-print flex justify-between items-start gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">كشف الغياب اليومي</h1>
          <p className="text-muted-foreground mt-1">
            كل من كان خارج المدرسة في اليوم، فصلاً فصلاً، ضمن مراحلك — للطباعة والحفظ
          </p>
        </div>
        <NotificationBell />
      </div>
      <DailyAbsenceReport data={data} identity={identity} basePath="/counselor/absence" today={todayStr} />
    </div>
  )
}
