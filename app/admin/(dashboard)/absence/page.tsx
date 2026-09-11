import { db } from '@/lib/db'
import { classes, gradeLevels } from '@/lib/db/schema'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { requireAdminAccess } from '@/lib/admin-access'
import { NotificationBell } from '@/components/notification-bell'
import { DailyAbsenceReport } from '@/components/daily-absence-report'
import { getDailyAbsence, getSheetIdentity, scopeLabelFor } from '@/lib/daily-absence'
import { today, isValidDateString } from '@/lib/utils'

export const dynamic = 'force-dynamic'

/**
 * The daily absence sheet for the administration — the reader's own stages
 * only, the same cut every other admin page uses. A `stage` query narrows it
 * further, exactly as the dashboard's stage picker does; it can never widen.
 */
export default async function AdminAbsencePage({ searchParams }: { searchParams: Promise<{ date?: string; stage?: string | string[] }> }) {
  const access = await requireAdminAccess()
  const school = access.school
  const params = await searchParams
  const todayStr = today()
  const date = params.date && isValidDateString(params.date) && params.date <= todayStr ? params.date : todayStr

  const permitted = (await db.select({ id: gradeLevels.id }).from(gradeLevels).where(eq(gradeLevels.schoolId, school.id)))
    .map((g) => g.id)
    .filter((id) => access.viewAllGrades || access.gradeIds.includes(id))
  const requested = (Array.isArray(params.stage) ? params.stage : params.stage ? [params.stage] : [])
    .flatMap((v) => v.split(',')).map((v) => v.trim()).filter(Boolean)
  const selected = requested.filter((id) => permitted.includes(id))
  const gradeIds = selected.length ? selected : access.viewAllGrades ? null : access.gradeIds

  const scopedClassIds = gradeIds
    ? (await db.select({ id: classes.id }).from(classes).where(and(
        eq(classes.schoolId, school.id),
        gradeIds.length ? inArray(classes.gradeLevelId, gradeIds) : sql`false`,
      ))).map((c) => c.id)
    : null

  const data = await getDailyAbsence(school.id, date, scopedClassIds)
  const identity = await getSheetIdentity(school.id, scopeLabelFor(access.viewAllGrades && !selected.length, data))

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
      <DailyAbsenceReport data={data} identity={identity} basePath="/admin/absence" keepQuery={selected.length ? { stage: selected } : {}} today={todayStr} />
    </div>
  )
}
