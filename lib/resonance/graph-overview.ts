// The Resonance Graph SURFACE read layer (Resonance Engine · ADR-388 · docs/ADMIN-BUILD-PLAN.md
// Phase 3b). The consent-first, fail-safe reads the /admin/crm/graph dashboard composes: the metric
// row (consented members, live edges, mean resonance health) and the strongest-connections list (a
// ranked, accessible projection of resonance_edges, NEVER a heavy graph-viz dependency).
//
// CONSENT IS MANDATORY (the trust moat). An edge only EXISTS in resonance_edges when both people
// opted in to matching (the nightly refresh in lib/resonance/edges.ts only ever produces edges over
// the opted-in pool, and only opted-in, not-opted-out targets). This read enforces it AGAIN as
// defense-in-depth: it re-checks resonance_consent for both ends and DROPS any edge where either side
// is not currently opted in, so a consent withdrawal between nightly runs is honored immediately. It
// can therefore NEVER fabricate or over-surface an edge.
//
// FAIL-SAFE BY CONSTRUCTION. resonance_edges / resonance_consent are service-role only (RLS on, no
// client policy) and not in the generated DB types until they regenerate (ADR-246), so they are
// reached through the untyped admin client. Every read swallows any error (a missing table
// pre-migration, an RLS hiccup, an empty prod table) and returns zeros / an empty list, so the
// dashboard degrades to a calm, consent-explaining empty state and never crashes.
//
// authz-delegated: these are READ helpers (no mutation). The gate lives at the call site (the
// staff-gated /admin/crm/graph page, requireAdmin('janitor', { staff: 'insights', staffLevel: 'read' })).

import { createAdminClient } from '@/lib/supabase/admin'
import type { ResonanceReason } from './score'

// ── Types ─────────────────────────────────────────────────────────────────────

/** The metric row's numbers, all fail-safe to zeros. */
export interface GraphOverview {
  /** People currently opted in to matching (resonance_consent.opted_in = true). The pool size. */
  consentedMembers: number
  /** Live (not expired) edges between two currently-consented people. The graph's density. */
  edges: number
  /** True when a read DEGRADED (a table is absent or the read failed), so the counts are not
   *  authoritative; the page should read this as "nothing yet" rather than a hard zero. */
  degraded: boolean
}

export const ZERO_GRAPH_OVERVIEW: GraphOverview = { consentedMembers: 0, edges: 0, degraded: true }

/** One end of a connection, named for the list (the per-node drill to Member Intelligence). */
export interface ConnectionParty {
  profileId: string
  /** The CRM contact id for the timeline drill, or null when no contact is stitched. */
  contactId: string | null
  /** A plain display name (display_name, then the email local part, then a calm fallback). */
  name: string
}

/** One strongest consented connection, ready to render as a ranked list row. */
export interface StrongConnection {
  a: ConnectionParty
  b: ConnectionParty
  /** The reciprocal Resonance Score, 0..1 (higher = stronger mutual fit). */
  score: number
  /** The plain-language shared-belonging reasons (the WHY), never a stalking-adjacent signal. */
  reasons: ResonanceReason[]
}

const num = (v: number | null | undefined): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

// ── Consent (re-checked on read; defense-in-depth) ─────────────────────────────

/** Read the set of CURRENTLY opted-in profile ids among a candidate set, fail-closed. An absent row,
 *  opted_in=false, or any error means NOT in the set (so the edge is dropped). */
async function readOptedIn(profileIds: string[]): Promise<Set<string>> {
  const set = new Set<string>()
  if (profileIds.length === 0) return set
  try {
    const admin = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (c: string) => { in: (col: string, vals: string[]) => Promise<{ data: { profile_id: string; opted_in: boolean | null }[] | null; error: unknown }> }
      }
    }
    const { data, error } = await admin
      .from('resonance_consent')
      .select('profile_id, opted_in')
      .in('profile_id', profileIds)
    if (error || !data) return set
    for (const r of data) if (r.opted_in === true) set.add(r.profile_id)
    return set
  } catch {
    return set
  }
}

// ── Metric row ──────────────────────────────────────────────────────────────────

/**
 * The consented-member count + the live-edge count in one fail-safe read. FAIL-SAFE: any error or a
 * missing table resolves to a degraded zero, so the dashboard shows its consent-explaining empty
 * state. The caller MUST have passed the staff floor first.
 */
export async function getGraphOverview(): Promise<GraphOverview> {
  try {
    const admin = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (
          c: string,
          opts?: { head: boolean; count: 'exact' },
        ) => {
          eq: (col: string, val: boolean) => Promise<{ count: number | null; error: unknown }>
          gt: (col: string, val: string) => Promise<{ count: number | null; error: unknown }>
        }
      }
    }
    const nowIso = new Date().toISOString()
    const [consent, edges] = await Promise.all([
      admin.from('resonance_consent').select('profile_id', { head: true, count: 'exact' }).eq('opted_in', true),
      admin.from('resonance_edges').select('a_pid', { head: true, count: 'exact' }).gt('expires_at', nowIso),
    ])
    if (consent.error && edges.error) return ZERO_GRAPH_OVERVIEW
    return {
      consentedMembers: num(consent.error ? 0 : consent.count),
      edges: num(edges.error ? 0 : edges.count),
      degraded: !!consent.error || !!edges.error,
    }
  } catch {
    return ZERO_GRAPH_OVERVIEW
  }
}

// ── The strongest-connections list (the accessible relationship view) ──────────

interface EdgeRow {
  a_pid: string
  b_pid: string
  score: number | null
  reasons: unknown
}
type ContactNameRow = { id: string; profile_id: string | null; display_name: string | null; email: string }

/** Coerce a stored reasons jsonb back to the typed array, fail-safe to []. */
function asReasons(raw: unknown): ResonanceReason[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((r) => {
    if (r && typeof r === 'object' && 'kind' in r && 'label' in r) {
      const label = String((r as { label: unknown }).label)
      const kind = String((r as { kind: unknown }).kind)
      if (label) return [{ kind: kind as ResonanceReason['kind'], label }]
    }
    return []
  })
}

/**
 * The strongest CONSENTED connections across the platform, highest score first, for the ranked list.
 * Reads only live (not expired) edges, re-checks consent on BOTH ends (dropping any edge where either
 * side is not currently opted in), and resolves names + contact ids for the timeline / Member
 * Intelligence drill. FAIL-SAFE: any error, a missing table, or no edges resolves to an empty list,
 * so the page shows its consent-first empty state and NEVER fabricates an edge. The caller MUST gate
 * the scope first (staff floor).
 */
export async function getStrongestConnections(limit = 12): Promise<StrongConnection[]> {
  const capped = Math.max(1, Math.min(50, limit))
  try {
    const admin = createAdminClient()
    const nowIso = new Date().toISOString()
    // Over-read a little so dropping any unconsented edges still fills the list.
    const { data: edgeData, error } = await (admin as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          gt: (col: string, val: string) => {
            order: (col: string, o: { ascending: boolean }) => {
              limit: (n: number) => Promise<{ data: EdgeRow[] | null; error: unknown }>
            }
          }
        }
      }
    })
      .from('resonance_edges')
      .select('a_pid, b_pid, score, reasons')
      .gt('expires_at', nowIso)
      .order('score', { ascending: false })
      .limit(capped * 3)
    if (error || !edgeData || edgeData.length === 0) return []

    // Defense-in-depth consent re-check: drop any edge where either side is not currently opted in.
    const allIds = [...new Set(edgeData.flatMap((e) => [e.a_pid, e.b_pid]).filter(Boolean))]
    const optedIn = await readOptedIn(allIds)
    const consented = edgeData.filter((e) => optedIn.has(e.a_pid) && optedIn.has(e.b_pid)).slice(0, capped)
    if (consented.length === 0) return []

    // Resolve names + a contact id for every surviving party.
    const partyIds = [...new Set(consented.flatMap((e) => [e.a_pid, e.b_pid]))]
    const { data: contactData } = await admin
      .from('contacts')
      .select('id, profile_id, display_name, email')
      .in('profile_id', partyIds)
    const byProfile = new Map<string, ContactNameRow>()
    for (const c of (contactData ?? []) as ContactNameRow[]) {
      if (c.profile_id && !byProfile.has(c.profile_id)) byProfile.set(c.profile_id, c)
    }
    const party = (pid: string): ConnectionParty => {
      const c = byProfile.get(pid)
      return {
        profileId: pid,
        contactId: c?.id ?? null,
        name: (c?.display_name || c?.email?.split('@')[0] || 'This member').trim(),
      }
    }

    return consented.map((e) => ({
      a: party(e.a_pid),
      b: party(e.b_pid),
      score: Math.max(0, Math.min(1, num(e.score))),
      reasons: asReasons(e.reasons),
    }))
  } catch {
    return []
  }
}
