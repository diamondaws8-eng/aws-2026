import { PortalLayout } from '@/components/portal-layout'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { schools } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

export default async function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/admin/login')

  const [school] = await db.select().from(schools).where(eq(schools.adminId, session.user.id)).limit(1)
  if (!school) redirect('/admin/setup')

  return (
    <PortalLayout
      role="admin"
      user={{ name: session.user.name, email: session.user.email }}
      schoolName={school.name}
    >
      {children}
    </PortalLayout>
  )
}
