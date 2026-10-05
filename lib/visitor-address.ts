/**
 * The request headers that name the visitor's address — and can be believed.
 *
 * On Vercel the first of these is written by Vercel's own edge: one address,
 * and nothing a browser can send. On a host of one's own (cPanel) there is no
 * such promise — the same header names arrive straight from whoever made the
 * request, and believing them lets anyone claim a fresh address for every
 * attempt and never be counted. So there the list is empty, unless the host
 * is known to write such a header itself and AUTH_IP_HEADER names it.
 * (Apache with Passenger appends the real address as its own
 * `x-forwarded-for`, so a visitor who sent none arrives with exactly one —
 * `AUTH_IP_HEADER=x-forwarded-for` is right there, once that is confirmed on
 * the host. LiteSpeed's behaviour is not known.)
 */
export const ADDRESS_HEADERS: string[] =
  process.env.VERCEL === '1' || process.env.VERCEL_URL
    ? ['x-vercel-forwarded-for', 'x-real-ip', 'x-forwarded-for']
    : (process.env.AUTH_IP_HEADER ?? '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean)

/** The visitor's address as the host vouches for it — or null, where nothing it says can be believed. */
export function visitorAddress(headers: Headers): string | null {
  for (const name of ADDRESS_HEADERS) {
    const value = headers.get(name)?.split(',')[0]?.trim()
    if (value) return value
  }
  return null
}
