import { Trophy } from 'lucide-react'
import { rankWithTies, medalFor } from '@/lib/ranking'
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
  /** Pupils with a positive score, as the leaderboard returns them. */
  rows: LeaderboardRow[]
  childId: string
  childFirstName: string
  classSize: number
}) {
  if (rows.length === 0) return null

  const ranked = rankWithTies(rows)
  const top = ranked.slice(0, TOP)
  const mine = ranked.find((r) => r.id === childId)
  // A child with no positive score is not on the list at all; they sit behind
  // everyone who is, tied with the rest of the class on nothing.
  const myRank = mine?.rank ?? ranked.length + 1
  const myPoints = mine?.totalPoints ?? 0
  const above = mine ? ranked.filter((r) => r.rank < mine.rank).pop() : ranked[ranked.length - 1]
  const gap = above ? above.totalPoints - myPoints : 0

  return (
    <div className="bg-card border border-border rounded-3xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-lg flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
            <Trophy className="size-4" />
          </span>
          لوحة شرف الفصل
        </h2>
        <span className="text-xs text-muted-foreground">أعلى {Math.min(TOP, top.length)} من {classSize} طالباً</span>
      </div>

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

      {(!mine || mine.rank > TOP) && (
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
        تُعرض أسماء الأوائل فقط، وتُحسب النقاط من بداية العام الدراسي.
      </p>
    </div>
  )
}
