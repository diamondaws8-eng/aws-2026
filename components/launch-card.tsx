'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Rocket, XCircle } from 'lucide-react'
import { LAUNCH_PHRASE } from '@/lib/launch-rules'
import { formatDayGregorianAr } from '@/lib/utils'
import { launchSchool } from '@/app/admin/(dashboard)/launch-actions'

/**
 * Shown on the administration's home page for as long as the school is still
 * being set up, and never again after: the launch is pressed once.
 *
 * It says what the setup period is — everything can be entered, nothing is
 * recorded or counted — so nobody takes the quiet for a fault, and gives the
 * owner the one control that ends it.
 */
export function LaunchCard({ canLaunch, today }: { canLaunch: boolean; today: string }) {
  const router = useRouter()
  const [date, setDate] = useState(today)
  const [phrase, setPhrase] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const launch = async () => {
    if (phrase.trim() !== LAUNCH_PHRASE || !date) return
    // The date box shows digits; a slip of one month is a month in which no
    // teacher can record, and this is pressed once. So the day is read back in
    // words, and a day that is not today is pointed out.
    const when = formatDayGregorianAr(date, true)
    const note = date > today ? ' وهو يوم لم يأتِ بعد: لن يُسجَّل شيء قبله.'
      : date < today ? ' وهو يوم مضى: تُفتح الأيام من ذلك اليوم إلى اليوم للتسجيل.'
      : ' (اليوم).'
    if (!window.confirm(`يبدأ التشغيل الفعلي يوم ${when}${note}\n\nلا يُضغط هذا الزر إلا مرة واحدة — متابعة؟`)) return
    setBusy(true)
    setError('')
    try {
      const res = await launchSchool(date, phrase)
      if (!res.ok) { setError(res.error); return }
      // The card belongs to the setup; the refreshed page no longer has one.
      router.refresh()
    } catch {
      setError('تعذّر بدء التشغيل — أعد المحاولة')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 dark:border-amber-800 dark:bg-amber-950/20">
      <h2 className="font-bold text-lg flex items-center gap-2 text-amber-900 dark:text-amber-200">
        <Rocket className="size-5" /> الموقع في وضع التجهيز — لم يبدأ التشغيل الفعلي بعد
      </h2>
      <p className="mt-2 text-sm leading-7 text-amber-900/85 dark:text-amber-200/85">
        أدخِل الآن المراحل والفصول والمعلمين والطلاب والجداول، وأرسل رسائل التفعيل لأولياء الأمور.
        إلى أن يُضغط زر التشغيل لا يُسجَّل حضور ولا تُمنح نقاط ولا يُحسب شيء — لا للمعلمين ولا في الإحصاءات ولا لأولياء الأمور.
      </p>

      {canLaunch ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-white p-4 space-y-3 dark:border-amber-900 dark:bg-background">
          <p className="text-sm font-bold">التشغيل من اليوم والبداية الحقيقية</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-semibold">
              يوم بداية الدراسة
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1.5 w-full h-11 rounded-xl border border-border bg-background px-3 text-sm"
              />
              <span className="mt-1 block text-xs font-normal text-muted-foreground leading-5">
                {date ? `${formatDayGregorianAr(date, true)} — ` : ''}يبدأ الحساب من هذا اليوم. ما قبله لا يُسجَّل ولا يُحسب.
              </span>
            </label>
            <label className="block text-sm font-semibold">
              اكتب كلمة <span className="font-mono">{LAUNCH_PHRASE}</span> للتأكيد
              <input
                type="text"
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                placeholder={LAUNCH_PHRASE}
                className="mt-1.5 w-full h-11 rounded-xl border border-border bg-background px-3 text-sm"
              />
              <span className="mt-1 block text-xs font-normal text-muted-foreground leading-5">
                يُضغط مرة واحدة ثم يختفي — تأكد أن كل البيانات دخلت.
              </span>
            </label>
          </div>
          {error && (
            <p className="text-sm rounded-xl p-3 inline-flex items-center gap-2 w-full bg-red-50 text-red-600">
              <XCircle className="size-4 shrink-0" /> {error}
            </p>
          )}
          <button
            type="button"
            onClick={launch}
            disabled={busy || !date || phrase.trim() !== LAUNCH_PHRASE}
            className="w-full sm:w-auto min-h-11 px-6 rounded-xl bg-primary text-primary-foreground font-bold disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {busy ? <><Loader2 className="size-4 animate-spin" /> جاري بدء التشغيل...</> : <><Rocket className="size-4" /> بدء التشغيل الفعلي</>}
          </button>
        </div>
      ) : (
        <p className="mt-3 text-xs text-amber-900/80 dark:text-amber-200/80">بدء التشغيل الفعلي يضغطه المالك أو مدير الجودة.</p>
      )}
    </div>
  )
}
