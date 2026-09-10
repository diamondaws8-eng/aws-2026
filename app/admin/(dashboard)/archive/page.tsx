import { requireAdminAccess } from '@/lib/admin-access'
import { listSchoolYears, currentSchoolYear, summariseYear, graduatesOfYear } from '@/lib/school-years'
import { today } from '@/lib/utils'
import { ArchiveClient } from './archive-client'

export const dynamic = 'force-dynamic'

export default async function ArchivePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>
}) {
  const access = await requireAdminAccess()
  const schoolId = access.school.id

  const [years, open] = await Promise.all([
    listSchoolYears(schoolId),
    currentSchoolYear(schoolId),
  ])

  // Default to the year being read, else the one still running.
  const wanted = (await searchParams).year
  const selected = years.find((y) => y.id === wanted) ?? years[0] ?? null

  // A closed year shows the figures taken the day it closed; an open one is
  // counted live, because it is still changing.
  let summary = null
  let graduates: { id: string; fullName: string; graduatedAt: Date | null }[] = []
  if (selected) {
    summary = selected.summary
      ? JSON.parse(selected.summary)
      : await summariseYear(schoolId, selected.startDate, selected.endDate)
    graduates = await graduatesOfYear(schoolId, selected.label)
  }

  return (
    <ArchiveClient
      years={years.map((y) => ({
        id: y.id,
        label: y.label,
        startDate: y.startDate,
        endDate: y.endDate,
        closed: !!y.closedAt,
        closedByName: y.closedByName,
        closedAt: y.closedAt ? y.closedAt.toISOString() : null,
      }))}
      selectedId={selected?.id ?? null}
      summary={summary}
      isLiveCount={!!selected && !selected.closedAt}
      graduates={graduates.map((g) => ({ id: g.id, fullName: g.fullName }))}
      hasOpenYear={!!open}
      openYearLabel={open?.label ?? null}
      currentLabel={access.school.academicYear}
      currentStart={access.school.yearStartDate}
      canManage={access.editAllGrades}
      todayStr={today()}
    />
  )
}
