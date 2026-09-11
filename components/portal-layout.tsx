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
  CalendarCheck, CalendarX,
  HeartHandshake,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { ThemeToggle } from '@/components/theme-toggle'
import { PalettePicker } from '@/components/palette-picker'
import { BrandLogo } from '@/components/brand-logo'
import { MotionLayer } from '@/components/motion-layer'
import { UnreadDot, inboxHrefFor } from '@/components/notification-bell'

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
  ScrollText, HeartHandshake, ShieldAlert, CalendarCheck, CalendarX,
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

  // `null` until the browser has said how wide it is. The server cannot know,
  // and rendering "open" by default meant every full load on a phone drew the
  // sidebar over the page and then slid it away.
  const [isOpen, setIsOpen] = useState<boolean | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false)
  const [logoutPhrase, setLogoutPhrase] = useState('')
  const [loggingOut, setLoggingOut] = useState(false)

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768
      setIsMobile(mobile)
      if (mobile) setIsOpen(false)
      else setIsOpen((v) => (v === null ? true : v))
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
    <div data-portal={role} className="portal-shell flex min-h-screen">
      <MotionLayer />
      {/* Mobile Overlay */}
      {isOpen && isMobile && (
        <div 
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm transition-opacity"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Floating Toggle Button (visible when sidebar is closed). Before the
          width is known it exists only on a phone-sized screen. */}
      {isOpen !== true && (
        <button
          onClick={() => setIsOpen(true)}
          aria-label="فتح القائمة"
          className={cn(
            "fixed top-4 right-4 z-30 p-2.5 bg-card/90 backdrop-blur border border-border shadow-[var(--shadow-card)] rounded-xl text-foreground hover:bg-muted transition-colors",
            isOpen === null && "md:hidden",
          )}
        >
          <Menu className="size-5" />
        </button>
      )}

      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <aside className={cn(
        "fixed right-0 top-0 z-40 flex h-full w-64 flex-col border-l border-border bg-sidebar backdrop-blur-xl shadow-[var(--shadow-card)]",
        // No transition on the first paint: the phone must not see it slide.
        isOpen !== null && "transition-transform duration-300",
        isOpen === null ? "translate-x-full md:translate-x-0" : isOpen ? "translate-x-0" : "translate-x-full"
      )}>
        {/* Brand block: the school in the portal's own colours */}
        <div className="px-3 pt-3">
          <div
            className="gradient-live relative overflow-hidden rounded-2xl p-4 text-white shadow-[0_14px_28px_-14px_var(--glow)]"
            style={{ backgroundImage: 'linear-gradient(135deg, var(--portal-a), var(--portal-b), var(--portal-a))' }}
          >
            <div className="pointer-events-none absolute -top-10 -left-10 size-32 rounded-full bg-white/15 blur-2xl" />
            <div className="pointer-events-none absolute inset-0 opacity-[0.14] [background-image:radial-gradient(white_1px,transparent_1px)] [background-size:18px_18px]" />
            <div className="relative flex items-center justify-between">
              <BrandLogo size={40} rounded="rounded-xl" href={null} className="ring-2 ring-white/40" />
              <div className="flex items-center gap-1">
                <PalettePicker buttonClassName="p-2.5 rounded-full text-white/80 hover:bg-white/15 hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60" />
                <ThemeToggle />
                <button
                  onClick={() => setIsOpen(false)}
                  aria-label="إغلاق القائمة"
                  className="p-1.5 rounded-lg text-white/80 hover:bg-white/15 hover:text-white transition-colors"
                >
                  <PanelRightClose className="size-5" />
                </button>
              </div>
            </div>
            {/* The school's name, shown once, on its own line as the brand mark */}
            <p className="font-kufi relative mt-3 text-lg leading-snug font-semibold">
              {schoolName ?? 'مدارس الأوس الأهلية'}
            </p>
            <p className="relative mt-0.5 text-[11px] font-medium text-white/80">{nav.label}</p>
          </div>
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
                      'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all',
                      isActive
                        ? 'bg-primary text-primary-foreground shadow-[0_10px_22px_-10px_var(--glow)]'
                        : 'text-muted-foreground hover:bg-primary/8 hover:text-foreground hover:translate-x-[-2px]',
                    )}
                  >
                    <span className={cn(
                      'flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors',
                      isActive ? 'bg-white/20' : 'bg-muted/70 group-hover:bg-primary/12 group-hover:text-primary',
                    )}>
                      <Icon className="size-4" />
                    </span>
                    {link.label}
                    {link.href === inboxHrefFor(pathname) && <UnreadDot className="ms-auto" />}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* User info + logout */}
        <div className="border-t border-border px-4 py-4">
          <div className="mb-3 flex items-center gap-3">
            <div
              className="flex size-10 shrink-0 items-center justify-center rounded-xl text-sm font-black text-white shadow-[0_8px_16px_-8px_var(--glow)]"
              style={{ backgroundImage: 'linear-gradient(135deg, var(--portal-a), var(--portal-b))' }}
            >
              {user.name.replace(/^[أا]\s*[\\/]\s*|^د\s*[\\/]\s*/, '').trim().slice(0, 1) || user.name.slice(0, 1)}
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
        // On a phone the floating menu button sits over the top-right corner —
        // exactly where every page's title begins. Push the content below it.
        // min-w-0: this is a flex item, and without it a wide table inside
        // (the class register) stopped it shrinking to the space left beside
        // the sidebar — every desktop page then overflowed 256px to the left,
        // grew a horizontal scrollbar, and cut off the bell in the header.
        "min-h-screen w-full min-w-0 max-md:pt-14",
        // The floating menu button sits in a band of its own whenever the
        // sidebar is closed, on any screen — never over a page's title.
        isOpen === false && "pt-14",
        isOpen !== null && "transition-all duration-300",
        isOpen === null ? "md:mr-64" : isOpen ? "md:mr-64 mr-0" : "mr-0"
      )}>
        {children}
      </main>
    </div>
  )
}
