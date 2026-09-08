import { NotificationsPage } from '@/components/notifications-page'

export const dynamic = 'force-dynamic'

export default function TeacherNotificationsPage() {
  return (
    <NotificationsPage
      title="الإشعارات"
      subtitle="نتائج الحالات التي رفعتَها وتنبيهات الإدارة"
    />
  )
}
