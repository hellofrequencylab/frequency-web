import { Radar } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminPage } from '@/components/admin/admin-page'
import { getConnectionSettings } from '@/lib/connections/connection-settings'
import { ConnectionSettingsAdmin } from '@/components/admin/connection-settings-admin'

export const dynamic = 'force-dynamic'

// Platform operator control panel for the connection layer (ADR-186). Master switches
// for discovery/maps/the relationship game, the new-member privacy defaults, and the
// reward economics — all admin-gated. The settings singleton is the source of truth;
// this is just its console.
export default async function AdminConnectionsPage() {
  await requireAdmin('admin')
  const settings = await getConnectionSettings()

  return (
    <AdminPage
      title="Connections"
      icon={Radar}
      eyebrow="Studio"
      description="Master controls for the community connection layer. Discovery, maps, and the relationship game."
    >
      <ConnectionSettingsAdmin settings={settings} />
    </AdminPage>
  )
}
