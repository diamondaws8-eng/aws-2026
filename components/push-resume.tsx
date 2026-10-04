'use client'

import { useEffect } from 'react'
import { savePushSubscription, removePushSubscription } from '@/app/push-actions'

/** Inlined at build time; absent means the school has not switched instant notifications on. */
const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

/** The browser wants the server's public key as bytes; the environment holds it as base64url. */
export function keyBytes(base64url: string) {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

/** This browser's own subscription, if it ever made one. */
export async function subscriptionHere(): Promise<PushSubscription | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null
  const registration = await navigator.serviceWorker.getRegistration()
  return (await registration?.pushManager?.getSubscription()) ?? null
}

/**
 * Whether a subscription was made under the key pair the site uses today.
 *
 * A subscription is bound to the key it was created with. When the school
 * replaces its keys, every old one is refused by the push service on each
 * send, for ever — while the phone still holds it and the card still reads
 * «مفعَّلة». A browser that does not say which key it used is taken at its word.
 */
export function usesCurrentKey(sub: PushSubscription, publicKey: string): boolean {
  const used = sub.options?.applicationServerKey
  if (!used) return true
  const mine = new Uint8Array(used)
  const now = keyBytes(publicKey)
  return mine.length === now.length && mine.every((b, i) => b === now[i])
}

/** Forget a subscription on both sides: the browser first, so the phone is silent whatever the server answers. */
export async function dropSubscription(sub: PushSubscription): Promise<void> {
  await sub.unsubscribe().catch(() => {})
  await removePushSubscription(sub.endpoint).catch(() => {})
}

/**
 * Before signing out: this phone stops ringing for the person leaving it.
 *
 * Only the server forgets the phone. The browser keeps its subscription, so
 * signing back in picks it up again without asking the permission twice — see
 * PushResume below. Never throws: a sign-out must not fail over a notification.
 */
export async function silencePushHere(): Promise<void> {
  try {
    const sub = await subscriptionHere()
    if (sub) await removePushSubscription(sub.endpoint)
  } catch {
    // The push service's next refusal clears the row instead.
  }
}

/**
 * The other half of the above: a phone that was allowed to ring once rings for
 * whoever is signed in on it now. Once per browser session — the layout it
 * sits in outlives every page beneath it.
 */
export function PushResume() {
  useEffect(() => {
    const run = async () => {
      if (!PUBLIC_KEY || !('Notification' in window) || Notification.permission !== 'granted') return
      try {
        if (sessionStorage.getItem('push-resumed')) return
      } catch {
        // No storage: saving again on each load is harmless.
      }
      const sub = await subscriptionHere()
      if (!sub) return
      if (!usesCurrentKey(sub, PUBLIC_KEY)) {
        // Dead since the keys changed. Dropped, so the settings card offers
        // the button again instead of claiming the phone is on.
        await dropSubscription(sub)
        return
      }
      const keys = sub.toJSON().keys
      const res = await savePushSubscription({ endpoint: sub.endpoint, keys: { p256dh: keys?.p256dh, auth: keys?.auth } })
      if (res.ok) {
        try { sessionStorage.setItem('push-resumed', '1') } catch {}
      }
    }
    run().catch(() => {})
  }, [])
  return null
}
