'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell } from 'lucide-react'
import { getMyNotificationsInbox } from '@/app/notifications-actions'

const POLL_MS = 60_000

/** Each portal keeps its own inbox page; the bell reads which one from the path. */
const NOTIFICATIONS_HREF: { prefix: string; href: string }[] = [
  { prefix: '/admin', href: '/admin/my-notifications' },
  { prefix: '/teacher', href: '/teacher/notifications' },
  { prefix: '/counselor', href: '/counselor/notifications' },
  { prefix: '/parent', href: '/parent/notifications' },
]

export function inboxHrefFor(pathname: string): string {
  return NOTIFICATIONS_HREF.find((n) => pathname.startsWith(n.prefix))?.href ?? '/'
}

/**
 * How many notifications wait for the signed-in person.
 *
 * Refreshed on mount, when the tab comes back into focus, and once a minute
 * while the tab is visible — a background tab left open all day would
 * otherwise ask the database sixty times an hour about a screen nobody is
 * looking at. The pathname is a dependency so the count re-reads after the
 * inbox page marks things read.
 */
export function useUnreadCount(): number {
  const pathname = usePathname()
  const [unread, setUnread] = useState(0)
  const refresh = useCallback(async () => {
    try { setUnread((await getMyNotificationsInbox(1)).unread) } catch { /* keep the last known count */ }
  }, [])
  useEffect(() => {
    void refresh()
    const tick = () => { if (document.visibilityState === 'visible') void refresh() }
    const timer = setInterval(tick, POLL_MS)
    document.addEventListener('visibilitychange', tick)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', tick) }
  }, [refresh, pathname])
  return unread
}

/**
 * One bell for every portal: a link to that portal's inbox page, with a red
 * dot while something unread waits there.
 *
 * It used to open a floating panel with a counter. The panel sat over the
 * page text and its number lagged the inbox, so both went: the inbox page
 * is where notifications are read, and the bell only says «there is
 * something there».
 */
export function NotificationBell() {
  const pathname = usePathname()
  const unread = useUnreadCount()
  const href = inboxHrefFor(pathname)
  return (
    <Link
      href={href}
      className="relative inline-flex size-11 sm:size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      title={unread > 0 ? 'إشعارات جديدة' : 'الإشعارات'}
      aria-label={unread > 0 ? `إشعارات جديدة (${unread})` : 'الإشعارات'}
    >
      <Bell className={unread > 0 ? 'size-5 bell-live text-primary' : 'size-5'} />
      {unread > 0 && <span className="absolute top-1.5 left-1.5 sm:top-1 sm:left-1 size-2.5 rounded-full bg-rose-500 ring-2 ring-background" aria-hidden />}
    </Link>
  )
}

/** The same red dot, for the sidebar's inbox entry. */
export function UnreadDot({ className = '' }: { className?: string }) {
  const unread = useUnreadCount()
  if (unread <= 0) return null
  return <span className={`inline-block size-2.5 rounded-full bg-rose-500 ${className}`} aria-label="إشعارات جديدة" />
}
