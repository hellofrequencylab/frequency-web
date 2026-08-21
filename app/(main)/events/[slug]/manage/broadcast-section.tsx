import { createAdminClient } from '@/lib/supabase/admin'
import { BroadcastComposer } from '@/components/comms/broadcast-composer'
import type { BroadcastChannelOption } from '@/components/comms/broadcast-types'
import { loadEventBroadcastSegments } from '@/lib/events/broadcast-audience'
import {
  loadEventCrmAccess,
  listMyReinviteTargets,
  EVENT_CRM_LOCKED_MESSAGE,
  EVENT_CRM_UPSELL_LINE,
  EVENT_CRM_UPSELL_HREF,
} from '@/lib/events/crm-access'
import { isSpaceEmailEnabled } from '@/lib/spaces/email'
import { sendEventBroadcast, sendEventReinvite } from './broadcast-actions'
import { resolveHostingSpaceIdFromRow } from '@/lib/events/host-space'

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
  // Root EXCLUDED, so a personal event falls to the platform lane below (which is what the very
  // next branch already meant by `!hostSpaceId`).
  const hostSpaceId = await resolveHostingSpaceIdFromRow(ev)

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
    note: `Rides ${spaceName}'s campaign lane. Reaches guests with an email on file, apart from anyone who unsubscribed or muted event emails.`,
  }
}

export async function EventBroadcastSection({ eventId, slug }: { eventId: string; slug: string }) {
  // The access-tier seam (ADR-836): once a personally-hosted event ends, a personal-tier
  // viewer's composer swaps the channel row for ONE action, inviting this list to their next
  // event, with the quiet Business Space upsell line. The server actions re-check the tier.
  const access = await loadEventCrmAccess(eventId)
  if (!access.canMessage) {
    const [segments, targets] = await Promise.all([
      loadEventBroadcastSegments(eventId),
      listMyReinviteTargets(eventId),
    ])
    return (
      <BroadcastComposer
        heading="Message everyone"
        segments={segments}
        channels={[]}
        send={sendEventBroadcast.bind(null, slug)}
        locked={{
          message: EVENT_CRM_LOCKED_MESSAGE,
          upsell: { text: EVENT_CRM_UPSELL_LINE, href: EVENT_CRM_UPSELL_HREF },
          reinvite: {
            targets,
            send: sendEventReinvite.bind(null, slug),
            emptyNote: 'No upcoming events yet. Create your next event, then invite this list to it.',
          },
        }}
      />
    )
  }

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
