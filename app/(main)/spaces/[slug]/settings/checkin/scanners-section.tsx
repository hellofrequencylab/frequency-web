import { Nfc } from 'lucide-react'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { ScannerPanel } from '@/components/spaces/loyalty/scanner-panel'
import { CyberUnicornConsole } from '@/components/spaces/loyalty/cyberunicorn-console'
import { getMyProfileId } from '@/lib/auth'
import { listMemberCards, listScannerDevices, readMemberHandle, scannerDevicesEnabled } from '@/lib/devices/store'
import type { Space } from '@/lib/spaces/types'

// COUNTER SCANNERS, the owner side (LIVE-1125, docs/LOYALTY.md "Counter scanners"). Lives in the Check-in
// panel next to Regulars because a scanner checks members in on THIS Space's door node: a card tap at
// the counter is the same check-in as a phone scan at the door. No new module, panel or menu row
// (MENU-CONTRACT). While SCANNER_DEVICES_ENABLED is off the section says so and shows nothing to edit.
// The reads are owner-gated in lib/devices/store.ts. Copy obeys CONTENT-VOICE, no em dashes.
// The CyberUnicorn console sits first: plug the CyberUnicorn 5000 into this computer and it writes member
// cards over USB. It is the one block here in the CyberUnicorn design system; the rest stays Frequency.

export async function ScannersSection({ space, staffViewing }: { space: Space; staffViewing: boolean }) {
  if (!scannerDevicesEnabled()) {
    return (
      <section>
        <SectionHeader title="Counter scanners" />
        <EmptyState
          icon={Nfc}
          title="Counter scanners are not open yet."
          description="A card reader at your counter: members tap their Frequency card and it checks them in like the door code."
        />
      </section>
    )
  }

  const viewerId = await getMyProfileId()
  const [devices, cards, handle] = await Promise.all([
    listScannerDevices(space.id),
    listMemberCards(space.id),
    viewerId ? readMemberHandle(viewerId) : Promise.resolve(null),
  ])

  return (
    <section>
      <SectionHeader title="Counter scanners" count={devices.filter((d) => d.active).length} />
      <p className="mb-4 text-body-sm text-muted">
        A card reader at your counter. A member taps their card and it checks them in on your door code: the same stamp, Zaps and
        hunts as a phone scan.
      </p>
      <fieldset disabled={staffViewing} className="contents">
        {!staffViewing && (
          <div className="mb-6">
            <CyberUnicornConsole spaceId={space.id} spaceName={space.brandName ?? space.name} defaultHandle={handle} />
          </div>
        )}
        <ScannerPanel spaceId={space.id} devices={devices} cards={cards} />
      </fieldset>
    </section>
  )
}
