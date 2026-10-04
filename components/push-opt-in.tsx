'use client'

import { useEffect, useState } from 'react'
import { BellRing, Loader2 } from 'lucide-react'
import { pushStatus, savePushSubscription, removePushSubscription } from '@/app/push-actions'
import { keyBytes, subscriptionHere, usesCurrentKey, dropSubscription } from '@/components/push-resume'

/** Inlined at build time; absent means the school has not switched instant notifications on. */
const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

type Stage = 'checking' | 'unsupported' | 'ios-install' | 'disabled' | 'denied' | 'off' | 'on'

const NOTE: Partial<Record<Stage, string>> = {
  checking: 'جاري التحقق...',
  unsupported: 'متصفحك لا يدعم الإشعارات الفورية',
  'ios-install': 'على الآيفون: أضف الموقع إلى الشاشة الرئيسية أولاً (زر المشاركة ← «إضافة إلى الشاشة الرئيسية») ثم افتحه من هناك لتفعيل الإشعارات',
  disabled: 'الإشعارات الفورية غير مفعَّلة في النظام بعد',
  denied: 'الإشعارات محظورة لهذا الموقع من إعدادات المتصفح',
}

function subscriptionPayload(sub: PushSubscription) {
  const keys = sub.toJSON().keys
  return { endpoint: sub.endpoint, keys: { p256dh: keys?.p256dh, auth: keys?.auth } }
}

/**
 * Letting this phone be woken when something lands in its owner's bell.
 *
 * The choice belongs to the device, not the account: each phone asks its own
 * permission and holds its own subscription, so the card reads the browser
 * first and only then the server. Everything about the browser is decided in
 * an effect — on the server there is no browser to ask.
 */
export function PushOptIn() {
  const [stage, setStage] = useState<Stage>('checking')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    const decide = async (): Promise<Stage> => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        // An iPhone only offers notifications to a site opened from the home
        // screen; in a Safari tab the same phone looks like it cannot do it.
        const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
          || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
        const installed = (navigator as Navigator & { standalone?: boolean }).standalone === true
          || window.matchMedia('(display-mode: standalone)').matches
        return ios && !installed ? 'ios-install' : 'unsupported'
      }
      if (!PUBLIC_KEY || !(await pushStatus()).enabled) return 'disabled'
      if (Notification.permission === 'denied') return 'denied'
      const sub = Notification.permission === 'granted' ? await subscriptionHere() : null
      if (!sub) return 'off'
      // Made under keys the school has since replaced: the push service refuses
      // it on every send. Dropped here so the button comes back, instead of a
      // card that says «مفعَّلة» over a phone that will never ring.
      if (!usesCurrentKey(sub, PUBLIC_KEY)) {
        await dropSubscription(sub)
        return 'off'
      }
      // Saved again on every visit: the phone may have changed hands since it
      // subscribed, and the server may have dropped a row it thought was dead.
      // «مفعَّلة» must mean this phone rings for the person looking at it.
      return (await savePushSubscription(subscriptionPayload(sub))).ok ? 'on' : 'off'
    }
    decide()
      .catch((): Stage => 'off')
      .then((next) => { if (!cancelled) setStage(next) })
    return () => { cancelled = true }
  }, [])

  const enable = async () => {
    if (!PUBLIC_KEY) return
    setBusy(true)
    setMsg(null)
    try {
      // Asked before anything else is awaited: a phone shows the question only
      // while the tap that caused it is still fresh.
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setStage(permission === 'denied' ? 'denied' : 'off')
        return
      }
      await navigator.serviceWorker.register('/sw.js')
      const registration = await navigator.serviceWorker.ready
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes(PUBLIC_KEY),
      })
      const res = await savePushSubscription(subscriptionPayload(sub))
      if (!res.ok) {
        // A subscription the server does not hold would show as on and never ring.
        await sub.unsubscribe().catch(() => {})
        setMsg({ ok: false, text: res.error })
        return
      }
      setStage('on')
    } catch {
      setMsg({ ok: false, text: 'تعذّر تفعيل الإشعارات على هذا الجهاز' })
    } finally {
      setBusy(false)
    }
  }

  const disable = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const sub = await subscriptionHere()
      if (sub) {
        await sub.unsubscribe()
        // The phone is already silent. If this does not reach the server, the
        // push service refuses the next attempt and the row is dropped then.
        await removePushSubscription(sub.endpoint).catch(() => {})
      }
      setStage('off')
    } catch {
      setMsg({ ok: false, text: 'حدث خطأ غير متوقع' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="bg-card border border-border rounded-3xl p-6 space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><BellRing className="size-5" /></div>
        <div>
          <h2 className="text-lg font-bold">الإشعارات الفورية على هذا الجهاز</h2>
          <p className="text-xs text-muted-foreground mt-0.5 leading-5">يُنبَّه هاتفك فور إرسال المدرسة إشعاراً أو تسجيل غياب، حتى والموقع مغلق</p>
        </div>
      </div>

      {NOTE[stage] && <p className="text-sm leading-6 text-muted-foreground">{NOTE[stage]}</p>}

      {stage === 'off' && (
        <button
          type="button"
          onClick={enable}
          disabled={busy}
          className="w-full min-h-11 px-4 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity inline-flex items-center justify-center gap-2"
        >
          {busy ? <><Loader2 className="size-4 animate-spin" /> جاري التفعيل...</> : 'تفعيل الإشعارات على هذا الجهاز'}
        </button>
      )}

      {stage === 'on' && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-emerald-700">مفعَّلة على هذا الجهاز ✅</p>
          <button
            type="button"
            onClick={disable}
            disabled={busy}
            className="inline-flex items-center min-h-10 px-2 text-sm font-bold text-muted-foreground underline underline-offset-4 disabled:opacity-50"
          >
            {busy ? 'جاري الإيقاف...' : 'إيقاف'}
          </button>
        </div>
      )}

      {msg && (
        <p className={`text-sm leading-6 rounded-2xl p-3 ${msg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
          {msg.text}
        </p>
      )}
    </section>
  )
}
