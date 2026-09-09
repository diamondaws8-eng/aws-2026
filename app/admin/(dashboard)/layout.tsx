import { PortalLayout } from '@/components/portal-layout'
import type { PortalNavLink } from '@/components/portal-layout'
import { requireAdminAccess } from '@/lib/admin-access'
import { db } from '@/lib/db'
import { user } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { AdminSetPasswordCard } from './set-password-card'

export default async function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  const access = await requireAdminAccess()

  // An issued password opens nothing until it is replaced. The owner signed up
  // themselves and is never flagged, so this only gates invited accounts.
  const [me] = await db
    .select({ mustChange: user.mustChangePassword })
    .from(user)
    .where(eq(user.id, access.userId))
    .limit(1)
  if (me?.mustChange) {
    return <AdminSetPasswordCard name={access.name} />
  }

  const links: PortalNavLink[] = [
    { href: '/admin', label: 'الرئيسية', icon: 'LayoutDashboard', exact: true },
    { href: '/admin/grade-levels', label: 'المراحل والفصول', icon: 'Layers' },
    { href: '/admin/students', label: 'الطلاب', icon: 'Users' },
    { href: '/admin/promote', label: 'ترحيل الطلاب', icon: 'CheckSquare' },
    { href: '/admin/teachers', label: 'المعلمون', icon: 'UserCog' },
    { href: '/admin/cases', label: 'الحالات السلوكية', icon: 'ShieldAlert' },
    { href: '/admin/notifications', label: 'إرسال تنبيه', icon: 'Bell' },
    { href: '/admin/parent-activation', label: 'تفعيل أولياء الأمور', icon: 'CheckSquare' },
    { href: '/admin/my-notifications', label: 'إشعاراتي', icon: 'Bell' },
    ...(access.canManageStaff
      ? [
          { href: '/admin/staff', label: 'فريق الإدارة', icon: 'ClipboardList' as const },
          { href: '/admin/audit', label: 'سجل التدقيق', icon: 'BarChart2' as const },
        ]
      : []),
    { href: '/admin/settings', label: 'الإعدادات', icon: 'Settings' },
  ]

  return (
    <PortalLayout
      role="admin"
      user={{ name: access.name, email: access.email }}
      schoolName={access.school.name}
      roleLabel={access.roleLabel}
      links={links}
    >
      {children}
    </PortalLayout>
  )
}
