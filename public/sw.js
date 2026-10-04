/*
 * Wakes the phone when a notice lands in its owner's bell.
 *
 * The push that arrives is empty: what to show is asked of the site at that
 * moment, with the session already on this phone, so nothing about a child
 * passes through the push service and a signed-out phone learns nothing.
 *
 * No page is cached here. A stale copy of a child's record, shown as if it
 * were today's, is worse than a page that fails to load.
 */

const ICON = '/icon-192.png'
const LATEST_TIMEOUT_MS = 10000

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

function show(title, body, tag, href) {
  return self.registration.showNotification(title, {
    body,
    icon: ICON,
    badge: ICON,
    dir: 'rtl',
    lang: 'ar',
    tag,
    data: { href },
  })
}

function showGeneric() {
  return show('مدارس الأوس الأهلية', 'إشعار جديد من المدرسة — افتح البوابة للاطلاع عليه', 'school', '/')
}

async function showLatest() {
  // A request left hanging would let the browser end the event with nothing
  // shown, and a push that shows nothing is held against the site.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), LATEST_TIMEOUT_MS)
  try {
    const res = await fetch('/api/push/latest', {
      credentials: 'include',
      cache: 'no-store',
      signal: controller.signal,
    })
    if (res.status !== 200) return showGeneric()
    const notice = await res.json()
    if (!notice || typeof notice.title !== 'string' || !notice.title) return showGeneric()
    return await show(
      notice.title,
      typeof notice.body === 'string' ? notice.body : '',
      typeof notice.id === 'string' && notice.id ? notice.id : 'school',
      notice.href,
    )
  } finally {
    clearTimeout(timer)
  }
}

// Every push ends in a notification, whatever went wrong on the way: browsers
// withdraw the permission from a site that receives pushes and shows nothing.
self.addEventListener('push', (event) => {
  event.waitUntil(showLatest().catch(showGeneric))
})

/** Only this site's own pages are opened from a notification; anything else becomes the front door. */
function ownPath(href) {
  if (typeof href !== 'string' || !href.startsWith('/')) return '/'
  try {
    const url = new URL(href, self.location.origin)
    return url.origin === self.location.origin ? url.pathname + url.search + url.hash : '/'
  } catch {
    return '/'
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const href = ownPath(event.notification.data && event.notification.data.href)

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const open = windows[0]
    if (open) {
      try {
        // Moved before it is brought forward: one tap allows one window to be
        // focused or opened, and a failed move must leave that for below.
        const moved = await open.navigate(href)
        await (moved || open).focus()
        return
      } catch {
        // A window this worker does not control cannot be moved.
      }
    }
    await self.clients.openWindow(href)
  })())
})
