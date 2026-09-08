import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSubjectDetails } from '../../actions'
import { formatDateAr } from '@/lib/utils'
import { ChevronLeft } from 'lucide-react'

const ATTENDANCE_MAP = {
  present: { label: 'حاضر', color: 'text-emerald-700 bg-emerald-50 border-emerald-200', emoji: '✅' },
  absent:  { label: 'غائب', color: 'text-red-700 bg-red-50 border-red-200', emoji: '❌' },
  late:    { label: 'متأخر', color: 'text-amber-700 bg-amber-50 border-amber-200', emoji: '⏰' },
  excused: { label: 'مستأذن', color: 'text-blue-700 bg-blue-50 border-blue-200', emoji: '📋' },
}

const BEHAVIOR_MAP = {
  excellent: { label: 'سلوك ممتاز', color: 'text-emerald-700', emoji: '🌟' },
  good:      { label: 'سلوك جيد',   color: 'text-blue-700',    emoji: '👍' },
  normal:    { label: 'سلوك عادي',  color: 'text-muted-foreground', emoji: '😐' },
  issue:     { label: 'مشكلة سلوكية', color: 'text-red-700',   emoji: '⚠️' },
}

const EXAM_TYPE_LABELS: Record<string, string> = {
  quiz: 'اختبار قصير', midterm: 'نصف الفصل', final: 'نهاية الفصل',
  assignment: 'واجب', oral: 'شفهي',
}

function gradeColor(pct: number) {
  if (pct >= 90) return 'text-emerald-600'
  if (pct >= 75) return 'text-blue-600'
  if (pct >= 60) return 'text-amber-600'
  return 'text-red-600'
}

function gradeBg(pct: number) {
  if (pct >= 90) return 'bg-emerald-50 text-emerald-700'
  if (pct >= 75) return 'bg-blue-50 text-blue-700'
  if (pct >= 60) return 'bg-amber-50 text-amber-700'
  return 'bg-red-50 text-red-700'
}

export default async function SubjectDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ subjectId: string }>
  searchParams: Promise<{ child?: string }>
}) {
  const subjectId = (await params).subjectId
  const childId   = (await searchParams).child

  if (!childId) redirect('/parent')

  const details = await getSubjectDetails(childId, subjectId)
  if (!details) redirect('/parent')

  const { student, subject, teacher, records, points, grades } = details

  let totalPoints = 0
  points.forEach(p => { totalPoints += p.points })

  // حاضر + متأخر — the days the student was in school, matching every other
  // attendance figure in the system.
  let totalAttendance = 0
  records.forEach(r => { if (r.attendanceStatus === 'present' || r.attendanceStatus === 'late') totalAttendance++ })

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">

      {/* ── Breadcrumb ───────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href={`/parent?child=${childId}`} className="hover:text-foreground transition-colors font-medium">
          الرئيسية
        </Link>
        <ChevronLeft className="size-4" />
        <span className="text-foreground font-bold">{subject.name}</span>
      </div>

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold">{subject.name}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          المعلم: <span className="font-semibold">{teacher.fullName}</span>
          {' — '}
          الطالب: <span className="font-semibold">{student.fullName}</span>
        </p>
      </div>

      {/* ── Summary Cards ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-2xl p-4 shadow-sm text-center">
          <div className="text-3xl font-black text-primary mb-1">
            {totalPoints > 0 ? '+' : ''}{totalPoints}
          </div>
          <div className="text-xs font-semibold text-muted-foreground">إجمالي النقاط</div>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4 shadow-sm text-center">
          <div className="text-3xl font-black text-emerald-600 mb-1">{totalAttendance}</div>
          <div className="text-xs font-semibold text-muted-foreground">حضور الحصص</div>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4 shadow-sm text-center">
          <div className="text-3xl font-black text-blue-600 mb-1">{grades.length}</div>
          <div className="text-xs font-semibold text-muted-foreground">اختبارات</div>
        </div>
      </div>

      {/* ── Grades Section ───────────────────────────────────────────────────── */}
      {grades.length > 0 && (
        <div>
          <h2 className="font-bold text-lg mb-4">📊 درجات الاختبارات</h2>
          <div className="space-y-3">
            {grades.map(grade => {
              const pct = grade.maxScore > 0 ? Math.round((grade.score / grade.maxScore) * 100) : 0
              return (
                <div key={grade.id} className="bg-card border border-border rounded-2xl p-4 shadow-sm flex items-center justify-between">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-bold text-sm">{grade.examName}</span>
                    <span className="text-xs text-muted-foreground">
                      {EXAM_TYPE_LABELS[grade.examType] || grade.examType}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className={`text-2xl font-black ${gradeColor(pct)}`}>
                      {grade.score}
                      <span className="text-sm font-normal text-muted-foreground">/{grade.maxScore}</span>
                    </div>
                    <div className={`text-xs font-bold px-2 py-1 rounded-lg ${gradeBg(pct)}`}>
                      {pct}%
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Daily Timeline ───────────────────────────────────────────────────── */}
      <div>
        <h2 className="font-bold text-lg mb-4">📋 السجل اليومي</h2>

        {records.length === 0 ? (
          <div className="text-center py-12 bg-card border border-border rounded-3xl">
            <div className="text-4xl mb-2">📭</div>
            <p className="text-muted-foreground text-sm">لم يتم تسجيل بيانات في هذه المادة بعد</p>
          </div>
        ) : (
          <div className="space-y-4">
            {records.map(record => {
              const dayPoints = points.filter(p => p.date === record.date)
              let dayTotal = 0
              dayPoints.forEach(p => { dayTotal += p.points })

              const att = ATTENDANCE_MAP[record.attendanceStatus as keyof typeof ATTENDANCE_MAP]
              const beh = BEHAVIOR_MAP[record.behavior as keyof typeof BEHAVIOR_MAP]

              return (
                <div key={record.id} className="bg-card border border-border rounded-2xl p-4 shadow-sm space-y-3">

                  {/* Date & points */}
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-base">{formatDateAr(record.date)}</div>
                    {dayTotal !== 0 && (
                      <div className={`px-2 py-1 rounded-lg text-xs font-bold ${
                        dayTotal > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                      }`}>
                        {dayTotal > 0 ? '+' : ''}{dayTotal} نقطة
                      </div>
                    )}
                  </div>

                  {/* Status pills */}
                  <div className="flex flex-wrap gap-2">
                    {att && (
                      <div className={`px-2 py-1 rounded-lg border text-xs font-semibold flex items-center gap-1 ${att.color}`}>
                        <span>{att.emoji}</span> {att.label}
                      </div>
                    )}
                    {beh && (
                      <div className="px-2 py-1 rounded-lg border border-border bg-background text-xs font-semibold flex items-center gap-1">
                        <span>{beh.emoji}</span>
                        <span className={beh.color}>{beh.label}</span>
                      </div>
                    )}
                    {record.homeworkStatus && record.homeworkStatus !== 'na' && (
                      <div className="px-2 py-1 rounded-lg border border-border bg-background text-xs font-semibold flex items-center gap-1">
                        <span>{record.homeworkStatus === 'done' ? '📝' : '❌'}</span>
                        <span className={record.homeworkStatus === 'done' ? 'text-emerald-700' : 'text-red-700'}>
                          {record.homeworkStatus === 'done' ? 'أنجز الواجب' : 'لم ينجز الواجب'}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Teacher note */}
                  {record.teacherNote && (
                    <div className="bg-amber-50/70 border border-amber-100 rounded-xl px-3 py-2 text-sm text-amber-900 flex items-start gap-2">
                      <span className="text-amber-600 mt-0.5 shrink-0">📝</span>
                      <p className="leading-relaxed">{record.teacherNote}</p>
                    </div>
                  )}

                  {/* Point breakdown */}
                  {dayPoints.length > 0 && (
                    <div className="pt-2 border-t border-border/50 space-y-1">
                      {dayPoints.map((p, i) => (
                        <div key={`${p.date}-${p.type}-${i}`} className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
                            {p.reason}
                          </span>
                          <span className={`font-bold ${p.points > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {p.points > 0 ? '+' : ''}{p.points}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

    </div>
  )
}
