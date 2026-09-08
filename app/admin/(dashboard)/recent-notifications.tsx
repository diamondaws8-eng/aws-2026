import { Bell, AlertTriangle, UserX, GraduationCap } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'

type Notif = {
  id: string
  title: string
  body: string
  type: string
  createdAt: Date
}

const TYPE_META: Record<string, { icon: LucideIcon; label: string; text: string; ring: string; badge: string }> = {
  warning: { icon: AlertTriangle, label: 'تحذير', text: 'text-amber-600', ring: 'border-r-amber-400', badge: 'bg-amber-50 text-amber-700 border-amber-100' },
  absence: { icon: UserX, label: 'غياب', text: 'text-rose-600', ring: 'border-r-rose-400', badge: 'bg-rose-50 text-rose-700 border-rose-100' },
  grade: { icon: GraduationCap, label: 'درجات', text: 'text-emerald-600', ring: 'border-r-emerald-400', badge: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
  info: { icon: Bell, label: 'معلومة', text: 'text-blue-600', ring: 'border-r-blue-400', badge: 'bg-blue-50 text-blue-700 border-blue-100' },
}

function relativeTimeAr(date: Date): string {
  const diffMs = Date.now() - date.getTime()
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'الآن'
  if (minutes < 60) return `منذ ${minutes} د`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `منذ ${hours} س`
  const days = Math.floor(hours / 24)
  if (days < 7) return `منذ ${days} يوم`
  return date.toLocaleDateString('ar-SA', { day: 'numeric', month: 'short' })
}

export function RecentNotifications({ notifications }: { notifications: Notif[] }) {
  return (
    <div className="relative overflow-hidden bg-card border border-border rounded-2xl p-6">
      <div className="absolute -top-16 -left-14 size-48 rounded-full bg-blue-400/10 blur-3xl" />
      <div className="relative flex items-center gap-3 mb-5">
        <div className="flex size-11 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
          <Bell className="size-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold">آخر التنبيهات</h2>
          <p className="text-sm text-muted-foreground">أحدث 5 تنبيهات نشطة</p>
        </div>
      </div>

      {notifications.length > 0 ? (
        <div className="relative space-y-3">
          {notifications.map((notif) => {
            const meta = TYPE_META[notif.type] ?? TYPE_META.info
            const Icon = meta.icon
            return (
              <div
                key={notif.id}
                className={`flex items-start gap-3 p-3 rounded-xl bg-muted/60 border-r-4 ${meta.ring} transition-colors hover:bg-muted`}
              >
                <div className={`flex size-8 shrink-0 items-center justify-center rounded-lg bg-card border border-border ${meta.text}`}>
                  <Icon className="size-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-bold text-sm truncate">{notif.title}</h3>
                    <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border ${meta.badge}`}>
                      {meta.label}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{notif.body}</p>
                  <p className="text-xs text-muted-foreground/70 mt-1.5">{relativeTimeAr(notif.createdAt)}</p>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <EmptyState title="لا يوجد تنبيهات" description="لم يتم إرسال أي تنبيهات مؤخراً" icon={Bell} />
      )}
    </div>
  )
}
