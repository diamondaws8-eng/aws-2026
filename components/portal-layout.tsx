'use client'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { cn } from '@/lib/utils'
import {
  School,
  GraduationCap,
  UsersRound,
  LayoutDashboard,
  BookOpen,
  ClipboardList,
  Bell,
  UserCog,
  LogOut,
  Layers,
  Users,
  CheckSquare,
  BarChart2,
  Settings,
  Menu,
  X,
  PanelRightClose
} from 'lucide-react'

import { ThemeToggle } from '@/components/theme-toggle'

// ─── Nav config per role ──────────────────────────────────────────────────────

const navConfig = {
  admin: {
    label: 'بوابة الإدارة',
    icon: School,
    accent: 'text-blue-600',
    links: [
      { href: '/admin', label: 'الرئيسية', icon: LayoutDashboard, exact: true },
      { href: '/admin/grade-levels', label: 'المراحل والفصول', icon: Layers },
      { href: '/admin/students', label: 'الطلاب', icon: Users },
      { href: '/admin/teachers', label: 'المعلمون', icon: UserCog },
      { href: '/admin/notifications', label: 'التنبيهات', icon: Bell },
      { href: '/admin/settings', label: 'الإعدادات', icon: Settings },
    ],
    loginHref: '/admin/login',
  },
  teacher: {
    label: 'بوابة المعلم',
    icon: GraduationCap,
    accent: 'text-emerald-600',
    links: [
      { href: '/teacher', label: 'الرئيسية', icon: LayoutDashboard, exact: true },
      { href: '/teacher/classes', label: 'الفصول', icon: BookOpen },
      { href: '/teacher/settings', label: 'الإعدادات', icon: Settings },
    ],
    loginHref: '/teacher/login',
  },
  parent: {
    label: 'بوابة ولي الأمر',
    icon: UsersRound,
    accent: 'text-violet-600',
    links: [
      { href: '/parent', label: 'الرئيسية', icon: LayoutDashboard, exact: true },
      { href: '/parent/notifications', label: 'الإشعارات', icon: Bell },
      { href: '/parent/settings', label: 'الإعدادات', icon: Settings },
    ],
    loginHref: '/parent/login',
  },
} as const

type Role = keyof typeof navConfig

interface PortalLayoutProps {
  role: Role
  user: { name: string; email: string }
  schoolName?: string
  children: React.ReactNode
}

export function PortalLayout({ role, user, schoolName, children }: PortalLayoutProps) {
  const nav = navConfig[role]
  const pathname = usePathname()
  const router = useRouter()

  const PortalIcon = nav.icon

  const [isOpen, setIsOpen] = useState(true)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768)
      if (window.innerWidth < 768) {
        setIsOpen(false)
      }
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Auto close on navigation in mobile
  useEffect(() => {
    if (isMobile) setIsOpen(false)
  }, [pathname, isMobile])

  async function handleLogout() {
    await authClient.signOut()
    router.push(nav.loginHref)
    router.refresh()
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Mobile Overlay */}
      {isOpen && isMobile && (
        <div 
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm transition-opacity"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Floating Toggle Button (visible when sidebar is closed) */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed top-4 right-4 z-30 p-2.5 bg-card border border-border shadow-md rounded-xl text-foreground hover:bg-muted transition-colors"
        >
          <Menu className="size-5" />
        </button>
      )}

      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <aside className={cn(
        "fixed right-0 top-0 z-40 flex h-full w-64 flex-col border-l border-border bg-card shadow-lg transition-transform duration-300",
        isOpen ? "translate-x-0" : "translate-x-full"
      )}>
        {/* Logo / Portal name */}
        <div className="border-b border-border px-5 py-5 relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <PortalIcon className="size-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">مِداد</p>
                <p className="text-sm font-bold">{nav.label}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <button 
                onClick={() => setIsOpen(false)}
                className="p-1.5 hover:bg-muted text-muted-foreground rounded-lg transition-colors"
              >
                <PanelRightClose className="size-5" />
              </button>
            </div>
          </div>
          {schoolName && (
            <p className="mt-3 truncate text-xs font-medium text-muted-foreground">
              {schoolName}
            </p>
          )}
        </div>

        {/* Nav links */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-1">
            {nav.links.map((link) => {
              const isActive =
                'exact' in link && link.exact
                  ? pathname === link.href
                  : pathname.startsWith(link.href)
              const Icon = link.icon
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className={cn(
                      'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    {link.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* User info + logout */}
        <div className="border-t border-border px-4 py-4">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-full bg-muted text-sm font-bold text-foreground">
              {user.name.slice(0, 1)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{user.name}</p>
              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="size-4" />
            تسجيل الخروج
          </button>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <main className={cn(
        "min-h-screen w-full transition-all duration-300",
        isOpen ? "md:mr-64 mr-0" : "mr-0"
      )}>
        {children}
      </main>
    </div>
  )
}
