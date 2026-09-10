'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { NotificationBell } from '@/components/notification-bell'
import { StatCard } from '@/components/stat-card'
import { EmptyState } from '@/components/empty-state'
import { openCurrentYear, closeYearAndOpenNext } from './actions'
import {
  Archive, CalendarCheck2, Users, ClipboardList, MessageSquare,
  GraduationCap, Loader2, AlertTriangle, Lock,
} from 'lucide-react'

type Year = {
  id: string
  label: string
  startDate: string
  endDate: string | null
  closed: boolean
  closedByName: string | null
  closedAt: string | null
}

type Summary = {
  schoolDaysRecorded: number
  present: number
  absent: number
  late: number
  excused: number
  lessonEntries: number
  points: number
  cases: number
  parentMessages: number
  grades: number
  pupilsWithRecords: number
}

export function ArchiveClient({
  years,
  selectedId,
  summary,
  isLiveCount,
  graduates,
  hasOpenYear,
  openYearLabel,
  currentLabel,
  currentStart,
  canManage,
  todayStr,
}: {
  years: Year[]
  selectedId: string | null
  summary: Summary | null
  isLiveCount: boolean
  graduates: { id: string; fullName: string }[]
  hasOpenYear: boolean
  openYearLabel: string | null
  currentLabel: string
  currentStart: string | null
  canManage: boolean
  todayStr: string
}) {
  const router = useRouter()
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  // Opening the year the school is already in
  const [openStart, setOpenStart] = useState(currentStart ?? '')

  // Closing it and starting the next
  const [endDate, setEndDate] = useState(todayStr)
  const [nextLabel, setNextLabel] = useState('')
  const [nextStart, setNextStart] = useState('')
  const [confirm, setConfirm] = useState('')

  const selected = years.find((y) => y.id === selectedId) ?? null
  const attendanceTotal = summary
    ? summary.present + summary.absent + summary.late + summary.excused
    : 0

  const doOpen = async () => {
    setBusy(true); setNote(null)
    try {
      const res = await openCurrentYear(openStart)
      setNote(res.ok ? { ok: true, text: res.message } : { ok: false, text: res.error })
      if (res.ok) router.refresh()
    } catch {
      setNote({ ok: false, text: 'حدث خطأ غير متوقع — لم يُسجَّل العام' })
    } finally {
      setBusy(false)
    }
  }

  const doClose = async () => {
    setBusy(true); setNote(null)
    try {
      const res = await closeYearAndOpenNext({ endDate, nextLabel, nextStartDate: nextStart })
      setNote(res.ok ? { ok: true, text: res.message } : { ok: false, text: res.error })
      if (res.ok) { setConfirm(''); setNextLabel(''); setNextStart(''); router.refresh() }
    } catch {
      // A dropped connection here must not leave the button spinning forever
      // on the one screen where the person will not dare click twice.
      setNote({ ok: false, text: 'حدث خطأ غير متوقع — أعد تحميل الصفحة وتحقق من حالة العام قبل المحاولة مرة أخرى' })
    } finally {
      setBusy(false)
    }
  }

  const readyToClose = confirm.trim() === 'إقفال' && !!nextLabel.trim() && !!nextStart && !!endDate

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">أرشيف الأعوام</h1>
          <p className="text-muted-foreground mt-1">
            كل عام دراسي وما حدث فيه — محفوظ في مكانه، يُقرأ ولا يُنقل.
          </p>
        </div>
        <NotificationBell />
      </div>

      {note && (
        <p className={`rounded-2xl border p-4 text-sm ${
          note.ok ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'
        }`}>
          {note.text}
        </p>
      )}

      {/* ── The years ─────────────────────────────────────────────────────── */}
      {years.length === 0 ? (
        <div className="rounded-3xl border border-border bg-card p-6">
          <EmptyState
            icon={Archive}
            title="لم يُسجَّل أي عام دراسي بعد"
            description={`المدرسة تعمل في العام ${currentLabel}، لكنه غير مسجَّل كعام له بداية ونهاية. سجّله الآن ليصبح إقفاله وأرشفته ممكنين.`}
          />
          {canManage && (
            <div className="mt-5 flex flex-wrap items-end gap-3 max-w-xl">
              <div className="flex-1 min-w-48">
                <label className="block text-sm font-semibold mb-1.5">أول يوم دراسة في {currentLabel}</label>
                <input
                  type="date"
                  value={openStart}
                  onChange={(e) => setOpenStart(e.target.value)}
                  className="w-full p-3 rounded-xl border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <button
                onClick={doOpen}
                disabled={busy || !openStart}
                className="rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
              >
                {busy ? 'جاري...' : `تسجيل العام ${currentLabel}`}
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {years.map((y) => (
              <Link
                key={y.id}
                href={`/admin/archive?year=${y.id}`}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
                  y.id === selectedId ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/70'
                }`}
              >
                {y.closed ? <Lock className="size-3.5" /> : <CalendarCheck2 className="size-3.5" />}
                {y.label}
                <span className="text-[11px] opacity-70">{y.closed ? 'مُقفل' : 'جارٍ'}</span>
              </Link>
            ))}
          </div>

          {selected && summary && (
            <>
              <div className="rounded-2xl border border-border bg-card p-4 text-sm">
                <span className="font-bold">العام {selected.label}</span>
                <span className="text-muted-foreground">
                  {' — '}من {selected.startDate} {selected.endDate ? `إلى ${selected.endDate}` : '— ما زال جارياً'}
                </span>
                {selected.closed && selected.closedByName && (
                  <span className="text-muted-foreground"> · أقفله {selected.closedByName}</span>
                )}
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {isLiveCount
                    ? 'الأرقام محسوبة الآن لأن العام ما زال جارياً وتتغيّر كل يوم.'
                    : 'الأرقام كما كانت يوم الإقفال — محفوظة كما هي حتى لو تغيّرت السجلات بعده.'}
                </p>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="أيام سُجِّل فيها" value={summary.schoolDaysRecorded} icon={CalendarCheck2} accent="blue" />
                <StatCard label="طلاب لهم سجلات" value={summary.pupilsWithRecords} icon={Users} accent="emerald" />
                <StatCard label="حالات سلوكية" value={summary.cases} icon={ClipboardList} accent="violet" />
                <StatCard label="رسائل لأولياء الأمور" value={summary.parentMessages} icon={MessageSquare} accent="amber" />
              </div>

              <div className="rounded-3xl border border-border bg-card p-6">
                <h2 className="text-lg font-bold mb-4">الحضور خلال العام</h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'حاضر', value: summary.present, cls: 'text-emerald-600' },
                    { label: 'متأخر', value: summary.late, cls: 'text-amber-600' },
                    { label: 'غائب', value: summary.absent, cls: 'text-red-600' },
                    { label: 'بعذر', value: summary.excused, cls: 'text-blue-600' },
                  ].map((s) => (
                    <div key={s.label} className="rounded-2xl border border-border p-4 text-center">
                      <p className={`text-2xl font-bold ${s.cls}`}>{s.value}</p>
                      <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {attendanceTotal ? Math.round((s.value / attendanceTotal) * 100) : 0}%
                      </p>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
                  <div className="rounded-2xl border border-border p-4 text-center">
                    <p className="text-2xl font-bold">{summary.lessonEntries}</p>
                    <p className="text-xs text-muted-foreground mt-1">تقييم حصة</p>
                  </div>
                  <div className="rounded-2xl border border-border p-4 text-center">
                    <p className="text-2xl font-bold">{summary.points}</p>
                    <p className="text-xs text-muted-foreground mt-1">مجموع النقاط</p>
                  </div>
                  <div className="rounded-2xl border border-border p-4 text-center">
                    <p className="text-2xl font-bold">{summary.grades}</p>
                    <p className="text-xs text-muted-foreground mt-1">درجة مسجَّلة</p>
                  </div>
                </div>
              </div>

              {graduates.length > 0 && (
                <div className="rounded-3xl border border-border bg-card p-6">
                  <h2 className="text-lg font-bold mb-1.5 inline-flex items-center gap-2">
                    <GraduationCap className="size-5" /> متخرجو {selected.label} ({graduates.length})
                  </h2>
                  <p className="text-sm text-muted-foreground mb-4">
                    غادروا المدرسة وبقيت سجلاتهم كاملة.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {graduates.map((g) => (
                      <span key={g.id} className="text-xs bg-muted rounded-full px-3 py-1">{g.fullName}</span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Closing the year ────────────────────────────────────────── */}
          {canManage && hasOpenYear && (
            <div className="rounded-3xl border border-border bg-card p-6">
              <h2 className="text-lg font-bold mb-1.5">إقفال العام {openYearLabel} وبدء عام جديد</h2>
              <p className="text-sm text-muted-foreground mb-5 leading-7">
                <span className="font-semibold text-foreground">لا تُحذف بيانة واحدة ولا تُنقل.</span> يُكتب أن
                العام انتهى في تاريخ كذا، وتُحفظ أرقامه كما هي، ويبدأ العام الجديد من تاريخه —
                فتبدأ النقاط ولوحة الصدارة من الصفر لأن الحساب يبدأ من التاريخ الجديد، لا لأن شيئاً أُفرِغ.
                <br />
                وسجل كل طالب يبقى معه: ولي الأمر يفتح العام الماضي من هنا في أي وقت.
                <br />
                <span className="font-semibold text-foreground">افعل هذا بعد أن ترحّل الطلاب لفصولهم الجديدة</span> من صفحة ترحيل الطلاب.
              </p>

              <div className="grid sm:grid-cols-3 gap-4 max-w-3xl">
                <div>
                  <label className="block text-sm font-semibold mb-1.5">آخر يوم في {openYearLabel}</label>
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                    className="w-full p-3 rounded-xl border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1.5">اسم العام الجديد</label>
                  <input type="text" value={nextLabel} onChange={(e) => setNextLabel(e.target.value)} placeholder="1449"
                    className="w-full p-3 rounded-xl border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1.5">أول يوم في العام الجديد</label>
                  <input type="date" value={nextStart} onChange={(e) => setNextStart(e.target.value)}
                    className="w-full p-3 rounded-xl border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-primary" />
                </div>
              </div>

              <p className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                <span>يُنفَّذ مرة واحدة في نهاية العام. بعده تبدأ كل العدادات من الصفر لدى المعلمين وأولياء الأمور.</span>
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <input
                  type="text"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="اكتب: إقفال"
                  className="w-40 p-3 rounded-xl border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-primary"
                />
                <button
                  onClick={doClose}
                  disabled={busy || !readyToClose}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground disabled:opacity-40"
                >
                  {busy ? <><Loader2 className="size-4 animate-spin" /> جاري الإقفال...</> : <><Lock className="size-4" /> إقفال العام وبدء الجديد</>}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
