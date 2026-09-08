import { requireCounselor, getCounselorClassIds } from '@/lib/counselor-access'
import { listCases, CASE_STATUS, type CaseStatus } from '@/lib/behavior-cases'
import { EmptyState } from '@/components/empty-state'
import { ScrollText } from 'lucide-react'
import { NotificationBell } from '@/components/notification-bell'

export const dynamic = 'force-dynamic'

const STATUS_STYLE: Record<CaseStatus, string> = {
  open: 'bg-amber-50 text-amber-700 border-amber-100',
  resolved_privately: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  parent_informed: 'bg-blue-50 text-blue-700 border-blue-100',
  escalated: 'bg-violet-50 text-violet-700 border-violet-100',
  admin_handled: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  dismissed: 'bg-slate-50 text-slate-700 border-slate-200',
}

export default async function CounselorArchivePage() {
  const access = await requireCounselor()
  const classIds = access.allGrades ? null : await getCounselorClassIds(access)

  const cases = await listCases({
    schoolId: access.schoolId,
    classIds,
    statuses: ['resolved_privately', 'parent_informed', 'escalated', 'admin_handled', 'dismissed'],
    limit: 200,
  })

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">أرشيف الحالات</h1>
          <p className="text-muted-foreground mt-1">كل حالة أُغلقت وكيف انتهت</p>
        </div>
        <NotificationBell />
      </div>

      {cases.length === 0 ? (
        <EmptyState icon={ScrollText} title="الأرشيف فارغ" description="لم تُغلق أي حالة بعد" />
      ) : (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-muted text-muted-foreground text-xs">
                <tr>
                  <th className="p-3 font-semibold">الطالب</th>
                  <th className="p-3 font-semibold">الفصل</th>
                  <th className="p-3 font-semibold">المعلم</th>
                  <th className="p-3 font-semibold">التاريخ</th>
                  <th className="p-3 font-semibold">النتيجة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {cases.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/40">
                    <td className="p-3 font-semibold">{c.studentName}</td>
                    <td className="p-3 text-muted-foreground text-xs">
                      {c.gradeName ? `${c.gradeName} — ` : ''}{c.className ? `فصل ${c.className}` : '—'}
                    </td>
                    <td className="p-3 text-muted-foreground text-xs">{c.teacherName}</td>
                    <td className="p-3 text-muted-foreground text-xs whitespace-nowrap">{c.date}</td>
                    <td className="p-3">
                      <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${STATUS_STYLE[c.status]}`}>
                        {CASE_STATUS[c.status]}
                        {c.status === 'escalated' && c.escalatedToName ? ` — ${c.escalatedToName}` : ''}
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
  )
}
