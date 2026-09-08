import { NotificationsPage } from '@/components/notifications-page'

export const dynamic = 'force-dynamic'

export default function AdminMyNotificationsPage() {
  return (
    <NotificationsPage
      title="إشعاراتي"
      subtitle="الحالات المحالة إليك وما يخص حسابك"
    />
  )
}
