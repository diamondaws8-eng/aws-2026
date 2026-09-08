import { NotificationsPage } from '@/components/notifications-page'

export const dynamic = 'force-dynamic'

export default function CounselorNotificationsPage() {
  return (
    <NotificationsPage
      title="الإشعارات"
      subtitle="الحالات الجديدة وما يعود إليك من الإدارة"
    />
  )
}
