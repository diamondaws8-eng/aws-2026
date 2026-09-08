import { PortalLayout } from '@/components/portal-layout'
import type { PortalNavLink } from '@/components/portal-layout'
import { requireAdminAccess } from '@/lib/admin-access'

export default async function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  const access = await requireAdminAccess()

  const links: PortalNavLink[] = [
    { href: '/admin', label: 'الرئيسية', icon: 'LayoutDashboard', exact: true },
    { href: '/admin/grade-levels', label: 'المراحل والفصول', icon: 'Layers' },
    { href: '/admin/students', label: 'الطلاب', icon: 'Users' },
    { href: '/admin/teachers', label: 'المعلمون', icon: 'UserCog' },
    { href: '/admin/notifications', label: 'التنبيهات', icon: 'Bell' },
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
