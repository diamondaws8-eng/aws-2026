import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

// Reuse the pool across hot reloads in development — otherwise every code change
// creates a new pool and each query pays a fresh TCP + TLS handshake to the
// database, which is what made pages take seconds to load while developing.
const globalForDb = globalThis as unknown as { __pool?: Pool }

export const pool =
  globalForDb.__pool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    /**
     * Small on purpose. On Vercel every warm function instance holds its own
     * pool, and Supabase's transaction pooler caps the clients it will accept.
     * Fifteen per instance was fine for one developer; the morning nine hundred
     * families open the app after an absence notice, a dozen instances times
     * fifteen would walk straight past that cap and the school would read
     * "too many clients". Queries beyond eight simply queue for a moment — the
     * dashboard's dozen parallel reads still complete, a few milliseconds later.
     */
    max: 8,
    /**
     * Opening a connection to the pooler costs about a second (TCP + TLS +
     * auth); a query on an open one costs a hundred milliseconds. The default
     * closed idle connections after ten seconds, so a school's bursty morning —
     * a teacher saves, thirty seconds pass, a parent opens the app — paid that
     * second again and again. Measured: the same request took 1.3 s after a
     * short pause and 0.25 s right after another. Connections now stay open
     * for five minutes and are kept alive, and one is always ready.
     */
    min: 1,
    idleTimeoutMillis: 5 * 60_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    connectionTimeoutMillis: 15_000,
  })

if (process.env.NODE_ENV !== 'production') globalForDb.__pool = pool

export const db = drizzle(pool, { schema })
