import { Nfc } from 'lucide-react'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { ScannerPanel } from '@/components/spaces/loyalty/scanner-panel'
import { listMemberCards, listScannerDevices, scannerDevicesEnabled } from '@/lib/devices/store'
import type { Space } from '@/lib/spaces/types'

// COUNTER SCANNERS, the owner side (LIVE-1056, docs/LOYALTY.md "Counter scanners"). Lives in the Check-in
// panel next to Regulars because a scanner checks members in on THIS Space's door node: a card tap at
// the counter is the same check-in as a phone scan at the door. No new module, panel or menu row
// (MENU-CONTRACT). While SCANNER_DEVICES_ENABLED is off the section says so and shows nothing to edit.
// The reads are owner-gated in lib/devices/store.ts. Copy obeys CONTENT-VOICE, no em dashes.

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

  const [devices, cards] = await Promise.all([listScannerDevices(space.id), listMemberCards(space.id)])

  return (
    <section>
      <SectionHeader title="Counter scanners" count={devices.filter((d) => d.active).length} />
      <p className="mb-4 text-body-sm text-muted">
        A card reader at your counter. A member taps their card and it checks them in on your door code: the same stamp, Zaps and
        hunts as a phone scan.
      </p>
      <fieldset disabled={staffViewing} className="contents">
        <ScannerPanel spaceId={space.id} devices={devices} cards={cards} />
      </fieldset>
    </section>
  )
}
