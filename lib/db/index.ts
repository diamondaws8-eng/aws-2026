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
  })

if (process.env.NODE_ENV !== 'production') globalForDb.__pool = pool

export const db = drizzle(pool, { schema })
