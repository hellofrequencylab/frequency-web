import { Nfc } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import { CyberUnicornConsole } from '@/components/spaces/loyalty/cyberunicorn-console'
import { listBadgeRequests, listSpacesForConsole } from '@/lib/devices/badges'
import { scannerDevicesEnabled } from '@/lib/devices/store'

export const dynamic = 'force-dynamic'

// THE CYBERUNICORN (LIVE-1180): the USB badge programmer, for platform staff (Admin and Janitor). Plug the
// CyberUnicorn 5000 into this computer, pick a member who asked for a badge on a Space's page (or type a
// Space and a handle), hold a card to the reader, and the console writes their member card for that
// Space. It moved here from a Space's Check in tab on the owner's call (2026-10-20): Spaces ask, staff write.
export default async function CyberUnicornPage() {
  await requireAdmin('admin')
  const on = scannerDevicesEnabled()
  const [requests, spaces] = on ? await Promise.all([listBadgeRequests(), listSpacesForConsole()]) : [[], []]

  return (
    <AdminTemplate
      title="CyberUnicorn"
      eyebrow="Growth"
      icon={Nfc}
      description="Program scannable member badges over USB. Members ask for one on a Space's page; their request waits here until you write their card."
    >
      <AdminSection>
        {on ? (
          <CyberUnicornConsole requests={requests} spaces={spaces} />
        ) : (
          <EmptyState title="Badges are not open yet." description="Turn on SCANNER_DEVICES_ENABLED to write member badges." />
        )}
      </AdminSection>
    </AdminTemplate>
  )
}
