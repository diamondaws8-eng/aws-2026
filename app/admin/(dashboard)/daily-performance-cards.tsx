'use client'

import { useEffect, useState } from 'react'
import { formatDateAr } from '@/lib/utils'
import {
  CalendarCheck2,
  CalendarX2,
  BookCheck,
  Sparkles,
  Activity,
  ChevronRight,
  ChevronLeft,
  History,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// ── Types (mirrors the aggregates built server-side in page.tsx) ──────────────
export type DailyTrendPoint = {
  date: string
  present: number
  absent: number
  late: number
  excused: number
  attTotal: number
  homeworkDone: number
  homeworkMissing: number
  participationActive: number
  participationInactive: number
  attendancePct: number
  absencePct: number
  homeworkPct: number
  participationPct: number
  hasAttendance: boolean
  hasHomework: boolean
  hasParticipation: boolean
}

export type ClassTodayStat = {
  id: string
  name: string
  gradeName: string | null
  present: number
  absent: number
  late: number
  excused: number
  attTotal: number
  attendancePct: number
  homeworkPct: number
  participationPct: number
  recorded: boolean
}

export type ClassHistoryDay = {
  date: string
  classes: ClassTodayStat[]
}

const MAX_DAYS_BACK = 7

type Point = { x: number; y: number }

// ── Small math helpers for the hand-drawn charts ───────────────────────────────

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number): Point {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

/** Describes a circular arc path from startAngle to endAngle (degrees, clockwise, 0 = top) */
function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const start = polarToCartesian(cx, cy, r, endAngle)
  const end = polarToCartesian(cx, cy, r, startAngle)
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1'
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`
}

/** Smooth polyline through points using paired midpoint quadratic curves */
function smoothPath(points: Point[]): string {
  if (points.length === 0) return ''
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`
  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i]
    const p1 = points[i + 1]
    const midX = (p0.x + p1.x) / 2
    const midY = (p0.y + p1.y) / 2
    d += ` Q ${p0.x} ${p0.y} ${midX} ${midY} Q ${midX} ${midY} ${p1.x} ${p1.y}`
  }
  return d
}

/** Animates a number from 0 to target with an ease-out curve, for the "live" feel */
function useCountUp(target: number, duration = 1100): number {
  const [value, setValue] = useState(0)
  useEffect(() => {
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(target * eased)
      if (progress < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return value
}

// ── Live pulsing badge ─────────────────────────────────────────────────────────

function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-2.5 py-1 text-xs font-bold text-rose-600">
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full rounded-full bg-rose-500 opacity-75 animate-ping" />
        <span className="relative inline-flex size-2 rounded-full bg-rose-500" />
      </span>
      مباشر
    </span>
  )
}

// ── Radial gauge (270° dashboard-style arc) with count-up animation ───────────

function RadialGauge({
  value,
  label,
  sublabel,
  icon: Icon,
  gradientId,
  colorFrom,
  colorTo,
  glow,
}: {
  value: number
  label: string
  sublabel: string
  icon: LucideIcon
  gradientId: string
  colorFrom: string
  colorTo: string
  glow: string
}) {
  const animated = useCountUp(value)
  const size = 172
  const cx = size / 2
  const cy = size / 2
  const r = 66
  const stroke = 15
  const gapStart = 225
  const sweep = 270
  const clamped = Math.min(Math.max(animated, 0), 100)
  const trackPath = describeArc(cx, cy, r, gapStart, gapStart + sweep)
  const valuePath = describeArc(cx, cy, r, gapStart, gapStart + (clamped / 100) * sweep)

  return (
    <div className="flex flex-col items-center rounded-2xl border border-border/70 bg-gradient-to-b from-muted/40 to-transparent p-4 transition-transform hover:-translate-y-0.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={colorFrom} />
              <stop offset="100%" stopColor={colorTo} />
            </linearGradient>
          </defs>
          <path d={trackPath} fill="none" stroke="currentColor" className="text-muted" strokeWidth={stroke} strokeLinecap="round" />
          {clamped > 0 && (
            <path
              d={valuePath}
              fill="none"
              stroke={`url(#${gradientId})`}
              strokeWidth={stroke}
              strokeLinecap="round"
              style={{ filter: `drop-shadow(0 0 7px ${glow})` }}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
          <Icon className="size-4" style={{ color: colorTo }} />
          <span className="text-3xl font-black tracking-tight">{Math.round(animated)}%</span>
        </div>
      </div>
      <p className="mt-1 text-sm font-bold text-center">{label}</p>
      <p className="text-xs text-muted-foreground text-center">{sublabel}</p>
    </div>
  )
}

// ── Multi-series 14-day trend chart ────────────────────────────────────────────

function TrendChart({
  trend,
  series,
  highlightIndex,
}: {
  trend: DailyTrendPoint[]
  series: { key: keyof DailyTrendPoint; label: string; color: string }[]
  highlightIndex?: number
}) {
  const w = 720
  const h = 220
  const padX = 6
  const padY = 14
  const innerH = h - padY * 2
  const step = trend.length > 1 ? (w - padX * 2) / (trend.length - 1) : 0
  const highlightX = highlightIndex != null ? padX + highlightIndex * step : null

  return (
    <div className="space-y-3">
      <svg viewBox={`0 0 ${w} ${h + 18}`} className="w-full h-60" preserveAspectRatio="none">
        {[0, 25, 50, 75, 100].map((g) => {
          const y = padY + innerH - (g / 100) * innerH
          return (
            <g key={g}>
              <line x1={padX} x2={w - padX} y1={y} y2={y} stroke="currentColor" className="text-muted" strokeDasharray="3 7" strokeWidth={1} />
              <text x={w - padX} y={y - 3} fontSize={10} textAnchor="end" className="fill-muted-foreground">{g}%</text>
            </g>
          )
        })}
        {highlightX != null && (
          <line x1={highlightX} x2={highlightX} y1={padY} y2={padY + innerH} stroke="currentColor" className="text-foreground/30" strokeWidth={1.5} strokeDasharray="2 3" />
        )}
        {series.map((s) => {
          const coords = trend.map((t, i) => ({
            x: padX + i * step,
            y: padY + innerH - (Number(t[s.key]) / 100) * innerH,
          }))
          const linePath = smoothPath(coords)
          const last = coords[coords.length - 1]
          const first = coords[0]
          const areaPath = `${linePath} L ${last.x} ${padY + innerH} L ${first.x} ${padY + innerH} Z`
          return (
            <g key={String(s.key)}>
              <path d={areaPath} fill={s.color} opacity={0.09} />
              <path d={linePath} fill="none" stroke={s.color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
              {coords.map((c, i) => (
                <circle key={i} cx={c.x} cy={c.y} r={i === highlightIndex ? 5 : 2.6} fill={s.color} stroke={i === highlightIndex ? 'white' : 'none'} strokeWidth={i === highlightIndex ? 1.5 : 0} />
              ))}
            </g>
          )
        })}
        {trend.map((t, i) =>
          i % 2 === 0 ? (
            <text key={t.date} x={padX + i * step} y={h + 14} fontSize={9.5} textAnchor="middle" className="fill-muted-foreground">
              {t.date.slice(5).replace('-', '/')}
            </text>
          ) : null
        )}
      </svg>
      <div className="flex flex-wrap items-center gap-4">
        {series.map((s) => (
          <span key={String(s.key)} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="size-2.5 rounded-full" style={{ backgroundColor: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Segmented attendance bar for the per-class comparison list ────────────────

function AttendanceSegmentBar({ cls }: { cls: ClassTodayStat }) {
  const total = cls.attTotal || 1
  const segments = [
    { value: cls.present, color: 'bg-emerald-500' },
    { value: cls.late, color: 'bg-amber-400' },
    { value: cls.excused, color: 'bg-blue-400' },
    { value: cls.absent, color: 'bg-rose-500' },
  ]
  return (
    <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden flex">
      {segments.map((seg, i) => (
        <div key={i} className={`h-full ${seg.color}`} style={{ width: `${(seg.value / total) * 100}%` }} />
      ))}
    </div>
  )
}

function attendanceTone(pct: number) {
  if (pct >= 90) return 'border-emerald-200/70 bg-emerald-50/50'
  if (pct >= 75) return 'border-amber-200/70 bg-amber-50/50'
  return 'border-rose-200/70 bg-rose-50/60'
}

function dayOffsetLabel(offset: number): string {
  if (offset === 0) return 'اليوم'
  if (offset === 1) return 'أمس'
  return `منذ ${offset} أيام`
}

// ── Day-back navigator (up to 7 days) ──────────────────────────────────────────

function DayNav({
  offset,
  maxOffset,
  onChange,
}: {
  offset: number
  maxOffset: number
  onChange: (offset: number) => void
}) {
  return (
    <div className="flex items-center gap-1 rounded-full border border-border bg-muted/60 p-1">
      <button
        type="button"
        onClick={() => onChange(Math.min(offset + 1, maxOffset))}
        disabled={offset >= maxOffset}
        className="flex size-7 items-center justify-center rounded-full text-muted-foreground disabled:opacity-30 disabled:cursor-not-allowed hover:bg-card hover:text-foreground transition-colors"
        title="اليوم السابق"
      >
        <ChevronRight className="size-4" />
      </button>
      <span className="px-2 text-xs font-bold min-w-[70px] text-center select-none">
        {dayOffsetLabel(offset)}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.max(offset - 1, 0))}
        disabled={offset <= 0}
        className="flex size-7 items-center justify-center rounded-full text-muted-foreground disabled:opacity-30 disabled:cursor-not-allowed hover:bg-card hover:text-foreground transition-colors"
        title="اليوم التالي"
      >
        <ChevronLeft className="size-4" />
      </button>
    </div>
  )
}

// ── Main export ────────────────────────────────────────────────────────────────

export function DailyPerformanceCards({
  attendanceEnabled,
  homeworkEnabled,
  participationEnabled,
  trend,
  byClassHistory,
}: {
  attendanceEnabled: boolean
  homeworkEnabled: boolean
  participationEnabled: boolean
  trend: DailyTrendPoint[]
  byClassHistory: ClassHistoryDay[]
}) {
  const maxOffset = Math.min(MAX_DAYS_BACK, trend.length - 1)
  const [dayOffset, setDayOffset] = useState(0)

  if (!attendanceEnabled && !homeworkEnabled && !participationEnabled) return null

  const selectedIndex = trend.length - 1 - dayOffset
  const today = trend[selectedIndex]

  const historyMap = new Map(byClassHistory.map((d) => [d.date, d.classes]))
  const byClass = historyMap.get(today.date) ?? []

  const dayLabel = dayOffsetLabel(dayOffset)
  const gauges: React.ReactNode[] = []
  if (attendanceEnabled) {
    gauges.push(
      <RadialGauge
        key="attendance"
        value={today.attendancePct}
        label={`نسبة الحضور — ${dayLabel}`}
        sublabel={today.attTotal ? `${today.present} من ${today.attTotal} طالب` : 'لا بيانات مسجلة'}
        icon={CalendarCheck2}
        gradientId="gauge-attendance"
        colorFrom="#34d399"
        colorTo="#059669"
        glow="rgba(16,185,129,0.55)"
      />,
      <RadialGauge
        key="absence"
        value={today.absencePct}
        label={`نسبة الغياب — ${dayLabel}`}
        sublabel={today.attTotal ? `${today.absent} من ${today.attTotal} طالب` : 'لا بيانات مسجلة'}
        icon={CalendarX2}
        gradientId="gauge-absence"
        colorFrom="#fb7185"
        colorTo="#e11d48"
        glow="rgba(225,29,72,0.5)"
      />
    )
  }
  if (homeworkEnabled) {
    const hwTotal = today.homeworkDone + today.homeworkMissing
    gauges.push(
      <RadialGauge
        key="homework"
        value={today.homeworkPct}
        label={`إنجاز الواجبات — ${dayLabel}`}
        sublabel={hwTotal ? `${today.homeworkDone} من ${hwTotal} طالب أنجز واجبه` : 'لا بيانات مسجلة'}
        icon={BookCheck}
        gradientId="gauge-homework"
        colorFrom="#fbbf24"
        colorTo="#d97706"
        glow="rgba(217,119,6,0.5)"
      />
    )
  }
  if (participationEnabled) {
    const partTotal = today.participationActive + today.participationInactive
    gauges.push(
      <RadialGauge
        key="participation"
        value={today.participationPct}
        label={`نسبة المشاركة — ${dayLabel}`}
        sublabel={partTotal ? `${today.participationActive} من ${partTotal} طالب فاعل` : 'لا بيانات مسجلة'}
        icon={Activity}
        gradientId="gauge-participation"
        colorFrom="#a78bfa"
        colorTo="#7c3aed"
        glow="rgba(124,58,237,0.5)"
      />
    )
  }

  const series: { key: keyof DailyTrendPoint; label: string; color: string }[] = []
  if (attendanceEnabled) {
    series.push({ key: 'attendancePct', label: 'الحضور', color: '#059669' })
    series.push({ key: 'absencePct', label: 'الغياب', color: '#e11d48' })
  }
  if (homeworkEnabled) series.push({ key: 'homeworkPct', label: 'إنجاز الواجب', color: '#d97706' })
  if (participationEnabled) series.push({ key: 'participationPct', label: 'المشاركة', color: '#7c3aed' })

  const rankedClasses = [...byClass].sort((a, b) => {
    if (attendanceEnabled) return a.attendancePct - b.attendancePct
    if (homeworkEnabled) return a.homeworkPct - b.homeworkPct
    return a.participationPct - b.participationPct
  })

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card">
        <div className="absolute -top-24 -right-16 size-64 rounded-full bg-violet-400/10 blur-3xl" />
        <div className="absolute -bottom-24 -left-10 size-64 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="relative p-6 space-y-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
                <Sparkles className="size-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold">مؤشرات الأداء اليومي</h2>
                <p className="text-sm text-muted-foreground">{formatDateAr(today.date)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <DayNav offset={dayOffset} maxOffset={maxOffset} onChange={setDayOffset} />
              {dayOffset === 0 ? (
                <LiveBadge />
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground">
                  <History className="size-3" />
                  سجل سابق
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {gauges}
          </div>

          <div className="pt-2 border-t border-border">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold">اتجاه آخر 14 يوماً — على مستوى المدرسة</h3>
            </div>
            <TrendChart trend={trend} series={series} highlightIndex={selectedIndex} />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
        <div>
          <h2 className="text-lg font-bold">
            مقارنة الفصول — {dayOffsetLabel(dayOffset)}
          </h2>
          <p className="text-sm text-muted-foreground">الفصول الأقل نسبة تظهر أولاً لسهولة المتابعة</p>
        </div>
        {rankedClasses.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد فصول لعرض المقارنة</p>
        ) : (
          <div className="space-y-3">
            {rankedClasses.map((cls, i) => (
              <div
                key={cls.id}
                className={`rounded-2xl border p-4 transition-colors ${
                  attendanceEnabled && cls.recorded ? attendanceTone(cls.attendancePct) : 'border-border bg-muted/30'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex size-7 items-center justify-center rounded-full bg-card border border-border text-xs font-bold text-muted-foreground">
                      {i + 1}
                    </span>
                    <div>
                      <p className="font-bold text-sm">
                        {cls.gradeName ? `${cls.gradeName} — ` : ''}فصل {cls.name}
                      </p>
                      {!cls.recorded && <p className="text-xs text-muted-foreground">لا يوجد سجل يومي بعد</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {attendanceEnabled && (
                      <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                        حضور {cls.attendancePct}%
                      </span>
                    )}
                    {homeworkEnabled && (
                      <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-100">
                        واجب {cls.homeworkPct}%
                      </span>
                    )}
                    {participationEnabled && (
                      <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 border border-violet-100">
                        مشاركة {cls.participationPct}%
                      </span>
                    )}
                  </div>
                </div>
                {attendanceEnabled && cls.recorded && (
                  <div className="mt-3">
                    <AttendanceSegmentBar cls={cls} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
