import { getCounselorAccess, getCounselorClassIds } from '@/lib/counselor-access'
import { redirect } from 'next/navigation'
import { listCases, countCasesByStatus, countCasesByStudent } from '@/lib/behavior-cases'
import { db } from '@/lib/db'
import { schoolStaff } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { parseCasePrefs, parseTemplates, daysLabel } from '@/lib/counselor-settings'
import { CaseInbox } from './case-inbox'
import { StatCard } from '@/components/stat-card'
import { EmptyState } from '@/components/empty-state'
import { ClipboardList, AlertTriangle, CheckCircle2, Clock } from 'lucide-react'
import { NotificationBell } from '@/components/notification-bell'
import { CounselorRaiseCase } from '@/components/counselor-raise-case'
import { CounselorPupilSearch } from '@/components/counselor-pupil-search'

export const dynamic = 'force-dynamic'

export default async function CounselorInboxPage() {
  // The layout redirects an unauthorised visitor, but this page renders in
  // parallel with it — and a throw here reached the logs as an error on every
  // single anonymous hit. Redirecting says the same thing without the noise.
  const access = await getCounselorAccess()
  if (!access) redirect('/counselor/login')
  const classIds = access.allGrades ? null : await getCounselorClassIds(access)

  // This person's own thresholds and their own saved wording, set in
  // /counselor/settings. Both belong to the counsellor, not to the school: how
  // long is "late" and how many is "repeated" are judgements, and so is how you
  // word bad news to a family.
  const [me] = await db
    .select({ templates: schoolStaff.whatsappTemplates, prefs: schoolStaff.casePrefs })
    .from(schoolStaff)
    .where(eq(schoolStaff.id, access.staffId))
    .limit(1)
  const prefs = parseCasePrefs(me?.prefs)
  const templates = parseTemplates(me?.templates)

  const [open, counts, repeats] = await Promise.all([
    listCases({ schoolId: access.schoolId, classIds, statuses: ['open'], limit: 200 }),
    countCasesByStatus(access.schoolId, classIds),
    countCasesByStudent(access.schoolId, classIds, prefs.repeatThreshold),
  ])

  const staleCutoff = Date.now() - prefs.staleAfterDays * 24 * 60 * 60 * 1000
  const stale = open.filter((c) => c.createdAt.getTime() < staleCutoff).length
  const decidedToday =
    (counts.resolved_privately ?? 0) + (counts.parent_informed ?? 0) +
    (counts.escalated ?? 0) + (counts.dismissed ?? 0)

  // A pupil flagged by several teachers is one signal, not several incidents —
  // and it is the thing no single teacher is in a position to see.
  const repeatByStudent = new Map(repeats.map((r) => [r.studentId, r]))

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">الحالات السلوكية</h1>
          <p className="text-muted-foreground mt-1">
            لا شيء يصل إلى ولي الأمر قبل أن تقرأه — القرار لك
          </p>
        </div>
        <div className="flex items-center gap-2">
          <NotificationBell />
          <CounselorRaiseCase />
        </div>
      </div>

      <CounselorPupilSearch />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="بانتظار قرارك" value={open.length} icon={ClipboardList} accent="amber" />
        <StatCard label={`متأخرة أكثر من ${daysLabel(prefs.staleAfterDays)}`} value={stale} icon={Clock} accent={stale > 0 ? 'red' : 'default'} />
        <StatCard label="طلاب تكررت حالاتهم" value={repeats.length} icon={AlertTriangle} accent="violet" />
        <StatCard label="حالات مغلقة" value={decidedToday} icon={CheckCircle2} accent="emerald" />
      </div>

      {repeats.length > 0 && (
        <div className="rounded-2xl border border-violet-200 bg-violet-50/60 p-4">
          <h2 className="text-sm font-bold text-violet-900 mb-2">طلاب تكررت حالاتهم — انظر النمط لا الحادثة</h2>
          <div className="flex flex-wrap gap-2">
            {repeats.slice(0, 12).map((r) => (
              <span key={r.studentId} className="text-xs bg-card border border-violet-200 rounded-full px-3 py-1">
                <span className="font-bold">{r.studentName}</span>
                {r.className ? ` · فصل ${r.className}` : ''}
                {' — '}
                <span className="font-bold text-violet-700">{r.total} حالات</span>
                {r.teachers > 1 ? ` من ${r.teachers} معلمين` : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      {open.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="لا توجد حالات بانتظارك"
          description="كل ما رفعه المعلمون تمت معالجته"
        />
      ) : (
        <CaseInbox
          templates={templates}
          counselorName={access.name}
          schoolName={access.schoolName}
          cases={open.map((c) => ({
            id: c.id,
            studentId: c.studentId,
            studentName: c.studentName,
            className: c.className,
            gradeName: c.gradeName,
            subjectName: c.subjectName,
            teacherName: c.teacherName,
            teacherNote: c.teacherNote,
            adminNote: c.adminNote,
            date: c.date,
            createdAt: c.createdAt.toISOString(),
            isStale: c.createdAt.getTime() < staleCutoff,
            repeatCount: repeatByStudent.get(c.studentId)?.total ?? 1,
            repeatTeachers: repeatByStudent.get(c.studentId)?.teachers ?? 1,
          }))}
        />
      )}
    </div>
  )
}
