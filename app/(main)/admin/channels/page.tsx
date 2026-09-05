import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
// THE live create dialog (the same one /channels shows hosts). It posts to createTopicalChannel,
// which writes `topical_channels` and redirects to `/channels/<slug>`, the URL the Channel page
// resolves. The console used to mount a separate legacy form that wrote the retired `channels`
// table and redirected to a uuid the page could not resolve (L9-01, 2026-09-05).
import { NewChannelCompose } from '@/app/(main)/channels/new-channel-compose'
import { getChannelsAdminData } from './load-channels'
import { ChannelsAdminList } from './channels-admin-list'


export default async function AdminChannelsPage() {
  await requireAdmin('host', { staff: 'community' })
  const { pillars, visible, hidden } = await getChannelsAdminData()

  return (
    <AdminTemplate
      title="Channels"
      eyebrow="Community"
      description="Every Channel members can tune into. Hiding one pulls it out of discovery and off its page until you restore it."
      actions={<NewChannelCompose pillars={pillars} />}
      width="default"
    >
      <AdminSection>
        <ChannelsAdminList visible={visible} hidden={hidden} />
      </AdminSection>
    </AdminTemplate>
  )
}
