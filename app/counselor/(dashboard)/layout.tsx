import { PortalLayout } from '@/components/portal-layout'
import type { PortalNavLink } from '@/components/portal-layout'
import { getCounselorAccess } from '@/lib/counselor-access'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { user } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { CounselorSetPasswordCard } from './set-password-card'
import { homePortalFor } from '@/lib/home-portal'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'

export default async function CounselorLayout({ children }: { children: React.ReactNode }) {
  const access = await getCounselorAccess()
  if (!access) {
    // A real account that is not a counsellor goes to its own portal.
    const session = await auth.api.getSession({ headers: await headers() })
    redirect(session?.user ? ((await homePortalFor(session.user.id, session.user.role)) ?? '/counselor/login') : '/counselor/login')
  }

  // Issued passwords open nothing until replaced — this account reads private
  // notes about children.
  const [me] = await db
    .select({ mustChange: user.mustChangePassword })
    .from(user)
    .where(eq(user.id, access.userId))
    .limit(1)
  if (me?.mustChange) return <CounselorSetPasswordCard name={access.name} />

  const links: PortalNavLink[] = [
    { href: '/counselor', label: 'الحالات', icon: 'ClipboardList', exact: true },
    { href: '/counselor/notifications', label: 'الإشعارات', icon: 'Bell' },
    { href: '/counselor/archive', label: 'الأرشيف', icon: 'ScrollText' },
    { href: '/counselor/settings', label: 'الإعدادات', icon: 'Settings' },
  ]

  return (
    <PortalLayout
      role="counselor"
      user={{ name: access.name, email: '' }}
      schoolName={access.schoolName}
      roleLabel="موجه طلابي"
      links={links}
    >
      {children}
    </PortalLayout>
  )
}
