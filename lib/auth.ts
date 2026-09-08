import { betterAuth } from 'better-auth'
import { pool } from '@/lib/db'

export const auth = betterAuth({
  database: pool,
  baseURL:
    process.env.BETTER_AUTH_URL ??
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.V0_RUNTIME_URL),
  emailAndPassword: { enabled: true, autoSignIn: true },
  trustedOrigins: [
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
    ...(process.env.NODE_ENV === 'production'
      ? [
          process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '',
          process.env.VERCEL_PROJECT_PRODUCTION_URL
            ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
            : '',
        ].filter(Boolean)
      : []),
  ],
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },

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
   */
  rateLimit: {
    window: 60,
    max: 300,
    customRules: {
      '/sign-in/email': { window: 60, max: 60 },
      '/sign-up/email': { window: 60, max: 10 },
      '/change-password': { window: 60, max: 20 },
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
      ipAddressHeaders: ['x-vercel-forwarded-for', 'x-real-ip', 'x-forwarded-for'],
    },
    ...(process.env.NODE_ENV === 'development'
      ? { defaultCookieAttributes: { sameSite: 'none' as const, secure: true } }
      : {}),
  },
})

export type Session = typeof auth.$Infer.Session
