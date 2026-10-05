'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ChevronDown } from 'lucide-react'
import { closedTodayHeading, isWeeklyRest } from '@/lib/school-days'

type ClassCard = {
  id: string
  name: string
  studentCount: number
  /** What this teacher teaches in the class. */
  subjects: string[]
  recordedToday: boolean
  offToday: string | null
  /** «الحصة الثانية · رياضيات» — what the timetable gives this teacher in the class today, when it gives anything. */
  lessonsToday: string | null
  /**
   * The timetable governs and holds no lesson of this teacher's in the class
   * today. Kept apart from today's classes: still theirs to open, but not
   * offered as today's work. Decided on the server (../today-lessons).
   */
  notToday: boolean
}

type GradeWithClasses = {
  id: string
  name: string
  classes: ClassCard[]
}

export default function GradeSelector({ grades }: { grades: GradeWithClasses[] }) {
  const searchParams = useSearchParams()
  const asked = searchParams.get('grade')

  // Without a stage asked for, open on the first one that has a class today:
  // a teacher of two stages should not land on the one with nothing in it.
  const [selectedGradeId, setSelectedGradeId] = useState<string | null>(
    (asked && grades.some((g) => g.id === asked)
      ? asked
      : (grades.find((g) => g.classes.some((c) => !c.notToday)) ?? grades[0])?.id) ?? null,
  )
  /** The class whose already-sent register the teacher is about to reopen. */
  const [confirmEdit, setConfirmEdit] = useState<{ id: string; name: string } | null>(null)
  const [showRest, setShowRest] = useState(false)

  const selectedGrade = grades.find((g) => g.id === selectedGradeId)
  const todays = selectedGrade?.classes.filter((c) => !c.notToday) ?? []
  const rest = selectedGrade?.classes.filter((c) => c.notToday) ?? []

  return (
    <div className="space-y-8">
      {/* One stage needs no choosing. */}
      {grades.length > 1 && (
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-4">اختر المرحلة</h2>
          <div className="flex flex-wrap gap-4">
            {grades.map((grade) => {
              const today = grade.classes.filter((c) => !c.notToday).length
              return (
                <button
                  key={grade.id}
                  onClick={() => { setSelectedGradeId(grade.id); setShowRest(false) }}
                  className={`px-6 py-3 rounded-2xl border font-semibold transition-all ${
                    selectedGradeId === grade.id
                      ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                      : 'bg-card text-foreground border-border hover:bg-muted'
                  }`}
                >
                  <div className="text-base">{grade.name}</div>
                  <div className={`text-xs mt-1 ${selectedGradeId === grade.id ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                    {today === grade.classes.length ? `${grade.classes.length} فصول` : `${today} اليوم من ${grade.classes.length}`}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {selectedGrade && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 space-y-8">
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-4">
              {rest.length > 0 ? `حصص اليوم — ${selectedGrade.name}` : `فصول ${selectedGrade.name}`}
            </h2>

            {todays.length === 0 ? (
              <div className="text-center p-8 bg-card rounded-2xl border border-border">
                <p className="text-muted-foreground">لا حصص لك اليوم في هذه المرحلة حسب الجدول</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {todays.map((cls) => (
                  <div key={cls.id} className="bg-card border border-border p-6 rounded-2xl flex flex-col">
                    <div className="flex justify-between items-start mb-3">
                      <h3 className="text-xl font-bold text-foreground">{cls.name}</h3>
                      <span className="bg-muted text-muted-foreground text-xs px-2.5 py-1 rounded-full font-medium">
                        {cls.studentCount} طالب
                      </span>
                    </div>

                    {/* The lesson, when the timetable names it; otherwise what this teacher teaches here. */}
                    <p className="text-sm font-semibold text-foreground/80 leading-6">
                      {cls.lessonsToday ?? (cls.subjects.length ? cls.subjects.join('، ') : '')}
                    </p>

                    <p className={`mt-2 mb-4 text-xs font-semibold ${cls.offToday ? 'text-muted-foreground' : cls.recordedToday ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {cls.offToday
                        ? (isWeeklyRest(cls.offToday) ? `${closedTodayHeading(cls.offToday)} — لا تسجيل` : closedTodayHeading(cls.offToday))
                        : cls.recordedToday ? '✓ سجّلته اليوم' : '• لم تسجّله اليوم بعد'}
                    </p>

                    <div className="mt-auto">
                      {cls.recordedToday && !cls.offToday ? (
                        <button
                          onClick={() => setConfirmEdit({ id: cls.id, name: cls.name })}
                          className="block w-full text-center bg-amber-500 text-white py-2.5 rounded-xl font-semibold hover:bg-amber-600 transition-colors"
                        >
                          تعديل
                        </button>
                      ) : (
                        <Link
                          href={`/teacher/classes/${cls.id}`}
                          className="block w-full text-center bg-primary text-primary-foreground py-2.5 rounded-xl font-semibold hover:bg-primary/90 transition-colors"
                        >
                          فتح
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Not today's work, so not laid out as work: folded, and a card
              here never says «لم تسجّله اليوم بعد» — there was nothing to
              record. It is here for the day that was left unfinished. */}
          {rest.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowRest((v) => !v)}
                aria-expanded={showRest}
                className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-muted/40 px-4 py-3 text-right min-h-12"
              >
                <span>
                  <span className="block text-sm font-bold">فصول ليست في جدول اليوم ({rest.length})</span>
                  <span className="block text-xs text-muted-foreground mt-0.5">لا حصة لك فيها اليوم — افتحها إن احتجت إكمال يوم سابق</span>
                </span>
                <ChevronDown className={`size-5 shrink-0 text-muted-foreground transition-transform ${showRest ? 'rotate-180' : ''}`} />
              </button>

              {showRest && (
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {rest.map((cls) => (
                    <div key={cls.id} className="bg-card border border-border p-6 rounded-2xl flex flex-col">
                      <div className="flex justify-between items-start mb-3">
                        <h3 className="text-xl font-bold text-foreground">{cls.name}</h3>
                        <span className="bg-muted text-muted-foreground text-xs px-2.5 py-1 rounded-full font-medium">
                          {cls.studentCount} طالب
                        </span>
                      </div>
                      {cls.subjects.length > 0 && (
                        <p className="text-sm font-semibold text-foreground/80 leading-6">{cls.subjects.join('، ')}</p>
                      )}
                      <p className="mt-2 mb-4 text-xs text-muted-foreground">لا حصة لك فيه اليوم حسب الجدول</p>
                      <div className="mt-auto">
                        <Link
                          href={`/teacher/classes/${cls.id}`}
                          className="block w-full text-center bg-muted text-foreground py-2.5 rounded-xl font-semibold hover:bg-muted/70 transition-colors"
                        >
                          فتح
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {confirmEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-card border border-border p-6 shadow-xl">
            <h3 className="text-lg font-bold mb-2">تعديل سجل {confirmEdit.name}</h3>
            <p className="text-sm text-muted-foreground leading-7 mb-4">
              هذا الفصل سُجِّل اليوم بالفعل، وما فيه وصل إلى أولياء الأمور ودخل في إحصاءات
              المدرسة. أي تغيير تحفظه سيحدّثهما معاً، والنقاط تبقى محسوبة مرة واحدة لليوم.
            </p>
            <div className="flex gap-2">
              <Link
                href={`/teacher/classes/${confirmEdit.id}`}
                className="flex-1 text-center py-3 rounded-xl bg-primary text-primary-foreground font-bold"
              >فتح للتعديل</Link>
              <button onClick={() => setConfirmEdit(null)} className="px-5 py-3 rounded-xl bg-muted font-semibold">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
