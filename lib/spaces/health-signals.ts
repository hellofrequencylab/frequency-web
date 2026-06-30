// BATCHED health-signal gathering for the /admin/spaces dashboard (NO N+1). This is the SERVER seam
// that feeds the PURE classifier in lib/spaces/health.ts: it gathers per-Space member counts +
// recency for EVERY Space in ONE pass (not a query per Space), mirroring listSpaceAdminMeta's untyped
// admin-client pattern in app/(main)/admin/spaces/page.tsx. Reads go through the service-role admin
// client behind the janitor gate (same posture as the rest of that page) — no RLS change.
//
// WHY ONE QUERY, NOT listSpaceMembers IN A LOOP: calling listSpaceMembers(space.id) per Space is the
// N+1 the brief forbids. Instead we select the THREE columns we need (space_id, status, created_at)
// across ALL space_members in a single request and fold them per space_id in memory. space_members is
// small (one row per Space membership) and we never hydrate the full row, so this stays cheap.
//
// FAIL-SAFE: if space_members is unmigrated or the read errors, every member-derived signal degrades
// to UNKNOWN (undefined) rather than throwing — the page still renders, and the classifier judges each
// Space on status + the Space's own timestamp alone (it never reads a missing count as zero).

import { createAdminClient } from '@/lib/supabase/admin'
import type { Space } from './types'
import { spaceHealth, type SpaceHealthSignals, type SpaceHealthResult } from './health'

/** The folded member signal for one Space: active + total counts and the newest join timestamp. */
interface MemberSignal {
  activeMembers: number
  totalMembers: number
  /** ISO of the most recent member join (max created_at), or null when the Space has no members. */
  newestJoinAt: string | null
}

/** A raw `space_members` projection — only the three columns the fold needs. The table is not in the
 *  generated DB types yet (ADR-246), so it rides the untyped admin accessor like membership.ts. */
type MemberSignalRow = { space_id: string; status: string; created_at: string }

/**
 * ONE grouped read over space_members for every Space, folded per space_id in memory. Returns a Map
 * keyed by space id -> its MemberSignal. FAIL-SAFE: a missing/unmigrated table yields an EMPTY map, so
 * each Space's member counts read as unknown (never zero). No per-Space query, no N+1.
 */
async function gatherMemberSignals(): Promise<Map<string, MemberSignal>> {
  const out = new Map<string, MemberSignal>()
  try {
    // Untyped admin accessor: space_members is not in the generated types (ADR-246), same as
    // lib/spaces/membership.ts. We pull only space_id/status/created_at — never the full row.
    const db = createAdminClient() as unknown as {
      from: (table: string) => {
        select: (cols: string) => Promise<{ data: MemberSignalRow[] | null; error: unknown }>
      }
    }
    const { data, error } = await db.from('space_members').select('space_id, status, created_at')
    if (error || !data) return out
    for (const row of data) {
      if (!row?.space_id) continue
      const cur =
        out.get(row.space_id) ?? { activeMembers: 0, totalMembers: 0, newestJoinAt: null }
      cur.totalMembers += 1
      if (row.status === 'active') cur.activeMembers += 1
      // Track the newest join as the recency proxy (string compare is valid for ISO-8601 UTC).
      if (typeof row.created_at === 'string' && (cur.newestJoinAt === null || row.created_at > cur.newestJoinAt)) {
        cur.newestJoinAt = row.created_at
      }
      out.set(row.space_id, cur)
    }
  } catch {
    // Pre-migration (no space_members table) or a read error: degrade to no member signals. The
    // classifier then judges each Space on status + its own timestamp alone.
  }
  return out
}

/** A raw `spaces` timestamp projection — only the columns the recency fallback needs. These are NOT on
 *  the typed Space (the store does not select them, ADR-246-style), so they ride this untyped read. */
type SpaceTimestampRow = { id: string; updated_at: string | null; created_at: string | null }

/**
 * ONE read of each Space's own activity timestamp (updated_at, falling back to created_at), keyed by
 * id. This is the recency fallback for a Space with no members yet. FAIL-SAFE: a read error yields an
 * empty map, so recency degrades to unknown rather than erroring. One query for all Spaces (no N+1).
 */
async function gatherSpaceTimestamps(): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  try {
    const db = createAdminClient() as unknown as {
      from: (table: string) => {
        select: (cols: string) => Promise<{ data: SpaceTimestampRow[] | null; error: unknown }>
      }
    }
    const { data, error } = await db.from('spaces').select('id, updated_at, created_at')
    if (error || !data) return out
    for (const row of data) {
      const ts = row?.updated_at ?? row?.created_at
      if (row?.id && typeof ts === 'string') out.set(row.id, ts)
    }
  } catch {
    // Degrade to no timestamps: recency falls to unknown for Spaces without members.
  }
  return out
}

/** One Space paired with its computed health verdict. The dashboard groups these by `health.bucket`. */
export interface SpaceWithHealth {
  space: Space
  signals: SpaceHealthSignals
  health: SpaceHealthResult
}

/**
 * Gather health for EVERY Space in one batched pass and classify each. Takes the already-loaded Spaces
 * (the page reads them once via listSpaces) and does ONE additional grouped read for member signals.
 * Returns each Space paired with its signals + health verdict, preserving the input order.
 *
 * The recency signal is the newest member join when the Space has members, else the Space's own
 * updated_at/created_at (a coarse "anything happening here" proxy, honest about its limits). Any signal
 * we cannot read stays undefined so spaceHealth treats it as unknown, never as zero.
 */
export async function gatherSpacesHealth(spaces: Space[]): Promise<SpaceWithHealth[]> {
  // Two batched reads, in parallel: member counts/recency, and each Space's own timestamp fallback.
  const [memberSignals, spaceTimestamps] = await Promise.all([
    gatherMemberSignals(),
    gatherSpaceTimestamps(),
  ])
  const now = Date.now()
  return spaces.map((space) => {
    const member = memberSignals.get(space.id)
    const lastActivityAt = member?.newestJoinAt ?? spaceTimestamps.get(space.id) ?? null
    const signals: SpaceHealthSignals = {
      status: space.status,
      activeMembers: member?.activeMembers,
      totalMembers: member?.totalMembers,
      lastActivityAt,
      now,
    }
    return { space, signals, health: spaceHealth(signals) }
  })
}
