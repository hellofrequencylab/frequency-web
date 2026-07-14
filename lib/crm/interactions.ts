// THE CRM interaction timeline seam (ADR-372 · docs/CRM-OVERHAUL.md §1.1). One append-only stream of
// every touch with a person — `contact_interactions` — fed by the `engagement_events` backbone and the
// comms paths (Resend / Twilio webhooks, manual notes, crm_activities) through this one adapter. The
// rest of the CRM reads the timeline from here; nothing writes the table directly.
//
// SHAPE (mirrors lib/crm/client-notes.ts + lib/spaces/membership.ts): the PURE row builder
// (`buildInteractionInsert`) has no Supabase/Next imports, so it is unit-testable in isolation. The IO
// (`recordContactInteraction` / `listContactInteractions`) reaches the table through the untyped admin
// client (the table is not in the generated DB types yet, ADR-246).
//
// authz-delegated: contact_interactions is a system/owner-scoped timeline FRONT DOOR — exactly-once on
// idempotency_key, every write is STAMPED with the owner (and Space) the calling action/webhook already
// authorized, and reads are owner/Space-scoped. The gate lives at the call site, exactly like
// lib/engagement/events.ts. There is no per-caller scope to enforce here by design.

import { createAdminClient } from '@/lib/supabase/admin'

// ── Vocabulary (kept in lock-step with the CHECK constraints in 20260728000000) ──────────────────

// `in_app` (ADR Phase 1): an in-house direct message or room message, folded onto the timeline by the
// messaging adapter (app/(main)/messages/actions.ts) so the contact card shows every in-house touch.
export type InteractionChannel = 'email' | 'sms' | 'call' | 'in_person' | 'event' | 'note' | 'system' | 'in_app'
export type InteractionDirection = 'inbound' | 'outbound' | 'internal'
export type InteractionSubjectKind = 'contact' | 'network_contact' | 'profile'
// `playbook` (ADR-382): a touch a Resonance Engine playbook recorded through the governed
// Vera allow-list (a streak save, a tag, a stage move, a drafted email). Additive.
// `import` (Phase 1): a touch reconstructed from a CSV / data import (used by the import pipeline).
export type InteractionSource = 'manual' | 'engagement' | 'resend' | 'twilio' | 'crm_activity' | 'ai' | 'playbook' | 'system' | 'import'

const CHANNELS: readonly InteractionChannel[] = ['email', 'sms', 'call', 'in_person', 'event', 'note', 'system', 'in_app']
const DIRECTIONS: readonly InteractionDirection[] = ['inbound', 'outbound', 'internal']
const SUBJECT_KINDS: readonly InteractionSubjectKind[] = ['contact', 'network_contact', 'profile']
const SOURCES: readonly InteractionSource[] = ['manual', 'engagement', 'resend', 'twilio', 'crm_activity', 'ai', 'playbook', 'system', 'import']

// Generous caps so a hostile/automated write can never store an unbounded blob.
const MAX_SUMMARY_LEN = 280
const MAX_BODY_LEN = 20_000

/** What a caller (adapter / action / webhook) hands in to record one touch. camelCase; normalized and
 *  validated by `buildInteractionInsert`. */
export interface RecordInteractionInput {
  ownerProfileId: string
  subjectKind: InteractionSubjectKind
  subjectId: string
  channel: InteractionChannel
  direction?: InteractionDirection
  summary?: string | null
  body?: string | null
  metadata?: Record<string, unknown> | null
  source?: InteractionSource
  /** ISO timestamp the touch HAPPENED (defaults to now). */
  occurredAt?: string | null
  /** Exactly-once key for folded events (an email open delivered twice). Omit for ad-hoc rows. */
  idempotencyKey?: string | null
}

/** One timeline row as the app consumes it (camelCase). */
export interface ContactInteraction {
  id: string
  ownerProfileId: string
  subjectKind: InteractionSubjectKind
  subjectId: string
  spaceId: string | null
  channel: InteractionChannel
  direction: InteractionDirection
  summary: string | null
  body: string | null
  metadata: Record<string, unknown>
  source: InteractionSource
  occurredAt: string
  createdAt: string
}

/** The snake_case row shape written to `contact_interactions` (what the insert/upsert sends). */
export interface InteractionInsert {
  idempotency_key: string | null
  owner_profile_id: string
  subject_kind: InteractionSubjectKind
  subject_id: string
  space_id: string | null
  channel: InteractionChannel
  direction: InteractionDirection
  summary: string | null
  body: string | null
  metadata: Record<string, unknown>
  source: InteractionSource
  occurred_at: string
}

function oneLine(raw: unknown, cap: number): string | null {
  if (typeof raw !== 'string') return null
  const clean = raw.replace(/\s+/g, ' ').trim().slice(0, cap)
  return clean.length ? clean : null
}

function multiLine(raw: unknown, cap: number): string | null {
  if (typeof raw !== 'string') return null
  const clean = raw.trim().slice(0, cap)
  return clean.length ? clean : null
}

// ── PURE: validate + normalize one row (no IO, fully testable) ────────────────────────────────────

/**
 * Build the snake_case insert row from a caller's input, or return `null` when the input is invalid
 * (a missing owner / subject, or an unknown channel / subject_kind). FAIL-CLOSED: an unknown
 * direction or source falls back to its safe default ('internal' / 'manual') rather than being
 * trusted, and copy fields are trimmed + length-capped. Pure and deterministic.
 */
export function buildInteractionInsert(
  input: RecordInteractionInput,
  spaceId?: string | null,
): InteractionInsert | null {
  const ownerProfileId = typeof input.ownerProfileId === 'string' ? input.ownerProfileId.trim() : ''
  const subjectId = typeof input.subjectId === 'string' ? input.subjectId.trim() : ''
  if (!ownerProfileId || !subjectId) return null
  if (!SUBJECT_KINDS.includes(input.subjectKind)) return null
  if (!CHANNELS.includes(input.channel)) return null

  const direction = DIRECTIONS.includes(input.direction as InteractionDirection)
    ? (input.direction as InteractionDirection)
    : 'internal'
  const source = SOURCES.includes(input.source as InteractionSource)
    ? (input.source as InteractionSource)
    : 'manual'

  const metadata =
    input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata)
      ? (input.metadata as Record<string, unknown>)
      : {}

  const occurredAt =
    typeof input.occurredAt === 'string' && !Number.isNaN(Date.parse(input.occurredAt))
      ? new Date(input.occurredAt).toISOString()
      : new Date().toISOString()

  const idempotencyKey =
    typeof input.idempotencyKey === 'string' && input.idempotencyKey.trim().length
      ? input.idempotencyKey.trim()
      : null

  return {
    idempotency_key: idempotencyKey,
    owner_profile_id: ownerProfileId,
    subject_kind: input.subjectKind,
    subject_id: subjectId,
    space_id: typeof spaceId === 'string' && spaceId.trim().length ? spaceId.trim() : null,
    channel: input.channel,
    direction,
    summary: oneLine(input.summary, MAX_SUMMARY_LEN),
    body: multiLine(input.body, MAX_BODY_LEN),
    metadata,
    source,
    occurred_at: occurredAt,
  }
}

// ── IO: the untyped admin-client seam (contact_interactions is not in generated types yet, ADR-246) ─

type InteractionRow = {
  id: string
  owner_profile_id: string
  subject_kind: string
  subject_id: string
  space_id: string | null
  channel: string
  direction: string
  summary: string | null
  body: string | null
  metadata: unknown
  source: string
  occurred_at: string
  created_at: string
}

const ROW_COLS =
  'id, owner_profile_id, subject_kind, subject_id, space_id, channel, direction, summary, body, metadata, source, occurred_at, created_at'

/** The contact_interactions table via an untyped admin client (not in generated types yet, ADR-246).
 *  Loosely typed, mirroring lib/spaces/membership.ts. */
function interactionsTable(): {
  insert: (rows: InteractionInsert[]) => {
    select: (c: string) => { maybeSingle: () => Promise<{ data: InteractionRow | null; error: unknown }> }
  }
  upsert: (
    rows: InteractionInsert[],
    opts: { onConflict: string; ignoreDuplicates: boolean },
  ) => {
    select: (c: string) => { maybeSingle: () => Promise<{ data: InteractionRow | null; error: unknown }> }
  }
  select: (c: string) => {
    eq: (col: string, val: string) => unknown
    order: (col: string, opts: { ascending: boolean }) => unknown
    limit: (n: number) => unknown
  }
} {
  const db = createAdminClient() as unknown as { from: (t: string) => never }
  return db.from('contact_interactions')
}

/** Map a raw row to a typed ContactInteraction, fail-closed: an unknown enum value drops the row
 *  (returns null) so a future value the build doesn't know never surfaces mislabeled. */
function mapRow(r: InteractionRow): ContactInteraction | null {
  if (!SUBJECT_KINDS.includes(r.subject_kind as InteractionSubjectKind)) return null
  if (!CHANNELS.includes(r.channel as InteractionChannel)) return null
  const direction = DIRECTIONS.includes(r.direction as InteractionDirection)
    ? (r.direction as InteractionDirection)
    : 'internal'
  const source = SOURCES.includes(r.source as InteractionSource) ? (r.source as InteractionSource) : 'system'
  return {
    id: r.id,
    ownerProfileId: r.owner_profile_id,
    subjectKind: r.subject_kind as InteractionSubjectKind,
    subjectId: r.subject_id,
    spaceId: r.space_id,
    channel: r.channel as InteractionChannel,
    direction,
    summary: r.summary,
    body: r.body,
    metadata: r.metadata && typeof r.metadata === 'object' && !Array.isArray(r.metadata)
      ? (r.metadata as Record<string, unknown>)
      : {},
    source,
    occurredAt: r.occurred_at,
    createdAt: r.created_at,
  }
}

/**
 * Record one touch on the timeline. Returns the new (or existing) interaction id, or null on an
 * invalid input or a write error (FAIL-SAFE — recording a touch must never break the caller's hot
 * path). A row carrying an `idempotencyKey` upserts (a replay is a no-op); a keyless row inserts.
 * The write is stamped with the owner/Space the caller already authorized (see the authz note above).
 */
export async function recordContactInteraction(
  input: RecordInteractionInput,
  spaceId?: string | null,
): Promise<{ id: string } | null> {
  const row = buildInteractionInsert(input, spaceId)
  if (!row) return null
  try {
    if (row.idempotency_key) {
      // Exactly-once: on a replay (same key) do nothing and return null — the touch is already logged.
      const { data, error } = await interactionsTable()
        .upsert([row], { onConflict: 'idempotency_key', ignoreDuplicates: true })
        .select(ROW_COLS)
        .maybeSingle()
      if (error || !data) return null
      return { id: data.id }
    }
    const { data, error } = await interactionsTable().insert([row]).select(ROW_COLS).maybeSingle()
    if (error || !data) return null
    return { id: data.id }
  } catch {
    return null
  }
}

/** Filters for a timeline read. At least `ownerProfileId` (the personal timeline) is expected; a
 *  Studio read adds `spaceId`, a per-person read adds `subjectKind` + `subjectId`. */
export interface ListInteractionsFilter {
  ownerProfileId?: string
  subjectKind?: InteractionSubjectKind
  subjectId?: string
  spaceId?: string
  limit?: number
}

/**
 * Read a slice of the timeline, newest touch first. Service-role read, FAIL-SAFE (empty array on any
 * error). The caller is responsible for having authorized the scope it asks for (owner / Space), the
 * lib/crm/client-notes.ts contract; this binds the query to whichever scope columns are supplied.
 */
export async function listContactInteractions(filter: ListInteractionsFilter): Promise<ContactInteraction[]> {
  const limit = Math.min(Math.max(filter.limit ?? 100, 1), 500)
  try {
    let q = interactionsTable().select(ROW_COLS) as {
      eq: (col: string, val: string) => typeof q
      order: (col: string, opts: { ascending: boolean }) => typeof q
      limit: (n: number) => Promise<{ data: InteractionRow[] | null; error: unknown }>
    }
    if (filter.ownerProfileId) q = q.eq('owner_profile_id', filter.ownerProfileId)
    if (filter.spaceId) q = q.eq('space_id', filter.spaceId)
    if (filter.subjectKind) q = q.eq('subject_kind', filter.subjectKind)
    if (filter.subjectId) q = q.eq('subject_id', filter.subjectId)
    const { data, error } = await q.order('occurred_at', { ascending: false }).limit(limit)
    if (error || !data) return []
    return data.flatMap((r) => {
      const m = mapRow(r)
      return m ? [m] : []
    })
  } catch {
    return []
  }
}

/**
 * Read the timeline for ONE person across ALL of their subject rows at once — the platform/admin
 * "person view" (ADR-372). A person is stitched from several identity rows (their `contact` id, their
 * `profile` id, and any `network_contact` capture ids), so this gathers every interaction whose
 * `subject_id` is one of those, regardless of who logged it. Subject ids are UUIDs, so an `in` filter
 * across them never collides between kinds. Newest first. Service-role read; the caller (a staff-gated
 * admin surface) has authorized the scope. FAIL-SAFE: [] on any error.
 */
export async function listInteractionsForPerson(
  subjectIds: (string | null | undefined)[],
  limit = 200,
): Promise<ContactInteraction[]> {
  const ids = [...new Set(subjectIds.filter((s): s is string => typeof s === 'string' && s.length > 0))]
  if (ids.length === 0) return []
  const capped = Math.min(Math.max(limit, 1), 500)
  try {
    const db = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          in: (col: string, vals: string[]) => {
            order: (col: string, opts: { ascending: boolean }) => {
              limit: (n: number) => Promise<{ data: InteractionRow[] | null; error: unknown }>
            }
          }
        }
      }
    }
    const { data, error } = await db
      .from('contact_interactions')
      .select(ROW_COLS)
      .in('subject_id', ids)
      .order('occurred_at', { ascending: false })
      .limit(capped)
    if (error || !data) return []
    return data.flatMap((r) => {
      const m = mapRow(r)
      return m ? [m] : []
    })
  } catch {
    return []
  }
}
