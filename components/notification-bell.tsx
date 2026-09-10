'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Bell, AlertTriangle, CheckCircle2, ArrowUpCircle, Undo2, MessageSquare, UserX, Clock, Loader2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  getMyNotificationsInbox,
  markNotificationsRead,
  markAllNotificationsRead,
  type BellData,
} from '@/app/notifications-actions'

const KIND_META: Record<string, { icon: LucideIcon; className: string }> = {
  announcement: { icon: Bell, className: 'bg-blue-50 text-blue-600 border-blue-100' },
  case_raised: { icon: AlertTriangle, className: 'bg-amber-50 text-amber-600 border-amber-100' },
  case_decided: { icon: CheckCircle2, className: 'bg-emerald-50 text-emerald-600 border-emerald-100' },
  case_escalated: { icon: ArrowUpCircle, className: 'bg-violet-50 text-violet-600 border-violet-100' },
  case_returned: { icon: Undo2, className: 'bg-amber-50 text-amber-600 border-amber-100' },
  parent_informed: { icon: MessageSquare, className: 'bg-rose-50 text-rose-600 border-rose-100' },
  absence: { icon: UserX, className: 'bg-red-50 text-red-600 border-red-100' },
  attendance_corrected: { icon: Clock, className: 'bg-amber-50 text-amber-600 border-amber-100' },
  late_arrival: { icon: Clock, className: 'bg-amber-50 text-amber-600 border-amber-100' },
}

function relativeAr(date: Date): string {
  const minutes = Math.floor((Date.now() - date.getTime()) / 60000)
  if (minutes < 1) return 'الآن'
  if (minutes < 60) return `منذ ${minutes} د`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `منذ ${hours} س`
  const days = Math.floor(hours / 24)
  if (days < 7) return `منذ ${days} يوم`
  // 'ar-SA' alone renders Hijri, which no other date in the system uses.
  return date.toLocaleDateString('ar-SA-u-ca-gregory', { day: 'numeric', month: 'short' })
}

const POLL_MS = 60_000

/** Each portal keeps its own inbox page; the bell reads which one from the path. */
const NOTIFICATIONS_HREF: { prefix: string; href: string }[] = [
  { prefix: '/admin', href: '/admin/my-notifications' },
  { prefix: '/teacher', href: '/teacher/notifications' },
  { prefix: '/counselor', href: '/counselor/notifications' },
  { prefix: '/parent', href: '/parent/notifications' },
]

/**
 * One bell for every portal.
 *
 * Dropped into a page's own header row rather than a bar of its own: a strip
 * that holds nothing but a bell costs every screen 56px, and on the class
 * register that is the space the save button needs.
 *
 * It refreshes on mount, when the panel is opened, when the tab comes back into
 * focus, and once a minute — but only while the tab is actually visible. A
 * background tab left open all day would otherwise ask a small database sixty
 * times an hour about a screen nobody is looking at, and the moment the count
 * matters is the moment somebody looks.
 */
export function NotificationBell() {
  const router = useRouter()
  const pathname = usePathname()
  const allHref = NOTIFICATIONS_HREF.find((n) => pathname.startsWith(n.prefix))?.href ?? null
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<BellData>({ unread: 0, items: [] })
  const [loading, setLoading] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  const refresh = useCallback(async () => {
    try {
      setData(await getMyNotificationsInbox(20))
    } catch {
      // A bell that cannot load must never break the page around it.
    }
  }, [])

  useEffect(() => {
    refresh()
    const tick = () => { if (document.visibilityState === 'visible') refresh() }
    const timer = setInterval(tick, POLL_MS)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [refresh])

  // Clicking anywhere else closes the panel.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const toggle = async () => {
    const next = !open
    setOpen(next)
    if (next) {
      setLoading(true)
      await refresh()
      setLoading(false)
    }
  }

  const openItem = async (id: string, href: string | null, unread: boolean) => {
    setOpen(false)
    if (unread) {
      // Optimistic: the badge should drop the moment it is clicked, not after
      // the round trip.
      setData((d) => ({
        unread: Math.max(0, d.unread - 1),
        items: d.items.map((i) => (i.id === id ? { ...i, readAt: new Date() } : i)),
      }))
      markNotificationsRead([id]).catch(() => {})
    }
    if (href) router.push(href)
  }

  const readAll = async () => {
    setData((d) => ({ unread: 0, items: d.items.map((i) => ({ ...i, readAt: i.readAt ?? new Date() })) }))
    await markAllNotificationsRead().catch(() => {})
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={toggle}
        /* 32px square was too small a target for a thumb, and this is the only
           way a deputy learns a case has been handed to them. Grown to 44 on a
           phone; the desk keeps the compact size. */
        className="relative p-3 sm:p-1.5 hover:bg-muted text-muted-foreground rounded-lg transition-colors"
        title="الإشعارات"
        aria-label={data.unread > 0 ? `${data.unread} إشعار غير مقروء` : 'الإشعارات'}
      >
        <Bell className="size-5" />
        {data.unread > 0 && (
          <span className="absolute -top-0.5 -left-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-rose-500 text-white text-[10px] font-bold">
            {data.unread > 99 ? '99+' : data.unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 w-[340px] max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-card shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="font-bold text-sm">الإشعارات</span>
            {data.unread > 0 && (
              <button onClick={readAll} className="text-xs text-primary font-semibold hover:underline">
                تعليم الكل كمقروء
              </button>
            )}
          </div>

          <div className="max-h-[380px] overflow-y-auto">
            {loading ? (
              <div className="p-6 flex justify-center text-muted-foreground">
                <Loader2 className="size-5 animate-spin" />
              </div>
            ) : data.items.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">لا توجد إشعارات</p>
            ) : (
              data.items.map((item) => {
                const meta = KIND_META[item.kind] ?? KIND_META.announcement
                const Icon = meta.icon
                const unread = !item.readAt
                return (
                  <button
                    key={item.id}
                    onClick={() => openItem(item.id, item.href, unread)}
                    className={`w-full text-right flex gap-2.5 px-3 py-3 border-b border-border last:border-0 transition-colors hover:bg-muted/50 ${
                      unread ? 'bg-primary/5' : ''
                    }`}
                  >
                    <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg border ${meta.className}`}>
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-2">
                        <span className={`text-sm truncate ${unread ? 'font-bold' : 'font-medium'}`}>{item.title}</span>
                        {unread && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-rose-500" />}
                      </span>
                      {item.body && (
                        <span className="block text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.body}</span>
                      )}
                      <span className="block text-[11px] text-muted-foreground/70 mt-1">
                        {item.actorName ? `${item.actorName} · ` : ''}
                        {relativeAr(new Date(item.createdAt))}
                      </span>
                    </span>
                  </button>
                )
              })
            )}
          </div>

          {allHref && (
            <button
              onClick={() => { setOpen(false); router.push(allHref) }}
              className="w-full border-t border-border py-2.5 text-sm font-semibold text-primary hover:bg-muted/50 transition-colors"
            >
              عرض كل الإشعارات
            </button>
          )}
        </div>
      )}
    </div>
  )
}
