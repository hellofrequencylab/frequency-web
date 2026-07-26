import { createAdminClient } from '@/lib/supabase/admin'
import { BroadcastComposer } from '@/components/comms/broadcast-composer'
import type { BroadcastChannelOption } from '@/components/comms/broadcast-types'
import { loadEventBroadcastSegments } from '@/lib/events/broadcast-audience'
import { isSpaceEmailEnabled } from '@/lib/spaces/email'
import { sendEventBroadcast } from './broadcast-actions'

// MESSAGE EVERYONE on the event hub's Home tab (ADR-827 ruling 3, first wiring). A
// self-fetching RSC (streams behind its own <Suspense>, PAGE-FRAMEWORK §5): loads the
// audience segments (RSVPs + ticket holders + checked in), decides per-channel
// availability honestly for THIS event, and mounts the shared BroadcastComposer with the
// slug-bound server action. The page already gated 'event.editSettings'; the action
// re-checks it. Copy is plain, no em dashes (docs/CONTENT-VOICE.md).

async function resolveEmailLane(eventId: string): Promise<{ enabled: boolean; note: string }> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('events')
    .select('space_id, host_space_id')
    .eq('id', eventId)
    .maybeSingle()
  const ev = data as { space_id: string | null; host_space_id: string | null } | null
  const hostSpaceId = ev?.host_space_id ?? ev?.space_id ?? null

  // Platform-hosted: the Event Dispatch email lane (per-guest event email preference).
  if (!hostSpaceId) {
    return { enabled: true, note: 'Goes out as an event update email to guests who accept event emails.' }
  }

  const { data: sp } = await admin
    .from('spaces')
    .select('name, brand_name')
    .eq('id', hostSpaceId)
    .maybeSingle()
  const space = sp as { name: string | null; brand_name: string | null } | null
  const spaceName = space?.brand_name ?? space?.name ?? 'the host Space'

  // Refuse-first: when the host Space's email kill-switch is off, the chip says so instead
  // of offering a send that the delivery core would refuse.
  if (!(await isSpaceEmailEnabled(hostSpaceId))) {
    return { enabled: false, note: `Turn on email for ${spaceName} in its settings first` }
  }
  return {
    enabled: true,
    note: `Rides ${spaceName}'s campaign lane; it reaches people subscribed to its emails.`,
  }
}

export async function EventBroadcastSection({ eventId, slug }: { eventId: string; slug: string }) {
  const [segments, emailLane] = await Promise.all([
    loadEventBroadcastSegments(eventId),
    resolveEmailLane(eventId),
  ])

  const channels: BroadcastChannelOption[] = [
    { key: 'email', enabled: emailLane.enabled, note: emailLane.note },
    { key: 'dm', enabled: true, note: 'Lands in each person’s Frequency inbox as a message from you.' },
    {
      key: 'dispatch',
      enabled: true,
      note: 'Posts to the event page and reaches the whole event audience, whatever segments you pick.',
    },
    // Refuse-first SMS (ADR-256): the infrastructure exists but A2P is not filed, so Text
    // is a disabled chip with an honest note, never a toggle that silently does nothing.
    { key: 'sms', enabled: false, note: 'Coming soon' },
  ]

  return (
    <BroadcastComposer
      heading="Message everyone"
      segments={segments}
      channels={channels}
      send={sendEventBroadcast.bind(null, slug)}
      bodyPlaceholder="What should everyone know? A time change, parking, what to bring."
    />
  )
}
