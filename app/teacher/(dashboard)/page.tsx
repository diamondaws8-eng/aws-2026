import { db } from '@/lib/db'
import { students, classes, gradeLevels, lessonRecords, subjects } from '@/lib/db/schema'
import { eq, and, count, inArray } from 'drizzle-orm'
import { CalendarCheck, CircleDashed } from 'lucide-react'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { formatDateAr, today } from '@/lib/utils'
import { requireTeacher, getTeacherVisibleClassIds } from '@/lib/teacher-access'
import { getSchoolDaysConfig } from '@/lib/school-holidays'
import { nonSchoolDayReason } from '@/lib/school-days'

import { StatCard } from '@/components/stat-card'
import { EmptyState } from '@/components/empty-state'
import { Users, BookOpen, AlertCircle } from 'lucide-react'
import { NotificationBell } from '@/components/notification-bell'
import { getLeaderboard } from '@/lib/points'
import { LeaderboardClient } from '@/app/admin/(dashboard)/leaderboard-client'

export const dynamic = 'force-dynamic'

export default async function TeacherDashboard() {
  let teacher
  try {
    teacher = await requireTeacher()
  } catch {
    redirect('/teacher/login')
  }

  // Total students in school
  const [{ count: totalStudents }] = await db
    .select({ count: count() })
    .from(students)
    .where(and(eq(students.schoolId, teacher.schoolId), eq(students.status, 'active')))

  // Total classes in school
  const [{ count: totalClasses }] = await db
    .select({ count: count() })
    .from(classes)
    .where(eq(classes.schoolId, teacher.schoolId))

  // Get grade levels and class counts — "available" means available to this
  // teacher, so it follows the same subject-based visibility as /teacher/classes.
  const gradesData = await db.select().from(gradeLevels).where(eq(gradeLevels.schoolId, teacher.schoolId)).orderBy(gradeLevels.orderIndex)
  const classesData = await db.select().from(classes).where(eq(classes.schoolId, teacher.schoolId))
  const visibleClassIds = await getTeacherVisibleClassIds(teacher.schoolId, teacher.userId)
  const visibleClasses = classesData.filter(c => visibleClassIds.has(c.id))

  const gradesWithCounts = gradesData
    .map(g => ({
      ...g,
      classCount: visibleClasses.filter(c => c.gradeLevelId === g.id).length
    }))
    .filter(g => g.classCount > 0)

  // The honour board for this teacher's own classes — the same figures the
  // administration sees, cut to the classes this account may open.
  const gradeNameOf = new Map(gradesData.map((g) => [g.id, g.name]))
  const boardClasses = visibleClasses
    .sort((a, b) => (gradeNameOf.get(a.gradeLevelId) ?? '').localeCompare(gradeNameOf.get(b.gradeLevelId) ?? '') || a.name.localeCompare(b.name))
    .map((c) => ({ id: c.id, name: `${gradeNameOf.get(c.gradeLevelId) ?? ''} — ${c.name}` }))
  const boardRows = visibleClasses.length
    ? await getLeaderboard(teacher.schoolId, visibleClasses.map((c) => c.id))
    : []

  /**
   * Today, class by class: which of this teacher's classes already have their
   * record saved and which are still waiting. The classes listed are the ones
   * with a subject assigned to this teacher — the ones they are expected to
   * fill — and the count is of pupils in them, not in the whole school.
   */
  const todayStr = today()
  const myClassIds = visibleClasses.map((c) => c.id)
  const [mySubjectRows, recordedRows, [{ count: myPupils }]] = await Promise.all([
    myClassIds.length
      ? db.select({ classId: subjects.classId, name: subjects.name }).from(subjects)
          .where(and(eq(subjects.teacherUserId, teacher.userId), inArray(subjects.classId, myClassIds)))
      : Promise.resolve([] as { classId: string; name: string }[]),
    myClassIds.length
      ? db.selectDistinct({ classId: lessonRecords.classId }).from(lessonRecords)
          .where(and(eq(lessonRecords.teacherUserId, teacher.userId), eq(lessonRecords.date, todayStr), inArray(lessonRecords.classId, myClassIds)))
      : Promise.resolve([] as { classId: string }[]),
    myClassIds.length
      ? db.select({ count: count() }).from(students).where(and(inArray(students.classId, myClassIds), eq(students.status, 'active')))
      : Promise.resolve([{ count: 0 }]),
  ])
  const recordedToday = new Set(recordedRows.map((r) => r.classId))
  const subjectOf = new Map<string, string[]>()
  for (const s of mySubjectRows) subjectOf.set(s.classId, [...(subjectOf.get(s.classId) ?? []), s.name])
  // "My classes" are the ones with a subject in this teacher's name. Classes
  // nobody has been assigned to yet are reachable (the rollout fallback) but
  // are not this teacher's daily duty, so they stay off the list — unless
  // the teacher has no assignment at all, when the list shows what is open.
  const mine = boardClasses.filter((c) => subjectOf.has(c.id))
  const todayBase = mine.length ? mine : boardClasses
  // A Friday, a Saturday the stage does not teach on, or a holiday is not a
  // day with eight classes still waiting — it is a day off, and the card
  // says so instead of pressing the teacher to record it.
  const gradeOfClass = new Map(visibleClasses.map((c) => [c.id, c.gradeLevelId]))
  const offReason = new Map<string, string | null>()
  for (const gid of new Set(todayBase.map((c) => gradeOfClass.get(c.id) ?? null))) {
    offReason.set(gid ?? '', nonSchoolDayReason(todayStr, await getSchoolDaysConfig(teacher.schoolId, gid)))
  }
  const todayList = todayBase.map((c) => ({ ...c, subjects: subjectOf.get(c.id) ?? [], done: recordedToday.has(c.id), off: offReason.get(gradeOfClass.get(c.id) ?? '') ?? null }))
  const pendingCount = todayList.filter((c) => !c.done && !c.off).length
  const allOff = todayList.length > 0 && todayList.every((c) => c.off)
  const offLabel = allOff ? (todayList[0].off === 'الجمعة' || todayList[0].off === 'السبت' ? `اليوم ${todayList[0].off} — لا تسجيل` : `إجازة: ${todayList[0].off}`) : null
  const myClassCount = todayBase.length
  const myPupilCount = todayBase.length === visibleClasses.length
    ? myPupils
    : (await db.select({ count: count() }).from(students).where(and(inArray(students.classId, todayBase.map((c) => c.id)), eq(students.status, 'active'))))[0].count

  return (
    <div className="p-6 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">أهلاً، {teacher.fullName}</h1>
          <p className="text-muted-foreground mt-1">{formatDateAr(today())}</p>
        </div>
        <div className="flex items-center gap-2">
          <NotificationBell />
          <Link href="/teacher/classes" className="bg-primary text-primary-foreground px-4 py-2 rounded-xl font-semibold text-center hover:bg-primary/90 transition-colors">
            الذهاب للفصول &larr;
          </Link>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard label="طلاب فصولي" value={myPupilCount} icon={Users} accent="blue" trend={{ value: 0, label: `من ${totalStudents} طالباً في المدرسة` }} />
        <StatCard label="فصولي" value={myClassCount} icon={BookOpen} accent="emerald" trend={{ value: 0, label: mine.length ? `من ${totalClasses} فصلاً في المدرسة` : 'لم تُسند إليك مادة بعد — تظهر الفصول المفتوحة' }} />
        <StatCard
          label="فصول لم تُسجَّل اليوم"
          value={pendingCount}
          icon={pendingCount ? CircleDashed : CalendarCheck}
          accent={pendingCount ? 'amber' : 'emerald'}
          trend={{ value: 0, label: pendingCount ? 'اضغط الفصل أدناه لتسجيله' : offLabel ?? 'كل فصولك مسجَّلة لهذا اليوم' }}
        />
      </div>

      {todayList.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="text-lg font-bold">سجل اليوم — {formatDateAr(todayStr)}</h2>
            <span className="text-xs text-muted-foreground">{offLabel ?? `${todayList.filter((c) => c.done).length} من ${todayList.length} فصل`}</span>
          </div>
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {todayList.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/teacher/classes/${c.id}`}
                  className={`flex items-center gap-3 rounded-xl border p-3 transition-colors ${
                    c.done ? 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100' : c.off ? 'border-border bg-muted/40 hover:bg-muted' : 'border-amber-200 bg-amber-50 hover:bg-amber-100'
                  }`}
                >
                  <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${c.done ? 'bg-emerald-100 text-emerald-700' : c.off ? 'bg-muted text-muted-foreground' : 'bg-amber-100 text-amber-700'}`}>
                    {c.done ? <CalendarCheck className="size-4" /> : <CircleDashed className="size-4" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold truncate">{c.name}</span>
                    <span className="block text-[11px] text-muted-foreground truncate">
                      {c.subjects.length ? c.subjects.join('، ') : 'بلا مادة مسندة'} · {c.done ? 'سُجّل اليوم' : c.off ? `يوم إجازة (${c.off})` : 'لم يُسجَّل بعد'}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {boardClasses.length > 0 && (
        <LeaderboardClient
          students={boardRows}
          classes={boardClasses}
          title="لوحة الشرف — فصولي"
          allLabel="كل فصولي"
          showAll={boardClasses.length > 1}
          defaultClassId={boardClasses[0].id}
        />
      )}

      <div>
        <h2 className="text-xl font-bold text-foreground mb-6">الفصول المتاحة</h2>
        {gradesWithCounts.length === 0 ? (
          <EmptyState title="لا توجد فصول" description="لا توجد فصول مسندة إليك بعد — تواصل مع الإدارة" icon={AlertCircle} />

        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {gradesWithCounts.map((grade) => (
              <div key={grade.id} className="bg-card border border-border p-6 rounded-2xl flex flex-col">
                <h3 className="text-lg font-bold text-foreground">{grade.name}</h3>
                <p className="text-muted-foreground mt-1 mb-6">{grade.classCount} فصول</p>
                <div className="mt-auto">
                  <Link href={`/teacher/classes?grade=${grade.id}`} className="block w-full text-center bg-primary/10 text-primary py-2 rounded-xl font-semibold hover:bg-primary/20 transition-colors">
                    فتح الفصول
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
