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
  PanelRightClose,
  ShieldAlert,
  ScrollText,
  HeartHandshake,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { ThemeToggle } from '@/components/theme-toggle'
import { BrandLogo } from '@/components/brand-logo'

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
      { href: '/teacher/notifications', label: 'الإشعارات', icon: Bell },
      { href: '/teacher/settings', label: 'الإعدادات', icon: Settings },
    ],
    loginHref: '/teacher/login',
  },
  counselor: {
    label: 'بوابة الموجه الطلابي',
    icon: HeartHandshake,
    accent: 'text-teal-600',
    links: [
      { href: '/counselor', label: 'الحالات', icon: ClipboardList, exact: true },
      { href: '/counselor/notifications', label: 'الإشعارات', icon: Bell },
      { href: '/counselor/archive', label: 'الأرشيف', icon: ScrollText },
      { href: '/counselor/settings', label: 'الإعدادات', icon: Settings },
    ],
    loginHref: '/counselor/login',
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

const ICON_MAP = {
  LayoutDashboard, Layers, Users, UserCog, Bell, Settings, BookOpen, ClipboardList, CheckSquare, BarChart2,
  ScrollText, HeartHandshake, ShieldAlert,
} as const

export type NavIconName = keyof typeof ICON_MAP

/** Serializable nav link, so a server component can decide which links a role gets. */
export type PortalNavLink = { href: string; label: string; icon: NavIconName; exact?: boolean }

interface PortalLayoutProps {
  role: Role
  user: { name: string; email: string }
  schoolName?: string
  /** Overrides the default per-role links (used by the admin portal's role system). */
  links?: PortalNavLink[]
  /** Overrides the portal label under the logo, e.g. "مدير الجودة". */
  roleLabel?: string
  children: React.ReactNode
}

export function PortalLayout({ role, user, schoolName, links, roleLabel, children }: PortalLayoutProps) {
  const nav = navConfig[role]
  const navLinks: { href: string; label: string; icon: LucideIcon; exact?: boolean }[] = links
    ? links.map((l) => ({ href: l.href, label: l.label, icon: ICON_MAP[l.icon], exact: l.exact }))
    : nav.links.map((l) => ({
        href: l.href,
        label: l.label,
        icon: l.icon,
        exact: 'exact' in l ? l.exact : undefined,
      }))
  const pathname = usePathname()
  const router = useRouter()

  const [isOpen, setIsOpen] = useState(true)
  const [isMobile, setIsMobile] = useState(false)
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false)
  const [logoutPhrase, setLogoutPhrase] = useState('')
  const [loggingOut, setLoggingOut] = useState(false)

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
    setLoggingOut(true)
    try {
      await authClient.signOut()
      router.push(nav.loginHref)
      router.refresh()
    } finally {
      setLoggingOut(false)
      setLogoutConfirmOpen(false)
      setLogoutPhrase('')
    }
  }

  const logoutConfirmed = logoutPhrase.trim().toLowerCase() === 'aws'

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
            <BrandLogo size={40} rounded="rounded-xl" href={null} />
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

          {/* The school's name, shown once, on its own line as the brand mark */}
          <p className="font-kufi mt-3 text-lg leading-snug font-semibold text-foreground">
            {schoolName ?? 'مدارس الأوس الأهلية'}
          </p>
        </div>

        {/* Nav links */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-1">
            {navLinks.map((link) => {
              const isActive = link.exact
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
              {/* The person's role sits with the person, not in the brand header */}
              <p className="truncate text-xs font-semibold text-primary">{roleLabel ?? nav.label}</p>
              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            </div>
          </div>
          <button
            onClick={() => setLogoutConfirmOpen(true)}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="size-4" />
            تسجيل الخروج
          </button>
        </div>
      </aside>

      {/* ── Logout confirmation ─────────────────────────────────────────────── */}
      {logoutConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-3xl bg-card p-6 shadow-xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                <ShieldAlert className="size-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold">تأكيد تسجيل الخروج</h2>
                <p className="text-sm text-muted-foreground">اكتب <span className="font-mono font-bold">aws</span> للتأكيد</p>
              </div>
            </div>
            <input
              autoFocus
              type="text"
              value={logoutPhrase}
              onChange={(e) => setLogoutPhrase(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && logoutConfirmed && !loggingOut) handleLogout()
                if (e.key === 'Escape') { setLogoutConfirmOpen(false); setLogoutPhrase('') }
              }}
              placeholder="aws"
              className="w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-primary"
            />
            <div className="mt-5 flex gap-3">
              <button
                onClick={handleLogout}
                disabled={!logoutConfirmed || loggingOut}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-destructive py-2.5 text-sm font-bold text-destructive-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                <LogOut className="size-4" />
                {loggingOut ? 'جاري تسجيل الخروج...' : 'تسجيل الخروج'}
              </button>
              <button
                onClick={() => { setLogoutConfirmOpen(false); setLogoutPhrase('') }}
                disabled={loggingOut}
                className="flex-1 rounded-xl bg-muted py-2.5 text-sm font-semibold text-muted-foreground hover:bg-muted/80 disabled:opacity-50"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

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
