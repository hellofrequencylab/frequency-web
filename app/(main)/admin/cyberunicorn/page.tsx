import { Nfc } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import { CyberUnicornConsole } from '@/components/spaces/loyalty/cyberunicorn-console'
import { findSpaceForConsole, listBadgeRequests, listSpacesForConsole } from '@/lib/devices/badges'
import { scannerDevicesEnabled } from '@/lib/devices/store'

export const dynamic = 'force-dynamic'

// THE CYBERUNICORN (LIVE-1180, LIVE-1182): the USB programming portal, for platform staff (Admin and
// Janitor). Plug the CyberUnicorn 5000 into this computer, pick ANY Space, and write its NFC check-in
// placard on the spot (the sales-visit demo), then tap it with a phone and watch the check-in land. It
// also writes member badges (members ask on a Space's page; the request waits here), sets the board up
// as a counter scanner, and mirrors the board's screen live with its buttons beside it.
// `?space=<slug>` opens the portal on that Space (QR Studio's "Program placard" links here).
export default async function CyberUnicornPage({ searchParams }: { searchParams: Promise<{ space?: string }> }) {
  await requireAdmin('admin')
  const on = scannerDevicesEnabled()
  const { space: slug } = await searchParams
  const [requests, spaces, initialSpace] = on
    ? await Promise.all([listBadgeRequests(), listSpacesForConsole(), slug ? findSpaceForConsole(slug.trim().toLowerCase()) : Promise.resolve(null)])
    : [[], [], null]

  return (
    <AdminTemplate
      title="CyberUnicorn"
      eyebrow="Growth"
      icon={Nfc}
      width="wide"
      description="Program any Space's NFC check-in placard with the CyberUnicorn, then tap it with a phone."
    >
      <AdminSection>
        {on ? (
          <CyberUnicornConsole requests={requests} spaces={spaces} initialSpace={initialSpace ? { spaceId: initialSpace.id, spaceName: initialSpace.name } : null} />
        ) : (
          <EmptyState title="The CyberUnicorn is not switched on yet." description="Turn on SCANNER_DEVICES_ENABLED to write placards and badges." />
        )}
      </AdminSection>
    </AdminTemplate>
  )
}
