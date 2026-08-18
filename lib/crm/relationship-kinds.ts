// THE RELATIONSHIP-KIND REGISTRY — the vocabulary and its pure helpers, with no imports (LIVE-037).
//
// WHY THIS FILE EXISTS. All of this lived in `lib/crm/relationships.ts`, whose other exports open the
// service-role admin client (`createAdminClient` -> @supabase/supabase-js -> a crypto-browserify
// polyfill graph). `app/(main)/admin/crm/contacts/contacts-roster-client.tsx` is `'use client'` and
// imported FOUR pure helpers from it (`assignableKinds`, `isAssignableKind`, `relationshipKind`,
// `relationshipLabel`), so that whole server graph was in the contacts roster's browser bundle, and
// `import 'server-only'` could not be added to `lib/crm/relationships.ts` without failing the build.
//
// Same shape of fix, same reasoning, as `lib/journeys/meeting.ts` and `lib/pillars/slugs.ts`
// (ADR-1074): a closed vocabulary plus four table lookups over it, parked in a file whose other
// exports reach the database. Nothing here was ever the problem — a bundler follows modules, not
// intentions.
//
// ⚠️ KEEP THIS FILE DEPENDENCY-FREE. An import here re-opens the door it was written to close.
// `lib/crm/relationships.ts` re-exports every name below, so every existing server caller — and
// every `import type` — is unchanged; CLIENT code must import from here.
//
// A contact is not one "type"; they hold a SET of relationships to the community (ADR-625):
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
// Naming + voice (docs/NAMING.md, docs/CONTENT-VOICE.md): every `label` is plain, sentence case,
// operator-facing, no em dashes.

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
