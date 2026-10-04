import { and, desc, eq, gte, isNull } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { userNotifications } from '@/lib/db/schema'
import { homePortalFor } from '@/lib/home-portal'
import { getParentAccess } from '@/lib/parent-access'

export const dynamic = 'force-dynamic'

/**
 * A push says «something just landed». Past this, the newest unread notice is
 * yesterday's news, and showing it as if it had just arrived would mislead.
 */
const FRESH_MS = 15 * 60 * 1000

const NO_STORE = { 'Cache-Control': 'no-store' }
const nothing = () => new Response(null, { status: 204, headers: NO_STORE })

const INBOX_BY_PORTAL: Record<string, string> = {
  '/parent': '/parent/notifications',
  '/teacher': '/teacher/notifications',
  '/counselor': '/counselor/notifications',
  '/admin': '/admin/my-notifications',
}

/**
 * What the service worker shows when a push wakes it: the newest unread notice
 * of whoever is signed in on that phone.
 *
 * The push itself is empty and names nobody, so this is the only place the
 * words come from — and it answers for the session it is asked with, never for
 * an id. A phone whose owner has signed out, or which somebody else has since
 * signed in on, gets nothing of the subscriber's, and the worker falls back to
 * a notice that says only that there is one.
 */
export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session?.user) return nothing()

  // The same lock as the bell: a parent on the starter password is told
  // nothing, and a notice's title names the child.
  if (session.user.role === 'parent') {
    const parent = await getParentAccess()
    if (!parent || parent.mustChangePassword) return nothing()
  }

  const [notice] = await db
    .select({
      id: userNotifications.id,
      title: userNotifications.title,
      body: userNotifications.body,
      href: userNotifications.href,
    })
    .from(userNotifications)
    .where(and(
      eq(userNotifications.recipientUserId, session.user.id),
      isNull(userNotifications.readAt),
      gte(userNotifications.createdAt, new Date(Date.now() - FRESH_MS)),
    ))
    .orderBy(desc(userNotifications.createdAt))
    .limit(1)
  if (!notice) return nothing()

  // A notice written without a link opens the inbox of the portal its reader
  // uses. The account's role cannot say which: a counsellor is stored as
  // 'admin', so the portal is looked up the way sign-in does.
  const href = notice.href
    || INBOX_BY_PORTAL[(await homePortalFor(session.user.id, session.user.role)) ?? '']
    || '/'

  return Response.json(
    { id: notice.id, title: notice.title, body: notice.body ?? '', href },
    { headers: NO_STORE },
  )
}
