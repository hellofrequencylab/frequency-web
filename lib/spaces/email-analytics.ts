// Per-Space EMAIL DELIVERABILITY ANALYTICS + SUPPRESSION READS (ENTITY-SPACES-BUILD §C Phase 3).
// The READ side of per-space email: a Space owner needs to see how their sending PERFORMS
// (sent / delivered / bounced / complained) and WHO opted out (unsubscribed / bounced), scoped to
// THIS Space and never another's. The Business analog of lib/spaces/memberships.ts: service-role
// admin client + untyped casts because the backbone's tables are not in the generated DB types yet
// (ADR-246), and every read is FAIL-SAFE (zeros / []) so this compiles and tests pass even before
// those tables exist in the database.
//
// THE SEAM (a sibling "backbone" agent creates these; we only READ them):
//   • outreach_sends - the per-Space send ledger. Columns: id, space_id (not null), campaign_id,
//     contact_id, email, status in ('queued','sent','delivered','bounced','complained','failed',
//     'suppressed'), resend_id, error, created_at, updated_at. We count statuses per space_id and
//     list recent rows for a history view.
//   • email_suppressions - gains a nullable space_id. A row with space_id = THIS space is a
//     per-Space suppression; a row with space_id = null is a GLOBAL suppression that affects every
//     Space. A Space's EFFECTIVE suppressions are its own rows UNION the global (null) rows.
//
// TENANCY (ADR-246/328/329): the server is the authority for "which space" and "what may this
// caller do here." Stats + suppressions are gated on canEditProfile (owner / admin / editor) via
// getSpaceCapabilities; a platform janitor previewing as staff may also read (view only, mirroring
// listSpaceMemberships). A space's stats/suppressions NEVER include another space's rows: every
// query filters on space_id, and the suppression union only ever adds the GLOBAL (null) rows.
//
// All owner-facing strings here are data, not copy; the components carry the voice (CONTENT-VOICE).

import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { getSpaceById } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { isJanitor } from '@/lib/core/roles'

// ── Types ───────────────────────────────────────────────────────────────────────────────────────

/** The lifecycle a send can be in, mirroring the outreach_sends `status` CHECK. */
export type SendStatus =
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'bounced'
  | 'complained'
  | 'failed'
  | 'suppressed'

/** A Space's deliverability snapshot, computed over its own outreach_sends rows. Counts are whole
 *  numbers; the two RATES are fractions in [0, 1] (a component renders them as percentages). */
export interface SpaceEmailStats {
  /** Rows whose status reached at least the "we tried to send it" stage (everything except queued /
   *  suppressed): sent + delivered + bounced + complained + failed. The denominator for the rates. */
  sent: number
  delivered: number
  bounced: number
  complained: number
  suppressed: number
  failed: number
  /** bounced / sent, a fraction (0 when nothing was sent). */
  bounceRate: number
  /** complained / sent, a fraction (0 when nothing was sent). The anti-spam health signal; the
   *  panel flags it when it exceeds 0.1% (0.001). */
  complaintRate: number
}

/** One effective suppression for a Space (its own row, or a global one that affects it). */
export interface SpaceSuppression {
  id: string
  email: string
  /** Why the address is suppressed (e.g. 'unsubscribe', 'bounce', 'complaint'); null if unrecorded. */
  reason: string | null
  /** True when this is a GLOBAL suppression (space_id = null) affecting every Space, not this Space's
   *  own opt-out. The list can label these so an owner understands a platform-wide opt-out. */
  isGlobal: boolean
  createdAt: string
}

/** One recent send, for the owner's history list. */
export interface SpaceSend {
  id: string
  email: string
  status: SendStatus
  /** A short failure/bounce reason when the provider gave one, else null. */
  error: string | null
  createdAt: string
}

const ZERO_STATS: SpaceEmailStats = {
  sent: 0,
  delivered: 0,
  bounced: 0,
  complained: 0,
  suppressed: 0,
  failed: 0,
  bounceRate: 0,
  complaintRate: 0,
}

// Hard cap so a list read can never pull an unbounded number of rows.
const DEFAULT_LIST_LIMIT = 50
const MAX_LIST_LIMIT = 200

/** The known send statuses, so a stray/unknown status from the ledger is ignored (fail-closed) and
 *  never inflates a count or rate. */
const SEND_STATUSES: readonly SendStatus[] = [
  'queued',
  'sent',
  'delivered',
  'bounced',
  'complained',
  'failed',
  'suppressed',
] as const

function isSendStatus(v: unknown): v is SendStatus {
  return typeof v === 'string' && (SEND_STATUSES as readonly string[]).includes(v)
}

// ── IO seams: the untyped admin-client builders (tables not in generated types yet, ADR-246) ──────

// Loosely-typed rows + a minimal chainable query surface, mirroring lib/spaces/memberships.ts. The
// builder is `then`-able so `await table().select(...).eq(...)` resolves to { data, error }.
type SendRow = {
  id: string
  space_id: string
  email: string | null
  status: string
  error: string | null
  created_at: string
}
type SuppressionRow = {
  id: string
  space_id: string | null
  email: string | null
  reason: string | null
  created_at: string
}

type SendQuery = {
  select: (cols: string) => SendQuery
  eq: (col: string, val: string) => SendQuery
  order: (col: string, opts: { ascending: boolean }) => SendQuery
  limit: (n: number) => SendQuery
  then: (resolve: (r: { data: SendRow[] | null; error: unknown }) => unknown) => Promise<unknown>
}
type SuppressionQuery = {
  select: (cols: string) => SuppressionQuery
  eq: (col: string, val: string) => SuppressionQuery
  is: (col: string, val: null) => SuppressionQuery
  or: (filter: string) => SuppressionQuery
  order: (col: string, opts: { ascending: boolean }) => SuppressionQuery
  limit: (n: number) => SuppressionQuery
  then: (
    resolve: (r: { data: SuppressionRow[] | null; error: unknown }) => unknown,
  ) => Promise<unknown>
}

function sendsTable(): SendQuery {
  const dbc = createAdminClient() as unknown as { from: (t: string) => SendQuery }
  return dbc.from('outreach_sends')
}
function suppressionsTable(): SuppressionQuery {
  const dbc = createAdminClient() as unknown as { from: (t: string) => SuppressionQuery }
  return dbc.from('email_suppressions')
}

const SEND_COLS = 'id, space_id, email, status, error, created_at'
const SUPPRESSION_COLS = 'id, space_id, email, reason, created_at'

/** Clamp a caller-supplied list limit to a sane, bounded positive integer. */
function clampLimit(limit: number | undefined): number {
  const n = Math.round(Number(limit))
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIST_LIMIT
  return Math.min(n, MAX_LIST_LIMIT)
}

/** Whether the current caller may read this Space's email analytics: an editor+ of the Space, OR a
 *  platform janitor previewing as staff (view only). FAIL-SAFE: anonymous / missing Space → false.
 *  Mirrors the gate in listSpaceMemberships so the read authority is identical across the surface. */
async function canReadSpaceEmail(spaceId: string): Promise<boolean> {
  const caller = await getCallerProfile()
  const space = await getSpaceById(spaceId)
  if (!space) return false
  const caps = await getSpaceCapabilities(space, caller?.id ?? null)
  return caps.canEditProfile || isJanitor(caller?.webRole)
}

// ── PUBLIC READS (gated, fail-safe) ───────────────────────────────────────────────────────────────

/**
 * A Space's deliverability snapshot, counted over ITS OWN outreach_sends rows (filtered on space_id,
 * so another Space's sends can never leak in). Gated on canEditProfile (or a staff janitor preview).
 *
 * RATES: `sent` is the count of rows that actually reached the provider (everything except `queued`
 * and `suppressed`); it is the denominator. `bounceRate = bounced / sent` and
 * `complaintRate = complained / sent`, each a fraction (and exactly 0 when nothing was sent, never a
 * divide-by-zero). The complaint rate is the <0.1% anti-spam health signal the panel surfaces.
 *
 * FAIL-SAFE: an unauthorized caller, a missing table, or any error resolves to all-zero stats, so a
 * render never breaks and a leak is impossible (zeros reveal nothing).
 */
export async function getSpaceEmailStats(spaceId: string): Promise<SpaceEmailStats> {
  if (!spaceId) return ZERO_STATS
  if (!(await canReadSpaceEmail(spaceId))) return ZERO_STATS

  try {
    const { data, error } = await sendsTable().select('status').eq('space_id', spaceId)
    if (error || !data) return ZERO_STATS

    const counts: Record<SendStatus, number> = {
      queued: 0,
      sent: 0,
      delivered: 0,
      bounced: 0,
      complained: 0,
      failed: 0,
      suppressed: 0,
    }
    for (const row of data) {
      // An unknown / future status is ignored (fail-closed) rather than trusted into a bucket.
      if (isSendStatus(row.status)) counts[row.status] += 1
    }

    // "Sent" = every row that actually reached the provider: everything except still-queued and
    // pre-send suppressed. This is the honest denominator for the deliverability rates.
    const attempted =
      counts.sent + counts.delivered + counts.bounced + counts.complained + counts.failed

    return {
      sent: attempted,
      delivered: counts.delivered,
      bounced: counts.bounced,
      complained: counts.complained,
      suppressed: counts.suppressed,
      failed: counts.failed,
      bounceRate: attempted > 0 ? counts.bounced / attempted : 0,
      complaintRate: attempted > 0 ? counts.complained / attempted : 0,
    }
  } catch {
    return ZERO_STATS
  }
}

/**
 * The suppressions that AFFECT this Space, newest first: its own (space_id = this space) rows UNION
 * the GLOBAL (space_id = null) rows that apply everywhere. Gated on canEditProfile (or a staff
 * janitor preview). The union only ever ADDS the global rows, so another Space's own suppressions
 * can never appear here. FAIL-SAFE to [] for an unauthorized caller, a missing table, or any error.
 *
 * `limit` caps the returned rows (default 50, hard max 200). Rows with no email are dropped (a
 * suppression with no address is meaningless to show).
 */
export async function listSpaceSuppressions(
  spaceId: string,
  limit?: number,
): Promise<SpaceSuppression[]> {
  if (!spaceId) return []
  if (!(await canReadSpaceEmail(spaceId))) return []

  const max = clampLimit(limit)
  try {
    // The effective set is "this space's own rows OR the global (null-space) rows". A single PostgREST
    // `or` does both: space_id equals this space, or space_id is null.
    const { data, error } = await suppressionsTable()
      .select(SUPPRESSION_COLS)
      .or(`space_id.eq.${spaceId},space_id.is.null`)
      .order('created_at', { ascending: false })
      .limit(max)
    if (error || !data) return []

    return data.flatMap((r) => {
      const email = typeof r.email === 'string' ? r.email.trim() : ''
      if (!email) return []
      return [
        {
          id: r.id,
          email,
          reason: typeof r.reason === 'string' && r.reason.trim() ? r.reason.trim() : null,
          isGlobal: r.space_id == null,
          createdAt: r.created_at,
        },
      ]
    })
  } catch {
    return []
  }
}

/**
 * Recent sends for THIS Space, newest first, for an owner history list. Filtered on space_id (no
 * cross-space leak). Gated on canEditProfile (or a staff janitor preview). FAIL-SAFE to [] for an
 * unauthorized caller, a missing table, or any error. `limit` defaults to 50 (hard max 200).
 *
 * A row whose status is unknown/garbage is dropped (fail-closed), so the history only ever shows
 * statuses the UI knows how to label.
 */
export async function recentSpaceSends(spaceId: string, limit?: number): Promise<SpaceSend[]> {
  if (!spaceId) return []
  if (!(await canReadSpaceEmail(spaceId))) return []

  const max = clampLimit(limit)
  try {
    const { data, error } = await sendsTable()
      .select(SEND_COLS)
      .eq('space_id', spaceId)
      .order('created_at', { ascending: false })
      .limit(max)
    if (error || !data) return []

    return data.flatMap((r) => {
      if (!isSendStatus(r.status)) return []
      return [
        {
          id: r.id,
          email: typeof r.email === 'string' ? r.email.trim() : '',
          status: r.status,
          error: typeof r.error === 'string' && r.error.trim() ? r.error.trim() : null,
          createdAt: r.created_at,
        },
      ]
    })
  } catch {
    return []
  }
}
