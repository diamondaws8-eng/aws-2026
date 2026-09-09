import { getSchoolSettings } from './actions-settings'
import SettingsClient from './settings-client'
import { requireAdminAccess } from '@/lib/admin-access'
import { Settings as SettingsIcon } from 'lucide-react'
import { NotificationBell } from '@/components/notification-bell'

export const dynamic = 'force-dynamic'

export default async function AdminSettingsPage() {
  const access = await requireAdminAccess()
  const settings = await getSchoolSettings(access.school.id)
  const { listSchoolHolidays } = await import('@/lib/school-holidays')
  const holidays = await listSchoolHolidays(access.school.id)

  return (
    <div className="px-6 py-8 max-w-3xl mx-auto space-y-8">
      <div className="flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <SettingsIcon className="size-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">الإعدادات</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{access.roleLabel} — {access.school.name}</p>
        </div>
        <div className="ms-auto"><NotificationBell /></div>
      </div>

      <SettingsClient
        schoolId={access.school.id}
        initialSettings={settings}
        adminEmail={access.email}
        adminName={access.name}
        roleLabel={access.roleLabel}
        canManageSchoolSettings={access.canManageSchoolSettings}
        canBackup={access.canBackup}
        backupAllGrades={access.backupAllGrades}
        canRestore={access.canRestore}
        initialAcademicYear={access.school.academicYear}
        initialCurrentSemester={access.school.currentSemester}
        initialYearStartDate={access.school.yearStartDate}
        canManageSchoolDays={access.canManageSchoolDays}
        initialSaturdayIsSchoolDay={access.school.saturdayIsSchoolDay}
        initialHolidays={holidays}
      />
    </div>
  )
}
