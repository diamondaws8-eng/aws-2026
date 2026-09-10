import { requireAdminAccess } from '@/lib/admin-access'
import { db } from '@/lib/db'
import { classes } from '@/lib/db/schema'
import { eq, and, inArray, sql } from 'drizzle-orm'
import {
  listCases, listCaseHeads, countCasesByStatus, countCasesByTeacher, countCasesByStudent,
  CASE_STATUS, STALE_AFTER_DAYS,
} from '@/lib/behavior-cases'
import { StatCard } from '@/components/stat-card'
import { EmptyState } from '@/components/empty-state'
import { ClipboardList, Clock, AlertTriangle, UserCog, ShieldCheck } from 'lucide-react'
import { EscalatedCases } from './escalated-cases'
import { NotificationBell } from '@/components/notification-bell'

export const dynamic = 'force-dynamic'

/**
 * The administration's view of the counselling flow — deliberately not a second
 * copy of the counsellor's inbox. What a stage's deputy needs is whether cases
 * are being dealt with, which pupils keep coming back, and the one thing nobody
 * else is placed to see: whether a single teacher is raising far more than
 * their colleagues. The counsellor's private notes are not selected anywhere on
 * this page; a second reviewer reading them would make the confidentiality
 * nominal, and pupils would stop talking.
 */
export default async function AdminCasesPage() {
  const access = await requireAdminAccess()
  const school = access.school

  const scopedClassRows = access.viewAllGrades
    ? null
    : await db.select({ id: classes.id }).from(classes).where(and(
        eq(classes.schoolId, school.id),
        access.gradeIds.length ? inArray(classes.gradeLevelId, access.gradeIds) : sql`false`,
      ))
  const classIds = scopedClassRows?.map((c) => c.id) ?? null

  const [counts, escalated, byTeacher, repeats, open] = await Promise.all([
    countCasesByStatus(school.id, classIds),
    listCases({ schoolId: school.id, classIds, statuses: ['escalated'], limit: 50 }),
    countCasesByTeacher(school.id, classIds),
    countCasesByStudent(school.id, classIds, 3),
    // Heads only: the administration watches for neglect, and that needs a
    // name and a date. What the child did is the counsellor's to read until
    // they hand the case over.
    listCaseHeads({ schoolId: school.id, classIds, statuses: ['open'], limit: 200 }),
  ])

  const staleCutoff = Date.now() - STALE_AFTER_DAYS * 24 * 60 * 60 * 1000
  const stale = open.filter((c) => c.createdAt.getTime() < staleCutoff)
  const total = Object.values(counts).reduce((a, b) => a + b, 0)

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">الحالات السلوكية</h1>
          <p className="text-muted-foreground mt-1">
            متابعة إدارية — الأعداد والأنماط والحالات المحالة إليك. تقرأ رواية المعلم في الحالة التي
            أُحيلت إليك؛ أما الحالة التي لم يقرر فيها الموجه بعد فتُتابَع بالاسم والتاريخ فقط.
            وملاحظات الموجه السرّية لا تظهر هنا إطلاقاً.
          </p>
        </div>
        <NotificationBell />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="إجمالي الحالات" value={total} icon={ClipboardList} accent="blue" />
        <StatCard label="بانتظار الموجه" value={counts.open ?? 0} icon={Clock} accent="amber" />
        <StatCard
          label={`متأخرة أكثر من ${STALE_AFTER_DAYS} يومين`}
          value={stale.length}
          icon={AlertTriangle}
          accent={stale.length ? 'red' : 'default'}
        />
        <StatCard label="بانتظار قرارك" value={counts.escalated ?? 0} icon={ShieldCheck} accent="violet" />
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <h2 className="font-bold mb-3">توزيع الحالات</h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-sm">
          {Object.entries(CASE_STATUS).map(([key, label]) => (
            <div key={key} className="rounded-xl border border-border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-2xl font-bold mt-1">{counts[key] ?? 0}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <h2 className="font-bold">الحالات المحالة إلى الإدارة</h2>
        <p className="text-sm text-muted-foreground mb-3">
          أحالها الموجه إلى شخص بعينه — والقرار الآن عندك
        </p>
        <EscalatedCases cases={escalated.map((c) => ({
          id: c.id,
          studentName: c.studentName,
          className: c.className,
          gradeName: c.gradeName,
          teacherName: c.teacherName,
          teacherNote: c.teacherNote,
          date: c.date,
          escalatedToName: c.escalatedToName,
        }))} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-1">
            <UserCog className="size-4 text-muted-foreground" />
            <h2 className="font-bold">الحالات حسب المعلم</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-3">
            معلم يرفع أضعاف زملائه ليست مشكلة طلاب — ولا يراها أحد غيرك
          </p>
          {byTeacher.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا توجد بيانات بعد</p>
          ) : (
            <div className="space-y-2">
              {byTeacher.map((t) => {
                const max = byTeacher[0].total || 1
                return (
                  <div key={t.teacherUserId}>
                    <div className="flex justify-between text-sm">
                      <span className="font-medium truncate">{t.teacherName}</span>
                      <span className="text-muted-foreground shrink-0">
                        {t.total}
                        {t.dismissed > 0 ? ` · ${t.dismissed} أُغلقت بلا إجراء` : ''}
                      </span>
                    </div>
                    <div className="h-2 mt-1 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-blue-500" style={{ width: `${(t.total / max) * 100}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="size-4 text-muted-foreground" />
            <h2 className="font-bold">طلاب تكررت حالاتهم</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-3">ثلاث حالات فأكثر</p>
          {repeats.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا يوجد</p>
          ) : (
            <div className="space-y-2">
              {repeats.map((r) => (
                <div key={r.studentId} className="flex items-center justify-between rounded-xl border border-border p-3">
                  <div>
                    <p className="font-semibold text-sm">{r.studentName}</p>
                    {r.className && <p className="text-xs text-muted-foreground">فصل {r.className}</p>}
                  </div>
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 border border-violet-100">
                    {r.total} حالات{r.teachers > 1 ? ` · ${r.teachers} معلمين` : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {stale.length > 0 && (
        <div className="rounded-2xl border border-red-200 bg-red-50/60 p-5">
          <h2 className="font-bold text-red-800 mb-1">حالات لم يفتحها الموجه</h2>
          <p className="text-sm text-red-700/80 mb-3">
            مضى عليها أكثر من {STALE_AFTER_DAYS} يومين — تحتاج متابعتك حتى لا تُهمل
          </p>
          <div className="space-y-2">
            {stale.map((c) => (
              <div key={c.id} className="rounded-xl border border-red-200 bg-card p-3 text-sm">
                <span className="font-bold">{c.studentName}</span>
                {c.className ? ` · فصل ${c.className}` : ''} — رفعها {c.teacherName} في {c.date}
              </div>
            ))}
          </div>
        </div>
      )}

      {total === 0 && (
        <EmptyState
          icon={ClipboardList}
          title="لا توجد حالات بعد"
          description="ستظهر هنا بمجرد أن يرفع المعلمون أول حالة سلوكية"
        />
      )}
    </div>
  )
}
