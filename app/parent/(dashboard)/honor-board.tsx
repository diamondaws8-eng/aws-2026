'use client'

import { useState } from 'react'
import { Trophy } from 'lucide-react'
import { rankWithTies, medalFor, LEADERBOARD_PERIODS, type LeaderboardPeriod } from '@/lib/ranking'
import type { LeaderboardRow } from '@/lib/points'

const TOP = 5

/**
 * The class honour board as a family sees it: the top five by name, and their
 * own child's place always — never anyone else's place below the top. An
 * honour board celebrates; a full ranking in every home would shame the
 * pupils at the bottom in front of every family in the class.
 */
export function HonorBoard({
  rows,
  childId,
  childFirstName,
  classSize,
}: {
  /** Every active pupil in the class, as the leaderboard returns them. */
  rows: LeaderboardRow[]
  childId: string
  childFirstName: string
  classSize: number
}) {
  const [period, setPeriod] = useState<LeaderboardPeriod>('year')

  if (rows.length === 0) return null

  // Inside one class every pupil had the same lessons, so raw points are the
  // fair measure here.
  const scoring = rows
    .map((r) => ({ ...r, totalPoints: r.periods[period].points }))
    .filter((r) => r.totalPoints > 0)
  const ranked = rankWithTies(scoring)
  const top = ranked.slice(0, TOP)
  const mine = ranked.find((r) => r.id === childId)
  // A child with no positive score is not on the list at all; they sit behind
  // everyone who is, tied with the rest of the class on nothing.
  const myRank = mine?.rank ?? ranked.length + 1
  const myPoints = mine?.totalPoints ?? rows.find((r) => r.id === childId)?.periods[period].points ?? 0
  const above = mine ? ranked.filter((r) => r.rank < mine.rank).pop() : ranked[ranked.length - 1]
  const gap = above ? above.totalPoints - myPoints : 0

  return (
    <div className="bg-card border border-border rounded-3xl p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="font-bold text-lg flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
            <Trophy className="size-4" />
          </span>
          لوحة شرف الفصل
        </h2>
        <span className="text-xs text-muted-foreground">أعلى {Math.min(TOP, top.length)} من {classSize} طالباً</span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mb-4">
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

      {top.length === 0 ? (
        <p className="rounded-xl bg-muted/50 p-4 text-sm text-muted-foreground text-center">
          لا نقاط موجبة في هذه المدة بعد.
        </p>
      ) : (
        <div className="space-y-2">
          {top.map((r) => {
            const isMine = r.id === childId
            return (
              <div
                key={r.id}
                className={`flex items-center justify-between rounded-xl border px-3 py-2.5 ${
                  isMine ? 'border-primary/40 bg-primary/5' : 'border-border'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-7 text-center text-lg">{medalFor(r.rank) ?? <span className="text-sm text-muted-foreground">{r.rank}</span>}</span>
                  <span className={`truncate text-sm ${isMine ? 'font-bold' : 'font-semibold'}`}>
                    {r.name}
                    {isMine && <span className="text-xs text-primary font-bold"> — ابنك</span>}
                  </span>
                </div>
                <span className="text-sm font-black text-primary shrink-0">+{r.totalPoints}</span>
              </div>
            )
          })}
        </div>
      )}

      {top.length > 0 && (!mine || mine.rank > TOP) && (
        <div className="mt-3 rounded-xl bg-muted/50 p-3 text-sm">
          <span className="font-bold">ترتيب {childFirstName}: {myRank} من {classSize}</span>
          <span className="text-muted-foreground"> · {myPoints > 0 ? '+' : ''}{myPoints} نقطة</span>
          {gap > 0 && (
            <span className="block text-xs text-muted-foreground mt-1">
              يفصله {gap} نقطة عن المركز الذي قبله.
            </span>
          )}
        </div>
      )}

      <p className="mt-3 text-[11px] text-muted-foreground">
        تُعرض أسماء الأوائل فقط. «العام» يُحسب من بداية العام الدراسي.
      </p>
    </div>
  )
}
