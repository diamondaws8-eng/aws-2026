import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { teachers, students, classes, gradeLevels } from '@/lib/db/schema'
import { eq, count } from 'drizzle-orm'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { formatDateAr, today } from '@/lib/utils'

import { StatCard } from '@/components/stat-card'
import { EmptyState } from '@/components/empty-state'
import { Users, BookOpen, AlertCircle } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function TeacherDashboard() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/teacher/login')
  
  const [teacher] = await db.select().from(teachers).where(eq(teachers.userId, session.user.id)).limit(1)
  if (!teacher) redirect('/teacher/login')
  
  // Total students in school
  const [{ count: totalStudents }] = await db
    .select({ count: count() })
    .from(students)
    .where(eq(students.schoolId, teacher.schoolId))
    
  // Total classes in school
  const [{ count: totalClasses }] = await db
    .select({ count: count() })
    .from(classes)
    .where(eq(classes.schoolId, teacher.schoolId))

  // Get grade levels and class counts
  const gradesData = await db.select().from(gradeLevels).where(eq(gradeLevels.schoolId, teacher.schoolId)).orderBy(gradeLevels.orderIndex)
  const classesData = await db.select().from(classes).where(eq(classes.schoolId, teacher.schoolId))

  const gradesWithCounts = gradesData.map(g => {
    return {
      ...g,
      classCount: classesData.filter(c => c.gradeLevelId === g.id).length
    }
  })

  return (
    <div className="p-6 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">أهلاً، {teacher.fullName}</h1>
          <p className="text-muted-foreground mt-1">{formatDateAr(today())}</p>
        </div>
        <Link href="/teacher/classes" className="bg-primary text-primary-foreground px-4 py-2 rounded-xl font-semibold text-center hover:bg-primary/90 transition-colors">
          الذهاب للفصول &larr;
        </Link>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <StatCard label="إجمالي الطلاب بالمدرسة" value={totalStudents} icon={Users} accent="blue" />
        <StatCard label="إجمالي الفصول بالمدرسة" value={totalClasses} icon={BookOpen} accent="emerald" />
      </div>
      
      <div>
        <h2 className="text-xl font-bold text-foreground mb-6">الفصول المتاحة</h2>
        {gradesWithCounts.length === 0 ? (
          <EmptyState title="لا توجد فصول" description="لم تُضف الإدارة أي مراحل دراسية بعد" icon={AlertCircle} />

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
