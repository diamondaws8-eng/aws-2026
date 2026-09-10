'use client'

import { useState } from 'react'
import { EmptyState } from '@/components/empty-state'
import { rankWithTies } from '@/lib/ranking'
import { Trophy, Medal, Star, Crown } from 'lucide-react'

type LeaderboardStudent = {
  id: string
  name: string
  classId: string | null
  className: string | null
  totalPoints: number
}

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
  students: LeaderboardStudent[]
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

  // Ranked with ties before the cut, so two pupils on the same score share a
  // place instead of one of them being "11th" and dropped.
  const filteredStudents = rankWithTies(
    students.filter(s => selectedClass === 'all' || s.classId === selectedClass),
  ).slice(0, 10)

  const maxPoints = filteredStudents.length > 0 ? filteredStudents[0].totalPoints : 0

  return (
    <div className="relative overflow-hidden bg-card border border-border rounded-2xl p-6 flex flex-col min-h-[400px] max-h-[500px]">
      <div className="absolute -top-16 -right-14 size-48 rounded-full bg-amber-400/10 blur-3xl pointer-events-none" />
      <div className="relative flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-3">
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

      {/* Lesson points scale with how many teachers record a class: a pupil
          with eight subjects can out-score a better pupil with one. A
          school-wide list is still wanted, but it must say what it compares. */}
      {selectedClass === 'all' && (
        <p className="relative -mt-3 mb-3 text-[11px] text-muted-foreground">
          الترتيب على مستوى المدرسة يتأثر بعدد المواد المسجَّلة لكل فصل — للمقارنة العادلة اختر فصلاً واحداً.
        </p>
      )}

      {filteredStudents.length > 0 ? (
        <div className="relative space-y-2.5 flex-1 overflow-y-auto pr-2">
          {filteredStudents.map((student) => {
            const isFirst = student.rank === 1
            const isSecond = student.rank === 2
            const isThird = student.rank === 3
            const barPct = maxPoints > 0 ? Math.max((student.totalPoints / maxPoints) * 100, 4) : 0

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
                      {selectedClass === 'all' && student.className && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {student.className}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className={`font-black flex items-center gap-1 ${
                    isFirst ? 'text-amber-600' :
                    isSecond ? 'text-slate-600' :
                    isThird ? 'text-orange-600' :
                    'text-primary'
                  }`}>
                    {student.totalPoints}
                    <Star className="w-4 h-4 fill-current" />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <EmptyState
          title="لا يوجد بيانات"
          description="لم يحصل أي طالب على نقاط بعد"
          icon={Medal}
        />
      )}
    </div>
  )
}
