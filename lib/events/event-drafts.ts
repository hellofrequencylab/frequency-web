// The draft → publish → claim store for the Poster Events engine (server-only).
// A member captures a town poster, the AI builds a DRAFT (status='draft',
// owner-private), they tidy it, then PUBLISH it. Publishing one of their OWN
// events makes them the host (mirrors createEvent). Publishing one posted ON
// BEHALF of an organizer mints a one-time claim_token and pays the SCALED
// event_posted reward (the honesty multiplier). An organizer later CLAIMS it with
// the token, becomes the host, and the original poster gets the claim bonus.
// Removing a posted event reverses the poster's Zaps, so spam loses money.
//
// New columns aren't in the generated types yet, so we talk to events through the
// untyped admin handle (repo convention, cf. lib/connections/store.ts). All reads
// and the draft writes are OWNER-SCOPED; claim/publish/removal run service-role.

import 'server-only'
import { randomBytes } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { slugify } from '@/lib/utils'
import { awardZapsForAction } from '@/lib/zaps'
import { recordEngagementEvent } from '@/lib/engagement/events'
import { recordStreakActivity, processGamificationEvent } from '@/lib/achievements'
import { scaledPostReward } from './poster-quality'
import type { DomainSlug, ExtractedEvent } from './types'

const db = () => createAdminClient() as unknown as SupabaseClient

const COLS =
  'id, title, description, location, starts_at, ends_at, slug, status, source, ' +
  'host_id, posted_by_profile_id, poster_path, domain_id, scope_id, scope_type, ' +
  'visibility, price_cents, claim_token, claimed_at, published_at, organizer_name, ' +
  'organizer_contact, removed_at, removed_reason, is_cancelled, created_at'

const emptyToNull = (v: string | null | undefined): string | null => {
  const s = (v ?? '').trim()
  return s.length ? s : null
}

export interface EventDraft {
  id: string
  title: string | null
  description: string | null
  location: string | null
  startsAt: string | null
  endsAt: string | null
  slug: string | null
  status: 'draft' | 'published'
  source: 'manual' | 'poster_scan'
  hostId: string | null
  postedByProfileId: string | null
  posterPath: string | null
  domainId: string | null
  scopeId: string | null
  scopeType: string | null
  visibility: string | null
  priceCents: number | null
  claimToken: string | null
  claimedAt: string | null
  publishedAt: string | null
  organizerName: string | null
  organizerContact: string | null
  removedAt: string | null
  removedReason: string | null
  createdAt: string | null
}

function mapDraft(r: Record<string, unknown>): EventDraft {
  return {
    id: String(r.id),
    title: (r.title as string) ?? null,
    description: (r.description as string) ?? null,
    location: (r.location as string) ?? null,
    startsAt: (r.starts_at as string) ?? null,
    endsAt: (r.ends_at as string) ?? null,
    slug: (r.slug as string) ?? null,
    status: (r.status as 'draft' | 'published') ?? 'draft',
    source: (r.source as 'manual' | 'poster_scan') ?? 'poster_scan',
    hostId: (r.host_id as string) ?? null,
    postedByProfileId: (r.posted_by_profile_id as string) ?? null,
    posterPath: (r.poster_path as string) ?? null,
    domainId: (r.domain_id as string) ?? null,
    scopeId: (r.scope_id as string) ?? null,
    scopeType: (r.scope_type as string) ?? null,
    visibility: (r.visibility as string) ?? null,
    priceCents: typeof r.price_cents === 'number' ? r.price_cents : null,
    claimToken: (r.claim_token as string) ?? null,
    claimedAt: (r.claimed_at as string) ?? null,
    publishedAt: (r.published_at as string) ?? null,
    organizerName: (r.organizer_name as string) ?? null,
    organizerContact: (r.organizer_contact as string) ?? null,
    removedAt: (r.removed_at as string) ?? null,
    removedReason: (r.removed_reason as string) ?? null,
    createdAt: (r.created_at as string) ?? null,
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Resolve the scope_id for a posted town event: the poster's nexus region, or a
 *  stable fallback (the root region) so a region-less poster still surfaces in
 *  local discovery. Returns null only if there are no regions at all. */
async function resolveRegionScopeId(profileId: string): Promise<string | null> {
  const admin = db()
  const { data: me } = await admin
    .from('profiles')
    .select('nexus_region_id')
    .eq('id', profileId)
    .maybeSingle()
  const regionId = (me as { nexus_region_id?: string | null } | null)?.nexus_region_id ?? null
  if (regionId) return regionId
  // Fallback: the topmost region (parent_id null, shallowest depth) is a stable
  // sentinel for "somewhere, not yet placed". Deterministic by id as a tiebreak.
  const { data: root } = await admin
    .from('nexus_regions')
    .select('id')
    .is('parent_id', null)
    .order('depth', { ascending: true })
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle()
  return (root as { id?: string } | null)?.id ?? null
}

/** Resolve a DomainSlug to its domains.id, or null. */
async function resolveDomainId(domain: DomainSlug | null): Promise<string | null> {
  if (!domain) return null
  const { data } = await db().from('domains').select('id').eq('slug', domain).maybeSingle()
  return (data as { id?: string } | null)?.id ?? null
}

/** Mint a unique slug from a title + start date (mirrors createEvent). */
async function mintSlug(title: string, startsAt: string | null): Promise<string> {
  const datePart = startsAt ? startsAt.slice(0, 10) : new Date().toISOString().slice(0, 10)
  const base = `${slugify(title) || 'event'}-${datePart}`
  const { data: existing } = await db().from('events').select('slug').eq('slug', base).maybeSingle()
  if (!existing) return base
  return `${base}-${randomBytes(3).toString('hex')}`
}

/** A url-safe, hard-to-guess one-time claim secret. */
function mintClaimToken(): string {
  return randomBytes(24).toString('base64url')
}

// ── Create / read / update drafts (owner-scoped) ─────────────────────────────

export interface DraftInput {
  title?: string
  description?: string
  startsAt?: string | null
  endsAt?: string | null
  location?: string
  priceCents?: number | null
  organizerName?: string
  organizerContact?: string
  domain?: DomainSlug | null
  posterPath?: string | null
}

/** Build a DraftInput from an AI extraction, for convenience at the call site. */
export function draftInputFromExtraction(e: ExtractedEvent, posterPath?: string | null): DraftInput {
  return {
    title: e.title,
    description: e.description,
    startsAt: e.startsAt || null,
    endsAt: e.endsAt || null,
    location: e.location,
    priceCents: e.isFree ? 0 : e.priceCents,
    organizerName: e.organizerName,
    organizerContact: e.organizerContact,
    domain: e.domain,
    posterPath: posterPath ?? null,
  }
}

/** Insert a poster-scanned event as a DRAFT, owned by the poster. host_id stays
 *  null (it is set at publish/claim). scope is the poster's region, scope_type
 *  'public' (a posted town event is not tied to a circle). */
export async function createEventDraft(
  posterProfileId: string,
  input: DraftInput,
): Promise<{ id: string } | null> {
  const scopeId = await resolveRegionScopeId(posterProfileId)
  if (!scopeId) return null
  const domainId = await resolveDomainId(input.domain ?? null)
  const title = (input.title ?? '').trim() || 'Untitled event'

  const { data, error } = await db()
    .from('events')
    .insert({
      title,
      description: emptyToNull(input.description),
      location: emptyToNull(input.location),
      starts_at: input.startsAt ?? null,
      ends_at: input.endsAt ?? null,
      status: 'draft',
      source: 'poster_scan',
      posted_by_profile_id: posterProfileId,
      host_id: null,
      poster_path: input.posterPath ?? null,
      domain_id: domainId,
      scope_type: 'public',
      scope_id: scopeId,
      visibility: 'public',
      price_cents: input.priceCents ?? null,
      organizer_name: emptyToNull(input.organizerName),
      organizer_contact: emptyToNull(input.organizerContact),
      slug: await mintSlug(title, input.startsAt ?? null),
    })
    .select('id')
    .maybeSingle()

  if (error || !data) return null
  return { id: String((data as { id: string }).id) }
}

/** Read one of the poster's own drafts (or published events they posted). */
export async function getMyDraft(posterProfileId: string, id: string): Promise<EventDraft | null> {
  const { data } = await db()
    .from('events')
    .select(COLS)
    .eq('id', id)
    .eq('posted_by_profile_id', posterProfileId)
    .maybeSingle()
  return data ? mapDraft(data as unknown as Record<string, unknown>) : null
}

/** List the poster's drafts (and posted events), newest first. */
export async function listMyDrafts(posterProfileId: string, limit = 100): Promise<EventDraft[]> {
  const { data } = await db()
    .from('events')
    .select(COLS)
    .eq('posted_by_profile_id', posterProfileId)
    .order('created_at', { ascending: false })
    .limit(limit)
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(mapDraft)
}

export interface DraftPatch {
  title?: string
  description?: string | null
  startsAt?: string | null
  endsAt?: string | null
  location?: string | null
  priceCents?: number | null
  organizerName?: string | null
  organizerContact?: string | null
  domain?: DomainSlug | null
}

/** Patch a draft the poster owns. Only DRAFT rows are editable here. */
export async function updateEventDraft(
  posterProfileId: string,
  id: string,
  patch: DraftPatch,
): Promise<boolean> {
  const u: Record<string, unknown> = {}
  if (patch.title !== undefined) u.title = patch.title.trim() || 'Untitled event'
  if (patch.description !== undefined) u.description = emptyToNull(patch.description)
  if (patch.startsAt !== undefined) u.starts_at = patch.startsAt
  if (patch.endsAt !== undefined) u.ends_at = patch.endsAt
  if (patch.location !== undefined) u.location = emptyToNull(patch.location)
  if (patch.priceCents !== undefined) u.price_cents = patch.priceCents
  if (patch.organizerName !== undefined) u.organizer_name = emptyToNull(patch.organizerName)
  if (patch.organizerContact !== undefined) u.organizer_contact = emptyToNull(patch.organizerContact)
  if (patch.domain !== undefined) u.domain_id = await resolveDomainId(patch.domain)
  if (Object.keys(u).length === 0) return true

  const { error } = await db()
    .from('events')
    .update(u)
    .eq('id', id)
    .eq('posted_by_profile_id', posterProfileId)
    .eq('status', 'draft')
  return !error
}

// ── Publish ──────────────────────────────────────────────────────────────────

export type DraftOwnership = 'mine' | 'posted'

export interface PublishResult {
  slug: string
  claimToken?: string
  /** The scaled event_posted Zaps actually awarded (0 when throttled or 'mine'). */
  zapsAwarded?: number
}

/**
 * Publish a draft the poster owns.
 *   • ownership 'mine'  → the poster IS the organizer. Set host_id=poster,
 *     status=published. Award event_host + tick the hosting streak (mirrors
 *     createEvent). No claim token.
 *   • ownership 'posted'→ posted on behalf of an organizer. host_id stays null,
 *     mint a claim_token, and award the SCALED event_posted via the honesty
 *     metric (skipped entirely when the multiplier is 0). Idempotent on the
 *     ledger key event_posted:<id>.
 */
export async function publishEventDraft(
  posterProfileId: string,
  id: string,
  ownership: DraftOwnership,
): Promise<PublishResult | null> {
  const draft = await getMyDraft(posterProfileId, id)
  if (!draft || draft.status !== 'draft') return null

  const admin = db()
  const nowIso = new Date().toISOString()

  if (ownership === 'mine') {
    const { error } = await admin
      .from('events')
      .update({
        status: 'published',
        published_at: nowIso,
        host_id: posterProfileId,
      })
      .eq('id', id)
      .eq('posted_by_profile_id', posterProfileId)
      .eq('status', 'draft')
    if (error) return null

    // Reward hosting (mirrors createEvent). Best-effort: never break publish.
    processGamificationEvent({ type: 'event_host', profileId: posterProfileId }).catch(() => {})
    await awardZapsForAction(posterProfileId, 'event_host').catch(() => {})
    await recordStreakActivity(posterProfileId, 'hosting').catch(() => {})
    return { slug: draft.slug ?? '', zapsAwarded: 0 }
  }

  // ownership === 'posted'
  const claimToken = mintClaimToken()
  const { error } = await admin
    .from('events')
    .update({
      status: 'published',
      published_at: nowIso,
      claim_token: claimToken,
    })
    .eq('id', id)
    .eq('posted_by_profile_id', posterProfileId)
    .eq('status', 'draft')
  if (error) return null

  // Scaled event_posted reward, exactly-once on event_posted:<id>. Skip the award
  // when the honesty multiplier zeros it out (throttled posters earn nothing).
  let zapsAwarded = 0
  try {
    const reward = await scaledPostReward(posterProfileId)
    if (reward.amount > 0) {
      const { recorded } = await recordEngagementEvent({
        idempotencyKey: `event_posted:${id}`,
        source: 'task',
        eventType: 'event.posted',
        actorProfileId: posterProfileId,
        context: { eventId: id, kind: 'event_posted', band: reward.band, amount: reward.amount },
      })
      if (recorded) {
        const res = await awardZapsForAction(posterProfileId, 'event_posted', reward.amount)
        zapsAwarded = res.amount
      }
    }
  } catch {
    /* rewards are best-effort; a failed grant must not break publish */
  }

  return { slug: draft.slug ?? '', claimToken, zapsAwarded }
}

// ── Claim ────────────────────────────────────────────────────────────────────

export interface ClaimResult {
  slug: string
}

/**
 * An organizer claims a posted, unclaimed event with its one-time token. They
 * become the host; the token is cleared. The POSTER (posted_by_profile_id), not
 * the claimer, gets the event_claim_bonus, exactly-once on event_claim_bonus:<id>.
 * For a circle-scoped event we upsert membership; a public-scope town event has no
 * circle, so no membership is touched.
 */
export async function claimEvent(
  claimerProfileId: string,
  claimToken: string,
): Promise<ClaimResult | null> {
  const token = (claimToken ?? '').trim()
  if (!token) return null
  const admin = db()

  const { data } = await admin
    .from('events')
    .select('id, slug, host_id, claimed_at, removed_at, scope_type, scope_id, posted_by_profile_id, status')
    .eq('claim_token', token)
    .eq('status', 'published')
    .maybeSingle()
  const ev = data as Record<string, unknown> | null
  if (!ev) return null
  if (ev.host_id || ev.claimed_at || ev.removed_at) return null

  const eventId = String(ev.id)
  const slug = (ev.slug as string) ?? ''
  const posterId = (ev.posted_by_profile_id as string | null) ?? null

  const { error } = await admin
    .from('events')
    .update({
      host_id: claimerProfileId,
      claimed_at: new Date().toISOString(),
      claim_token: null,
    })
    .eq('id', eventId)
    .is('host_id', null)
    .is('claimed_at', null)
  if (error) return null

  // Circle-scoped events: make the claimer a member/host. Public town events have
  // no circle, so skip membership entirely.
  if (ev.scope_type === 'circle' && ev.scope_id) {
    await admin
      .from('memberships')
      .upsert(
        { profile_id: claimerProfileId, circle_id: String(ev.scope_id), status: 'active', volunteer_role: 'host' },
        { onConflict: 'profile_id,circle_id' },
      )
      .then(() => {}, () => {})
  }

  // Reward the POSTER (not the claimer), exactly-once on event_claim_bonus:<id>.
  if (posterId) {
    try {
      const { recorded } = await recordEngagementEvent({
        idempotencyKey: `event_claim_bonus:${eventId}`,
        source: 'task',
        eventType: 'event.claim_bonus',
        actorProfileId: posterId,
        context: { eventId, kind: 'event_claim_bonus', claimerProfileId },
      })
      if (recorded) await awardZapsForAction(posterId, 'event_claim_bonus')
    } catch {
      /* bonus is best-effort */
    }
  }

  // Log the claim itself on the ledger (separate key from the bonus).
  await recordEngagementEvent({
    idempotencyKey: `event_claimed:${eventId}`,
    source: 'web',
    eventType: 'event.claimed',
    actorProfileId: claimerProfileId,
    context: { eventId, slug, kind: 'event_claim' },
  }).catch(() => {})

  return { slug }
}

// ── Remove + clawback (staff / service) ──────────────────────────────────────

export interface RemoveResult {
  removed: boolean
  /** The Zaps clawed back from the poster for this event (0 if none / already done). */
  clawedBack: number
}

/**
 * Staff removes a posted event (spam / abuse). Sets removed_at + reason, cancels
 * it, and CLAWS BACK the poster's event_posted Zaps for THIS event by appending a
 * negative ledger row. The clawback is idempotent on event_posted_reversal:<id>
 * (an engagement_events sentinel), so re-running removal never double-reverses.
 * This is what makes spam unprofitable: the reward is undone when the event is
 * pulled.
 */
export async function reportRemoveEvent(eventId: string, reason: string): Promise<RemoveResult> {
  const admin = db()
  const cleanReason = (reason ?? '').trim().slice(0, 500) || 'Removed by staff.'

  const { data } = await admin
    .from('events')
    .select('id, posted_by_profile_id, removed_at')
    .eq('id', eventId)
    .maybeSingle()
  const ev = data as { id: string; posted_by_profile_id: string | null; removed_at: string | null } | null
  if (!ev) return { removed: false, clawedBack: 0 }

  const alreadyRemoved = !!ev.removed_at
  const { error } = await admin
    .from('events')
    .update({ removed_at: ev.removed_at ?? new Date().toISOString(), removed_reason: cleanReason, is_cancelled: true })
    .eq('id', eventId)
  if (error) return { removed: false, clawedBack: 0 }

  // Already removed once: do not re-claw (the reversal key would also block it,
  // but short-circuit to avoid an extra ledger read).
  if (alreadyRemoved) return { removed: true, clawedBack: 0 }

  let clawedBack = 0
  const posterId = ev.posted_by_profile_id
  if (posterId) {
    try {
      // Exactly-once reversal: the sentinel key blocks a second clawback even
      // across retries / repeated removals.
      const { recorded } = await recordEngagementEvent({
        idempotencyKey: `event_posted_reversal:${eventId}`,
        source: 'system',
        eventType: 'event.posted_reversed',
        actorProfileId: posterId,
        context: { eventId, kind: 'event_posted_reversal', reason: cleanReason },
      })
      if (recorded) {
        // Find what was actually granted for this event's post, and reverse it.
        const granted = await grantedPostAmount(eventId)
        if (granted > 0) {
          const { error: revErr } = await admin.from('zap_transactions').insert({
            profile_id: posterId,
            action_type: 'event_posted_reversal',
            amount: -granted,
            metadata: { eventId, reason: cleanReason },
          })
          if (!revErr) clawedBack = granted
        }
      }
    } catch {
      /* clawback is best-effort; removal still stands */
    }
  }

  return { removed: true, clawedBack }
}

/** How many event_posted Zaps were actually granted for this event. The publish
 *  path records the scaled amount in the engagement_events context under
 *  event_posted:<id>; that event-keyed ledger row is authoritative, so the
 *  reversal undoes exactly what was paid. */
async function grantedPostAmount(eventId: string): Promise<number> {
  const { data } = await db()
    .from('engagement_events')
    .select('context')
    .eq('idempotency_key', `event_posted:${eventId}`)
    .maybeSingle()
  const ctx = (data as { context?: { amount?: number } } | null)?.context
  const amount = typeof ctx?.amount === 'number' ? ctx.amount : 0
  return amount > 0 ? Math.round(amount) : 0
}
