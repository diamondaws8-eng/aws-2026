'use server'

import { headers } from 'next/headers'
import { and, desc, eq, inArray, ne } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { pushSubscriptions } from '@/lib/db/schema'
import { getParentAccess } from '@/lib/parent-access'
import { isPushConfigured } from '@/lib/web-push'

/**
 * A browser saying «wake me», and taking it back.
 *
 * Like the bell's actions these only ever work on the signed-in person's own
 * rows — the one thing the browser supplies is the address its push service
 * handed it, and that is checked before it is kept, because the server will
 * later send a request to it.
 */

export type PushActionResult = { ok: true } | { ok: false; error: string }

/** The only places a real browser's subscription points to: Chrome and its kin, Firefox, Edge, Safari. */
const PUSH_SERVICE_HOSTS = [
  'fcm.googleapis.com',
  // Chrome hands some phones an address here instead of the one above.
  'jmt17.google.com',
  'updates.push.services.mozilla.com',
  'notify.windows.com',
  'push.apple.com',
]

const MAX_ENDPOINT_LENGTH = 1000
/** One person's phones, tablets and browsers; beyond this the oldest are let go. */
const MAX_PER_USER = 10

/** The signed-in person of any portal — except a parent still on the starter password. */
async function currentUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return null
  if (session.user.role === 'parent') {
    const parent = await getParentAccess()
    if (!parent || parent.mustChangePassword) return null
  }
  return session.user.id
}

function isPushServiceEndpoint(endpoint: string): boolean {
  if (endpoint.length > MAX_ENDPOINT_LENGTH) return false
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' || url.port || url.username || url.password) return false
  return PUSH_SERVICE_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))
}

const shortText = (value: unknown, max: number): string | null =>
  typeof value === 'string' && value.length > 0 && value.length <= max ? value : null

export async function savePushSubscription(
  sub: { endpoint: string; keys?: { p256dh?: string; auth?: string } },
): Promise<PushActionResult> {
  const userId = await currentUserId()
  if (!userId) return { ok: false, error: 'انتهت الجلسة، سجّل الدخول من جديد' }
  if (!isPushConfigured()) return { ok: false, error: 'الإشعارات الفورية غير مفعَّلة في النظام بعد' }

  // Whatever is stored here is a URL this server will call. Left unchecked it
  // would let any signed-in account aim the school's server at an address of
  // its choosing.
  const endpoint = typeof sub?.endpoint === 'string' ? sub.endpoint : ''
  if (!isPushServiceEndpoint(endpoint)) return { ok: false, error: 'تعذّر تفعيل الإشعارات على هذا الجهاز' }

  // The browser's two keys are only needed to encrypt a payload, and the
  // pushes carry none; they are kept for the day one does.
  const row = {
    userId,
    p256dh: shortText(sub.keys?.p256dh, 200),
    auth: shortText(sub.keys?.auth, 200),
    userAgent: (await headers()).get('user-agent')?.slice(0, 300) ?? null,
  }

  // One browser has one endpoint. When it subscribes again, or somebody else
  // signs in on the same phone and switches this on, the row follows whoever
  // asked last — the phone must stop ringing for the person who left it.
  const [saved] = await db
    .insert(pushSubscriptions)
    .values({ endpoint, ...row })
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: row })
    .returning({ id: pushSubscriptions.id })

  const others = await db
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), ne(pushSubscriptions.id, saved.id)))
    .orderBy(desc(pushSubscriptions.createdAt))
  const surplus = others.slice(MAX_PER_USER - 1).map((r) => r.id)
  if (surplus.length > 0) {
    await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, surplus))
  }

  return { ok: true }
}

export async function removePushSubscription(endpoint: string): Promise<PushActionResult> {
  const userId = await currentUserId()
  if (!userId) return { ok: false, error: 'انتهت الجلسة، سجّل الدخول من جديد' }
  if (typeof endpoint !== 'string' || !endpoint || endpoint.length > MAX_ENDPOINT_LENGTH) {
    return { ok: false, error: 'اشتراك غير صالح' }
  }

  // Scoped to the caller: knowing an endpoint is not a reason to be able to
  // silence somebody else's phone.
  await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, userId)))
  return { ok: true }
}

/**
 * After «sign out my other devices»: they stop ringing too. A phone whose
 * session was closed would otherwise go on being woken for every notice to
 * this account — told nothing but that there is one, yet told each time.
 */
export async function dropOtherPushSubscriptions(keepEndpoint: string | null): Promise<PushActionResult> {
  const userId = await currentUserId()
  if (!userId) return { ok: false, error: 'انتهت الجلسة، سجّل الدخول من جديد' }
  const keep = typeof keepEndpoint === 'string' && keepEndpoint.length <= MAX_ENDPOINT_LENGTH ? keepEndpoint : ''
  await db
    .delete(pushSubscriptions)
    .where(keep
      ? and(eq(pushSubscriptions.userId, userId), ne(pushSubscriptions.endpoint, keep))
      : eq(pushSubscriptions.userId, userId))
  return { ok: true }
}

/** Whether the server can send at all — so the opt-in card can say why it offers nothing. */
export async function pushStatus(): Promise<{ enabled: boolean }> {
  const userId = await currentUserId()
  return { enabled: !!userId && isPushConfigured() }
}
