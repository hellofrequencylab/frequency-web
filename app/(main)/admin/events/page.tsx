import { requireAdmin } from '@/lib/admin/guard'
import { AdminPage, AdminSection } from '@/components/admin/admin-page'
import { EventCompose } from '@/app/(main)/events/event-compose'
import { getEventsAdminData } from './load-events'
import { EventsAdminList } from './events-admin-list'


export default async function AdminEventsPage() {
  const { profileId } = await requireAdmin('host', { staff: 'community' })
  const { upcoming, past, myCircles } = await getEventsAdminData(profileId)

  return (
    <AdminPage
      title="Events"
      eyebrow="Community"
      description="Manage events across your circles. Cancel or reinstate from here."
      actions={<EventCompose groups={myCircles} />}
      width="default"
    >
      <AdminSection>
        <EventsAdminList upcoming={upcoming} past={past} />
      </AdminSection>
    </AdminPage>
  )
}
