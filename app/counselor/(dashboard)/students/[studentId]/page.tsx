import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { students, classes, gradeLevels, dailyRecords, gradeEntries, subjects, behaviorCases, teachers, schoolStaff } from '@/lib/db/schema'
import { and, eq, desc, count, gte } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { getCounselorAccess, getCounselorClassIds } from '@/lib/counselor-access'
import { NotificationBell } from '@/components/notification-bell'
import { ATTENDANCE_STATUS, formatDateAr } from '@/lib/utils'
import { CASE_STATUS, isCaseStatus } from '@/lib/case-status'
import { yearStartForStudent, getStudentPointsTotal } from '@/lib/points'
import { ArrowRight, CalendarCheck, Trophy, ShieldAlert, BookOpen } from 'lucide-react'

export const dynamic = 'force-dynamic'

/**
 * One pupil as the counsellor sees them — for the parent who walks in with
 * no case open, or the pupil whose name keeps coming up. Attendance this
 * year, points, every case with what the teacher wrote and what the
 * counsellor decided, and the latest marks. Read-only; decisions are taken
 * from the inbox.
 */
export default async function CounselorStudentPage({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params
  const access = await getCounselorAccess()
  if (!access) redirect('/counselor/login')

  const [pupil] = await db
    .select({
      id: students.id,
      fullName: students.fullName,
      status: students.status,
      classId: students.classId,
      className: classes.name,
      gradeName: gradeLevels.name,
    })
    .from(students)
    .leftJoin(classes, eq(classes.id, students.classId))
    .leftJoin(gradeLevels, eq(gradeLevels.id, classes.gradeLevelId))
    .where(and(eq(students.id, studentId), eq(students.schoolId, access.schoolId)))
    .limit(1)
  if (!pupil) notFound()
  if (!access.allGrades) {
    const allowed = await getCounselorClassIds(access)
    if (!pupil.classId || !allowed.includes(pupil.classId)) redirect('/counselor')
  }

  const since = await yearStartForStudent(studentId)
  const yearFilter = since ? gte(dailyRecords.date, since) : undefined
  const raiserStaff = alias(schoolStaff, 'raiser_staff')

  const [attRows, recent, grades, cases, totalPoints] = await Promise.all([
    db.select({ status: dailyRecords.attendanceStatus, n: count() })
      .from(dailyRecords).where(and(eq(dailyRecords.studentId, studentId), yearFilter)).groupBy(dailyRecords.attendanceStatus),
    db.select({ id: dailyRecords.id, date: dailyRecords.date, status: dailyRecords.attendanceStatus, points: dailyRecords.pointsEarned })
      .from(dailyRecords).where(and(eq(dailyRecords.studentId, studentId), yearFilter)).orderBy(desc(dailyRecords.date)).limit(15),
    db.select({ id: gradeEntries.id, examName: gradeEntries.examName, score: gradeEntries.score, maxScore: gradeEntries.maxScore, subjectName: subjects.name })
      .from(gradeEntries)
      .leftJoin(subjects, eq(subjects.id, gradeEntries.subjectId))
      .where(eq(gradeEntries.studentId, studentId)).orderBy(desc(gradeEntries.createdAt)).limit(12),
    db.select({
        id: behaviorCases.id, date: behaviorCases.date, status: behaviorCases.status,
        teacherNote: behaviorCases.teacherNote, counselorNote: behaviorCases.counselorNote,
        parentMessageSent: behaviorCases.parentMessageSent,
        teacherName: teachers.fullName, raiserStaffName: raiserStaff.fullName,
      })
      .from(behaviorCases)
      .leftJoin(teachers, eq(teachers.userId, behaviorCases.raisedByUserId))
      .leftJoin(raiserStaff, eq(raiserStaff.userId, behaviorCases.raisedByUserId))
      .where(eq(behaviorCases.studentId, studentId)).orderBy(desc(behaviorCases.createdAt)).limit(30),
    getStudentPointsTotal(studentId),
  ])
  const att = { present: 0, absent: 0, late: 0, excused: 0 }
  for (const r of attRows) if (r.status in att) att[r.status as keyof typeof att] = Number(r.n)
  const days = att.present + att.absent + att.late + att.excused
  const timesParentTold = cases.filter((c) => c.parentMessageSent).length

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link href="/counselor" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowRight className="size-4" /> العودة إلى الحالات
          </Link>
          <h1 className="text-2xl font-bold mt-2">{pupil.fullName}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {pupil.gradeName ? `${pupil.gradeName} — ` : ''}{pupil.className ? `فصل ${pupil.className}` : 'بلا فصل'}
            {pupil.status !== 'active' ? ` · ${pupil.status === 'graduated' ? 'متخرّج' : 'غير نشط'}` : ''}
          </p>
        </div>
        <NotificationBell />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4">
        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="text-lg font-bold mb-3 inline-flex items-center gap-2"><CalendarCheck className="size-5 text-primary" /> الحضور هذا العام</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {([['present', '✅'], ['late', '⏰'], ['absent', '❌'], ['excused', '📋']] as const).map(([k, emoji]) => (
              <div key={k} className={`rounded-xl border p-3 text-center ${ATTENDANCE_STATUS[k].light}`}>
                <div className="text-lg">{emoji}</div>
                <div className="text-xl font-black">{att[k]}</div>
                <div className="text-xs font-semibold">{ATTENDANCE_STATUS[k].label}</div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">{days} يوم مسجَّل</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5 min-w-[200px] text-center">
          <Trophy className="size-6 text-amber-500 mx-auto" />
          <p className="text-3xl font-black mt-2">{totalPoints > 0 ? `+${totalPoints}` : totalPoints}</p>
          <p className="text-xs text-muted-foreground">إجمالي النقاط</p>
          <p className="text-xs text-muted-foreground mt-2">{cases.length} حالة · أُبلغ ولي الأمر {timesParentTold} مرة</p>
        </div>
      </div>

      {/* Cases, in full — this is the counsellor's own record */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-lg font-bold mb-3 inline-flex items-center gap-2"><ShieldAlert className="size-5 text-primary" /> الحالات السلوكية</h2>
        {cases.length === 0 ? <p className="text-sm text-muted-foreground">لم تُرفع حالات لهذا الطالب</p> : (
          <ul className="divide-y divide-border">
            {cases.map((c) => (
              <li key={c.id} className="py-3 text-sm space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    {c.date} · رفعها {c.teacherName ?? (c.raiserStaffName ? `${c.raiserStaffName} (الموجه)` : 'معلم محذوف')}
                  </span>
                  <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-bold">
                    {isCaseStatus(c.status) ? CASE_STATUS[c.status] : c.status}
                    {c.parentMessageSent ? ' · أُبلغ ولي الأمر' : ''}
                  </span>
                </div>
                <p className="leading-6 whitespace-pre-wrap">{c.teacherNote}</p>
                {c.counselorNote ? (
                  <p className="text-xs text-muted-foreground leading-5 whitespace-pre-wrap border-r-2 border-primary/40 pr-2">قرار الموجه: {c.counselorNote}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="text-lg font-bold mb-3">آخر الأيام</h2>
          {recent.length === 0 ? <p className="text-sm text-muted-foreground">لا سجل بعد</p> : (
            <ul className="divide-y divide-border">
              {recent.map((r) => {
                const s = ATTENDANCE_STATUS[r.status as keyof typeof ATTENDANCE_STATUS]
                return (
                  <li key={r.id} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-muted-foreground">{formatDateAr(r.date)}</span>
                    <span className="flex items-center gap-2">
                      <span className={`rounded-lg border px-2 py-0.5 text-xs font-bold ${s?.light ?? ''}`}>{s?.label ?? r.status}</span>
                      <span className={`text-xs font-bold ${r.points >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{r.points > 0 ? '+' : ''}{r.points}</span>
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="text-lg font-bold mb-3 inline-flex items-center gap-2"><BookOpen className="size-5 text-primary" /> آخر الدرجات</h2>
          {grades.length === 0 ? <p className="text-sm text-muted-foreground">لم تُرصد درجات بعد</p> : (
            <ul className="divide-y divide-border">
              {grades.map((g) => {
                const pct = g.maxScore > 0 ? Math.round((g.score / g.maxScore) * 100) : 0
                return (
                  <li key={g.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span className="min-w-0 truncate"><span className="font-semibold">{g.subjectName ?? '—'}</span><span className="text-muted-foreground text-xs"> · {g.examName}</span></span>
                    <span className={`shrink-0 rounded-lg px-2 py-0.5 text-xs font-black ${pct >= 80 ? 'bg-emerald-50 text-emerald-700' : pct >= 50 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>{g.score}/{g.maxScore}</span>
                  </li>
                )
              })}
            </ul>
          )}
          <p className="text-[11px] text-muted-foreground mt-3">السلوك كثيراً ما يتبع التراجع الدراسي — لذلك تُعرض هنا.</p>
        </div>
      </div>
    </div>
  )
}
