import { pool } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * The school's day is worked out for Riyadh, and the official sheets carry the
 * Hijri date; both come from the calendar data built into Node. A host whose
 * Node was built without it would file every record under the wrong day and
 * say nothing — so it is asked here, about a day whose answer is known.
 */
function calendarWorks(): boolean {
  try {
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date(0))
    const hijriYear = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { timeZone: 'Asia/Riyadh', year: 'numeric' }).format(new Date(0))
    return day === '1970-01-01' && hijriYear.includes('1389')
  } catch {
    return false
  }
}

/**
 * «Is the site standing, and can it reach its database?» — in one address.
 *
 * On a host of one's own the first failure is rarely the code: it is a
 * variable that was not set, or a firewall that will not let the server call
 * the database's port. Both show up to a visitor as the same blank error, so
 * this says which. It tells nothing a visitor should not know — whether each
 * setting is present, never its value, and the database's error as a code.
 */
export async function GET() {
  let database = false
  let databaseError: string | null = null
  let databaseEncrypted: boolean | null = null
  let ms: number | null = null
  try {
    const client = await pool.connect()
    try {
      // The round trip alone, on a connection already open: how far the
      // database is from this server, which every page pays many times over.
      const asked = Date.now()
      await client.query('select 1')
      ms = Date.now() - asked
      database = true
      databaseEncrypted = !!(client as unknown as { connection?: { stream?: { encrypted?: boolean } } }).connection?.stream?.encrypted
    } finally {
      client.release()
    }
  } catch (error) {
    const e = error as { code?: string; name?: string; message?: string }
    // ECONNREFUSED / EHOSTUNREACH: the host refuses the port. ENOTFOUND: the
    // address is wrong or cannot be looked up. 28P01: the password is. A
    // firewall that silently drops the packets gives no code at all — the
    // driver just gives up after its own wait, and that is named here.
    // Never the message itself: it can carry the address.
    databaseError = e?.code || (/timeout/i.test(e?.message ?? '') ? 'CONNECT_TIMEOUT' : e?.name) || 'unknown'
  }
  const calendar = calendarWorks()

  return Response.json(
    {
      // The site's address is not part of «ok»: without it sign-in still
      // works from whatever address the site is opened on (lib/auth.ts).
      ok: database && !!process.env.BETTER_AUTH_SECRET && calendar,
      database,
      databaseError,
      databaseEncrypted,
      settings: {
        databaseUrl: !!process.env.DATABASE_URL,
        siteAddress: !!process.env.BETTER_AUTH_URL?.trim(),
        authSecret: !!process.env.BETTER_AUTH_SECRET,
        pushKeys: !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && !!process.env.VAPID_PRIVATE_KEY,
      },
      calendar,
      // Which build is answering — written into the package when it is made.
      build: process.env.APP_BUILD || null,
      node: process.version,
      ms,
    },
    { status: database ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  )
}
