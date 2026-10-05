import { betterAuth } from 'better-auth'
import { pool } from '@/lib/db'
import { ADDRESS_HEADERS } from '@/lib/visitor-address'

/**
 * The address the site was told it lives at — or nothing, which is an answer
 * too. An empty line in an env file arrives as an empty string, and handed on
 * as it is that would be read as an address and refused.
 */
const configuredUrl = process.env.BETTER_AUTH_URL?.trim() || undefined

/**
 * The address a request was sent to, spelled as an origin.
 *
 * A sign-in is refused when the page it comes from is not the site itself.
 * «The site itself» used to mean the one address written in BETTER_AUTH_URL —
 * so the same site reached as www.…, or set up on a host of one's own with
 * that line mistyped or left empty, turned every correct password into
 * «بيانات الدخول غير صحيحة». What the check exists to stop is another site
 * posting here, and that is exactly a request whose Origin is not the host it
 * was sent to. So the host it was sent to is trusted as an origin, under
 * either scheme: behind a host's own proxy the server often cannot tell that
 * the visitor came over https. A browser does not let a page choose the Host
 * of a request it makes elsewhere, so this lets in nothing that was out.
 */
function sameHostOrigins(request?: Request): string[] {
  const host = request?.headers.get('host')?.trim().toLowerCase()
  if (!host || !/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?$/.test(host)) return []
  return [`https://${host}`, `http://${host}`]
}

/** Whether attempts can be counted per visitor, or only for the school as a whole (lib/visitor-address.ts). */
const perVisitor = ADDRESS_HEADERS.length > 0

export const auth = betterAuth({
  database: pool,
  baseURL:
    configuredUrl ??
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.V0_RUNTIME_URL),
  emailAndPassword: { enabled: true, autoSignIn: true },
  trustedOrigins: (request) => [
    ...sameHostOrigins(request),
    ...(process.env.NODE_ENV === 'development'
      ? [
          'http://localhost:3000',
          ...[
            process.env.V0_RUNTIME_URL,
            process.env.V0_DEV_APP_URL,
            process.env.V0_BUILD_URL,
            process.env.V0_SANDBOX_URL,
          ].filter(Boolean) as string[],
        ]
      : []),
    /**
     * Other addresses the same site answers on, comma-separated — on a host
     * of one's own that is usually the «www.» twin of BETTER_AUTH_URL. A
     * sign-in from an address that is neither is refused as a foreign origin,
     * and to the person typing the right password it only looks wrong.
     */
    ...(process.env.AUTH_TRUSTED_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean),
    ...(process.env.NODE_ENV === 'production'
      ? [
          process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '',
          process.env.VERCEL_PROJECT_PRODUCTION_URL
            ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
            : '',
        ].filter(Boolean)
      : []),
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    /**
     * Every page and every server action starts by asking "who is this?", and
     * that used to be a database round trip each time — on some pages five or
     * six times. The answer is now kept in a signed cookie for five minutes,
     * so the question costs nothing in between. What the cookie cannot know
     * for those five minutes is a revoked session; the portals do not rely on
     * it for that — a deleted teacher or staff member fails the role lookup
     * that follows, and a parent whose account is gone has no children left
     * to read.
     */
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },

  /**
   * Rate limiting is on by default in production, but it can only tell callers
   * apart if it can resolve a client IP. better-auth reads `x-forwarded-for`
   * and refuses the value when it arrives as a chain of addresses — and every
   * request that fails to resolve falls into ONE shared bucket, so the default
   * "3 sign-ins per 10 seconds" would then apply to the whole school at once.
   * Vercel's own header carries a single trusted address, so it goes first.
   *
   * The limits below are deliberately loose: a school shares one public IP, so
   * nineteen teachers signing in at the start of the day must not look like an
   * attack. 60 attempts a minute still stops a scripted one.
   *
   * Where no address can be believed (ADDRESS_HEADERS is empty) that one
   * shared bucket is not an accident but the whole arrangement: every sign-in
   * in the school is counted together. And a bucket's count starts over only
   * after a full window with no request in it — on a morning when somebody
   * signs in every half minute it never does, and the sixtieth person of the
   * day would be told their password is wrong. So the shared bucket is given
   * ten times the room: what it guards against there is a flood, and telling
   * one visitor from another is not something it can do.
   */
  rateLimit: {
    window: 60,
    max: perVisitor ? 300 : 1200,
    customRules: {
      '/sign-in/email': { window: 60, max: perVisitor ? 60 : 600 },
      '/sign-up/email': { window: 60, max: 10 },
      '/change-password': { window: 60, max: perVisitor ? 20 : 200 },
    },
  },
  user: {
    additionalFields: {
      role: {
        type: 'string' as const,
        required: false,
        defaultValue: 'admin',
        input: false, // not settable by the client
      },
    },
  },
  advanced: {
    ipAddress: {
      ipAddressHeaders: ADDRESS_HEADERS,
    },
    ...(process.env.NODE_ENV === 'development'
      ? { defaultCookieAttributes: { sameSite: 'none' as const, secure: true } }
      : {}),
  },
})

export type Session = typeof auth.$Infer.Session
