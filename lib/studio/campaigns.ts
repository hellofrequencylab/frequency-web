// Studio campaigns: segments (who) + the email body builder. Send orchestration
// lives in the campaigns server action. Server-only; untyped client view until
// types regenerate. v1 targets member contacts (so the profile-based unsubscribe
// works); lead/non-member segments come with a contact-based unsubscribe later.

import { createAdminClient } from '@/lib/supabase/admin'
import { loadRootSpaceId } from '@/lib/spaces/store'
import { resolveSegmentProfileIds, listSegmentChoices } from '@/lib/traits/segments'
import {
  parsePlaceSelector,
  resolvePlaceTreeProfileIds,
  type PlaceType,
} from '@/lib/messaging/place-tree'
import { resolveEventDispatchAudience } from '@/lib/events/dispatch-audience'

/** A built-in audience, a trait segment (`seg:<slug>`), a place-tree selector
 *  (`circle:<id>` / `hub:<id>` / `nexus:<id>`, CRM Phase 5), an event RSVP audience
 *  (`event:<id>`), or a direct member/contact selector the Resonance CRM composer uses:
 *  `profile:<id>` / `contact:<id>` (one member) and `profiles:<id,...>` / `contacts:<id,...>`
 *  (an ad-hoc set). */
export type SegmentKey = string

// A hard cap so a malformed / hostile ad-hoc key can never resolve an unbounded id list in one pass.
const MAX_ADHOC_IDS = 5_000

/** Pure: split a comma-separated id list (`a, b, ,c`) into a trimmed, de-duplicated, capped array. */
function parseIdList(raw: string): string[] {
  const ids = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return [...new Set(ids)].slice(0, MAX_ADHOC_IDS)
}

/** Trait-segment keys are namespaced so they can't collide with built-ins. */
export const TRAIT_SEGMENT_PREFIX = 'seg:'

export const BUILTIN_SEGMENTS: { key: SegmentKey; label: string }[] = [
  { key: 'members', label: 'All members (not unsubscribed)' },
  { key: 'subscribed_members', label: 'Subscribed members only' },
  // Site sign-ups only — organic members, with the imported email list (source='import')
  // held out. This is the audience for a blast that should reach people who joined ON the
  // site but NOT contacts we uploaded from an outside list. The hold-out is by SOURCE, so it
  // stays correct even after an imported contact later signs up (their contacts row keeps
  // source='import', which no signup path overwrites). See the import commit (source='import')
  // and the profiles_sync_contact trigger (source='signup'/'backfill').
  { key: 'site_signups', label: 'Site sign-ups only (excludes imported list)' },
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
  | { kind: 'event'; id: string }
  | { kind: 'profiles'; ids: string[] }
  | { kind: 'contacts'; ids: string[] }

/** Pure: classify an audience key. A `circle:/hub:/nexus:<id>` string is a place selector; an
 *  `event:<id>` string is an event RSVP audience; `profile:<id>` / `profiles:<id,...>` and
 *  `contact:<id>` / `contacts:<id,...>` are the CRM composer's direct member / contact selectors;
 *  a `seg:<slug>` string is a trait segment; anything else is a built-in audience. Unit-tested.
 *  FAIL-SAFE: a bare prefix (no ids) reads as an EMPTY audience of that kind, never a fall-through
 *  to a built-in, so a malformed selector resolves to nobody rather than everybody. */
export function parseSegmentKey(key: string): ParsedSegmentKey {
  const place = parsePlaceSelector(key)
  if (place) return { kind: 'place', place: place.type, id: place.id }

  const trimmed = key.trim()

  // Direct member / contact selectors (Resonance CRM composer). The plural (ad-hoc set) forms are
  // checked first; `profiles:` never matches `profile:` and vice versa (the 's' precedes the colon).
  if (trimmed.startsWith('profiles:')) return { kind: 'profiles', ids: parseIdList(trimmed.slice('profiles:'.length)) }
  if (trimmed.startsWith('profile:')) return { kind: 'profiles', ids: parseIdList(trimmed.slice('profile:'.length)) }
  if (trimmed.startsWith('contacts:')) return { kind: 'contacts', ids: parseIdList(trimmed.slice('contacts:'.length)) }
  if (trimmed.startsWith('contact:')) return { kind: 'contacts', ids: parseIdList(trimmed.slice('contact:'.length)) }
  if (trimmed.startsWith('event:')) return { kind: 'event', id: trimmed.slice('event:'.length).trim() }

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

/** Map a set of profile ids onto their member contacts (the send-seam shape), excluding
 *  unsubscribed contacts. The SAME query the trait / place / event / ad-hoc-profile paths all
 *  share: a contact must carry both a profile id and an email to be reachable. Fail-safe to []. */
async function recipientsForProfileIds(
  db: ReturnType<typeof createAdminClient>,
  profileIds: string[],
): Promise<Recipient[]> {
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
    return recipientsForProfileIds(db, profileIds)
  }

  // Event RSVP audience (Resonance CRM composer): the event's non-muted guests + its hosting Circle,
  // resolved through the SAME fan-out an Event Dispatch push uses (lib/events/dispatch-audience), then
  // mapped onto member contacts exactly like a place / trait segment. The downstream send-gate still
  // applies each member's consent + preferences. FAIL-SAFE: a missing event is nobody, never everybody.
  if (parsed.kind === 'event') {
    if (!parsed.id) return []
    const profileIds = await resolveEventDispatchAudience(parsed.id)
    return recipientsForProfileIds(db, profileIds)
  }

  // Direct member set (`profile:<id>` / `profiles:<id,...>`): map the given profile ids onto contacts.
  if (parsed.kind === 'profiles') {
    return recipientsForProfileIds(db, parsed.ids)
  }

  // Direct contact set (`contact:<id>` / `contacts:<id,...>`): resolve the contacts by id. A contact
  // must still carry a profile id + email to be reachable (the profile drives the unsubscribe link).
  if (parsed.kind === 'contacts') {
    if (!parsed.ids.length) return []
    const { data } = await db
      .from('contacts')
      .select('id, email, profile_id, consent_state')
      .in('id', parsed.ids)
      .neq('consent_state', 'unsubscribed')
    return (data ?? [])
      .filter((c) => c.profile_id && c.email)
      .map((c) => ({ contactId: c.id, email: c.email as string, profileId: c.profile_id as string }))
  }

  if (parsed.kind === 'trait') {
    const profileIds = await resolveSegmentProfileIds(parsed.slug)
    return recipientsForProfileIds(db, profileIds)
  }

  let q = db
    .from('contacts')
    .select('id, email, profile_id, consent_state')
    .not('profile_id', 'is', null)
    .neq('consent_state', 'unsubscribed')
  if (parsed.slug === 'subscribed_members') q = q.eq('consent_state', 'subscribed')
  // Site sign-ups: the same profile-bearing, not-unsubscribed rule, with the imported
  // email list held out by SOURCE. `source <> 'import'` alone would also drop rows with a
  // NULL source (SQL three-valued logic), so keep null-source members in with an explicit
  // OR — an organic member without a source stamp is still a site user, never "the list".
  if (parsed.slug === 'site_signups') q = q.or('source.is.null,source.neq.import')
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
  // The GLOBAL marketing console shows only GLOBAL broadcasts. Scope out the two things that were
  // leaking in (an unscoped select mixed them into the list + counts):
  //   • beta-sequence rows (phase_id set) — they have their own Campaign tab, and
  //   • per-Space campaigns (a non-root space_id) — they belong to that Space's own console.
  // Global rows are root-owned (space_email backfilled legacy rows to the root space) or legacy-null.
  const rootId = await loadRootSpaceId()
  let query = db
    .from('campaigns')
    .select('id, subject, segment, status, recipient_count, sent_at, created_at')
    .is('phase_id', null)
    .order('created_at', { ascending: false })
    .limit(limit)
  query = rootId ? query.or(`space_id.is.null,space_id.eq.${rootId}`) : query.is('space_id', null)
  const { data } = await query
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
