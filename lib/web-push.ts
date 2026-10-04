import { createPrivateKey, sign } from 'crypto'
import { after } from 'next/server'
import { inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { pushSubscriptions } from '@/lib/db/schema'

/**
 * Waking a phone when something lands in its owner's bell.
 *
 * The message sent is empty. Nothing about a child travels through Google's,
 * Apple's or Mozilla's servers: the phone is only told «there is something»,
 * and its service worker then asks this site what, with its owner's own
 * session. An empty message also needs no payload encryption — only the VAPID
 * signature that tells the push service who is knocking, which Node signs
 * without any library.
 *
 * The keys live in the environment, and without them the whole feature is
 * simply off: nothing is sent, and the opt-in card says so.
 */

type VapidKeys = {
  /** The uncompressed P-256 point (65 bytes), base64url — the same value the browser subscribes with. */
  publicKey: string
  /** The private scalar d (32 bytes), base64url. */
  privateKey: string
  subject: string
}

const DEFAULT_SUBJECT = 'mailto:Info@alaws.edu.sa'
/** Push services refuse a token that outlives a day; half of that leaves room for a wrong clock. */
const JWT_LIFETIME_SECONDS = 12 * 60 * 60
const SEND_TIMEOUT_MS = 8_000
const SEND_CONCURRENCY = 20
const QUERY_CHUNK = 500

function vapidKeys(): VapidKeys | null {
  const rawPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim()
  const rawPrivate = process.env.VAPID_PRIVATE_KEY?.trim()
  if (!rawPublic || !rawPrivate) return null
  // A key pasted with padding, or cut short, would otherwise fail on every
  // send; decoded and measured here, a bad pair reads as "not switched on".
  const point = Buffer.from(rawPublic, 'base64url')
  const scalar = Buffer.from(rawPrivate, 'base64url')
  if (point.length !== 65 || point[0] !== 4 || scalar.length !== 32) return null
  return {
    publicKey: point.toString('base64url'),
    privateKey: scalar.toString('base64url'),
    subject: process.env.VAPID_SUBJECT?.trim() || DEFAULT_SUBJECT,
  }
}

export function isPushConfigured(): boolean {
  return vapidKeys() !== null
}

const base64urlJson = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')

/**
 * The signed token a push service asks for before it will deliver: who is
 * sending (`sub`), to which service (`aud`), and until when. Pure — it reads
 * no environment and touches no network, so it can be checked against the
 * public key on its own.
 */
export function buildVapidJwt(
  audience: string,
  keys: { publicKey: string; privateKey: string; subject: string },
  nowSeconds: number = Math.floor(Date.now() / 1000),
): string {
  const point = Buffer.from(keys.publicKey, 'base64url')
  const key = createPrivateKey({
    format: 'jwk',
    key: {
      kty: 'EC',
      crv: 'P-256',
      d: keys.privateKey,
      x: point.subarray(1, 33).toString('base64url'),
      y: point.subarray(33, 65).toString('base64url'),
    },
  })
  const header = base64urlJson({ typ: 'JWT', alg: 'ES256' })
  const claims = base64urlJson({ aud: audience, exp: nowSeconds + JWT_LIFETIME_SECONDS, sub: keys.subject })
  // JWS wants the bare r‖s pair; Node's default for ECDSA is a DER envelope.
  const signature = sign('sha256', Buffer.from(`${header}.${claims}`), { key, dsaEncoding: 'ieee-p1363' })
  return `${header}.${claims}.${signature.toString('base64url')}`
}

/**
 * Knock on every browser these people have subscribed.
 *
 * A subscription the push service no longer knows (the app was removed, the
 * permission withdrawn) answers 404 or 410, and its row is deleted — short of
 * its owner pressing «إيقاف», that is how this table learns a phone has gone.
 * Anything else that fails is logged and left: the notice is in the bell
 * either way.
 */
export async function sendPushTo(userIds: string[]): Promise<void> {
  try {
    const keys = vapidKeys()
    const ids = [...new Set(userIds)].filter(Boolean)
    if (!keys || ids.length === 0) return

    const subscriptions: { id: string; endpoint: string }[] = []
    for (let i = 0; i < ids.length; i += QUERY_CHUNK) {
      subscriptions.push(
        ...(await db
          .select({ id: pushSubscriptions.id, endpoint: pushSubscriptions.endpoint })
          .from(pushSubscriptions)
          .where(inArray(pushSubscriptions.userId, ids.slice(i, i + QUERY_CHUNK)))),
      )
    }
    if (subscriptions.length === 0) return

    // One token per push service, not per phone: nearly every family's phone
    // sits behind the same two or three services.
    const jwtByAudience = new Map<string, string>()
    const gone: string[] = []

    const send = async (subscription: { id: string; endpoint: string }) => {
      // Only the host is ever logged — the full endpoint is the address that
      // lets anybody holding it knock on that phone.
      let host = 'unknown host'
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS)
      try {
        const url = new URL(subscription.endpoint)
        host = url.host
        let jwt = jwtByAudience.get(url.origin)
        if (!jwt) {
          jwt = buildVapidJwt(url.origin, keys)
          jwtByAudience.set(url.origin, jwt)
        }
        const res = await fetch(subscription.endpoint, {
          method: 'POST',
          headers: {
            TTL: '86400',
            'Content-Length': '0',
            Urgency: 'high',
            Authorization: `vapid t=${jwt}, k=${keys.publicKey}`,
          },
          signal: controller.signal,
        })
        await res.body?.cancel()
        if (res.status === 404 || res.status === 410) gone.push(subscription.id)
        else if (!res.ok) console.error(`Push refused by ${host}: HTTP ${res.status}`)
      } catch (error) {
        console.error(`Push to ${host} failed: ${error instanceof Error ? error.name : 'unknown error'}`)
      } finally {
        clearTimeout(timer)
      }
    }

    // A closure notice knocks on every family at once; a handful of workers
    // drain the list so one slow service never holds the rest behind it.
    let next = 0
    const worker = async () => {
      while (next < subscriptions.length) await send(subscriptions[next++])
    }
    await Promise.all(Array.from({ length: Math.min(SEND_CONCURRENCY, subscriptions.length) }, worker))

    for (let i = 0; i < gone.length; i += QUERY_CHUNK) {
      await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, gone.slice(i, i + QUERY_CHUNK)))
    }
  } catch (error) {
    console.error('Push send failed:', error)
  }
}

/** Nudge every browser these people have subscribed. Never throws, never blocks the caller. */
export function schedulePush(userIds: string[]): void {
  if (userIds.length === 0 || !isPushConfigured()) return
  try {
    // After the response: whoever caused the notice must not wait on somebody
    // else's phone.
    after(() => sendPushTo(userIds))
  } catch {
    // Outside a request there is no response to wait for, and after() refuses
    // to be called.
    void sendPushTo(userIds).catch(() => {})
  }
}
