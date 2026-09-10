import { db } from '@/lib/db'
import { students, classes, gradeLevels } from '@/lib/db/schema'
import { eq, and, count } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { formatDateAr, today } from '@/lib/utils'
import { requireTeacher, getTeacherVisibleClassIds } from '@/lib/teacher-access'

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
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <StatCard label="إجمالي الطلاب بالمدرسة" value={totalStudents} icon={Users} accent="blue" />
        <StatCard label="إجمالي الفصول بالمدرسة" value={totalClasses} icon={BookOpen} accent="emerald" />
      </div>

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
