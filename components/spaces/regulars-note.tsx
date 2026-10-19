import Link from 'next/link'
import { Stamp } from 'lucide-react'
import { nearbyLine } from '@/lib/loyalty/nearby'
import { getLoyaltyProgram, loyaltyEnabled } from '@/lib/loyalty/store'

// THE REGULARS LINE on a Space's public page (LIVE-944): one row that says the place runs a stamp card and
// what a full card earns, so a member who found the Space learns there is a reason to check in. Rendered
// only while the switch is on and the program is on; nothing otherwise. Streams behind Suspense. No em dashes.

export async function RegularsNote({ spaceId }: { spaceId: string }) {
  if (!loyaltyEnabled()) return null
  const program = await getLoyaltyProgram(spaceId)
  if (program.status !== 'on') return null
  return (
    <p className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-card border border-border bg-surface px-3 py-2 text-body-sm text-text">
      <Stamp className="h-4 w-4 shrink-0 text-primary" aria-hidden />
      <span>
        <span className="font-semibold">Regulars here.</span> {nearbyLine(program)}. Check in at the door for a stamp and 25 Zaps.
      </span>
      <Link href="/rewards" className="ml-auto text-meta font-semibold text-muted hover:text-text">
        Your cards
      </Link>
    </p>
  )
}
