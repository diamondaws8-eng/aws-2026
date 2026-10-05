import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

/**
 * Bumped whenever the pool options below change. The dev server keeps the pool
 * on globalThis across hot reloads (see the note under it), so without this a
 * change here would never reach a running `next dev` — the old pool, with the
 * old options and any dead sockets, would live until the process restarted.
 */
const POOL_VERSION = 4

const globalForDb = globalThis as unknown as { __pool?: Pool; __poolVersion?: number }

/**
 * Encrypted, whenever the database is on another machine.
 *
 * The connection string asks for nothing, and a driver asked for nothing
 * sends the password and every pupil's record in the clear — across a cloud
 * provider's network on Vercel, across the open internet from a host of one's
 * own. The certificate is not checked: Supabase signs its pooler's with a CA
 * of its own that Node does not know (a full check fails with
 * SELF_SIGNED_CERT_IN_CHAIN), and checking it means shipping that CA file. A
 * string that says how it wants TLS is taken at its word instead.
 */
function tls(connectionString: string | undefined) {
  try {
    const { hostname, searchParams } = new URL(connectionString ?? '')
    if (searchParams.has('sslmode') || searchParams.has('ssl')) return undefined
    if (!hostname || hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') return undefined
    return { rejectUnauthorized: false }
  } catch {
    return undefined
  }
}

/** Eight unless the host says otherwise: one long-lived server can afford more than a fleet of functions. */
function poolSize() {
  const asked = Number.parseInt(process.env.DB_POOL_MAX ?? '', 10)
  return Number.isInteger(asked) && asked >= 2 && asked <= 40 ? asked : 8
}

function createPool() {
  const created = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: tls(process.env.DATABASE_URL),
    /**
     * Small on purpose. On Vercel every warm function instance holds its own
     * pool, and Supabase's transaction pooler caps the clients it will accept.
     * Fifteen per instance was fine for one developer; the morning nine hundred
     * families open the app after an absence notice, a dozen instances times
     * fifteen would walk straight past that cap and the school would read
     * "too many clients". Queries beyond eight simply queue for a moment — the
     * dashboard's dozen parallel reads still complete, a few milliseconds later.
     */
    max: poolSize(),
    /**
     * Opening a connection to the pooler costs about a second (TCP + TLS +
     * auth); a query on an open one costs a hundred milliseconds. The default
     * closed idle connections after ten seconds, so every visit after a short
     * pause paid that second again. Thirty seconds covers a page's own burst
     * of queries and the next click. Five minutes was tried first; a fresh
     * production server then failed its first page with "timeout exceeded
     * when trying to connect" once, and a kept-alive socket left idle that
     * long cannot be trusted across a pooler, so the shorter value stays.
     * Keep-alive probes catch a dead socket early rather than never.
     */
    idleTimeoutMillis: 30_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    connectionTimeoutMillis: 15_000,
  })
  // A connection that breaks while it sits idle reports to the pool, and an
  // error nobody listens for is an uncaught one. In a server that lives for
  // days, the pooler closing a quiet socket is an ordinary event.
  created.on('error', (error) => {
    console.error('Database pool: an idle connection failed —', (error as { code?: string }).code ?? error.name)
  })
  return created
}

// Reuse the pool across hot reloads in development — otherwise every code change
// creates a new pool and each query pays a fresh TCP + TLS handshake to the
// database, which is what made pages take seconds to load while developing.
let pool: Pool
if (process.env.NODE_ENV === 'production') {
  pool = createPool()
} else {
  if (!globalForDb.__pool || globalForDb.__poolVersion !== POOL_VERSION) {
    globalForDb.__pool?.end().catch(() => {})
    globalForDb.__pool = createPool()
    globalForDb.__poolVersion = POOL_VERSION
  }
  pool = globalForDb.__pool
}

export { pool }
export const db = drizzle(pool, { schema })
