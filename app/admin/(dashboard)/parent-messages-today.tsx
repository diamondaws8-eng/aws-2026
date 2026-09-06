'use client'

import { useMemo, useState } from 'react'
import { EmptyState } from '@/components/empty-state'
import { BookOpen, MessageCircle, ThumbsDown, ThumbsUp } from 'lucide-react'

type ClassStat = {
  id: string
  name: string
  gradeName: string | null
  positive: number
  negative: number
}

function DonutChart({
  positive,
  negative,
  size = 188,
  id,
}: {
  positive: number
  negative: number
  size?: number
  id: string
}) {
  const total = positive + negative
  const stroke = 22
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const posLen = total === 0 ? 0 : (positive / total) * c
  const negLen = total === 0 ? 0 : (negative / total) * c
  const gap = total === 0 ? 0 : Math.min(6, c * 0.02)
  const posId = `${id}-pos`
  const negId = `${id}-neg`

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <defs>
          <linearGradient id={posId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#34d399" />
            <stop offset="100%" stopColor="#059669" />
          </linearGradient>
          <linearGradient id={negId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fb7185" />
            <stop offset="100%" stopColor="#e11d48" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          className="text-muted"
          strokeWidth={stroke}
        />
        {total > 0 && (
          <>
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={`url(#${posId})`}
              strokeWidth={stroke}
              strokeDasharray={`${Math.max(posLen - gap, 0)} ${c}`}
              strokeLinecap="round"
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={`url(#${negId})`}
              strokeWidth={stroke}
              strokeDasharray={`${Math.max(negLen - gap, 0)} ${c}`}
              strokeDashoffset={-(posLen + (posLen > 0 ? gap : 0))}
              strokeLinecap="round"
            />
          </>
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold tracking-tight">{total}</span>
        <span className="text-xs text-muted-foreground mt-0.5">إجمالي الطلاب</span>
      </div>
    </div>
  )
}

function StackedBar({
  positive,
  negative,
  max,
}: {
  positive: number
  negative: number
  max: number
}) {
  const width = max === 0 ? 0 : ((positive + negative) / max) * 100
  const posPct = positive + negative === 0 ? 0 : (positive / (positive + negative)) * 100

  return (
    <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
      <div className="h-full flex rounded-full overflow-hidden" style={{ width: `${width}%` }}>
        <div className="h-full bg-gradient-to-l from-emerald-500 to-emerald-400" style={{ width: `${posPct}%` }} />
        <div className="h-full flex-1 bg-gradient-to-l from-rose-500 to-rose-400" />
      </div>
    </div>
  )
}

export function ParentMessagesToday({
  classStats,
  todayPositive,
  todayNegative,
}: {
  classStats: ClassStat[]
  todayPositive: number
  todayNegative: number
}) {
  const [selectedClassId, setSelectedClassId] = useState(classStats[0]?.id ?? '')

  const selected = useMemo(
    () => classStats.find((cls) => cls.id === selectedClassId) ?? classStats[0],
    [classStats, selectedClassId]
  )

  const maxClassTotal = Math.max(...classStats.map((cls) => cls.positive + cls.negative), 1)
  const schoolTotal = todayPositive + todayNegative
  const posShare = schoolTotal === 0 ? 0 : Math.round((todayPositive / schoolTotal) * 100)
  const negShare = schoolTotal === 0 ? 0 : 100 - posShare
  const selectedTotal = selected ? selected.positive + selected.negative : 0
  const selectedPosShare = selectedTotal === 0 ? 0 : Math.round((selected.positive / selectedTotal) * 100)
  const selectedNegShare = selectedTotal === 0 ? 0 : 100 - selectedPosShare

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card">
        <div className="absolute -top-20 -left-16 size-56 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="absolute -bottom-24 -right-10 size-56 rounded-full bg-rose-400/10 blur-3xl" />
        <div className="relative p-6 space-y-6">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
              <MessageCircle className="size-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold">رسائل أولياء الأمور اليوم — كل الفصول</h2>
              <p className="text-sm text-muted-foreground">توزيع الرسائل الإيجابية والسلبية على مستوى المدرسة</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-8 items-center">
            <DonutChart id="school" positive={todayPositive} negative={todayNegative} />
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/70 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-emerald-800">رسائل إيجابية</span>
                    <ThumbsUp className="size-4 text-emerald-600" />
                  </div>
                  <p className="mt-2 text-3xl font-bold text-emerald-700">{todayPositive}</p>
                  <p className="mt-1 text-xs text-emerald-700/80">
                    {schoolTotal === 0 ? 'لا رسائل اليوم' : `${posShare}% من رسائل اليوم`}
                  </p>
                </div>
                <div className="rounded-2xl border border-rose-200/70 bg-rose-50/70 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-rose-800">رسائل سلبية</span>
                    <ThumbsDown className="size-4 text-rose-600" />
                  </div>
                  <p className="mt-2 text-3xl font-bold text-rose-700">{todayNegative}</p>
                  <p className="mt-1 text-xs text-rose-700/80">
                    {schoolTotal === 0 ? 'لا رسائل اليوم' : `${negShare}% من رسائل اليوم`}
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>مقارنة الفصول</span>
                  <span>إيجابي / سلبي</span>
                </div>
                <div className="max-h-48 overflow-y-auto space-y-3 pr-1">
                  {classStats.length === 0 ? (
                    <p className="text-sm text-muted-foreground">لا توجد فصول لعرض المقارنة</p>
                  ) : (
                    classStats.map((cls) => (
                      <div key={cls.id} className="space-y-1.5">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium truncate">
                            {cls.gradeName ? `${cls.gradeName} — ` : ''}فصل {cls.name}
                          </span>
                          <span className="text-xs text-muted-foreground shrink-0">
                            <span className="text-emerald-600 font-semibold">{cls.positive}</span>
                            {' / '}
                            <span className="text-rose-600 font-semibold">{cls.negative}</span>
                          </span>
                        </div>
                        <StackedBar positive={cls.positive} negative={cls.negative} max={maxClassTotal} />
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h2 className="text-lg font-bold">رسائل أولياء الأمور اليوم — كل فصل</h2>
            <p className="text-sm text-muted-foreground">اختر الفصل لعرض الرسم البياني الخاص به</p>
          </div>
          {classStats.length > 0 && (
            <select
              value={selected?.id ?? ''}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="p-2 text-sm rounded-xl border border-border bg-muted outline-none focus:ring-2 focus:ring-primary min-w-[180px]"
            >
              {classStats.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.gradeName ? `${cls.gradeName} — ` : ''}فصل {cls.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {selected ? (
          <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-8 items-center">
            <DonutChart id="class" positive={selected.positive} negative={selected.negative} size={172} />
            <div className="space-y-5">
              <div>
                <p className="text-sm text-muted-foreground">{selected.gradeName ?? 'مرحلة غير معروفة'}</p>
                <p className="text-xl font-bold">فصل {selected.name}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4">
                  <p className="text-xs text-emerald-700">إيجابية</p>
                  <p className="mt-1 text-2xl font-bold text-emerald-700">{selected.positive}</p>
                </div>
                <div className="rounded-xl bg-rose-50 border border-rose-100 p-4">
                  <p className="text-xs text-rose-700">سلبية</p>
                  <p className="mt-1 text-2xl font-bold text-rose-700">{selected.negative}</p>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">نسبة الإيجابي</span>
                  <span className="font-semibold text-emerald-600">{selectedPosShare}%</span>
                </div>
                <div className="h-4 rounded-full bg-muted overflow-hidden flex">
                  <div
                    className="h-full bg-gradient-to-l from-emerald-500 to-emerald-400"
                    style={{ width: `${selectedPosShare}%` }}
                  />
                  <div
                    className="h-full bg-gradient-to-l from-rose-500 to-rose-400"
                    style={{ width: `${selectedNegShare}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <EmptyState title="لا توجد فصول" description="لم يتم إنشاء أي فصل دراسي بعد" icon={BookOpen} />
        )}
      </div>
    </div>
  )
}
