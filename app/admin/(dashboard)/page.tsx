import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { schools, students, teachers, classes, gradeLevels, notifications, studentPoints, parentWhatsappMessages } from '@/lib/db/schema'
import { eq, desc, and, isNull, count, or, gt, sql, asc } from 'drizzle-orm'
import { today } from '@/lib/utils'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { StatCard } from '@/components/stat-card'
import { EmptyState } from '@/components/empty-state'
import { Users, GraduationCap, Layers, BookOpen, Bell } from 'lucide-react'
import { LeaderboardClient } from './leaderboard-client'
import { ParentMessagesToday } from './parent-messages-today'

export const dynamic = 'force-dynamic'

export default async function AdminDashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/admin/login')

  const [school] = await db.select().from(schools).where(eq(schools.adminId, session.user.id)).limit(1)
  if (!school) redirect('/admin/setup')

  const [studentCount] = await db.select({ value: count() }).from(students).where(eq(students.schoolId, school.id))
  const [teacherCount] = await db.select({ value: count() }).from(teachers).where(eq(teachers.schoolId, school.id))
  const [classCount] = await db.select({ value: count() }).from(classes).where(eq(classes.schoolId, school.id))
  const [gradeCount] = await db.select({ value: count() }).from(gradeLevels).where(eq(gradeLevels.schoolId, school.id))

  const classList = await db
    .select({ id: classes.id, name: classes.name })
    .from(classes)
    .where(eq(classes.schoolId, school.id))

  const classRows = await db
    .select({
      id: classes.id,
      name: classes.name,
      gradeName: gradeLevels.name,
      gradeOrder: gradeLevels.orderIndex,
    })
    .from(classes)
    .leftJoin(gradeLevels, eq(classes.gradeLevelId, gradeLevels.id))
    .where(eq(classes.schoolId, school.id))
    .orderBy(asc(gradeLevels.orderIndex), asc(classes.name))

  const todayStr = today()

  const todayMessageCounts = await db
    .select({
      classId: parentWhatsappMessages.classId,
      type: parentWhatsappMessages.type,
      studentCount: sql<number>`COUNT(DISTINCT ${parentWhatsappMessages.studentId})`.mapWith(Number),
    })
    .from(parentWhatsappMessages)
    .where(and(eq(parentWhatsappMessages.schoolId, school.id), eq(parentWhatsappMessages.date, todayStr)))
    .groupBy(parentWhatsappMessages.classId, parentWhatsappMessages.type)

  const countsByClass = new Map<string, { positive: number; negative: number }>()
  for (const row of todayMessageCounts) {
    const current = countsByClass.get(row.classId) ?? { positive: 0, negative: 0 }
    if (row.type === 'positive') current.positive = row.studentCount
    if (row.type === 'negative') current.negative = row.studentCount
    countsByClass.set(row.classId, current)
  }

  const classStats = classRows.map((cls) => ({
    ...cls,
    positive: countsByClass.get(cls.id)?.positive ?? 0,
    negative: countsByClass.get(cls.id)?.negative ?? 0,
  }))

  const [todayPositive] = await db
    .select({
      value: sql<number>`COUNT(DISTINCT ${parentWhatsappMessages.studentId})`.mapWith(Number),
    })
    .from(parentWhatsappMessages)
    .where(
      and(
        eq(parentWhatsappMessages.schoolId, school.id),
        eq(parentWhatsappMessages.date, todayStr),
        eq(parentWhatsappMessages.type, 'positive')
      )
    )

  const [todayNegative] = await db
    .select({
      value: sql<number>`COUNT(DISTINCT ${parentWhatsappMessages.studentId})`.mapWith(Number),
    })
    .from(parentWhatsappMessages)
    .where(
      and(
        eq(parentWhatsappMessages.schoolId, school.id),
        eq(parentWhatsappMessages.date, todayStr),
        eq(parentWhatsappMessages.type, 'negative')
      )
    )

  const leaderboardData = await db
    .select({
      id: students.id,
      name: students.fullName,
      classId: students.classId,
      className: classes.name,
      totalPoints: sql<number>`COALESCE(SUM(${studentPoints.points}), 0)`.mapWith(Number)
    })
    .from(students)
    .leftJoin(classes, eq(students.classId, classes.id))
    .leftJoin(studentPoints, eq(students.id, studentPoints.studentId))
    .where(eq(students.schoolId, school.id))
    .groupBy(students.id, students.fullName, students.classId, classes.name)
    .having(sql`COALESCE(SUM(${studentPoints.points}), 0) > 0`)
    .orderBy(desc(sql`COALESCE(SUM(${studentPoints.points}), 0)`))

  const recentNotifications = await db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.schoolId, school.id),
        or(isNull(notifications.expiresAt), gt(notifications.expiresAt, sql`now()`))
      )
    )
    .orderBy(desc(notifications.createdAt))
    .limit(5)

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-foreground">لوحة التحكم</h1>
          <p className="text-muted-foreground mt-1">{school.name} — {school.academicYear}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="إجمالي الطلاب" value={studentCount.value} icon={Users} accent="blue" />
        <StatCard label="إجمالي المعلمين" value={teacherCount.value} icon={GraduationCap} accent="emerald" />
        <StatCard label="الفصول الدراسية" value={classCount.value} icon={BookOpen} accent="amber" />
        <StatCard label="المراحل الدراسية" value={gradeCount.value} icon={Layers} accent="violet" />
      </div>

      <ParentMessagesToday
        classStats={classStats}
        todayPositive={todayPositive.value}
        todayNegative={todayNegative.value}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <LeaderboardClient students={leaderboardData} classes={classList} />

        <div className="bg-card border border-border rounded-2xl p-6">
          <h2 className="text-lg font-bold mb-4">آخر التنبيهات</h2>
          {recentNotifications.length > 0 ? (
            <div className="space-y-3">
              {recentNotifications.map((notif) => (
                <div key={notif.id} className="p-3 rounded-xl bg-muted">
                  <h3 className="font-bold text-sm">{notif.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{notif.body}</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    {notif.createdAt.toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' })}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="لا يوجد تنبيهات" description="لم يتم إرسال أي تنبيهات مؤخراً" icon={Bell} />
          )}
        </div>
      </div>
    </div>
  )
}
