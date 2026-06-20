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

/** The audience selection. `tag` (when a non-empty string) narrows to contacts carrying that tag;
 *  omitted / null / empty = every contact in the Space. Additive: new facets (a saved segment, a
 *  consent filter) become new optional fields, never a signature change. */
export interface AudienceFilter {
  /** A freeform tag to filter by (network_contact_tags). Null / omitted = all of the Space's contacts. */
  tag?: string | null
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
  const tag = normalizeTag(filter.tag)

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
