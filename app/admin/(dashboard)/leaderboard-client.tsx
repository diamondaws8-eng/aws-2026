'use client'

import { useState } from 'react'
import { EmptyState } from '@/components/empty-state'
import { rankWithTies, LEADERBOARD_PERIODS, MIN_LESSONS_FOR_SCHOOL_RANK, type LeaderboardPeriod } from '@/lib/ranking'
import type { LeaderboardRow } from '@/lib/points'
import { Trophy, Medal, Star, Crown } from 'lucide-react'

type ClassInfo = {
  id: string
  name: string
}

export function LeaderboardClient({
  students,
  classes,
  title = 'لوحة الشرف (أعلى 10)',
  allLabel = 'المدرسة بالكامل',
  showAll = true,
  defaultClassId,
}: {
  students: LeaderboardRow[]
  classes: ClassInfo[]
  title?: string
  /** What the "everything" option is called — a teacher's is "كل فصولي". */
  allLabel?: string
  /** A teacher with one class has nothing to combine; hide the option. */
  showAll?: boolean
  defaultClassId?: string
}) {
  const [selectedClass, setSelectedClass] = useState<string>(
    defaultClassId && classes.some((c) => c.id === defaultClassId) ? defaultClassId : showAll ? 'all' : (classes[0]?.id ?? 'all'),
  )
  const [period, setPeriod] = useState<LeaderboardPeriod>('year')

  const schoolWide = selectedClass === 'all'
  const inScope = students.filter((s) => schoolWide || s.classId === selectedClass)

  // Inside one class every pupil had the same lessons, so raw points compare
  // fairly. Across classes they do not — a pupil with six teachers recording
  // has six chances a day where another has one — so the school-wide list
  // ranks by the share of the points that were possible.
  const keyed = inScope.map((s) => {
    const stat = s.periods[period]
    return { ...s, stat, totalPoints: schoolWide ? (stat.pct ?? Number.NEGATIVE_INFINITY) : stat.points }
  })
  // School-wide, a share needs a sample behind it (see MIN_LESSONS_FOR_SCHOOL_RANK).
  const eligible = schoolWide ? keyed.filter((s) => s.stat.lessons >= MIN_LESSONS_FOR_SCHOOL_RANK) : keyed
  const tooFew = keyed.length - eligible.length
  const scoring = eligible.filter((s) => s.totalPoints > 0)
  const ranked = rankWithTies(scoring).slice(0, 10)
  const notShown = eligible.length - scoring.length
  const maxKey = ranked.length > 0 ? ranked[0].totalPoints : 0

  return (
    <div className="relative overflow-hidden bg-card border border-border rounded-2xl p-6 flex flex-col min-h-[400px] max-h-[560px]">
      <div className="absolute -top-16 -right-14 size-48 rounded-full bg-amber-400/10 blur-3xl pointer-events-none" />
      <div className="relative flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
            <Trophy className="w-4.5 h-4.5" />
          </div>
          {title}
        </h2>

        <select
          value={selectedClass}
          onChange={(e) => setSelectedClass(e.target.value)}
          className="p-2 text-sm rounded-xl border border-border bg-muted outline-none focus:ring-2 focus:ring-primary min-w-[150px]"
        >
          {showAll && <option value="all">{allLabel}</option>}
          {classes.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* A board that only ever counts the whole year freezes by the second
          month: the same names at the top, and nothing a pupil does this week
          can move them. The short windows are what keep a class trying. */}
      <div className="relative flex flex-wrap items-center gap-1.5 mb-3">
        {LEADERBOARD_PERIODS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setPeriod(p.key)}
            className={`rounded-full px-3 py-2.5 sm:py-1.5 min-h-10 sm:min-h-0 text-xs font-semibold transition-colors ${
              period === p.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {schoolWide && (
        <p className="relative mb-3 text-[11px] text-muted-foreground">
          على مستوى المدرسة يُرتَّب بنسبة النقاط من الممكن، لا بالنقاط الخام — حتى لا يتقدم فصل بكثرة مواده على فصل بقلّتها.
        </p>
      )}

      {ranked.length > 0 ? (
        <div className="relative space-y-2.5 flex-1 overflow-y-auto pr-2">
          {ranked.map((student) => {
            const isFirst = student.rank === 1
            const isSecond = student.rank === 2
            const isThird = student.rank === 3
            const barPct = maxKey > 0 ? Math.max((student.totalPoints / maxKey) * 100, 4) : 0

            return (
              <div
                key={student.id}
                className={`relative overflow-hidden p-3 rounded-xl border transition-all ${
                  isFirst ? 'bg-gradient-to-l from-amber-50 to-amber-50/30 dark:from-amber-950/30 dark:to-transparent border-amber-200 shadow-sm' :
                  isSecond ? 'bg-gradient-to-l from-slate-50 to-slate-50/30 dark:from-slate-900/40 dark:to-transparent border-slate-200' :
                  isThird ? 'bg-gradient-to-l from-orange-50 to-orange-50/30 dark:from-orange-950/30 dark:to-transparent border-orange-200' :
                  'bg-card border-border hover:bg-muted/50'
                }`}
              >
                <div
                  className={`absolute inset-y-0 right-0 -z-0 ${
                    isFirst ? 'bg-amber-400/10' : isSecond ? 'bg-slate-400/10' : isThird ? 'bg-orange-400/10' : 'bg-primary/5'
                  }`}
                  style={{ width: `${barPct}%` }}
                />
                <div className="relative flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`relative w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                      isFirst ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400' :
                      isSecond ? 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300' :
                      isThird ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-400' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {isFirst ? <Crown className="w-4 h-4" /> : student.rank}
                    </div>
                    <div>
                      <div className={`font-bold ${isFirst ? 'text-amber-900 dark:text-amber-400' : ''}`}>
                        {student.name}
                      </div>
                      {schoolWide && student.className && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {student.className}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className={`text-left ${
                    isFirst ? 'text-amber-600' :
                    isSecond ? 'text-slate-600' :
                    isThird ? 'text-orange-600' :
                    'text-primary'
                  }`}>
                    {schoolWide ? (
                      <>
                        <div className="font-black">{student.stat.pct}%</div>
                        <div className="text-[11px] text-muted-foreground">{student.stat.points} من {student.stat.possible} نقطة</div>
                      </>
                    ) : (
                      <div className="font-black flex items-center gap-1">
                        {student.stat.points}
                        <Star className="w-4 h-4 fill-current" />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <EmptyState
          title="لا يوجد بيانات"
          description={period === 'year' ? 'لم يحصل أي طالب على نقاط موجبة بعد' : 'لا نقاط موجبة في هذه المدة'}
          icon={Medal}
        />
      )}

      {/* Said out loud rather than dropped: a class where nobody has a positive
          score is a class where nothing was recorded, and that is worth seeing. */}
      {(notShown > 0 || tooFew > 0) && (
        <p className="relative mt-3 text-[11px] text-muted-foreground">
          {notShown > 0 && <>{notShown} من {inScope.length} طالباً بلا نقاط موجبة في هذه المدة — لا يظهرون في القائمة.</>}
          {notShown > 0 && tooFew > 0 && ' '}
          {tooFew > 0 && <>{tooFew} لم يكتمل نصابهم بعد (أقل من {MIN_LESSONS_FOR_SCHOOL_RANK} حصص مسجَّلة) فلا يُرتَّبون على مستوى المدرسة.</>}
        </p>
      )}
    </div>
  )
}
