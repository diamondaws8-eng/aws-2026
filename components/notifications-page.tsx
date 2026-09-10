'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, AlertTriangle, CheckCircle2, ArrowUpCircle, Undo2, MessageSquare, UserX, Clock, Loader2, CheckCheck } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import { NotificationBell } from '@/components/notification-bell'
import {
  getMyNotificationsInbox,
  markNotificationsRead,
  markAllNotificationsRead,
  type BellData,
} from '@/app/notifications-actions'

const KIND_META: Record<string, { icon: LucideIcon; className: string; label: string }> = {
  announcement: { icon: Bell, className: 'bg-blue-50 text-blue-600 border-blue-100', label: 'تنبيه من الإدارة' },
  case_raised: { icon: AlertTriangle, className: 'bg-amber-50 text-amber-600 border-amber-100', label: 'حالة جديدة' },
  case_decided: { icon: CheckCircle2, className: 'bg-emerald-50 text-emerald-600 border-emerald-100', label: 'قرار في حالة' },
  case_escalated: { icon: ArrowUpCircle, className: 'bg-violet-50 text-violet-600 border-violet-100', label: 'حالة محالة إليك' },
  case_returned: { icon: Undo2, className: 'bg-amber-50 text-amber-600 border-amber-100', label: 'حالة أُعيدت' },
  parent_informed: { icon: MessageSquare, className: 'bg-rose-50 text-rose-600 border-rose-100', label: 'ملاحظة بخصوص ابنك' },
  absence: { icon: UserX, className: 'bg-red-50 text-red-600 border-red-100', label: 'غياب' },
  late_arrival: { icon: Clock, className: 'bg-amber-50 text-amber-600 border-amber-100', label: 'وصول متأخر' },
}

function formatWhen(date: Date): string {
  return date.toLocaleString('ar-SA-u-ca-gregory', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

/**
 * The full list behind the bell, shared by all four portals. The bell shows the
 * last twenty; this shows the rest and is where somebody goes looking for a
 * message they remember but cannot find.
 */
export function NotificationsPage({ title, subtitle }: { title: string; subtitle: string }) {
  const router = useRouter()
  const [data, setData] = useState<BellData>({ unread: 0, items: [] })
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      setData(await getMyNotificationsInbox(100))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const openItem = (id: string, href: string | null, unread: boolean) => {
    if (unread) {
      setData((d) => ({
        unread: Math.max(0, d.unread - 1),
        items: d.items.map((i) => (i.id === id ? { ...i, readAt: new Date() } : i)),
      }))
      markNotificationsRead([id]).catch(() => {})
    }
    if (href) router.push(href)
  }

  const readAll = async () => {
    setData((d) => ({ unread: 0, items: d.items.map((i) => ({ ...i, readAt: i.readAt ?? new Date() })) }))
    await markAllNotificationsRead().catch(() => {})
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
          <p className="text-muted-foreground mt-1">
            {subtitle}
            {data.unread > 0 ? ` · ${data.unread} غير مقروء` : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
        {data.unread > 0 && (
          <button
            onClick={readAll}
            className="inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-xl border border-border hover:bg-muted transition-colors"
          >
            <CheckCheck className="size-4" /> تعليم الكل كمقروء
          </button>
        )}
        <NotificationBell />
        </div>
      </div>

      {loading ? (
        <div className="p-10 flex justify-center text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
        </div>
      ) : data.items.length === 0 ? (
        <EmptyState icon={Bell} title="لا توجد إشعارات" description="سيظهر هنا كل ما يخصّك بمجرد حدوثه" />
      ) : (
        <div className="space-y-2">
          {data.items.map((item) => {
            const meta = KIND_META[item.kind] ?? KIND_META.announcement
            const Icon = meta.icon
            const unread = !item.readAt
            return (
              <button
                key={item.id}
                onClick={() => openItem(item.id, item.href, unread)}
                className={`w-full text-right flex gap-3 rounded-2xl border p-4 transition-colors hover:border-primary/40 ${
                  unread ? 'border-primary/30 bg-primary/5' : 'border-border bg-card'
                }`}
              >
                <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl border ${meta.className}`}>
                  <Icon className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className={`text-sm ${unread ? 'font-bold' : 'font-semibold'}`}>{item.title}</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                      {meta.label}
                    </span>
                    {unread && <span className="size-2 rounded-full bg-rose-500" />}
                  </span>
                  {item.body && (
                    <span className="block text-sm text-muted-foreground mt-1.5 leading-6 whitespace-pre-wrap">{item.body}</span>
                  )}
                  <span className="block text-xs text-muted-foreground/70 mt-2">
                    {item.actorName ? `${item.actorName} · ` : ''}
                    {formatWhen(new Date(item.createdAt))}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
