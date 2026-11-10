// The real seams for lib/flowweb/claim.ts (LIVE-2251). SERVER-ONLY.
// authz-delegated: the caller (app/api/webhooks/flowweb-claim/route.ts) verifies FlowWeb's HMAC
// signature before any of this runs; every write binds to the item id or the event this build made.

import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { envFlag } from '@/lib/env/string'
import { isSuppressed } from '@/lib/suppression'
import { getRootSpaceId } from '@/lib/crm/import/store'
import { resolveSeedOwnerProfileId } from '@/lib/listing-seeder/seed-owner'
import { createEventDraft, publishEventDraft } from '@/lib/events/event-drafts'
import { coerceIsoDate } from '@/lib/events/normalize'
import type { ClaimDeps, ClaimItem } from './claim'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://frequencylocal.com'

type Loose = {
  from: (t: string) => {
    select: (c: string) => {
      eq: (c: string, v: unknown) => Loose2
    }
    update: (v: Record<string, unknown>) => { eq: (c: string, v: unknown) => Promise<{ error: unknown }> }
  }
}
type Loose2 = {
  eq: (c: string, v: unknown) => Loose2
  maybeSingle: () => Promise<{ data: Record<string, unknown> | null }>
}
const db = () => createAdminClient() as unknown as Loose

/** Posts the found event for its organizer (seed owner as poster) and returns its claim link. Reuses an
 *  event this item already built, so a retried POST never builds two. */
async function buildEvent(item: ClaimItem): Promise<{ claimUrl: string; eventUrl: string } | null> {
  const startsAt = coerceIsoDate(item.event.startsAt ?? '')
  if (!item.event.title || !startsAt) return null
  const prior = await db()
    .from('events')
    .select('slug, claim_token')
    .eq('details->flowweb->>item_id', item.id)
    .maybeSingle()
  if (prior.data?.claim_token && prior.data.slug)
    return { claimUrl: `${APP_URL}/events/claim/${prior.data.claim_token}`, eventUrl: `${APP_URL}/events/${prior.data.slug}` }
  const owner = await resolveSeedOwnerProfileId()
  if (!owner) return null
  // No organizer contact at create time: publishing would otherwise send the stock claim email on
  // top of the founder's own message. The contact is stamped right after, so the public "claim it" path works.
  const draft = await createEventDraft(owner, {
    title: item.event.title,
    startsAt,
    organizerName: item.name ?? undefined,
    description: `Listed on Frequency from ${item.event.url || item.sourceUrl}. Is this your event? Claim it to run it here.`,
    details: { flowweb: { item_id: item.id, hunt_id: item.huntId, source_url: item.sourceUrl, event_url: item.event.url } } as never,
  })
  if (!draft) return null
  const pub = await publishEventDraft(owner, draft.id, 'posted')
  if (!pub?.claimToken) return null
  await db().from('events').update({ organizer_contact: item.to }).eq('id', draft.id)
  return { claimUrl: `${APP_URL}/events/claim/${pub.claimToken}`, eventUrl: `${APP_URL}/events/${pub.slug}` }
}

export const realClaimDeps: ClaimDeps = {
  enabled: () => envFlag('FLOWWEB_CLAIM_ENABLED'),
  isSuppressed: async (email) => {
    const root = await getRootSpaceId()
    return root ? isSuppressed(email, root) : true
  },
  buildEvent,
}
