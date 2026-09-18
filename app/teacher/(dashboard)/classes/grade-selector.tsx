'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

type GradeWithClasses = {
  id: string
  name: string
  orderIndex: number
  classes: { id: string; name: string; studentCount: number; recordedToday?: boolean; offToday?: string | null }[]
}

export default function GradeSelector({ grades }: { grades: GradeWithClasses[] }) {
  const searchParams = useSearchParams()
  const initialGrade = searchParams.get('grade')
  
  const [selectedGradeId, setSelectedGradeId] = useState<string | null>(
    initialGrade || (grades.length > 0 ? grades[0].id : null)
  )
  /** The class whose already-sent register the teacher is about to reopen. */
  const [confirmEdit, setConfirmEdit] = useState<{ id: string; name: string } | null>(null)

  const selectedGrade = grades.find(g => g.id === selectedGradeId)

  return (
    <div className="space-y-8">
      {/* Grade Selector */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">اختر المرحلة</h2>
        <div className="flex flex-wrap gap-4">
          {grades.map(grade => (
            <button
              key={grade.id}
              onClick={() => setSelectedGradeId(grade.id)}
              className={`px-6 py-3 rounded-2xl border font-semibold transition-all ${
                selectedGradeId === grade.id
                  ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                  : 'bg-card text-foreground border-border hover:bg-muted'
              }`}
            >
              <div className="text-base">{grade.name}</div>
              <div className={`text-xs mt-1 ${selectedGradeId === grade.id ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                {grade.classes.length} فصول
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Classes List */}
      {selectedGrade && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
          <h2 className="text-lg font-semibold text-foreground mb-4">فصول {selectedGrade.name}</h2>
          
          {selectedGrade.classes.length === 0 ? (
            <div className="text-center p-8 bg-card rounded-2xl border border-border">
              <p className="text-muted-foreground">لا يوجد فصول في هذه المرحلة بعد</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {selectedGrade.classes.map(cls => (
                <div key={cls.id} className="bg-card border border-border p-6 rounded-2xl flex flex-col">
                  <div className="flex justify-between items-start mb-6">
                    <h3 className="text-xl font-bold text-foreground">{cls.name}</h3>
                    <span className="bg-muted text-muted-foreground text-xs px-2.5 py-1 rounded-full font-medium">
                      {cls.studentCount} طالب
                    </span>
                  </div>
                  
                  <p className={`mb-4 text-xs font-semibold ${cls.offToday ? 'text-muted-foreground' : cls.recordedToday ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {cls.offToday
                      ? (cls.offToday === 'الجمعة' || cls.offToday === 'السبت' ? `اليوم ${cls.offToday} — لا تسجيل` : `إجازة: ${cls.offToday}`)
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
