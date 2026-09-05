import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { schools, classes, students, notifications } from '@/lib/db/schema'
import { eq, desc, and, or, isNull, gt, sql } from 'drizzle-orm'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import NotificationsClient from './notifications-client'

export const dynamic = 'force-dynamic'

export default async function NotificationsPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/admin/login')
  
  const [school] = await db.select().from(schools).where(eq(schools.adminId, session.user.id)).limit(1)
  if (!school) redirect('/admin/setup')

  const classesList = await db.select().from(classes).where(eq(classes.schoolId, school.id))
  const studentsList = await db.select({ id: students.id, fullName: students.fullName }).from(students).where(eq(students.schoolId, school.id))
  
  const notifs = await db.select()
    .from(notifications)
    .where(
      and(
        eq(notifications.schoolId, school.id),
        or(isNull(notifications.expiresAt), gt(notifications.expiresAt, sql`now()`))
      )
    )
    .orderBy(desc(notifications.createdAt))
    .limit(30)

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-foreground">التنبيهات</h1>
          <p className="text-muted-foreground mt-1">إرسال التنبيهات لأولياء الأمور</p>
        </div>
      </div>

      <NotificationsClient 
        schoolId={school.id} 
        userId={session.user.id} 
        classes={classesList} 
        students={studentsList} 
        notifications={notifs} 
      />
    </div>
  )
}
