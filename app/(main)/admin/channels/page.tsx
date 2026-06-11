import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { NewChannelCompose } from '@/components/compose/new-channel-compose'
import { getChannelsAdminData } from './load-channels'
import { ChannelsAdminList } from './channels-admin-list'


export default async function AdminChannelsPage() {
  const { profileId } = await requireAdmin('host', { staff: 'community' })
  const { scopeOptions, visible, hidden } = await getChannelsAdminData(profileId)

  return (
    <AdminTemplate
      title="Channels"
      eyebrow="Community"
      description="Manage channels across your scope. Archiving hides from discovery."
      actions={scopeOptions.length > 0 ? <NewChannelCompose scopeOptions={scopeOptions} /> : undefined}
      width="default"
    >
      <AdminSection>
        <ChannelsAdminList visible={visible} hidden={hidden} />
      </AdminSection>
    </AdminTemplate>
  )
}
