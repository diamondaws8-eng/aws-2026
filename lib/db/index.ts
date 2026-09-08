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
    max: 15, // the dashboard fires ~14 queries in parallel
  })

if (process.env.NODE_ENV !== 'production') globalForDb.__pool = pool

export const db = drizzle(pool, { schema })
