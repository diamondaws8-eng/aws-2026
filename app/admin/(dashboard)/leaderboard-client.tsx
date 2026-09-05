'use client'

import { useState } from 'react'
import { EmptyState } from '@/components/empty-state'
import { Trophy, Medal, Star } from 'lucide-react'

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
  classes
}: {
  students: LeaderboardStudent[]
  classes: ClassInfo[]
}) {
  const [selectedClass, setSelectedClass] = useState<string>('all')

  const filteredStudents = students
    .filter(s => selectedClass === 'all' || s.classId === selectedClass)
    .sort((a, b) => b.totalPoints - a.totalPoints)
    .slice(0, 10)

  return (
    <div className="bg-card border border-border rounded-2xl p-6 flex flex-col min-h-[400px] max-h-[500px]">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-3">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Trophy className="w-5 h-5 text-amber-500" />
          لوحة الشرف (أعلى 10)
        </h2>
        
        <select
          value={selectedClass}
          onChange={(e) => setSelectedClass(e.target.value)}
          className="p-2 text-sm rounded-xl border border-border bg-muted outline-none focus:ring-2 focus:ring-primary min-w-[150px]"
        >
          <option value="all">المدرسة بالكامل</option>
          {classes.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {filteredStudents.length > 0 ? (
        <div className="space-y-3 flex-1 overflow-y-auto pr-2">
          {filteredStudents.map((student, idx) => {
            const isFirst = idx === 0
            const isSecond = idx === 1
            const isThird = idx === 2
            
            return (
              <div 
                key={student.id} 
                className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                  isFirst ? 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 shadow-sm' : 
                  isSecond ? 'bg-slate-50/50 dark:bg-slate-900/40 border-slate-200' : 
                  isThird ? 'bg-orange-50/50 dark:bg-orange-950/20 border-orange-200' : 
                  'bg-card border-border hover:bg-muted/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                    isFirst ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400' : 
                    isSecond ? 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300' : 
                    isThird ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-400' : 
                    'bg-muted text-muted-foreground'
                  }`}>
                    {idx + 1}
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
