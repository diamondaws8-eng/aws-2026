'use client'

import { useEffect, useState } from 'react'
import { formatDateAr, wholePercents } from '@/lib/utils'
import {
  CalendarCheck2,
  CalendarX2,
  BookCheck,
  Backpack,
  Smile,
  Layers3,
  Sparkles,
  Activity,
  ChevronRight,
  ChevronLeft,
  History,
  ChartLine,
  ChartArea,
  ChartColumn,
  ChartBar,
  ChartPie,
  Radar,
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
  /** حاضر + متأخر — the students who were in school. */
  inSchool: number
  /** غائب + إذن — the students who were not. */
  outOfSchool: number
  /** Assessments recorded that day: one per pupil per teacher. */
  lessonEntries: number
  homeworkDone: number
  homeworkMissing: number
  materialsBrought: number
  materialsMissing: number
  participationActive: number
  participationInactive: number
  behaviorGood: number
  behaviorIssue: number
  attendancePct: number
  absencePct: number
  homeworkPct: number
  materialsPct: number
  participationPct: number
  behaviorPct: number
  hasAttendance: boolean
  hasHomework: boolean
  hasMaterials: boolean
  hasParticipation: boolean
  hasBehavior: boolean
}

/** One subject's day, as taught by one teacher to one class. */
export type SubjectStat = {
  key: string
  subjectName: string | null
  teacherName: string | null
  className: string | null
  gradeName: string | null
  entries: number
  homeworkDone: number
  homeworkMissing: number
  materialsBrought: number
  materialsMissing: number
  participationActive: number
  participationInactive: number
  behaviorGood: number
  behaviorIssue: number
  homeworkPct: number | null
  materialsPct: number | null
  participationPct: number | null
  behaviorPct: number | null
}

export type SubjectHistoryDay = { date: string; subjects: SubjectStat[] }

export type ClassTodayStat = {
  id: string
  name: string
  gradeName: string | null
  present: number
  absent: number
  late: number
  excused: number
  attTotal: number
  inSchool: number
  attendancePct: number
  homeworkPct: number
  materialsPct: number
  participationPct: number
  teacherCount: number
  lessonEntries: number
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
    // A tab opened in the background gets no animation frames, so the figure
    // would sit at 0% until the tab is looked at. The number must be right
    // whether or not the animation ran.
    const settle = setTimeout(() => setValue(target), duration + 100)
    return () => { cancelAnimationFrame(raf); clearTimeout(settle) }
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

type TrendSeries = {
  key: keyof DailyTrendPoint
  /** The flag that says this day was actually recorded — see the gap logic below. */
  flag: keyof DailyTrendPoint
  label: string
  color: string
}

type TrendKind = 'line' | 'area' | 'columns' | 'bars' | 'donut' | 'radar'
const TREND_KINDS: { id: TrendKind; label: string; icon: LucideIcon }[] = [
  { id: 'line', label: 'خطي', icon: ChartLine },
  { id: 'area', label: 'منطقة', icon: ChartArea },
  { id: 'columns', label: 'أعمدة', icon: ChartColumn },
  { id: 'bars', label: 'أفقي', icon: ChartBar },
  { id: 'donut', label: 'دائري', icon: ChartPie },
  { id: 'radar', label: 'راداري', icon: Radar },
]
const TREND_KIND_KEY = 'aws-trend-chart'

/**
 * The same fourteen days, drawn six ways. Which way is the reader's choice
 * and is remembered on the device. Every shape keeps the one rule of the
 * original: a day that was not recorded is a gap, never a zero.
 */
function TrendChart({
  trend,
  series,
  highlightIndex,
}: {
  trend: DailyTrendPoint[]
  series: TrendSeries[]
  highlightIndex?: number
}) {
  const [kind, setKind] = useState<TrendKind>('line')
  useEffect(() => {
    try {
      const v = localStorage.getItem(TREND_KIND_KEY)
      if (v && TREND_KINDS.some((k) => k.id === v)) setKind(v as TrendKind)
    } catch { /* stays on the line chart */ }
  }, [])
  const pick = (k: TrendKind) => { setKind(k); try { localStorage.setItem(TREND_KIND_KEY, k) } catch { /* private mode */ } }

  const blank = trend.filter((t) => !t.hasAttendance && !t.hasHomework && !t.hasMaterials && !t.hasParticipation && !t.hasBehavior).length
  const dateLabel = (d: string) => d.slice(5).replace('-', '/')

  return (
    <div className="space-y-3">
      <div className="no-print flex flex-wrap items-center gap-1 rounded-xl border border-border bg-muted/40 p-1 w-fit" role="radiogroup" aria-label="شكل الرسم">
        {TREND_KINDS.map((k) => {
          const Icon = k.icon
          const active = kind === k.id
          return (
            <button
              key={k.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => pick(k.id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${active ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
              title={k.label}
            >
              <Icon className="size-3.5" /> {k.label}
            </button>
          )
        })}
      </div>

      {kind === 'line' || kind === 'area' ? (
        <TrendLines trend={trend} series={series} highlightIndex={highlightIndex} filled={kind === 'area'} />
      ) : kind === 'columns' ? (
        <TrendColumns trend={trend} series={series} highlightIndex={highlightIndex} />
      ) : kind === 'bars' ? (
        <TrendBars trend={trend} series={series} highlightIndex={highlightIndex} />
      ) : kind === 'donut' ? (
        <TrendDonut trend={trend} highlightIndex={highlightIndex} />
      ) : (
        <TrendRadar trend={trend} series={series} />
      )}

      <div className="flex flex-wrap items-center gap-4">
        {kind !== 'donut' && series.map((s) => (
          <span key={String(s.key)} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="size-2.5 rounded-full" style={{ backgroundColor: s.color }} />
            {s.label}
          </span>
        ))}
        {blank > 0 && (
          <span className="text-xs text-muted-foreground">
            — {blank} من {trend.length} يوم دراسة بلا تسجيل، ولا تظهر في الرسم
            <span className="opacity-70"> (الإجازات مستبعدة)</span>
          </span>
        )}
      </div>
    </div>
  )

  function TrendLines({ trend, series, highlightIndex, filled }: { trend: DailyTrendPoint[]; series: TrendSeries[]; highlightIndex?: number; filled: boolean }) {
    const w = 720, h = 220, padX = 6, padY = 14
    const innerH = h - padY * 2
    const step = trend.length > 1 ? (w - padX * 2) / (trend.length - 1) : 0
    const highlightX = highlightIndex != null ? padX + highlightIndex * step : null
    return (
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
          const segments: (Point & { i: number })[][] = []
          let run: (Point & { i: number })[] = []
          trend.forEach((t, i) => {
            if (t[s.flag]) run.push({ i, x: padX + i * step, y: padY + innerH - (Number(t[s.key]) / 100) * innerH })
            else if (run.length) { segments.push(run); run = [] }
          })
          if (run.length) segments.push(run)
          return (
            <g key={String(s.key)}>
              {segments.map((coords, si) => {
                const linePath = smoothPath(coords)
                const last = coords[coords.length - 1], first = coords[0]
                const areaPath = `${linePath} L ${last.x} ${padY + innerH} L ${first.x} ${padY + innerH} Z`
                return (
                  <g key={si}>
                    {coords.length > 1 && <path d={areaPath} fill={s.color} opacity={filled ? 0.22 : 0.09} />}
                    {coords.length > 1 && <path d={linePath} fill="none" stroke={s.color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />}
                    {coords.map((c) => (
                      <circle key={c.i} cx={c.x} cy={c.y} r={c.i === highlightIndex ? 5 : 2.6} fill={s.color} stroke={c.i === highlightIndex ? 'white' : 'none'} strokeWidth={c.i === highlightIndex ? 1.5 : 0} />
                    ))}
                  </g>
                )
              })}
            </g>
          )
        })}
        {trend.map((t, i) => i % 2 === 0 ? (
          <text key={t.date} x={padX + i * step} y={h + 14} fontSize={9.5} textAnchor="middle" className="fill-muted-foreground">{dateLabel(t.date)}</text>
        ) : null)}
      </svg>
    )
  }

  function TrendColumns({ trend, series, highlightIndex }: { trend: DailyTrendPoint[]; series: TrendSeries[]; highlightIndex?: number }) {
    const w = 720, h = 220, padX = 6, padY = 14
    const innerH = h - padY * 2
    const slot = (w - padX * 2) / Math.max(trend.length, 1)
    const group = slot * 0.72
    const bar = group / Math.max(series.length, 1)
    return (
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
        {trend.map((t, i) => {
          const x0 = padX + i * slot + (slot - group) / 2
          return (
            <g key={t.date}>
              {i === highlightIndex && <rect x={padX + i * slot} y={padY} width={slot} height={innerH} fill="currentColor" className="text-foreground/6" />}
              {series.map((s, si) => {
                if (!t[s.flag]) return null
                const v = Number(t[s.key]) / 100
                const bh = Math.max(v * innerH, v > 0 ? 2 : 0)
                return <rect key={String(s.key)} x={x0 + si * bar + 0.5} y={padY + innerH - bh} width={Math.max(bar - 1, 1)} height={bh} rx={1.5} fill={s.color} opacity={i === highlightIndex ? 1 : 0.85} />
              })}
              {i % 2 === 0 && <text x={padX + i * slot + slot / 2} y={h + 14} fontSize={9.5} textAnchor="middle" className="fill-muted-foreground">{dateLabel(t.date)}</text>}
            </g>
          )
        })}
      </svg>
    )
  }

  function TrendBars({ trend, series, highlightIndex }: { trend: DailyTrendPoint[]; series: TrendSeries[]; highlightIndex?: number }) {
    const days = trend.map((t, i) => ({ t, i })).filter(({ t }) => series.some((s) => t[s.flag]))
    if (!days.length) return <p className="text-sm text-muted-foreground py-10 text-center">لا يوم مسجَّل في هذه الفترة</p>
    const w = 720, labelW = 52, padX = 6, rowGap = 6, bar = 7
    const rowH = series.length * bar + rowGap
    const h = days.length * rowH + 10
    const innerW = w - padX * 2 - labelW
    return (
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: Math.max(220, h) }} preserveAspectRatio="none">
        {[0, 25, 50, 75, 100].map((g) => {
          const x = padX + labelW + (g / 100) * innerW
          return (
            <g key={g}>
              <line x1={x} x2={x} y1={0} y2={h - 10} stroke="currentColor" className="text-muted" strokeDasharray="3 7" strokeWidth={1} />
              <text x={x} y={h - 1} fontSize={9.5} textAnchor="middle" className="fill-muted-foreground">{g}%</text>
            </g>
          )
        })}
        {days.map(({ t, i }, r) => {
          const y0 = r * rowH
          return (
            <g key={t.date}>
              {i === highlightIndex && <rect x={padX} y={y0 - 1} width={w - padX * 2} height={rowH - rowGap + 2} fill="currentColor" className="text-foreground/6" rx={3} />}
              <text x={padX + labelW - 6} y={y0 + (rowH - rowGap) / 2 + 3.5} fontSize={10} textAnchor="end" className="fill-muted-foreground">{dateLabel(t.date)}</text>
              {series.map((s, si) => {
                if (!t[s.flag]) return null
                const v = Number(t[s.key]) / 100
                return <rect key={String(s.key)} x={padX + labelW} y={y0 + si * bar} width={Math.max(v * innerW, v > 0 ? 2 : 0)} height={bar - 1.5} rx={1.5} fill={s.color} />
              })}
            </g>
          )
        })}
      </svg>
    )
  }

  function TrendDonut({ trend, highlightIndex }: { trend: DailyTrendPoint[]; highlightIndex?: number }) {
    const recorded = trend.filter((t) => t.hasAttendance)
    const day = (highlightIndex != null && trend[highlightIndex]?.hasAttendance ? trend[highlightIndex] : recorded[recorded.length - 1]) ?? null
    if (!day) return <p className="text-sm text-muted-foreground py-10 text-center">لا حضور مسجَّل في هذه الفترة</p>
    const parts = [
      { label: 'حاضر', value: day.present, color: '#059669' },
      { label: 'متأخر', value: day.late, color: '#d97706' },
      { label: 'إذن', value: day.excused, color: '#2563eb' },
      { label: 'غائب', value: day.absent, color: '#e11d48' },
    ].filter((x) => x.value > 0)
    const total = parts.reduce((n, x) => n + x.value, 0) || 1
    const cx = 110, cy = 110, r = 84, stroke = 26
    const circ = 2 * Math.PI * r
    let offset = 0
    return (
      <div className="grid grid-cols-1 sm:grid-cols-[220px_1fr] gap-4 items-center">
        <svg viewBox="0 0 220 220" className="w-[220px] h-[220px] mx-auto">
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="currentColor" className="text-muted" strokeWidth={stroke} />
          {parts.map((x) => {
            const len = (x.value / total) * circ
            const el = <circle key={x.label} cx={cx} cy={cy} r={r} fill="none" stroke={x.color} strokeWidth={stroke} strokeDasharray={`${len} ${circ - len}`} strokeDashoffset={-offset} transform={`rotate(-90 ${cx} ${cy})`} strokeLinecap="butt" />
            offset += len
            return el
          })}
          <text x={cx} y={cy - 4} fontSize={22} fontWeight={800} textAnchor="middle" className="fill-foreground">{Math.round((day.inSchool / total) * 100)}%</text>
          <text x={cx} y={cy + 16} fontSize={10.5} textAnchor="middle" className="fill-muted-foreground">في المدرسة · {dateLabel(day.date)}</text>
        </svg>
        <ul className="space-y-2 text-sm">
          {parts.map((x) => (
            <li key={x.label} className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2">
              <span className="inline-flex items-center gap-2"><span className="size-3 rounded-full" style={{ backgroundColor: x.color }} /> {x.label}</span>
              <span className="font-bold tabular-nums">{x.value} <span className="text-xs font-normal text-muted-foreground">({Math.round((x.value / total) * 100)}%)</span></span>
            </li>
          ))}
          <li className="text-xs text-muted-foreground px-1">تركيبة حضور اليوم المحدَّد من {day.attTotal} طالباً مسجَّلاً</li>
        </ul>
      </div>
    )
  }

  function TrendRadar({ trend, series }: { trend: DailyTrendPoint[]; series: TrendSeries[] }) {
    const avgs = series.map((s) => {
      const vals = trend.filter((t) => t[s.flag]).map((t) => Number(t[s.key]))
      return { s, avg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null, days: vals.length }
    })
    const axes = avgs.filter((a) => a.avg != null)
    if (axes.length < 3) return <p className="text-sm text-muted-foreground py-10 text-center">الرسم الراداري يحتاج ثلاثة مؤشرات مسجَّلة على الأقل</p>
    const cx = 160, cy = 150, R = 110
    const pt = (i: number, v: number) => polarToCartesian(cx, cy, (v / 100) * R, (360 / axes.length) * i)
    const poly = axes.map((a, i) => pt(i, a.avg as number))
    return (
      <div className="grid grid-cols-1 sm:grid-cols-[320px_1fr] gap-4 items-center">
        <svg viewBox="0 0 320 300" className="w-[320px] h-[300px] mx-auto">
          {[25, 50, 75, 100].map((g) => (
            <polygon key={g} points={axes.map((_, i) => { const q = pt(i, g); return `${q.x},${q.y}` }).join(' ')} fill="none" stroke="currentColor" className="text-muted" strokeWidth={1} />
          ))}
          {axes.map((a, i) => { const q = pt(i, 100); const lab = pt(i, 122); return (
            <g key={String(a.s.key)}>
              <line x1={cx} y1={cy} x2={q.x} y2={q.y} stroke="currentColor" className="text-muted" strokeWidth={1} />
              <text x={lab.x} y={lab.y + 4} fontSize={10.5} textAnchor="middle" className="fill-muted-foreground">{a.s.label}</text>
            </g>
          ) })}
          <polygon points={poly.map((q) => `${q.x},${q.y}`).join(' ')} fill="var(--primary)" opacity={0.22} stroke="var(--primary)" strokeWidth={2} strokeLinejoin="round" />
          {poly.map((q, i) => <circle key={i} cx={q.x} cy={q.y} r={4} fill={axes[i].s.color} stroke="white" strokeWidth={1.5} />)}
        </svg>
        <ul className="space-y-2 text-sm">
          {axes.map((a) => (
            <li key={String(a.s.key)} className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2">
              <span className="inline-flex items-center gap-2"><span className="size-3 rounded-full" style={{ backgroundColor: a.s.color }} /> {a.s.label}</span>
              <span className="font-bold tabular-nums">{Math.round(a.avg as number)}% <span className="text-xs font-normal text-muted-foreground">متوسط {a.days} يوم</span></span>
            </li>
          ))}
        </ul>
      </div>
    )
  }
}

/**
 * The gauges answer "in school or not": a latecomer attended, and إذن is an
 * excused absence. This strip breaks those two totals back into the four
 * statuses a teacher actually records, so the counts reconcile on screen.
 */
function AttendanceBreakdown({ day }: { day: DailyTrendPoint }) {
  if (!day.attTotal) return null

  const parts = [
    { label: 'حاضر', value: day.present, bar: 'bg-emerald-500', dot: 'bg-emerald-500', group: 'حضور' },
    { label: 'متأخر', value: day.late, bar: 'bg-amber-400', dot: 'bg-amber-400', group: 'حضور' },
    { label: 'إذن (غياب بعذر)', value: day.excused, bar: 'bg-blue-400', dot: 'bg-blue-400', group: 'غياب' },
    { label: 'غائب', value: day.absent, bar: 'bg-rose-500', dot: 'bg-rose-500', group: 'غياب' },
  ]
  const percents = wholePercents(parts.map((p) => p.value), day.attTotal)

  return (
    <div className="rounded-2xl border border-border bg-muted/20 p-4 space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold">تفصيل الحضور</h3>
        <p className="text-xs text-muted-foreground">
          حضور ({day.present} + {day.late} = {day.inSchool}) + غياب ({day.absent} + {day.excused} = {day.outOfSchool})
          {' '}= {day.attTotal} طالب مسجَّل
        </p>
      </div>

      <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
        {parts.map((p) => (
          <div key={p.label} className={`h-full ${p.bar}`} style={{ width: `${(p.value / day.attTotal) * 100}%` }} />
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {parts.map((p, i) => (
          <div key={p.label} className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
            <span className={`size-2.5 shrink-0 rounded-full ${p.dot}`} />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground truncate">
                {p.label} <span className="opacity-60">· ضمن ال{p.group}</span>
              </p>
              <p className="text-sm font-bold tabular-nums">
                {p.value} <span className="text-xs font-medium text-muted-foreground">({percents[i]}%)</span>
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** A count with its share, or a dash when that teacher rated nobody. */
function DetailCell({ good, bad, pct }: { good: number; bad: number; pct: number | null }) {
  if (pct == null) return <span className="text-muted-foreground">—</span>
  const tone = pct >= 90 ? 'text-emerald-600' : pct >= 70 ? 'text-amber-600' : 'text-rose-600'
  return (
    <span className="whitespace-nowrap">
      <span className={`font-bold ${tone}`}>{pct}%</span>
      <span className="text-muted-foreground text-[11px]"> ({good}/{good + bad})</span>
    </span>
  )
}

/**
 * The point of splitting the register from the lesson rows: a pupil can bring
 * their tools to maths and forget them in science, and here both show. Every
 * line is one teacher's own reading of one class, never merged with anyone
 * else's.
 */
function SubjectBreakdown({
  subjects,
  homeworkEnabled,
  materialsEnabled,
  participationEnabled,
  behaviorEnabled,
}: {
  subjects: SubjectStat[]
  homeworkEnabled: boolean
  materialsEnabled: boolean
  participationEnabled: boolean
  behaviorEnabled: boolean
}) {
  const totalEntries = subjects.reduce((sum, s) => sum + s.entries, 0)

  return (
    <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
          <Layers3 className="size-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold">التفصيل حسب المادة والمعلم</h2>
          <p className="text-sm text-muted-foreground">
            {subjects.length
              ? `${subjects.length} سجل تدريس · ${totalEntries} تقييم طالب`
              : 'لا توجد تقييمات مسجَّلة في هذا اليوم'}
          </p>
        </div>
      </div>

      {subjects.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          سيظهر هنا كل معلم دخل الفصل وما سجّله، مادةً مادة.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead className="bg-muted text-muted-foreground text-xs font-semibold">
              <tr>
                <th className="px-3 py-3">المادة / المعلم</th>
                <th className="px-3 py-3">الفصل</th>
                <th className="px-3 py-3 text-center">طلاب</th>
                {homeworkEnabled && <th className="px-3 py-3 text-center">الواجب</th>}
                {materialsEnabled && <th className="px-3 py-3 text-center">الأدوات</th>}
                {participationEnabled && <th className="px-3 py-3 text-center">المشاركة</th>}
                {behaviorEnabled && <th className="px-3 py-3 text-center">السلوك</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {subjects.map((s) => (
                <tr key={s.key} className="hover:bg-muted/30 transition-colors">
                  <td className="px-3 py-3">
                    <p className="font-bold">{s.subjectName ?? 'بدون مادة محددة'}</p>
                    <p className="text-xs text-muted-foreground">{s.teacherName ?? 'معلم غير معروف'}</p>
                  </td>
                  <td className="px-3 py-3 text-muted-foreground whitespace-nowrap">
                    {s.gradeName ? `${s.gradeName} — ` : ''}{s.className ?? '—'}
                  </td>
                  <td className="px-3 py-3 text-center font-semibold tabular-nums">{s.entries}</td>
                  {homeworkEnabled && (
                    <td className="px-3 py-3 text-center">
                      <DetailCell good={s.homeworkDone} bad={s.homeworkMissing} pct={s.homeworkPct} />
                    </td>
                  )}
                  {materialsEnabled && (
                    <td className="px-3 py-3 text-center">
                      <DetailCell good={s.materialsBrought} bad={s.materialsMissing} pct={s.materialsPct} />
                    </td>
                  )}
                  {participationEnabled && (
                    <td className="px-3 py-3 text-center">
                      <DetailCell good={s.participationActive} bad={s.participationInactive} pct={s.participationPct} />
                    </td>
                  )}
                  {behaviorEnabled && (
                    <td className="px-3 py-3 text-center">
                      <DetailCell good={s.behaviorGood} bad={s.behaviorIssue} pct={s.behaviorPct} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
  materialsEnabled,
  behaviorEnabled,
  trend,
  byClassHistory,
  subjectHistory,
}: {
  attendanceEnabled: boolean
  homeworkEnabled: boolean
  participationEnabled: boolean
  materialsEnabled: boolean
  behaviorEnabled: boolean
  trend: DailyTrendPoint[]
  byClassHistory: ClassHistoryDay[]
  subjectHistory: SubjectHistoryDay[]
}) {
  const maxOffset = Math.min(MAX_DAYS_BACK, trend.length - 1)
  const [dayOffset, setDayOffset] = useState(0)

  if (!attendanceEnabled && !homeworkEnabled && !participationEnabled && !materialsEnabled && !behaviorEnabled) {
    return null
  }

  const selectedIndex = trend.length - 1 - dayOffset
  const today = trend[selectedIndex]

  const historyMap = new Map(byClassHistory.map((d) => [d.date, d.classes]))
  const byClass = historyMap.get(today.date) ?? []
  const subjectMap = new Map(subjectHistory.map((d) => [d.date, d.subjects]))
  const bySubject = subjectMap.get(today.date) ?? []

  const dayLabel = dayOffsetLabel(dayOffset)
  const gauges: React.ReactNode[] = []
  if (attendanceEnabled) {
    gauges.push(
      <RadialGauge
        key="attendance"
        value={today.attendancePct}
        label={`نسبة الحضور — ${dayLabel}`}
        sublabel={
          today.attTotal
            ? `${today.inSchool} من ${today.attTotal} في المدرسة (حاضر ${today.present} + متأخر ${today.late})`
            : 'لا بيانات مسجلة'
        }
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
        sublabel={
          today.attTotal
            ? `${today.outOfSchool} من ${today.attTotal} غائب (بدون عذر ${today.absent} + بعذر ${today.excused})`
            : 'لا بيانات مسجلة'
        }
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
        sublabel={hwTotal ? `${today.homeworkDone} من ${hwTotal} تسجيل` : 'لا بيانات مسجلة'}
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
        sublabel={partTotal ? `${today.participationActive} من ${partTotal} تسجيل` : 'لا بيانات مسجلة'}
        icon={Activity}
        gradientId="gauge-participation"
        colorFrom="#a78bfa"
        colorTo="#7c3aed"
        glow="rgba(124,58,237,0.5)"
      />
    )
  }

  if (materialsEnabled) {
    const matTotal = today.materialsBrought + today.materialsMissing
    gauges.push(
      <RadialGauge
        key="materials"
        value={today.materialsPct}
        label={`إحضار الأدوات — ${dayLabel}`}
        sublabel={matTotal ? `${today.materialsBrought} من ${matTotal} تسجيل` : 'لا بيانات مسجلة'}
        icon={Backpack}
        gradientId="gauge-materials"
        colorFrom="#fb923c"
        colorTo="#ea580c"
        glow="rgba(234,88,12,0.5)"
      />
    )
  }
  if (behaviorEnabled) {
    const behTotal = today.behaviorGood + today.behaviorIssue
    gauges.push(
      <RadialGauge
        key="behavior"
        value={today.behaviorPct}
        label={`السلوك — ${dayLabel}`}
        sublabel={behTotal ? `${today.behaviorGood} من ${behTotal} تسجيل` : 'لا بيانات مسجلة'}
        icon={Smile}
        gradientId="gauge-behavior"
        colorFrom="#38bdf8"
        colorTo="#0284c7"
        glow="rgba(2,132,199,0.5)"
      />
    )
  }

  const series: TrendSeries[] = []
  if (attendanceEnabled) {
    series.push({ key: 'attendancePct', flag: 'hasAttendance', label: 'الحضور', color: '#059669' })
    series.push({ key: 'absencePct', flag: 'hasAttendance', label: 'الغياب', color: '#e11d48' })
  }
  if (homeworkEnabled) series.push({ key: 'homeworkPct', flag: 'hasHomework', label: 'إنجاز الواجب', color: '#d97706' })
  if (materialsEnabled) series.push({ key: 'materialsPct', flag: 'hasMaterials', label: 'الأدوات', color: '#ea580c' })
  if (participationEnabled) series.push({ key: 'participationPct', flag: 'hasParticipation', label: 'المشاركة', color: '#7c3aed' })
  if (behaviorEnabled) series.push({ key: 'behaviorPct', flag: 'hasBehavior', label: 'السلوك', color: '#0284c7' })

  const rankedClasses = [...byClass].sort((a, b) => {
    // A class with no record yet is not a 0% class — it has no number at all,
    // so it can't be ranked as the worst performer. It goes to the end.
    if (a.recorded !== b.recorded) return a.recorded ? -1 : 1
    if (attendanceEnabled) return a.attendancePct - b.attendancePct
    if (homeworkEnabled) return a.homeworkPct - b.homeworkPct
    return a.participationPct - b.participationPct
  })
  const recordedCount = byClass.filter((c) => c.recorded).length

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

          {attendanceEnabled && <AttendanceBreakdown day={today} />}

          <div className="pt-2 border-t border-border">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold">اتجاه آخر 14 يوماً — على مستوى المدرسة</h3>
            </div>
            <TrendChart trend={trend} series={series} highlightIndex={selectedIndex} />
          </div>
        </div>
      </div>

      <SubjectBreakdown
        subjects={bySubject}
        homeworkEnabled={homeworkEnabled}
        materialsEnabled={materialsEnabled}
        participationEnabled={participationEnabled}
        behaviorEnabled={behaviorEnabled}
      />

      <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
        <div>
          <h2 className="text-lg font-bold">
            مقارنة الفصول — {dayOffsetLabel(dayOffset)}
          </h2>
          <p className="text-sm text-muted-foreground">
            الفصول الأقل نسبة تظهر أولاً لسهولة المتابعة · سُجِّل {recordedCount} من {byClass.length} فصلاً
          </p>
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
                    {!cls.recorded ? (
                      // Printing "حضور 0%" here stated something the register never said.
                      <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-muted text-muted-foreground border border-border">
                        بانتظار تسجيل المعلم
                      </span>
                    ) : (
                      <>
                        {attendanceEnabled && (
                          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                            حضور {cls.inSchool}/{cls.attTotal} ({cls.attendancePct}%)
                          </span>
                        )}
                        {homeworkEnabled && cls.lessonEntries > 0 && (
                          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-100">
                            واجب {cls.homeworkPct}%
                          </span>
                        )}
                        {materialsEnabled && cls.lessonEntries > 0 && (
                          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-orange-50 text-orange-700 border border-orange-100">
                            أدوات {cls.materialsPct}%
                          </span>
                        )}
                        {participationEnabled && cls.lessonEntries > 0 && (
                          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 border border-violet-100">
                            مشاركة {cls.participationPct}%
                          </span>
                        )}
                        {cls.teacherCount > 0 && (
                          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-muted text-muted-foreground border border-border">
                            {cls.teacherCount} معلم سجّل
                          </span>
                        )}
                      </>
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
