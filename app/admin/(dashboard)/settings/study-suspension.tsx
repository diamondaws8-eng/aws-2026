'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import {
  declareStudySuspension, endStudySuspension,
  type HolidayRow, type ExistingRecords,
} from './actions-school-days'
import { daysInRange } from '@/lib/school-days'
import { formatRangeAr, formatDayGregorianAr, dayCountAr, arabicDigits } from '@/lib/utils'
import { StatusMsg } from './settings-ui'

/**
 * How many the notice was written for, and how many of those cannot see it: a
 * parent who has not yet chosen a password has no portal to read it in.
 */
const toldPhrase = (notified: number, unreachable: number) => (notified
  ? ` عدد من أُرسل إليهم الإشعار: ${notified}${unreachable ? `، منهم ${unreachable} من أولياء الأمور لم يفعّلوا حساباتهم بعد ولن يروه — أبلغهم بوسيلة أخرى` : ''}.`
  : '')

/**
 * Declaring that lessons have moved home for a range of days, and lifting it.
 *
 * Unlike a holiday, this is typed on the morning it happens — sometimes after
 * the first lesson was already marked. So the server is first asked what the
 * range holds, and nothing is written until whoever is declaring it has seen
 * the numbers and chosen whether they stay or go.
 */
export function StudySuspension({
  today,
  stages,
  canWholeSchool,
  suspendableStageIds,
  suspensions,
  onDeclared,
  onRemoved,
  onShortened,
}: {
  /** The school's date, from the server. */
  today: string
  stages: { id: string; name: string }[]
  canWholeSchool: boolean
  suspendableStageIds: string[]
  suspensions: HolidayRow[]
  onDeclared: (row: HolidayRow) => void
  onRemoved: (id: string) => void
  onShortened: (id: string, endDate: string) => void
}) {
  const router = useRouter()

  const scopeOptions = [
    ...(canWholeSchool ? [{ id: '', name: 'كل المدرسة' }] : []),
    ...stages.filter((s) => suspendableStageIds.includes(s.id)),
  ]

  const [scope, setScope] = useState(scopeOptions[0]?.id ?? '')
  const [start, setStart] = useState(today)
  // The form opens on today. When the page learns of a new day, a start date
  // still sitting on the old one moves with it; a date the user chose stays.
  const shownToday = useRef(today)
  useEffect(() => {
    const prev = shownToday.current
    shownToday.current = today
    setStart((cur) => (cur === prev ? today : cur))
  }, [today])
  const ids = { scope: useId(), start: useId(), end: useId(), reason: useId() }
  const [end, setEnd] = useState('')
  const [reason, setReason] = useState('')
  const [notifyPeople, setNotifyPeople] = useState(true)
  const [pending, setPending] = useState<{ found: ExistingRecords; canPurge: boolean } | null>(null)
  // Set once the user has said a range starting before today is meant.
  const [pastConfirmed, setPastConfirmed] = useState(false)
  // 'declare', or the id of the suspension being changed.
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // The numbers in the decision box describe the range as it was asked about.
  // The fields stay shut until the choice is made, so «حذف» can never take
  // more of the register than the box showed.
  const locked = busy !== null || pending !== null

  const scopeName = scopeOptions.find((o) => o.id === scope)?.name ?? ''
  // The range as it will be filed, in words: the date inputs show it in the
  // browser's own format, and a wrong day is easiest to miss there.
  const rangeWords = (from: string, to: string) =>
    `${scopeName} — ${formatRangeAr(from, to, true)} (${dayCountAr(daysInRange(from, to))})`

  const submit = (existing: 'ask' | 'keep' | 'purge') => {
    if (!start) {
      setMsg({ ok: false, text: 'تاريخ البداية مطلوب' })
      return
    }
    const to = end || start
    if (to < start) {
      setMsg({ ok: false, text: 'تاريخ النهاية قبل تاريخ البداية' })
      return
    }
    // One press closes the register and tells every family, so the first press
    // says exactly what it is about to do.
    if (existing === 'ask' && !window.confirm(
      `تعليق الدراسة الحضورية:\n${rangeWords(start, to)}\n\n`
      + (notifyPeople && to >= today ? 'يُرسَل إشعار لأولياء الأمور والمعلمين فوراً.' : 'لن يُرسَل إشعار.')
      + '\nمتابعة؟')) return
    void send(existing, pastConfirmed)
  }

  const send = async (existing: 'ask' | 'keep' | 'purge', allowPast: boolean): Promise<void> => {
    const to = end || start
    setBusy('declare')
    setMsg(null)
    try {
      const res = await declareStudySuspension({
        startDate: start,
        endDate: to,
        gradeLevelId: scope || null,
        reason,
        notifyPeople,
        existing,
        allowPast,
      })
      if (!res.ok && res.past) {
        // The server's date, not this tab's: a page left open overnight still
        // offers yesterday as "today".
        if (!window.confirm(`${res.error}.\n\nالفترة: ${rangeWords(start, to)}\n\nهل تقصد تعليق يوم مضى؟`)) return
        setPastConfirmed(true)
        return await send(existing, true)
      }
      if (res.ok) {
        onDeclared(res.holiday)
        setPending(null)
        setPastConfirmed(false)
        // Asked to tell people and reached nobody is not a success to report
        // in the same words as one that did.
        const unheard = res.announced && res.notified === 0
        setMsg({
          ok: !unheard,
          text: `عُلِّقت الدراسة الحضورية ${formatRangeAr(start, to)}.`
            + (unheard ? ' لكن الإشعار لم يصل لأحد — أبلغ أولياء الأمور والمعلمين بوسيلة أخرى.' : toldPhrase(res.notified, res.unreachable))
            + (res.purged
              ? ` حُذف ما سُجِّل — سجلات الحضور: ${arabicDigits(res.purged.attendance)}، تقييمات الحصص: ${arabicDigits(res.purged.lessons)}، مرات منح النقاط اليدوية: ${arabicDigits(res.purged.points)}.`
              : ''),
        })
        setStart(today)
        setEnd('')
        setReason('')
        setNotifyPeople(true)
        router.refresh()
      } else if (res.existing) {
        setPending({ found: res.existing, canPurge: res.canPurge === true })
      } else {
        // The confirmation was for this range and this attempt only.
        setPastConfirmed(false)
        setMsg({ ok: false, text: res.error })
      }
    } catch {
      setPastConfirmed(false)
      setMsg({ ok: false, text: 'حدث خطأ غير متوقع' })
    } finally {
      setBusy(null)
    }
  }

  const purgeAndDeclare = () => {
    if (!window.confirm(
      `ستُحذف نهائياً سجلات الحضور والتقييم والنقاط اليدوية داخل:\n${rangeWords(start, end || start)}\n\nلا يمكن استرجاعها. متابعة؟`)) return
    submit('purge')
  }

  const endEarly = async (row: HolidayRow, when: 'today' | 'next-school-day') => {
    if (!window.confirm(when === 'today'
      ? 'تعود الدراسة حضورياً من اليوم: يُفتح سجل اليوم للتسجيل، وتبقى الأيام الماضية من التعليق كما هي، ويُبلَّغ من وصلهم الإشعار. متابعة؟'
      : 'يُقصَّر هذا التعليق: يبقى اليوم عن بُعد وسجلّه مغلقاً، وتعود الدراسة حضورياً في أول يوم دراسي قادم، ويُبلَّغ من وصلهم الإشعار. متابعة؟')) return
    setBusy(row.id)
    setMsg(null)
    try {
      // The return day is the server's to name: it knows the school's date
      // and which days are taught.
      const res = await endStudySuspension(row.id, when)
      if (res.ok) {
        if (res.removed || !res.endDate) {
          onRemoved(row.id)
          setMsg({ ok: true, text: `حُذف التعليق.${toldPhrase(res.notified, res.unreachable)}` })
        } else {
          onShortened(row.id, res.endDate)
          setMsg({
            ok: true,
            text: `قُصِّر التعليق${res.resumeDate ? `، وتعود الدراسة حضورياً ${formatDayGregorianAr(res.resumeDate)}` : ''}.${toldPhrase(res.notified, res.unreachable)}`,
          })
        }
        router.refresh()
      } else {
        setMsg({ ok: false, text: res.error })
      }
    } catch {
      setMsg({ ok: false, text: 'حدث خطأ غير متوقع' })
    } finally {
      setBusy(null)
    }
  }

  const remove = async (row: HolidayRow) => {
    const upcoming = row.startDate > today
    const running = !upcoming && row.endDate >= today
    if (!window.confirm(upcoming
      ? 'إلغاء هذا التعليق؟ يُبلَّغ من وصلهم الإشعار.'
      : running
        ? 'حذف هذا التعليق يعيد أيامه كلها — الماضية واليوم — أياماً دراسية عادية تظهر بلا تسجيل، ويُبلَّغ من وصلهم الإشعار بأن الدراسة حضورية، وما حُذف من السجلات عند التعليق لا يعود.'
          + (row.startDate < today ? '\n\nلإبقاء الأيام الماضية معلَّقة استخدم زر «العودة حضورياً اليوم» بدل الحذف.' : '')
          + '\n\nمتابعة الحذف؟'
        : 'حذف هذا التعليق يعيد أيامه أياماً دراسية عادية — تظهر بلا تسجيل — وما حُذف من السجلات عند التعليق لا يعود. متابعة؟')) return
    setBusy(row.id)
    setMsg(null)
    try {
      const res = await endStudySuspension(row.id)
      if (res.ok) {
        onRemoved(row.id)
        setMsg({ ok: true, text: `${upcoming ? 'أُلغي التعليق.' : 'حُذف التعليق.'}${toldPhrase(res.notified, res.unreachable)}` })
        router.refresh()
      } else {
        setMsg({ ok: false, text: res.error })
      }
    } catch {
      setMsg({ ok: false, text: 'حدث خطأ غير متوقع' })
    } finally {
      setBusy(null)
    }
  }

  // What is running or still ahead comes first, soonest at the top; what is
  // over follows, most recent first.
  const ordered = [
    ...suspensions.filter((s) => s.endDate >= today).sort((a, b) => a.startDate.localeCompare(b.startDate)),
    ...suspensions.filter((s) => s.endDate < today).sort((a, b) => b.startDate.localeCompare(a.startDate)),
  ]

  return (
    <div>
      <p className="text-sm text-muted-foreground mb-5 leading-7">
        إذا عُلِّقت الدراسة الحضورية — لأمطار أو لتعميم من إدارة التعليم — وصارت الدراسة عن بُعد، سجّل الفترة هنا.
        تُعامَل أيامها معاملة الإجازة تماماً: لا حضور ولا غياب ولا تقييم ولا نقاط، ولا تُحسب أياماً بلا تسجيل.
        ويُرسَل إشعار داخل النظام لأولياء الأمور والمعلمين — يراه من فعّل حسابه — ويظهر التعليق في الصفحة الرئيسية لولي الأمر.
      </p>

      <div className="grid sm:grid-cols-4 gap-3 max-w-3xl items-end">
        <div className="sm:col-span-2">
          <label htmlFor={ids.scope} className="block text-xs font-semibold mb-1.5">نطاق التعليق</label>
          <select
            id={ids.scope}
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            disabled={locked}
            className="w-full p-3 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary text-sm disabled:opacity-60"
          >
            {scopeOptions.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={ids.start} className="block text-xs font-semibold mb-1.5">من</label>
          <input
            id={ids.start}
            type="date"
            value={start}
            disabled={locked}
            onChange={(e) => {
              const v = e.target.value
              setStart(v)
              setPastConfirmed(false)
              if (end && v > end) setEnd('')
            }}
            className="w-full p-3 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary text-sm disabled:opacity-60"
          />
        </div>
        <div>
          <label htmlFor={ids.end} className="block text-xs font-semibold mb-1.5">إلى</label>
          <input
            id={ids.end}
            type="date"
            value={end}
            min={start || undefined}
            disabled={locked}
            onChange={(e) => setEnd(e.target.value)}
            className="w-full p-3 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary text-sm disabled:opacity-60"
          />
        </div>
        <div className="sm:col-span-4">
          <label htmlFor={ids.reason} className="block text-xs font-semibold mb-1.5">السبب (اختياري)</label>
          <input
            id={ids.reason}
            type="text"
            value={reason}
            disabled={locked}
            onChange={(e) => setReason(e.target.value)}
            maxLength={60}
            placeholder="مثال: أمطار غزيرة"
            className="w-full p-3 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary text-sm disabled:opacity-60"
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground mt-1.5">اترك «إلى» فارغاً إذا كان التعليق ليوم واحد.</p>

      <label className="flex items-center gap-2 mt-3 text-sm font-semibold w-fit cursor-pointer">
        <input
          type="checkbox"
          checked={notifyPeople}
          disabled={locked}
          onChange={(e) => setNotifyPeople(e.target.checked)}
          className="size-5 accent-primary"
        />
        إشعار أولياء الأمور والمعلمين
      </label>
      {start && (end || start) < today && (
        <p className="text-xs text-muted-foreground mt-1">الفترة التي انتهت تُسجَّل في التقويم دون إشعار.</p>
      )}

      {pending && (
        <div role="alert" className="mt-4 max-w-3xl rounded-2xl border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-4 space-y-3">
          <p className="text-sm font-bold text-amber-900 dark:text-amber-200">{rangeWords(start, end || start)}</p>
          <p className="text-sm font-bold text-amber-900 dark:text-amber-200">
            يوجد داخل هذه الفترة ما سُجِّل من قبل — سجلات الحضور: {arabicDigits(pending.found.attendance)} (عدد
            الأيام المسجَّلة: {arabicDigits(pending.found.days)})، تقييمات الحصص: {arabicDigits(pending.found.lessons)}،
            مرات منح النقاط اليدوية: {arabicDigits(pending.found.points)}.
          </p>
          <p className="text-sm text-amber-800 dark:text-amber-300">
            الحذف يجعل الفترة بلا أي حضور أو غياب لكل الطلاب. الإبقاء يترك ما سُجِّل محسوباً كما هو.
          </p>
          {!pending.canPurge && (
            <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
              الحذف متاح فقط لتعليق يبدأ خلال آخر ٧ أيام.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            {pending.canPurge && (
              <button
                type="button"
                onClick={purgeAndDeclare}
                disabled={busy !== null}
                className="px-5 py-2.5 bg-red-600 text-white font-bold text-sm rounded-xl hover:opacity-90 disabled:opacity-40"
              >
                تعليق وحذف ما سُجِّل
              </button>
            )}
            <button
              type="button"
              onClick={() => submit('keep')}
              disabled={busy !== null}
              className="px-5 py-2.5 bg-amber-600 text-white font-bold text-sm rounded-xl hover:opacity-90 disabled:opacity-40"
            >
              تعليق مع إبقاء ما سُجِّل
            </button>
            <button
              type="button"
              onClick={() => { setPending(null); setPastConfirmed(false); setMsg(null) }}
              disabled={busy !== null}
              className="px-5 py-2.5 bg-muted text-muted-foreground font-semibold text-sm rounded-xl hover:bg-muted/80 disabled:opacity-50"
            >
              إلغاء
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 mt-4">
        <button
          type="button"
          onClick={() => submit('ask')}
          disabled={locked || scopeOptions.length === 0}
          className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm disabled:opacity-50"
        >
          {busy === 'declare' ? 'جاري التعليق...' : 'تعليق الدراسة'}
        </button>
        {msg && <StatusMsg ok={msg.ok} text={msg.text} />}
      </div>

      <h3 className="font-bold text-sm mt-6 mb-3">فترات التعليق</h3>
      {ordered.length === 0 ? (
        <p className="text-sm text-muted-foreground bg-muted/40 rounded-xl p-4 max-w-3xl">
          لا توجد فترات تعليق مسجَّلة.
        </p>
      ) : (
        <div className="space-y-2 max-w-3xl">
          {ordered.map((s) => {
            const past = s.endDate < today
            const upcoming = s.startDate > today
            // A stage that no longer exists has nobody running it; its row
            // falls to whoever answers for the whole school.
            const withinReach = s.gradeLevelId === null || !stages.some((st) => st.id === s.gradeLevelId)
              ? canWholeSchool
              : suspendableStageIds.includes(s.gradeLevelId)
            return (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-border">
                <div className={`min-w-0 basis-full sm:basis-0 sm:flex-1 ${past ? 'opacity-60' : ''}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-sm">{s.name}</p>
                    <span
                      className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        past
                          ? 'bg-muted text-muted-foreground'
                          : upcoming
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}
                    >
                      {past ? 'انتهى' : upcoming ? 'قادم' : 'جارٍ الآن'}
                    </span>
                  </div>
                  <p
                    className="text-xs text-muted-foreground mt-0.5"
                    title={`${s.startDate}${s.endDate !== s.startDate ? ` → ${s.endDate}` : ''}`}
                  >
                    {s.gradeLevelId === null
                      ? 'كل المدرسة'
                      : stages.find((st) => st.id === s.gradeLevelId)?.name ?? 'مرحلة غير معروفة'}
                    {' — '}
                    {formatRangeAr(s.startDate, s.endDate, true)}
                    {' — '}
                    {dayCountAr(daysInRange(s.startDate, s.endDate))}
                  </p>
                </div>
                {withinReach && (
                  <div className="flex items-center gap-1 shrink-0">
                    {!past && !upcoming && s.startDate < today && (
                      <button
                        type="button"
                        onClick={() => endEarly(s, 'today')}
                        disabled={busy !== null}
                        className="rounded-lg px-3 py-2 text-xs font-bold bg-muted hover:bg-muted/70 disabled:opacity-50"
                      >
                        العودة حضورياً اليوم
                      </button>
                    )}
                    {!past && !upcoming && s.endDate > today && (
                      <button
                        type="button"
                        onClick={() => endEarly(s, 'next-school-day')}
                        disabled={busy !== null}
                        className="rounded-lg px-3 py-2 text-xs font-bold bg-muted hover:bg-muted/70 disabled:opacity-50"
                      >
                        العودة من أول يوم دراسي قادم
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => remove(s)}
                      disabled={busy !== null}
                      aria-label={upcoming ? 'إلغاء التعليق' : 'حذف التعليق'}
                      className="px-3 py-3 sm:py-2 rounded-lg text-red-600 hover:bg-red-50 shrink-0 disabled:opacity-50"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
