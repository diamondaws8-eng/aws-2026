'use server'

import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { listInbox, countUnread, markRead, markAllRead, type InboxItem } from '@/lib/notifications'
import { getParentAccess } from '@/lib/parent-access'

/**
 * The bell is the same component in all four portals, so its actions cannot ask
 * "which portal is this?" — they only ever work on the signed-in person's own
 * inbox. That is also what makes them safe: there is no id to pass that could
 * name somebody else's notifications.
 *
 * The one person signed in and still answered with nothing is a parent on the
 * starter password. Their inbox names the child and says when they were
 * absent, and that password is printed on the sign-in page.
 */
async function currentUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return null
  if (session.user.role === 'parent') {
    const parent = await getParentAccess()
    if (!parent || parent.mustChangePassword) return null
  }
  return session.user.id
}

export type BellData = { unread: number; items: InboxItem[] }

export async function getMyNotificationsInbox(limit = 20): Promise<BellData> {
  const userId = await currentUserId()
  if (!userId) return { unread: 0, items: [] }
  // The page size arrives from the browser like any other argument.
  const asked = Math.trunc(Number(limit))
  const take = Number.isFinite(asked) ? Math.min(100, Math.max(1, asked)) : 20
  const [unread, items] = await Promise.all([countUnread(userId), listInbox(userId, take)])
  return { unread, items }
}

export async function markNotificationsRead(ids: string[]): Promise<{ ok: boolean }> {
  const userId = await currentUserId()
  if (!userId) return { ok: false }
  await markRead(userId, ids.filter((v) => typeof v === 'string').slice(0, 100))
  return { ok: true }
}

export async function markAllNotificationsRead(): Promise<{ ok: boolean }> {
  const userId = await currentUserId()
  if (!userId) return { ok: false }
  await markAllRead(userId)
  return { ok: true }
}
