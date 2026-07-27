import { BroadcastComposer } from '@/components/comms/broadcast-composer'
import type { BroadcastChannelOption } from '@/components/comms/broadcast-types'
import { loadSpaceBroadcastSegments } from '@/lib/spaces/broadcast-audience'
import { isSpaceEmailEnabled } from '@/lib/spaces/email'
import { sendSpaceBroadcast } from './broadcast-actions'

// THE SPACE MESSAGE CENTER's composer (ADR-858). A self-fetching RSC (streams behind its
// own <Suspense>, PAGE-FRAMEWORK §5): loads the Space's audience segments (members, paid
// tiers, its circles, its upcoming events' RSVPs), decides per-channel availability
// HONESTLY for this Space, and mounts the shared BroadcastComposer with the slug-bound
// server action — the exact adoption contract broadcast-types.ts describes. The page
// gates space-manage; the action re-checks it. Copy is plain, no em dashes.

export async function SpaceBroadcastSection({
  spaceId,
  slug,
  spaceName,
}: {
  spaceId: string
  slug: string
  spaceName: string
}) {
  const [segments, emailOn] = await Promise.all([
    loadSpaceBroadcastSegments(spaceId),
    isSpaceEmailEnabled(spaceId),
  ])

  const channels: BroadcastChannelOption[] = [
    // Refuse-first: when the Space's email kill switch is off, the chip says so instead of
    // offering a send the delivery core would refuse.
    emailOn
      ? { key: 'email', enabled: true, note: `Rides ${spaceName}'s campaign lane; it reaches people subscribed to its emails.` }
      : { key: 'email', enabled: false, note: `Turn on email for ${spaceName} in its settings first` },
    { key: 'dm', enabled: true, note: 'Lands in each person’s Frequency inbox as a message from the space.' },
    {
      key: 'dispatch',
      enabled: true,
      note: 'Sends a Dispatch to ALL space members (rail, digest, and push), whatever segments you pick.',
    },
    // Refuse-first SMS (ADR-256): infrastructure exists but A2P is not filed, so Text is a
    // disabled chip with an honest note, never a toggle that silently does nothing.
    { key: 'sms', enabled: false, note: 'Coming soon' },
  ]

  return (
    <BroadcastComposer
      heading="Message center"
      segments={segments}
      channels={channels}
      send={sendSpaceBroadcast.bind(null, slug)}
      bodyPlaceholder="What should your people know? News, a schedule change, what is coming up."
    />
  )
}
