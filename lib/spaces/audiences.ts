// PER-SPACE AUDIENCES (ENTITY-SPACES-BUILD §C Phase 3, "Audience builder over contacts"). Resolve
// WHO a Space campaign goes to, over the Space's OWN contacts (the `contacts` table carries a
// `space_id` from Phase 2, backfilled to the root space). The output is exactly the shape the send
// seam consumes: { contactId, email }[], so the composer hands `resolveAudience(...)` straight to
// sendSpaceCampaign's `recipients` input.
//
// TENANCY IS THE WHOLE POINT (ADR-246/328/329). Every read here filters `space_id = spaceId` FIRST,
// so a Space A caller can never resolve Space B's contacts. The `contacts` + `network_contact_tags`
// tables are not in the generated DB types, so the reads go through the untyped admin client (the
// repo convention for not-yet-typed tables, cf. lib/crm/pipeline.ts). Service-role; the CALLER gates
// authorization (the composer's actions gate on canEditProfile before resolving), and these reads are
// FAIL-SAFE: any error / missing data yields an EMPTY audience, never a leak and never a throw.
//
// TAG FILTER. A Space's contacts can be filtered by a freeform TAG. Tags live on the owner-scoped
// `network_contact_tags` table (keyed to `network_contacts`, which links to a marketing `contacts`
// row via `network_contacts.linked_contact_id`). So a tag filter resolves: the network_contacts with
// that tag -> their linked_contact_id -> intersect with this Space's contacts. A contact with no
// linked network_contact simply never matches a tag (it only appears under "all contacts"). No tag
// (filter omitted or { tag: null }) = every contact in the Space that has an email.

import { createAdminClient } from '@/lib/supabase/admin'

// ── Types ─────────────────────────────────────────────────────────────────────────────────────

/** One resolved recipient. EXACTLY the shape the send seam's `recipients` input consumes
 *  (sendSpaceCampaign(spaceId, { ..., recipients: { contactId?, email }[] })): the marketing
 *  contact id (for suppression / unsubscribe mapping) plus the email to send to. */
export interface AudienceRecipient {
  contactId: string
  email: string
}

/** A resonance/engagement-depth facet value (the advanced segment facets, Resonance Engine Phase 6 ·
 *  ADR-387). Each is a coarse, member-traits-derived band a Space can target once it has the advanced
 *  segments lever (`crm.playbooks`). Read off the nightly `member_traits` feature store when the trait
 *  join lands; today they are ACCEPTED + STORED but do not yet narrow (the consent-facet precedent). */

/** How deeply a member is engaged with the Space (the `engagement_depth` trait, banded). */
export const ENGAGEMENT_DEPTH_VALUES = ['shallow', 'moderate', 'deep'] as const
export type EngagementDepth = (typeof ENGAGEMENT_DEPTH_VALUES)[number]

/** The member's resonance tier (the Resonance Health roll-up, banded green/amber/red). */
export const RESONANCE_TIER_VALUES = ['resonant', 'cooling', 'at_risk'] as const
export type ResonanceTier = (typeof RESONANCE_TIER_VALUES)[number]

/** The member's predicted churn-risk band (from the `churn_risk` prediction). */
export const CHURN_RISK_VALUES = ['low', 'medium', 'high'] as const
export type ChurnRiskBand = (typeof CHURN_RISK_VALUES)[number]

/** The audience selection. `tag` (when a non-empty string) narrows to contacts carrying that tag;
 *  omitted / null / empty = every contact in the Space. Additive: new facets (a saved segment, a
 *  consent filter, the resonance/engagement-depth facets) become new optional fields, never a
 *  signature change, so every existing resolveAudience / AudienceFilter caller is unchanged. */
export interface AudienceFilter {
  /** A freeform tag to filter by (network_contact_tags). Null / omitted = all of the Space's contacts. */
  tag?: string | null
  /** A saved segment to resolve from (space_segments, ADR-380). When set, resolveAudience loads the
   *  segment's stored AudienceFilter-shaped `definition` and resolves from THAT (fail-safe to
   *  "everyone" if the segment is missing / cross-space). Null / omitted = no segment. */
  segmentId?: string | null
  /** Consent scope (ADR-380). 'subscribed' would narrow to consented contacts; 'all' / omitted keeps
   *  the current behavior (every matching contact). Reserved for a future consent join: today the v1
   *  contacts read carries no per-Space consent column, so this is accepted + stored but does not yet
   *  narrow, keeping the change purely additive. */
  consent?: 'subscribed' | 'all'
  /** ADVANCED FACET (Phase 6 · ADR-387): the member's engagement-depth band, from `member_traits`.
   *  Null / omitted = no depth filter. Surfaced only for Spaces with the advanced-segments lever
   *  (`crm.playbooks`); the grammar always accepts it (additive, never a throw). Reserved for the
   *  member_traits join, like `consent` today. */
  engagementDepth?: EngagementDepth | null
  /** ADVANCED FACET (Phase 6 · ADR-387): the member's resonance tier (resonant / cooling / at_risk),
   *  from the Resonance Health roll-up. Null / omitted = no resonance filter. Reserved for the join. */
  resonanceTier?: ResonanceTier | null
  /** ADVANCED FACET (Phase 6 · ADR-387): the member's predicted churn-risk band. Null / omitted = no
   *  churn-risk filter. The literal "members about to go quiet" target. Reserved for the join. */
  churnRisk?: ChurnRiskBand | null
}

// Hard cap so a malformed/hostile Space can never resolve an unbounded recipient list in one pass.
const MAX_RECIPIENTS = 5000

// ── PURE helpers (no IO, testable) ──────────────────────────────────────────────────────────────

/** A trimmed, non-empty tag, or null. Pure: an empty / whitespace / non-string tag reads as "no
 *  filter" so a blank tag never accidentally narrows to nothing. */
export function normalizeTag(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const t = raw.trim()
  return t ? t : null
}

/** A loose email sanity check (has an @, no spaces, a dot after the @). Pure. Not RFC-perfect by
 *  design: the send pipeline + suppression are the real gate; this just drops obvious junk so an
 *  empty / malformed contact email never becomes a recipient. */
function looksLikeEmail(email: unknown): email is string {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

/** Normalize an arbitrary value to a known member among `allowed`, or null. Pure, fail-safe: any
 *  unknown / non-string value reads as "no filter" (null), so a malformed advanced facet never
 *  narrows to nobody and never throws. Shared by the resonance / engagement-depth normalizers below. */
function normalizeEnum<T extends string>(raw: unknown, allowed: readonly T[]): T | null {
  return typeof raw === 'string' && (allowed as readonly string[]).includes(raw) ? (raw as T) : null
}

/** A normalized engagement-depth facet, or null (no filter). Pure, fail-safe. */
export function normalizeEngagementDepth(raw: unknown): EngagementDepth | null {
  return normalizeEnum(raw, ENGAGEMENT_DEPTH_VALUES)
}

/** A normalized resonance-tier facet, or null (no filter). Pure, fail-safe. */
export function normalizeResonanceTier(raw: unknown): ResonanceTier | null {
  return normalizeEnum(raw, RESONANCE_TIER_VALUES)
}

/** A normalized churn-risk facet, or null (no filter). Pure, fail-safe. */
export function normalizeChurnRisk(raw: unknown): ChurnRiskBand | null {
  return normalizeEnum(raw, CHURN_RISK_VALUES)
}

/** Coerce a stored segment `definition` jsonb into a safe AudienceFilter, reading ONLY the known
 *  facets and DROPPING any nested segmentId (a segment never references another segment, so a stored
 *  definition can never chain into an infinite resolve). Pure: an absent / malformed definition reads
 *  as "everyone" ({}), which is the fail-safe posture. The advanced facets (Phase 6) are read from
 *  BOTH the camelCase (the app shape) and the snake_case (a likely stored shape) key so a definition
 *  saved either way resolves identically. */
export function definitionToFilter(raw: unknown): AudienceFilter {
  if (!raw || typeof raw !== 'object') return {}
  const d = raw as Record<string, unknown>
  const filter: AudienceFilter = {}
  const tag = normalizeTag(d.tag)
  if (tag) filter.tag = tag
  if (d.consent === 'subscribed' || d.consent === 'all') filter.consent = d.consent
  // Advanced resonance / engagement-depth facets (Phase 6 · ADR-387). Each is dropped unless it is a
  // recognized band (fail-safe to no filter), so a garbage stored facet can never narrow to nobody.
  const engagementDepth = normalizeEngagementDepth(d.engagementDepth ?? d.engagement_depth)
  if (engagementDepth) filter.engagementDepth = engagementDepth
  const resonanceTier = normalizeResonanceTier(d.resonanceTier ?? d.resonance_tier)
  if (resonanceTier) filter.resonanceTier = resonanceTier
  const churnRisk = normalizeChurnRisk(d.churnRisk ?? d.churn_risk)
  if (churnRisk) filter.churnRisk = churnRisk
  // Intentionally NO segmentId: a segment definition never nests another segment.
  return filter
}

// ── IO: the untyped admin-client seams (tables not in generated types yet, ADR-246) ────────────

/** The contact ids in a Space that carry `tag` (via network_contacts.linked_contact_id). Returns a
 *  Set of contact ids. FAIL-SAFE to an empty set. The tag match is case-insensitive on the stored
 *  tag. */
async function contactIdsWithTag(spaceId: string, tag: string): Promise<Set<string>> {
  const ids = new Set<string>()
  try {
    const db = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (col: string, val: string) => {
            ilike: (
              col: string,
              val: string,
            ) => Promise<{ data: { linked_contact_id: string | null }[] | null; error: unknown }>
          }
        }
      }
    }
    // network_contacts in THIS space that are promoted to a marketing contact (linked_contact_id set)
    // and carry the tag. We read the link table joined shape through PostgREST embedding so the tag
    // filter and the space filter both apply in one query.
    const { data, error } = await db
      .from('network_contact_tags')
      .select('network_contacts!inner(linked_contact_id, space_id)')
      .eq('network_contacts.space_id', spaceId)
      .ilike('tag', tag)
    if (error || !data) return ids
    for (const row of data as unknown as { network_contacts?: { linked_contact_id?: string | null } }[]) {
      const cid = row.network_contacts?.linked_contact_id
      if (cid) ids.add(cid)
    }
  } catch {
    // fall through to the empty set (fail-safe)
  }
  return ids
}

/** A Space's contacts (id + email), service-role, FAIL-SAFE to []. Filters `space_id = spaceId` so a
 *  caller never reaches another Space's contacts. Drops rows with no usable email. */
async function readSpaceContacts(spaceId: string): Promise<{ id: string; email: string }[]> {
  try {
    const db = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (col: string, val: string) => {
            limit: (
              n: number,
            ) => Promise<{ data: { id: string; email: string | null }[] | null; error: unknown }>
          }
        }
      }
    }
    const { data, error } = await db
      .from('contacts')
      .select('id, email')
      .eq('space_id', spaceId)
      .limit(MAX_RECIPIENTS)
    if (error || !data) return []
    const out: { id: string; email: string }[] = []
    for (const c of data) {
      if (c.id && looksLikeEmail(c.email)) out.push({ id: c.id, email: (c.email as string).trim() })
    }
    return out
  } catch {
    return []
  }
}

/** A saved segment's stored `definition` for THIS Space (space_segments, ADR-380), as a safe
 *  AudienceFilter. Reads through the untyped admin client (table not in the generated types yet,
 *  ADR-246), PINNED to space_id so a cross-space segment id resolves to null -> "everyone" (the
 *  fail-safe). Single-row read filters BOTH id AND space_id so a cross-space id leaks nothing.
 *  FAIL-SAFE to {} (everyone) on any error / missing row. */
async function readSegmentFilter(spaceId: string, segmentId: string): Promise<AudienceFilter> {
  if (!spaceId || !segmentId) return {}
  try {
    const db = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (
            col: string,
            val: string,
          ) => {
            eq: (
              col: string,
              val: string,
            ) => {
              maybeSingle: () => Promise<{ data: { definition: unknown } | null; error: unknown }>
            }
          }
        }
      }
    }
    const { data, error } = await db
      .from('space_segments')
      .select('definition')
      .eq('id', segmentId)
      .eq('space_id', spaceId)
      .maybeSingle()
    if (error || !data) return {}
    return definitionToFilter(data.definition)
  } catch {
    return {}
  }
}

// ── PUBLIC: resolve + count (the recipients the send seam consumes) ─────────────────────────────

/**
 * Resolve the recipients for a Space campaign. Over the SPACE'S OWN contacts only (space_id filter),
 * optionally narrowed by a tag (network_contact_tags via the linked marketing contact). The return is
 * EXACTLY the send seam's `recipients` shape: { contactId, email }[]. De-duplicated by lowercased
 * email so a contact is never emailed twice. FAIL-SAFE to [] on any error (never throws, never leaks).
 *
 * THE SEND-SEAM CONTRACT: pass this straight to sendSpaceCampaign(spaceId, { ..., recipients }).
 */
export async function resolveAudience(
  spaceId: string,
  filter: AudienceFilter = {},
): Promise<AudienceRecipient[]> {
  if (!spaceId) return []

  // A saved segment resolves from its STORED definition (ADR-380): load it (fail-safe to "everyone"
  // if the segment is missing / cross-space) and resolve through the EXISTING tag logic. When no
  // segmentId is given this is a pure no-op, so existing call sites are unchanged.
  const effective = filter.segmentId
    ? await readSegmentFilter(spaceId, filter.segmentId)
    : filter
  const tag = normalizeTag(effective.tag)

  const contacts = await readSpaceContacts(spaceId)
  if (contacts.length === 0) return []

  // Narrow to the tagged subset when a tag is given. A contact that isn't linked to a tagged
  // network_contact simply doesn't match (it only ever appears under "all contacts").
  let chosen = contacts
  if (tag) {
    const tagged = await contactIdsWithTag(spaceId, tag)
    chosen = contacts.filter((c) => tagged.has(c.id))
  }

  // De-dupe by lowercased email (a Space can hold two contact rows for one address); first wins.
  const seen = new Set<string>()
  const out: AudienceRecipient[] = []
  for (const c of chosen) {
    const key = c.email.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ contactId: c.id, email: c.email })
  }
  return out
}

/** How many recipients an audience resolves to (the composer's live count). FAIL-SAFE to 0. A thin
 *  wrapper over resolveAudience so the count and the send list can never disagree. */
export async function audienceCount(
  spaceId: string,
  filter: AudienceFilter = {},
): Promise<number> {
  return (await resolveAudience(spaceId, filter)).length
}

/**
 * The distinct tags available to filter a Space's audience by (the picker's tag options). Reads the
 * network_contact_tags for network_contacts in THIS Space that are linked to a marketing contact, so
 * a tag only appears when it can actually narrow the audience. Sorted, de-duplicated (case-insensitive
 * by display). FAIL-SAFE to []. Service-role; the caller gates authorization.
 */
export async function listAudienceTags(spaceId: string): Promise<string[]> {
  if (!spaceId) return []
  try {
    const db = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (
            col: string,
            val: string,
          ) => {
            not: (
              col: string,
              op: string,
              val: null,
            ) => Promise<{ data: { tag: string | null }[] | null; error: unknown }>
          }
        }
      }
    }
    const { data, error } = await db
      .from('network_contact_tags')
      .select('tag, network_contacts!inner(space_id, linked_contact_id)')
      .eq('network_contacts.space_id', spaceId)
      .not('network_contacts.linked_contact_id', 'is', null)
    if (error || !data) return []
    // De-dupe case-insensitively, keep the first-seen display form.
    const byLower = new Map<string, string>()
    for (const row of data as unknown as { tag?: string | null }[]) {
      const t = typeof row.tag === 'string' ? row.tag.trim() : ''
      if (t && !byLower.has(t.toLowerCase())) byLower.set(t.toLowerCase(), t)
    }
    return [...byLower.values()].sort((a, b) => a.localeCompare(b))
  } catch {
    return []
  }
}
