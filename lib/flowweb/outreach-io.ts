// The real seams for lib/flowweb/outreach.ts (LIVE-2251). SERVER-ONLY.
// authz-delegated: the caller (app/api/webhooks/flowweb-outreach/route.ts) verifies FlowWeb's HMAC
// signature before any of this runs; every write binds to the item id or the event this build made.

import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { envFlag, envStringOrNull } from '@/lib/env/string'
import { isSuppressed } from '@/lib/suppression'
import { buildSpaceUnsubscribeUrl } from '@/lib/unsubscribe-tokens'
import { enqueueEmail, listUnsubscribeHeaders } from '@/lib/email'
import { PLATFORM_POSTAL_LINE } from '@/lib/email-studio/postal'
import { getRootSpaceId } from '@/lib/crm/import/store'
import { conversationAddress } from '@/lib/comms/from-address'
import { resolveSeedOwnerProfileId } from '@/lib/listing-seeder/seed-owner'
import { createEventDraft, publishEventDraft } from '@/lib/events/event-drafts'
import { coerceIsoDate } from '@/lib/events/normalize'
import type { OutreachDeps, OutreachItem } from './outreach'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://frequencylocal.com'

type Loose = {
  from: (t: string) => {
    select: (c: string, o?: { count: 'exact'; head: true }) => {
      eq: (c: string, v: unknown) => Loose2
      gte: (c: string, v: unknown) => Promise<{ count: number | null }>
    }
    insert: (row: Record<string, unknown>) => Promise<{ error: unknown }>
    update: (v: Record<string, unknown>) => { eq: (c: string, v: unknown) => Promise<{ error: unknown }> }
  }
}
type Loose2 = {
  eq: (c: string, v: unknown) => Loose2
  gte: (c: string, v: unknown) => Promise<{ count: number | null }>
  maybeSingle: () => Promise<{ data: Record<string, unknown> | null }>
}
const db = () => createAdminClient() as unknown as Loose

/** Posts the found event for its organizer (seed owner as poster) and returns its claim link. Reuses an
 *  event this item already built, so a retried POST never builds two. */
async function buildEvent(item: OutreachItem): Promise<{ claimUrl: string; eventUrl: string } | null> {
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
  // top of this message. The contact is stamped right after, so the public "claim it" path works.
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

function html(text: string): string {
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const linked = esc.replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}">${u}</a>`)
  return `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5">${linked.replace(/\n/g, '<br>')}</div>`
}

export const realOutreachDeps: OutreachDeps = {
  enabled: () => envFlag('FLOWWEB_OUTREACH_ENABLED'),
  replyTo: () => envStringOrNull('FLOWWEB_OUTREACH_REPLY_TO'),
  dailyCap: () => {
    const n = Number.parseInt(envStringOrNull('FLOWWEB_OUTREACH_DAILY_CAP') ?? '', 10)
    return Number.isFinite(n) && n >= 0 ? Math.min(n, 500) : 50
  },
  isSuppressed: async (email) => {
    const root = await getRootSpaceId()
    return root ? isSuppressed(email, root) : true
  },
  sentToday: async () => {
    const since = new Date(Date.now() - 86_400_000).toISOString()
    const { count } = await db()
      .from('outreach_sends')
      .select('id', { count: 'exact', head: true })
      .eq('error', 'flowweb_hunt')
      .eq('status', 'queued')
      .gte('created_at', since)
    return count ?? Number.POSITIVE_INFINITY
  },
  buildEvent,
  unsubscribeUrl: async (email) => {
    const root = await getRootSpaceId()
    return root ? buildSpaceUnsubscribeUrl({ baseUrl: APP_URL, spaceId: root, email }) : null
  },
  postal: PLATFORM_POSTAL_LINE,
  send: async (m) => {
    const name = envStringOrNull('FLOWWEB_OUTREACH_FROM_NAME') ?? 'Frequency'
    await enqueueEmail(
      {
        to: m.to,
        from: `${name.replace(/[<>"\r\n]/g, '')} <${conversationAddress()}>`,
        replyTo: m.replyTo,
        subject: m.subject,
        text: m.text,
        html: html(m.text),
        headers: listUnsubscribeHeaders(m.unsubscribeUrl),
        tags: [{ name: 'source', value: 'flowweb_hunt' }],
      },
      { dedupeKey: m.dedupeKey },
    )
  },
  record: async (item, status) => {
    const root = await getRootSpaceId()
    if (!root) return
    // outreach_sends has no source column: `error` carries the marker the daily cap counts on.
    await db().from('outreach_sends').insert({ space_id: root, email: item.to, status, error: 'flowweb_hunt' })
  },
}
