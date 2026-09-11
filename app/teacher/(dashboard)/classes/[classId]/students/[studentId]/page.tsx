import { db } from '@/lib/db'
import { classes, students, dailyRecords, gradeEntries, subjects } from '@/lib/db/schema'
import { eq, and, count, gte, desc } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getTeacherClassAccess } from '@/lib/teacher-access'
import { getStudentTotalPoints, getStudentPointsHistory } from '../../../../actions'
import { formatDateAr, ATTENDANCE_STATUS, EXAM_TYPE_LABELS } from '@/lib/utils'
import { yearStartForStudent } from '@/lib/points'
import { StatCard } from '@/components/stat-card'
import { EmptyState } from '@/components/empty-state'
import { ArrowRight, Trophy, ScrollText } from 'lucide-react'
import { NotificationBell } from '@/components/notification-bell'

export const dynamic = 'force-dynamic'

export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ classId: string; studentId: string }>
}) {
  const { classId, studentId } = await params

  // Same guard as the class page itself: proves the class belongs to the
  // caller's school and, once it has an assigned subject, that the caller is
  // one of its assigned teachers (see lib/teacher-access.ts).
  const result = await getTeacherClassAccess(classId)
  if (result.status === 'no-session') redirect('/teacher/login')
  if (result.status === 'forbidden') redirect('/teacher/classes')

  const [classInfo] = await db.select({ name: classes.name }).from(classes).where(eq(classes.id, classId)).limit(1)
  if (!classInfo) redirect('/teacher/classes')

  const [student] = await db
    .select({ id: students.id, fullName: students.fullName })
    .from(students)
    .where(and(eq(students.id, studentId), eq(students.classId, classId)))
    .limit(1)
  if (!student) redirect(`/teacher/classes/${classId}`)

  // Both calls re-check that this student is actually reachable by the caller —
  // the class check above is not itself proof for a specific student id.
  const since = await yearStartForStudent(studentId)
  const [total, history, attRows, myGrades] = await Promise.all([
    getStudentTotalPoints(studentId),
    getStudentPointsHistory(studentId, result.access.schoolId),
    // The register this year: the same figures the parent and the office see.
    db.select({ status: dailyRecords.attendanceStatus, n: count() })
      .from(dailyRecords)
      .where(and(eq(dailyRecords.studentId, studentId), since ? gte(dailyRecords.date, since) : undefined))
      .groupBy(dailyRecords.attendanceStatus),
    // Only this teacher's marks — another subject's marks are that teacher's.
    db.select({ id: gradeEntries.id, examName: gradeEntries.examName, examType: gradeEntries.examType, score: gradeEntries.score, maxScore: gradeEntries.maxScore, subjectName: subjects.name, createdAt: gradeEntries.createdAt })
      .from(gradeEntries)
      .leftJoin(subjects, eq(subjects.id, gradeEntries.subjectId))
      .where(and(eq(gradeEntries.studentId, studentId), eq(gradeEntries.teacherUserId, result.access.userId)))
      .orderBy(desc(gradeEntries.createdAt))
      .limit(30),
  ])
  const att = { present: 0, absent: 0, late: 0, excused: 0 }
  for (const r of attRows) if (r.status in att) att[r.status as keyof typeof att] = Number(r.n)

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
        <Link
          href={`/teacher/classes/${classId}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowRight className="size-4" />
          العودة إلى فصل {classInfo.name}
        </Link>
        <h1 className="text-2xl font-bold text-foreground mt-2">{student.fullName}</h1>
        </div>
        <NotificationBell />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-xl">
        <StatCard
          label="إجمالي النقاط"
          value={total > 0 ? `+${total}` : total}
          icon={Trophy}
          accent={total >= 0 ? 'emerald' : 'red'}
        />
        <StatCard label="عدد العمليات" value={history.length} icon={ScrollText} accent="blue" />
      </div>

      {/* Attendance this year — a teacher deciding whether to raise a case
          should not have to ask the office how often the pupil is absent. */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <h2 className="text-lg font-bold mb-3">الحضور هذا العام</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {([['present', '✅'], ['late', '⏰'], ['absent', '❌'], ['excused', '📋']] as const).map(([k, emoji]) => (
            <div key={k} className={`rounded-xl border p-3 text-center ${ATTENDANCE_STATUS[k].light}`}>
              <div className="text-lg">{emoji}</div>
              <div className="text-xl font-black">{att[k]}</div>
              <div className="text-xs font-semibold">{ATTENDANCE_STATUS[k].label}</div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-bold text-foreground mb-4">درجاتي لهذا الطالب</h2>
        {myGrades.length === 0 ? (
          <p className="text-sm text-muted-foreground bg-card border border-border rounded-2xl p-4">لم تُرصد له درجات بعد</p>
        ) : (
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted text-muted-foreground text-xs font-semibold">
                  <tr>
                    <th className="px-4 py-3 text-right">المادة</th>
                    <th className="px-4 py-3 text-right">الاختبار</th>
                    <th className="px-4 py-3 text-right">النوع</th>
                    <th className="px-4 py-3 text-center">الدرجة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {myGrades.map((g) => {
                    const pct = g.maxScore > 0 ? Math.round((g.score / g.maxScore) * 100) : 0
                    return (
                      <tr key={g.id}>
                        <td className="px-4 py-3 font-semibold">{g.subjectName ?? '—'}</td>
                        <td className="px-4 py-3">{g.examName}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{EXAM_TYPE_LABELS[g.examType] ?? g.examType}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`rounded-lg px-2 py-0.5 text-xs font-black ${pct >= 80 ? 'bg-emerald-50 text-emerald-700' : pct >= 50 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>
                            {g.score}/{g.maxScore}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div>
        <h2 className="text-lg font-bold text-foreground mb-4">سجل النقاط</h2>
        {history.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title="لا يوجد سجل بعد"
            description="ستظهر هنا كل نقطة يكتسبها الطالب أو يخسرها بمجرد تسجيل أول يوم"
          />
        ) : (
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted text-muted-foreground text-xs font-semibold">
                  <tr>
                    <th className="px-4 py-3 text-right">التاريخ</th>
                    <th className="px-4 py-3 text-right">التفاصيل</th>
                    <th className="px-4 py-3 text-center">النقاط</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {history.map((entry, i) => (
                    <tr key={i} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{formatDateAr(entry.date)}</td>
                      <td className="px-4 py-3 font-medium">{entry.reason}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`font-bold ${entry.points >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                          {entry.points > 0 ? '+' : ''}{entry.points}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
