import { Gift } from 'lucide-react'
import { memberCardsEnabled, readSpaceFace } from '@/lib/member-cards/store'

// THE CARDHOLDER PERK LINE on a Space's page (LIVE-1282, ADR-1874, docs/LOYALTY.md "Member cards"): the
// one line a Space offers to people who carry a Frequency card ("Frequency cardholders: 10% off drinks").
// Any Space on any plan may set it, in its Check-in workspace. Rendered only while member cards are on
// (SCANNER_DEVICES_ENABLED) and a perk is set; nothing otherwise. A service-role read with no viewer,
// so it is safe on the ISR share page. Streams behind Suspense next to the Regulars line. No em dashes.

export async function CardholderPerkNote({ spaceId }: { spaceId: string }) {
  if (!memberCardsEnabled()) return null
  const perk = (await readSpaceFace(spaceId)).cardholderPerk
  if (!perk) return null
  return (
    <p className="mb-4 flex items-center gap-2 rounded-card border border-border bg-surface px-3 py-2 text-body-sm text-text">
      <Gift className="h-4 w-4 shrink-0 text-primary" aria-hidden />
      <span>
        <span className="font-semibold">Frequency cardholders:</span> {perk}
      </span>
    </p>
  )
}
