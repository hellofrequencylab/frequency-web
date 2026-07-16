// The RELATIONSHIP-KIND registry — the extensibility seam of the Resonance CRM restructure
// (ADR-625, docs/DECISIONS.md). A contact is not one "type"; they hold a SET of relationships to
// the community. Two categories:
//
//   • DERIVED   — computed from the record itself and never stored (member / subscriber / lead /
//                 business). lib/crm/classification.ts derives these on read; there is no row for
//                 them. They live in the registry so a surface can label + tone them uniformly.
//   • ASSIGNABLE — an operator-conferred standing that IS stored, one row per (contact, kind) in
//                 public.contact_relationships (donor / partner / vendor / labs_member / volunteer).
//
// Adding a new ASSIGNABLE kind is ONE registry row here — no migration. `kind` is free text on the
// table, validated in CODE against this registry (unknown kinds are ignored on read + rejected on
// write), which is exactly why the column is text and not a Postgres enum: expanding the vocabulary
// stays migration-free.
//
// SHAPE (mirrors lib/crm/engagement-stats.ts): the registry + helpers are PURE (no Supabase/Next
// imports) so they are trivially unit-testable and importable anywhere; the IO read/write wrappers
// at the bottom reach public.contact_relationships through the service-role admin client, UNTYPED
// until lib/database.types.ts regenerates (ADR-246), and are FAIL-SAFE (any error degrades to an
// empty read / a no-op write, never a throw). The caller is the read/write authority.
//
// Naming + voice (docs/NAMING.md, docs/CONTENT-VOICE.md): every `label` is plain, sentence case,
// operator-facing, no em dashes.

import { createAdminClient } from '@/lib/supabase/admin'

// ── The registry ──────────────────────────────────────────────────────────────

/** DERIVED = computed + never stored; ASSIGNABLE = operator-conferred + stored as a row. */
export type RelationshipCategory = 'derived' | 'assignable'

/** The semantic tone token a chip/badge reads (never a hex; mirrors MemberRole['tone']). */
export type RelationshipTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger'

/** One relationship kind: a stable key, a voice-safe label, a tone token, its category, and a
 *  one-line description of who holds it. */
export interface RelationshipKindDef {
  key: string
  /** Operator-facing chip label. Plain, sentence case, no em dashes. */
  label: string
  /** The semantic tone family for the chip (no hardcoded color). */
  tone: RelationshipTone
  category: RelationshipCategory
  /** One-line "who holds this" for tooltips / help. */
  description: string
}

/**
 * The single source of truth for every relationship kind. DERIVED kinds are computed by
 * lib/crm/classification.ts and never written; ASSIGNABLE kinds are stored in
 * public.contact_relationships. To add a new ASSIGNABLE kind, add ONE row here (no migration).
 */
export const RELATIONSHIP_KINDS = [
  // ── DERIVED (computed on read, never stored) ─────────────────────────────────
  {
    key: 'member',
    label: 'Member',
    tone: 'primary',
    category: 'derived',
    description: 'Has a Frequency profile linked to this contact.',
  },
  {
    key: 'subscriber',
    label: 'Subscriber',
    tone: 'neutral',
    category: 'derived',
    description: 'Opted in to hear from us, no profile yet.',
  },
  {
    key: 'lead',
    label: 'Lead',
    tone: 'neutral',
    category: 'derived',
    description: 'Known contact who has not subscribed or joined yet.',
  },
  {
    key: 'business',
    label: 'Business',
    tone: 'primary',
    category: 'derived',
    description: 'Runs a Space or holds an admin seat in one.',
  },
  // ── ASSIGNABLE (operator-conferred, stored as a contact_relationships row) ────
  {
    key: 'donor',
    label: 'Donor',
    tone: 'success',
    category: 'assignable',
    description: 'Has given financial support.',
  },
  {
    key: 'partner',
    label: 'Partner',
    tone: 'primary',
    category: 'assignable',
    description: 'A collaborating person or organization.',
  },
  {
    key: 'vendor',
    label: 'Vendor',
    tone: 'neutral',
    category: 'assignable',
    description: 'Supplies a product or service to us.',
  },
  {
    key: 'labs_member',
    label: 'Lab member',
    tone: 'primary',
    category: 'assignable',
    description: 'Belongs to a Frequency Lab program.',
  },
  {
    key: 'volunteer',
    label: 'Volunteer',
    tone: 'success',
    category: 'assignable',
    description: 'Gives time to run tasks, Circles, or events.',
  },
] as const satisfies readonly RelationshipKindDef[]

/** The typed union of every known relationship key. */
export type RelationshipKind = (typeof RELATIONSHIP_KINDS)[number]['key']

/** Fast lookup: key -> definition. */
const KIND_BY_KEY: Map<string, RelationshipKindDef> = new Map(
  RELATIONSHIP_KINDS.map((k) => [k.key, k]),
)

// ── Pure helpers ──────────────────────────────────────────────────────────────

/** True when `key` is a known relationship kind (narrows to RelationshipKind). */
export function isRelationshipKind(key: string | null | undefined): key is RelationshipKind {
  return typeof key === 'string' && KIND_BY_KEY.has(key)
}

/** True when `key` is a known ASSIGNABLE kind (the only kinds that may be stored). */
export function isAssignableKind(key: string | null | undefined): key is RelationshipKind {
  return isRelationshipKind(key) && KIND_BY_KEY.get(key)!.category === 'assignable'
}

/** The definition for a kind, or undefined when unknown. */
export function relationshipKind(key: string | null | undefined): RelationshipKindDef | undefined {
  return typeof key === 'string' ? KIND_BY_KEY.get(key) : undefined
}

/** The voice-safe label for a kind; falls back to the raw key when unknown (never throws). */
export function relationshipLabel(key: string | null | undefined): string {
  return relationshipKind(key)?.label ?? String(key ?? '')
}

/** Every ASSIGNABLE kind (the operator's "add a relationship" menu). */
export function assignableKinds(): RelationshipKindDef[] {
  return RELATIONSHIP_KINDS.filter((k) => k.category === 'assignable')
}

/** Every DERIVED kind. */
export function derivedKinds(): RelationshipKindDef[] {
  return RELATIONSHIP_KINDS.filter((k) => k.category === 'derived')
}

// ── The stored record ─────────────────────────────────────────────────────────

/** One stored assignable relationship (a public.contact_relationships row, kind narrowed). */
export interface ContactRelationship {
  id: string
  contactId: string
  spaceId: string | null
  kind: RelationshipKind
  status: string
  since: string | null
  meta: Record<string, unknown>
}

/** The raw table row shape (untyped until database.types regenerates, ADR-246). */
interface RelationshipRow {
  id: string
  contact_id: string
  space_id: string | null
  kind: string
  status: string | null
  since: string | null
  meta: Record<string, unknown> | null
}

/** Map a raw row to a typed record, or null when the kind is unknown (ignored on read). */
function toRecord(row: RelationshipRow): ContactRelationship | null {
  if (!isAssignableKind(row.kind)) return null
  return {
    id: row.id,
    contactId: row.contact_id,
    spaceId: row.space_id,
    kind: row.kind,
    status: row.status ?? 'active',
    since: row.since,
    meta: row.meta ?? {},
  }
}

// ── IO reads (fail-safe, service-role) ──────────────────────────────────────────

/**
 * The ACTIVE assignable relationships stored for one contact. FAIL-SAFE: any error, a missing table
 * (pre-migration), or an unknown-kind row degrades to [] (unknown kinds are silently dropped). The
 * caller (a staff-gated CRM surface) is the read authority.
 */
export async function listRelationships(contactId: string | null): Promise<ContactRelationship[]> {
  if (!contactId) return []
  const byContact = await listRelationshipsForContacts([contactId])
  return byContact.get(contactId) ?? []
}

/**
 * BATCH read: the ACTIVE assignable relationships for a SET of contacts, keyed by contact id. ONE
 * query for the whole set (no per-contact N+1) — this is what the roster / contacts list calls.
 * FAIL-SAFE: any error or a missing table resolves to an empty map; unknown-kind rows are dropped.
 */
export async function listRelationshipsForContacts(
  contactIds: string[],
): Promise<Map<string, ContactRelationship[]>> {
  const out = new Map<string, ContactRelationship[]>()
  const ids = [...new Set(contactIds.filter(Boolean))]
  if (ids.length === 0) return out
  try {
    const admin = createAdminClient()
    const { data, error } = await (admin as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          in: (col: string, vals: string[]) => {
            eq: (col: string, val: string) => Promise<{ data: RelationshipRow[] | null; error: unknown }>
          }
        }
      }
    })
      .from('contact_relationships')
      .select('id, contact_id, space_id, kind, status, since, meta')
      .in('contact_id', ids)
      .eq('status', 'active')
    if (error || !data) return out
    for (const row of data) {
      const rec = toRecord(row)
      if (!rec) continue
      const list = out.get(rec.contactId)
      if (list) list.push(rec)
      else out.set(rec.contactId, [rec])
    }
    return out
  } catch {
    return out
  }
}

// ── IO writes (fail-safe, service-role; validate against the registry) ───────────

/**
 * Confer an ASSIGNABLE relationship on a contact. Validates `kind` against the registry: an unknown
 * or DERIVED kind is REJECTED (returns false, no write) — derived kinds are computed, never stored.
 * Idempotent-ish: if an active row for (contact, kind) already exists this is a no-op success.
 * FAIL-SAFE: any error returns false rather than throwing. The caller is the write authority.
 */
export async function addRelationship(
  contactId: string,
  kind: string,
  opts: { spaceId?: string | null; since?: string | null; meta?: Record<string, unknown> } = {},
): Promise<boolean> {
  if (!contactId || !isAssignableKind(kind)) return false
  try {
    const admin = createAdminClient()
    const table = (admin as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (col: string, val: string) => {
            eq: (col: string, val: string) => {
              eq: (col: string, val: string) => {
                limit: (n: number) => Promise<{ data: { id: string }[] | null; error: unknown }>
              }
            }
          }
        }
        insert: (row: Record<string, unknown>) => Promise<{ error: unknown }>
      }
    }).from('contact_relationships')

    // Skip a duplicate active row for the same (contact, kind).
    const { data: existing } = await table
      .select('id')
      .eq('contact_id', contactId)
      .eq('kind', kind)
      .eq('status', 'active')
      .limit(1)
    if (existing && existing.length > 0) return true

    const { error } = await table.insert({
      contact_id: contactId,
      space_id: opts.spaceId ?? null,
      kind,
      status: 'active',
      since: opts.since ?? null,
      meta: opts.meta ?? {},
    })
    return !error
  } catch {
    return false
  }
}

/**
 * End an ASSIGNABLE relationship (soft close: set status to 'ended', stamp updated_at). Pass a row
 * id, or a (contactId, kind) pair to end whichever active row matches. FAIL-SAFE: returns false on
 * any error or an unknown kind, never throws. The caller is the write authority.
 */
export async function endRelationship(
  target: { id: string } | { contactId: string; kind: string },
): Promise<boolean> {
  try {
    const admin = createAdminClient()
    const patch = { status: 'ended', updated_at: new Date().toISOString() }
    if ('id' in target) {
      if (!target.id) return false
      const { error } = await (admin as unknown as {
        from: (t: string) => {
          update: (v: Record<string, unknown>) => {
            eq: (col: string, val: string) => Promise<{ error: unknown }>
          }
        }
      })
        .from('contact_relationships')
        .update(patch)
        .eq('id', target.id)
      return !error
    }
    if (!target.contactId || !isAssignableKind(target.kind)) return false
    const { error } = await (admin as unknown as {
      from: (t: string) => {
        update: (v: Record<string, unknown>) => {
          eq: (col: string, val: string) => {
            eq: (col: string, val: string) => {
              eq: (col: string, val: string) => Promise<{ error: unknown }>
            }
          }
        }
      }
    })
      .from('contact_relationships')
      .update(patch)
      .eq('contact_id', target.contactId)
      .eq('kind', target.kind)
      .eq('status', 'active')
    return !error
  } catch {
    return false
  }
}
