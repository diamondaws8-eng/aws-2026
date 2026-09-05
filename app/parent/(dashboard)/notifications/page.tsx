export const dynamic = 'force-dynamic'

import { getMyChildren, getMyNotifications } from '../actions'
import { formatDateAr } from '@/lib/utils'

export default async function ParentNotificationsPage() {
  const children = await getMyChildren()
  const firstChild = children[0]

  const notifications = firstChild ? await getMyNotifications(firstChild.id) : []

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">الإشعارات</h1>
        <p className="text-sm text-muted-foreground mt-1">آخر رسائل المدرسة وإدارة الفصل</p>
      </div>

      {notifications.length === 0 ? (
        <div className="bg-card border border-border rounded-3xl p-12 text-center">
          <div className="text-5xl mb-3">🔔</div>
          <h2 className="font-bold text-lg mb-2">لا توجد إشعارات جديدة</h2>
          <p className="text-muted-foreground text-sm">ستظهر هنا الإشعارات من إدارة المدرسة</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map(note => {
            const typeColor =
              note.type === 'warning' ? 'border-amber-200 bg-amber-50/50' :
              note.type === 'absence' ? 'border-red-200 bg-red-50/50' :
              note.type === 'grade'   ? 'border-blue-200 bg-blue-50/50' :
              'border-border bg-card'
            const typeEmoji =
              note.type === 'warning' ? '⚠️' :
              note.type === 'absence' ? '❌' :
              note.type === 'grade'   ? '📊' : '📢'

            return (
              <div key={note.id} className={`border rounded-2xl p-4 shadow-sm ${typeColor}`}>
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-bold text-base flex items-center gap-2">
                    <span>{typeEmoji}</span>
                    {note.title}
                  </h3>
                  <span className="text-xs text-muted-foreground bg-background/70 px-2 py-1 rounded-md shrink-0 ml-2">
                    {formatDateAr(note.createdAt.toISOString().split('T')[0])}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{note.body}</p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
