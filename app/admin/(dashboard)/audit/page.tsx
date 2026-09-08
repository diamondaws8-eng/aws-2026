import { redirect } from 'next/navigation'
import { requireAdminAccess, ROLE_LABELS, type AdminRole } from '@/lib/admin-access'
import { getAuditLog, AUDIT_LABELS, type AuditAction } from '@/lib/audit'
import { EmptyState } from '@/components/empty-state'
import { ScrollText, User } from 'lucide-react'

export const dynamic = 'force-dynamic'

const ROLE_BADGE: Record<string, string> = {
  owner: 'bg-amber-50 text-amber-700 border-amber-100',
  quality_manager: 'bg-violet-50 text-violet-700 border-violet-100',
  principal: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  deputy: 'bg-blue-50 text-blue-700 border-blue-100',
  teacher: 'bg-slate-100 text-slate-700 border-slate-200',
  counselor: 'bg-teal-50 text-teal-700 border-teal-100',
}

/** The log also carries entries written from the teacher portal, whose actor is not an admin. */
const OTHER_ROLE_LABELS: Record<string, string> = {
  teacher: 'معلم',
  counselor: 'موجه طلابي',
}

/** Destructive actions stand out in red so they're easy to spot when scanning. */
const DESTRUCTIVE = new Set<string>([
  'student.delete', 'class.delete', 'gradeLevel.delete', 'subject.delete',
  'teacher.delete', 'staff.delete', 'backup.restore',
  // Not destructive, but the decisions a school is most likely to be asked
  // about: a family that was never told, and a look at private notes.
  'case.resolvedPrivately', 'case.noteRead',
])

function formatWhen(date: Date) {
  // 'ar-SA' alone renders Hijri dates. An audit trail has to line up with the
  // Gregorian dates recorded everywhere else, or a date cannot be traced.
  return new Intl.DateTimeFormat('ar-SA-u-ca-gregory', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Riyadh',
  }).format(date)
}

/**
 * Each action stores its own extra context — the day a register was reopened,
 * how many points were given by hand and why. It was written but never shown,
 * which left the log saying that something happened without saying what.
 */
const DETAIL_LABELS: Record<string, string> = {
  date: 'التاريخ',
  students: 'عدد الطلاب',
  points: 'النقاط',
  reason: 'السبب',
  replaced: 'درجات مستبدلة',
  maxScore: 'الدرجة القصوى',
  examType: 'نوع الاختبار',
  role: 'الدور',
  email: 'البريد',
  scope: 'النطاق',
  from: 'الاسم السابق',
  to: 'أُحيلت إلى',
  caseId: 'رقم الحالة',
  unassignedSubjects: 'مواد أُلغي إسنادها',
  allGrades: 'كل المراحل',
  parentPhone: 'جوال ولي الأمر',
  studentPointsSkipped: 'نقاط قديمة متجاهَلة',
  pointsRecomputed: 'صفوف أُعيد حسابها',
}

function readDetails(raw: string | null): string {
  if (!raw) return ''
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return Object.entries(parsed)
      .filter(([, v]) => v !== null && v !== undefined && v !== '')
      .map(([k, v]) => `${DETAIL_LABELS[k] ?? k}: ${typeof v === 'boolean' ? (v ? 'نعم' : 'لا') : String(v)}`)
      .join(' · ')
  } catch {
    return ''
  }
}

export default async function AuditPage() {
  const access = await requireAdminAccess()
  // Only the people who can manage the team can review what the team did.
  if (!access.canManageStaff) redirect('/admin')

  const entries = await getAuditLog(access.school.id, 200)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">سجل التدقيق</h1>
        <p className="text-muted-foreground mt-1">
          كل إجراء حسّاس في النظام مسجّل هنا: من نفّذه ومتى — آخر {entries.length} عملية
        </p>
      </div>

      {entries.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="لا توجد عمليات مسجّلة بعد"
          description="سيظهر هنا كل حذف أو تغيير كلمة مرور أو تعديل صلاحيات بمجرد حدوثه"
        />
      ) : (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right">
              <thead className="bg-muted text-muted-foreground text-sm">
                <tr>
                  <th className="p-4 font-semibold">الإجراء</th>
                  <th className="p-4 font-semibold">على</th>
                  <th className="p-4 font-semibold">التفاصيل</th>
                  <th className="p-4 font-semibold">بواسطة</th>
                  <th className="p-4 font-semibold">التاريخ والوقت</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {entries.map((e) => {
                  const destructive = DESTRUCTIVE.has(e.action)
                  return (
                    <tr key={e.id} className="hover:bg-muted/50 transition-colors">
                      <td className="p-4">
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                          destructive
                            ? 'bg-rose-50 text-rose-700 border-rose-100'
                            : 'bg-muted text-muted-foreground border-border'
                        }`}>
                          {AUDIT_LABELS[e.action as AuditAction] ?? e.action}
                        </span>
                      </td>
                      <td className="p-4 font-semibold text-sm">{e.entityName || '—'}</td>
                      <td className="p-4 text-xs text-muted-foreground max-w-[280px]">
                        {readDetails(e.details) || '—'}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                            <User className="size-3.5" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate">{e.actorName}</p>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${ROLE_BADGE[e.actorRole] ?? ''}`}>
                              {ROLE_LABELS[e.actorRole as AdminRole] ?? OTHER_ROLE_LABELS[e.actorRole] ?? e.actorRole}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-sm text-muted-foreground whitespace-nowrap">
                        {formatWhen(e.createdAt)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
