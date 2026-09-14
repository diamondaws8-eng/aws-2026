'use client'

import { useState } from 'react'
import { Trophy } from 'lucide-react'
import { medalFor, LEADERBOARD_PERIODS, type LeaderboardPeriod, type HonorBoardView } from '@/lib/ranking'

/**
 * The class honour board as a family sees it: the top five by name, and their
 * own child's place always — never anyone else's place below the top.
 *
 * The ranking and the cut both happen on the server (buildHonorBoards in
 * lib/ranking.ts). This component receives five names per period and nothing
 * else, so no other family's child is ever sent to this device.
 */
export function HonorBoard({
  boards,
  childFirstName,
  classSize,
}: {
  boards: Record<LeaderboardPeriod, HonorBoardView>
  childFirstName: string
  classSize: number
}) {
  const [period, setPeriod] = useState<LeaderboardPeriod>('year')
  const board = boards[period]
  if (!board) return null

  const { top, myRank, myPoints, gap, showMine } = board

  return (
    <div className="bg-card border border-border rounded-3xl p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="font-bold text-lg flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
            <Trophy className="size-4" />
          </span>
          لوحة شرف الفصل
        </h2>
        <span className="text-xs text-muted-foreground">أعلى {top.length} من {classSize} طالباً</span>
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
          {top.map((r, i) => (
            <div
              key={i}
              className={`flex items-center justify-between rounded-xl border px-3 py-2.5 ${
                r.isMine ? 'border-primary/40 bg-primary/5' : 'border-border'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-7 text-center text-lg">{medalFor(r.rank) ?? <span className="text-sm text-muted-foreground">{r.rank}</span>}</span>
                <span className={`truncate text-sm ${r.isMine ? 'font-bold' : 'font-semibold'}`}>
                  {r.name}
                  {r.isMine && <span className="text-xs text-primary font-bold"> — ابنك</span>}
                </span>
              </div>
              <span className="text-sm font-black text-primary shrink-0">+{r.points}</span>
            </div>
          ))}
        </div>
      )}

      {showMine && (
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
