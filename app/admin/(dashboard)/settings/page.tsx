import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { schools } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getSchoolSettings } from './actions-settings'
import SettingsClient from './settings-client'

export const dynamic = 'force-dynamic'

export default async function AdminSettingsPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/admin/login')

  const [school] = await db.select().from(schools).where(eq(schools.adminId, session.user.id)).limit(1)
  if (!school) redirect('/admin/setup')

  const settings = await getSchoolSettings(school.id)

  return (
    <div className="px-6 py-8 max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold">⚙️ الإعدادات</h1>
        <p className="text-muted-foreground text-sm mt-1">إدارة إعدادات المدرسة وكلمة المرور</p>
      </div>
      <SettingsClient schoolId={school.id} initialSettings={settings} adminEmail={session.user.email} />
    </div>
  )
}
