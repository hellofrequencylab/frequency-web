// Studio campaigns: segments (who) + the email body builder. Send orchestration
// lives in the campaigns server action. Server-only; untyped client view until
// types regenerate. v1 targets member contacts (so the profile-based unsubscribe
// works); lead/non-member segments come with a contact-based unsubscribe later.

import { createAdminClient } from '@/lib/supabase/admin'
import { resolveSegmentProfileIds, listSegmentChoices } from '@/lib/traits/segments'
import {
  parsePlaceSelector,
  resolvePlaceTreeProfileIds,
  type PlaceType,
} from '@/lib/messaging/place-tree'

/** A built-in audience, a trait segment (`seg:<slug>`), or a place-tree selector
 *  (`circle:<id>` / `hub:<id>` / `nexus:<id>`, CRM Phase 5). */
export type SegmentKey = string

/** Trait-segment keys are namespaced so they can't collide with built-ins. */
export const TRAIT_SEGMENT_PREFIX = 'seg:'

export const BUILTIN_SEGMENTS: { key: SegmentKey; label: string }[] = [
  { key: 'members', label: 'All members (not unsubscribed)' },
  { key: 'subscribed_members', label: 'Subscribed members only' },
  // Beta Command Center audience (additive). Confirmed beta_waitlist contacts that
  // already hold a Frequency profile, so the profile-based unsubscribe still works.
  // Pre-account waitlist folks (no profile_id) are reached transactionally, not here.
  { key: 'beta_waitlist', label: 'Beta waitlist (confirmed, has account)' },
]

/** A classified audience key. A place selector is one audience type that spans the place tree
 *  (circles/hubs/nexuses) the same way a trait segment spans the Member Data Platform. */
export type ParsedSegmentKey =
  | { kind: 'builtin'; slug: string }
  | { kind: 'trait'; slug: string }
  | { kind: 'place'; place: PlaceType; id: string }

/** Pure: classify an audience key. A `circle:/hub:/nexus:<id>` string is a place selector; a
 *  `seg:<slug>` string is a trait segment; anything else is a built-in audience. Unit-tested. */
export function parseSegmentKey(key: string): ParsedSegmentKey {
  const place = parsePlaceSelector(key)
  if (place) return { kind: 'place', place: place.type, id: place.id }
  return key.startsWith(TRAIT_SEGMENT_PREFIX)
    ? { kind: 'trait', slug: key.slice(TRAIT_SEGMENT_PREFIX.length) }
    : { kind: 'builtin', slug: key }
}

/** Built-in audiences + saved trait segments — the activation picker (Phase 4). */
export async function listSegmentOptions(): Promise<{ key: SegmentKey; label: string }[]> {
  const choices = await listSegmentChoices()
  return [
    ...BUILTIN_SEGMENTS,
    ...choices.map((c) => ({ key: `${TRAIT_SEGMENT_PREFIX}${c.slug}`, label: `Segment: ${c.name}` })),
  ]
}

export interface Recipient {
  contactId: string
  email: string
  profileId: string
}

/** Member contacts in a segment, excluding unsubscribed (suppression is enforced at
 *  send). Trait segments (`seg:<slug>`) resolve via the Member Data Platform, then map
 *  to member contacts; built-ins query contacts directly. */
export async function resolveSegment(segment: SegmentKey): Promise<Recipient[]> {
  const db = createAdminClient()
  const parsed = parseSegmentKey(segment)

  // Place-tree selector (CRM Phase 5): a Circle / Hub / Nexus resolves through its memberships to
  // the profile ids of its active members, then maps onto member contacts EXACTLY like a trait
  // segment (same not-unsubscribed rule, same profile-based unsubscribe). One audience type, both
  // worlds. FAIL-SAFE: an empty / unresolvable place is nobody, never everybody.
  if (parsed.kind === 'place') {
    const profileIds = await resolvePlaceTreeProfileIds({ type: parsed.place, id: parsed.id })
    if (!profileIds.length) return []
    const { data } = await db
      .from('contacts')
      .select('id, email, profile_id, consent_state')
      .in('profile_id', profileIds)
      .neq('consent_state', 'unsubscribed')
    return (data ?? [])
      .filter((c) => c.profile_id && c.email)
      .map((c) => ({ contactId: c.id, email: c.email as string, profileId: c.profile_id as string }))
  }

  if (parsed.kind === 'trait') {
    const profileIds = await resolveSegmentProfileIds(parsed.slug)
    if (!profileIds.length) return []
    const { data } = await db
      .from('contacts')
      .select('id, email, profile_id, consent_state')
      .in('profile_id', profileIds)
      .neq('consent_state', 'unsubscribed')
    return (data ?? [])
      .filter((c) => c.profile_id && c.email)
      .map((c) => ({ contactId: c.id, email: c.email as string, profileId: c.profile_id as string }))
  }

  let q = db
    .from('contacts')
    .select('id, email, profile_id, consent_state')
    .not('profile_id', 'is', null)
    .neq('consent_state', 'unsubscribed')
  if (parsed.slug === 'subscribed_members') q = q.eq('consent_state', 'subscribed')
  // Beta waitlist: the same profile-bearing, not-unsubscribed rule, narrowed to the
  // contacts that came in through the Beta waitlist capture (source = 'beta_waitlist').
  if (parsed.slug === 'beta_waitlist') q = q.eq('source', 'beta_waitlist')

  const { data } = await q
  return (data ?? [])
    .filter((c) => c.profile_id && c.email)
    .map((c) => ({ contactId: c.id, email: c.email as string, profileId: c.profile_id as string }))
}

export interface CampaignRow {
  id: string
  subject: string
  segment: string
  status: string
  recipientCount: number
  sentAt: string | null
  createdAt: string | null
}

export async function listCampaigns(limit = 50): Promise<CampaignRow[]> {
  const db = createAdminClient()
  const { data } = await db
    .from('campaigns')
    .select('id, subject, segment, status, recipient_count, sent_at, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data ?? []).map((c) => ({
    id: c.id,
    subject: c.subject,
    segment: c.segment,
    status: c.status,
    recipientCount: Number(c.recipient_count ?? 0),
    sentAt: c.sent_at ?? null,
    createdAt: c.created_at ?? null,
  }))
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Wrap a plain-text campaign body in a minimal email + unsubscribe footer. */
export function campaignEmail(body: string, unsubscribeUrl: string): { html: string; text: string } {
  const paras = body
    .split(/\n{2,}/)
    .map(
      (p) =>
        `<p style="font-size:15px;color:#333;line-height:1.6;margin:0 0 16px;">${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`,
    )
    .join('')
  const html = `<div style="max-width:560px;margin:0 auto;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;padding:24px;">${paras}<hr style="border:none;border-top:1px solid #eee;margin:24px 0;"/><p style="font-size:12px;color:#999;line-height:1.6;">You're receiving this as a Frequency member. <a href="${unsubscribeUrl}" style="color:#999;">Unsubscribe</a>.</p></div>`
  const text = `${body}\n\n---\nUnsubscribe: ${unsubscribeUrl}`
  return { html, text }
}
