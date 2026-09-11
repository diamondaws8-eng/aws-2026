import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { students, classes, gradeLevels, dailyRecords, gradeEntries, subjects, behaviorCases, teachers, user, studentPoints, lessonRecords } from '@/lib/db/schema'
import { and, eq, desc, count, gte, sql } from 'drizzle-orm'
import { requireAdminAccess, canViewGrade } from '@/lib/admin-access'
import { NotificationBell } from '@/components/notification-bell'
import { ATTENDANCE_STATUS, EXAM_TYPE_LABELS, formatDateAr } from '@/lib/utils'
import { CASE_STATUS, isCaseStatus } from '@/lib/case-status'
import { yearStartForStudent, getStudentPointsTotal } from '@/lib/points'
import { genderLabel } from '@/lib/gender'
import { ArrowRight, Phone, CalendarCheck, Trophy, ShieldAlert, BookOpen } from 'lucide-react'

export const dynamic = 'force-dynamic'

/**
 * One pupil, everything the office is asked about on the phone: where they
 * are, how often they are here, what their marks say, what cases were raised
 * — and whether the family has activated its account. Read-only; every
 * change happens on the page that owns it.
 */
export default async function AdminStudentPage({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params
  const access = await requireAdminAccess()

  const [pupil] = await db
    .select({
      id: students.id,
      fullName: students.fullName,
      nationalId: students.nationalId,
      gender: students.gender,
      parentPhone: students.parentPhone,
      parentUserId: students.parentUserId,
      status: students.status,
      classId: students.classId,
      className: classes.name,
      gradeLevelId: classes.gradeLevelId,
      gradeName: gradeLevels.name,
      schoolId: students.schoolId,
    })
    .from(students)
    .leftJoin(classes, eq(classes.id, students.classId))
    .leftJoin(gradeLevels, eq(gradeLevels.id, classes.gradeLevelId))
    .where(and(eq(students.id, studentId), eq(students.schoolId, access.school.id)))
    .limit(1)
  if (!pupil) notFound()
  if (!canViewGrade(access, pupil.gradeLevelId)) redirect('/admin/students')

  const since = await yearStartForStudent(studentId)
  const yearFilter = since ? gte(dailyRecords.date, since) : undefined

  const [attRows, recent, grades, cases, totalPoints, [{ lessons }], parentRow] = await Promise.all([
    db.select({ status: dailyRecords.attendanceStatus, n: count() })
      .from(dailyRecords).where(and(eq(dailyRecords.studentId, studentId), yearFilter)).groupBy(dailyRecords.attendanceStatus),
    db.select({ id: dailyRecords.id, date: dailyRecords.date, status: dailyRecords.attendanceStatus, points: dailyRecords.pointsEarned })
      .from(dailyRecords).where(and(eq(dailyRecords.studentId, studentId), yearFilter)).orderBy(desc(dailyRecords.date)).limit(15),
    db.select({ id: gradeEntries.id, examName: gradeEntries.examName, examType: gradeEntries.examType, score: gradeEntries.score, maxScore: gradeEntries.maxScore, subjectName: subjects.name, teacherName: teachers.fullName, createdAt: gradeEntries.createdAt })
      .from(gradeEntries)
      .leftJoin(subjects, eq(subjects.id, gradeEntries.subjectId))
      .leftJoin(teachers, eq(teachers.userId, gradeEntries.teacherUserId))
      .where(eq(gradeEntries.studentId, studentId)).orderBy(desc(gradeEntries.createdAt)).limit(40),
    // Heads only — the notes stay with the counsellor (see lib/behavior-cases.ts).
    db.select({ id: behaviorCases.id, date: behaviorCases.date, status: behaviorCases.status, teacherName: teachers.fullName })
      .from(behaviorCases).leftJoin(teachers, eq(teachers.userId, behaviorCases.raisedByUserId))
      .where(eq(behaviorCases.studentId, studentId)).orderBy(desc(behaviorCases.createdAt)).limit(20),
    getStudentPointsTotal(studentId),
    db.select({ lessons: count() }).from(lessonRecords).where(and(eq(lessonRecords.studentId, studentId), since ? gte(lessonRecords.date, since) : undefined)),
    pupil.parentUserId
      ? db.select({ mustChange: user.mustChangePassword, email: user.email }).from(user).where(eq(user.id, pupil.parentUserId)).limit(1).then((r) => r[0] ?? null)
      : Promise.resolve(null),
  ])
  const att = { present: 0, absent: 0, late: 0, excused: 0 }
  for (const r of attRows) if (r.status in att) att[r.status as keyof typeof att] = Number(r.n)
  const days = att.present + att.absent + att.late + att.excused

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link href="/admin/students" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowRight className="size-4" /> العودة إلى الطلاب
          </Link>
          <h1 className="text-2xl font-bold mt-2">{pupil.fullName}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {pupil.gradeName ? `${pupil.gradeName} — ` : ''}{pupil.className ? `فصل ${pupil.className}` : 'بلا فصل'} · {genderLabel(pupil.gender)}
            {pupil.nationalId ? ` · هوية ${pupil.nationalId}` : ''}
            {pupil.status !== 'active' ? ` · ${pupil.status === 'graduated' ? 'متخرّج' : 'غير نشط'}` : ''}
          </p>
        </div>
        <NotificationBell />
      </div>

      {/* Family */}
      <div className="rounded-2xl border border-border bg-card p-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <span className="inline-flex items-center gap-2 font-semibold"><Phone className="size-4 text-primary" /> ولي الأمر: {pupil.parentPhone || '—'}</span>
        {parentRow ? (
          <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${parentRow.mustChange ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
            {parentRow.mustChange ? 'لم يفعّل حسابه بعد' : 'الحساب مفعّل'}
          </span>
        ) : (
          <span className="rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground">لا حساب لولي الأمر</span>
        )}
        {pupil.classId && (
          <Link href={`/admin/attendance?classId=${pupil.classId}`} className="text-xs font-bold text-primary underline underline-offset-2">سجل حضور الفصل</Link>
        )}
      </div>

      {/* Attendance + points */}
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
          <p className="text-xs text-muted-foreground mt-3">{days} يوم مسجَّل · {Number(lessons)} تقييم حصة</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5 min-w-[200px] text-center">
          <Trophy className="size-6 text-amber-500 mx-auto" />
          <p className="text-3xl font-black mt-2">{totalPoints > 0 ? `+${totalPoints}` : totalPoints}</p>
          <p className="text-xs text-muted-foreground">إجمالي النقاط</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent days */}
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

        {/* Cases */}
        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="text-lg font-bold mb-3 inline-flex items-center gap-2"><ShieldAlert className="size-5 text-primary" /> الحالات السلوكية</h2>
          {cases.length === 0 ? <p className="text-sm text-muted-foreground">لم تُرفع حالات</p> : (
            <ul className="divide-y divide-border">
              {cases.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span className="min-w-0 truncate">
                    <span className="text-muted-foreground">{c.date}</span>
                    <span className="text-xs text-muted-foreground"> · رفعها {c.teacherName ?? 'معلم محذوف'}</span>
                  </span>
                  <span className="shrink-0 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-bold">
                    {isCaseStatus(c.status) ? CASE_STATUS[c.status] : c.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px] text-muted-foreground mt-3">ما كتبه المعلم والموجه يبقى في صفحة الحالات لمن يملك الاطلاع.</p>
        </div>
      </div>

      {/* Grades */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="p-5 pb-3"><h2 className="text-lg font-bold inline-flex items-center gap-2"><BookOpen className="size-5 text-primary" /> الدرجات</h2></div>
        {grades.length === 0 ? <p className="px-5 pb-5 text-sm text-muted-foreground">لم تُرصد درجات بعد</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted text-muted-foreground text-xs font-semibold">
                <tr>
                  <th className="px-4 py-3 text-right">المادة</th>
                  <th className="px-4 py-3 text-right">الاختبار</th>
                  <th className="px-4 py-3 text-right">النوع</th>
                  <th className="px-4 py-3 text-right">المعلم</th>
                  <th className="px-4 py-3 text-center">الدرجة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {grades.map((g) => {
                  const pct = g.maxScore > 0 ? Math.round((g.score / g.maxScore) * 100) : 0
                  return (
                    <tr key={g.id}>
                      <td className="px-4 py-3 font-semibold">{g.subjectName ?? '—'}</td>
                      <td className="px-4 py-3">{g.examName}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{EXAM_TYPE_LABELS[g.examType] ?? g.examType}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{g.teacherName ?? 'معلم محذوف'}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`rounded-lg px-2 py-0.5 text-xs font-black ${pct >= 80 ? 'bg-emerald-50 text-emerald-700' : pct >= 50 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>{g.score}/{g.maxScore}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
