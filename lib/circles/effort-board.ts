import 'server-only'
import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { isOptedOut } from '@/app/(main)/crew/leaderboard/opt-out'
import type { SeasonRank } from '@/lib/season-ranks'
import { scoreEffort, buildEffortBoard, WINDOW_DAYS, type EffortCandidate, type EffortBoard } from '@/lib/quest/effort'

// ── THE CIRCLE BOARD'S READ ─────────────────────────────────────────────────────────────────────
//
// The IO half of "effort relative to yourself" (lib/quest/effort.ts holds the rules and all of the
// reasoning). Two independent questions, deliberately kept apart because they answer to different
// promises:
//
//   1. THE SHARED TOTAL, which leads the page. Zaps earned THROUGH this circle, and how many people
//      added to them. Read from the circle's own activity (getCircleZapContributions), so it is
//      never filtered by anybody's board preference. An opted-out member has no ROW and still
//      counts here — that is the promise app/(main)/crew/leaderboard/opt-out.ts makes, and this is
//      where it is kept.
//   2. THE ROWS, which sit below it. Each active member's last five weeks of `zap_transactions`,
//      scored against their own baseline.
//
// WHY THE ROWS READ A MEMBER'S WHOLE LEDGER, NOT ONLY THIS CIRCLE'S ZAPS. The comparison is a
// member against themselves, so the denominator has to be their real week; a circle-only numerator
// over a whole-life denominator would be a different number every time they practised elsewhere.
// The circle scopes WHO appears, which is the local-comparison the research asks for; it does not
// scope what counts as their effort. The shared bar above is the circle-scoped number.
//
// Service-role reads behind the CALLER's gate: the page renders rows only for members of the
// circle. FAIL-SAFE throughout — a board is never worth breaking a circle page over.

function db(): SupabaseClient {
  return createAdminClient()
}

/** One member's contribution to the circle's shared total. */
export interface CircleContribution {
  profileId: string
  zaps: number
}

/**
 * The shared total and its contributor count, from a per-member contribution list.
 *
 * Pure so the opt-out promise is testable without a database: nothing in this function can filter a
 * member out, which is the point. A contributor is someone with a positive contribution.
 */
export function summariseContributions(contributions: CircleContribution[]): {
  total: number
  contributors: number
} {
  let total = 0
  const people = new Set<string>()
  for (const c of contributions) {
    const zaps = Math.max(0, Number(c.zaps) || 0)
    if (zaps <= 0) continue
    total += zaps
    people.add(c.profileId)
  }
  return { total, contributors: people.size }
}

/** A board row, before it is mapped onto the shared leaderboard row component. */
export interface CircleBoardMember extends EffortCandidate {
  handle: string
  avatarUrl: string | null
  seasonRank: SeasonRank
  seasonZaps: number
  streak: number
}

export interface CircleBoardData extends EffortBoard<CircleBoardMember> {
  /** Zaps earned through this circle this season. Never filtered by opt-out. */
  total: number
  /** How many members have added to that total. Never filtered by opt-out. */
  contributors: number
  /** The viewer's own scored week, even when they are opted out or below the gate. */
  me: CircleBoardMember | null
}

/**
 * The viewer's own "hide me from the board" preference, for the control that toggles it.
 *
 * A one-column read rather than a slice of the board, because the control renders ABOVE the
 * streamed board section and must not wait on it. FAIL-SAFE to false: a failed read shows the
 * member as listed, which is the state the toggle can correct, rather than silently claiming they
 * are hidden when they are not.
 */
export async function loadOptOutPreference(profileId: string | null): Promise<boolean> {
  if (!profileId) return false
  try {
    const { data } = await db().from('profiles').select('meta').eq('id', profileId).maybeSingle()
    return isOptedOut((data as { meta: Record<string, unknown> | null } | null)?.meta)
  } catch {
    return false
  }
}

/**
 * Every active member of a circle, scored against their own recent baseline, plus the circle's
 * shared total. Three reads: the roster's profiles, their last five weeks of ledger rows, and the
 * circle's own contribution rows.
 */
export async function loadCircleBoard(
  circleId: string,
  memberProfileIds: string[],
  viewerProfileId: string | null,
  now: number = Date.now(),
): Promise<CircleBoardData> {
  const empty: CircleBoardData = { rows: [], showing: 0, showsBoard: false, total: 0, contributors: 0, me: null }
  if (!circleId) return empty

  try {
    const ids = [...new Set(memberProfileIds.filter(Boolean))]
    const since = new Date(now - WINDOW_DAYS * 86_400_000).toISOString()

    const [contributions, profilesRes, ledgerRes] = await Promise.all([
      getCircleZapContributions(circleId),
      ids.length
        ? db()
            .from('profiles')
            .select('id, display_name, handle, avatar_url, current_season_zaps, current_season_rank, current_streak, created_at, meta')
            .in('id', ids)
        : Promise.resolve({ data: [] }),
      ids.length
        ? db().from('zap_transactions').select('profile_id, amount, created_at').in('profile_id', ids).gte('created_at', since)
        : Promise.resolve({ data: [] }),
    ])

    const { total, contributors } = summariseContributions(contributions)

    // Bucket the ledger by member once, rather than filtering the whole list per member.
    const byMember = new Map<string, { at: string; amount: number }[]>()
    for (const row of (ledgerRes.data ?? []) as { profile_id: string; amount: number; created_at: string }[]) {
      const list = byMember.get(row.profile_id)
      if (list) list.push({ at: row.created_at, amount: row.amount })
      else byMember.set(row.profile_id, [{ at: row.created_at, amount: row.amount }])
    }

    type ProfileRow = {
      id: string
      display_name: string
      handle: string
      avatar_url: string | null
      current_season_zaps: number | null
      current_season_rank: string | null
      current_streak: number | null
      created_at: string | null
      meta: Record<string, unknown> | null
    }

    const candidates: CircleBoardMember[] = ((profilesRes.data ?? []) as ProfileRow[]).map((p) => {
      const createdMs = p.created_at ? Date.parse(p.created_at) : NaN
      const accountAgeDays = Number.isFinite(createdMs) ? Math.floor((now - createdMs) / 86_400_000) : 0
      return {
        id: p.id,
        displayName: p.display_name,
        handle: p.handle,
        avatarUrl: p.avatar_url,
        seasonRank: (p.current_season_rank ?? 'ghost') as SeasonRank,
        seasonZaps: p.current_season_zaps ?? 0,
        streak: p.current_streak ?? 0,
        optedOut: isOptedOut(p.meta),
        effort: scoreEffort({ entries: byMember.get(p.id) ?? [], accountAgeDays, now }),
      }
    })

    const board = buildEffortBoard(candidates)
    const me = viewerProfileId ? candidates.find((c) => c.id === viewerProfileId) ?? null : null

    return { ...board, total, contributors, me }
  } catch {
    return empty
  }
}

/**
 * Per-member Zaps earned THROUGH this circle, from the same two circle-scoped sources
 * lib/circles/earned.ts totals (and for the same reasons, including its no-double-count rule):
 * practice logs stamped with this circle, and zap_transactions stamped with it in metadata.
 *
 * A member's personal, platform-wide season total is deliberately NOT one of the sources: summing
 * those is the exact bug earned.ts was written to fix, where a freshly-claimed circle displayed its
 * claimer's own season standing as if the circle had earned it.
 *
 * `cache()`d because the page asks TWICE in one request: once at the top for the shared bar, which
 * must paint with the shell, and once inside the streamed board section. The second call is a memo
 * hit, so streaming the board costs no extra round trip (the loadCircleShell idiom).
 *
 * FAIL-SAFE: [] on any error.
 */
export const getCircleZapContributions = cache(async (circleId: string): Promise<CircleContribution[]> => {
  if (!circleId) return []
  try {
    const [logsRes, txRes] = await Promise.all([
      db().from('practice_logs').select('profile_id, zaps_awarded').eq('circle_id', circleId),
      db().from('zap_transactions').select('profile_id, amount').eq('metadata->>circleId', circleId),
    ])

    const byMember = new Map<string, number>()
    const add = (profileId: string | null, amount: number | null) => {
      if (!profileId) return
      byMember.set(profileId, (byMember.get(profileId) ?? 0) + Math.max(0, amount ?? 0))
    }
    for (const r of (logsRes.data ?? []) as { profile_id: string | null; zaps_awarded: number | null }[]) {
      add(r.profile_id, r.zaps_awarded)
    }
    for (const r of (txRes.data ?? []) as { profile_id: string | null; amount: number | null }[]) {
      add(r.profile_id, r.amount)
    }

    return [...byMember].map(([profileId, zaps]) => ({ profileId, zaps }))
  } catch {
    return []
  }
})
