import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { RANK_LABELS, type SeasonRank } from '@/lib/season-ranks'
import { isOptedOut } from '@/app/(main)/crew/leaderboard/opt-out'

// THE STANDING READS (Frequency /admin/gamification). Platform-wide, read-only, fail-quiet; the route's
// requireAdmin gate ran first. Every number is a profiles column the gamification engine already keeps:
// current_streak, longest_streak, current_season_zaps, lifetime_zaps and current_season_rank.
//
// WHO COUNTS. The same people the member leaderboard counts (app/(main)/crew/leaderboard/page.tsx): active,
// never a system account (Vera) and never a demo profile. A member who hid themselves from the board
// (profiles.meta.leaderboardOptOut, isOptedOut) never appears as a named row: not on either board and not as
// the longest-streak holder. They still count in "On a streak", a total that names no one, the same rule the
// effort board keeps (lib/quest/effort.ts: the opt-out hides the row, never the shared total).

export interface StandingRow {
  id: string
  name: string
  handle: string
  avatarUrl: string | null
  rank: string | null
  streak: number
  zaps: number
}

export interface StandingReads {
  /** Members with a live streak (current_streak > 0); null when the read failed. */
  onStreak: number | null
  longest: { days: number; name: string } | null
  season: StandingRow[]
  allTime: StandingRow[]
}

type ProfileRow = {
  id: string
  display_name: string | null
  handle: string
  avatar_url: string | null
  current_streak: number | null
  longest_streak: number | null
  current_season_zaps: number | null
  lifetime_zaps: number | null
  current_season_rank: string | null
  meta: Record<string, unknown> | null
}

const COLS =
  'id, display_name, handle, avatar_url, current_streak, longest_streak, current_season_zaps, lifetime_zaps, current_season_rank, meta'
const BOARD = 10
// Opted-out members are dropped after the read, so a board reads a page at a time until it has BOARD named
// rows. The ceiling only bounds a runaway read (PostgREST caps a page at 1000 rows anyway).
const PAGE = 50
const MAX_SCAN = 1_000

function toRow(p: ProfileRow, zaps: number | null): StandingRow {
  const rank = p.current_season_rank && p.current_season_rank in RANK_LABELS ? RANK_LABELS[p.current_season_rank as SeasonRank] : null
  return { id: p.id, name: p.display_name ?? p.handle, handle: p.handle, avatarUrl: p.avatar_url, rank, streak: p.current_streak ?? 0, zaps: zaps ?? 0 }
}

/** The people a Standing board may count: active, not a system account, not a demo profile. */
function counted() {
  return createAdminClient().from('profiles').select(COLS).eq('is_active', true).eq('is_system', false).eq('is_demo', false)
}

/** The top `want` members by `column` (descending, above zero) who have not opted out of the board. */
async function topVisible(column: 'current_season_zaps' | 'lifetime_zaps' | 'longest_streak', want: number): Promise<ProfileRow[]> {
  const out: ProfileRow[] = []
  for (let from = 0; from < MAX_SCAN && out.length < want; from += PAGE) {
    const { data, error } = await counted()
      .gt(column, 0)
      .order(column, { ascending: false })
      .order('id')
      .range(from, from + PAGE - 1)
    if (error) throw error
    const rows = (data ?? []) as ProfileRow[]
    for (const p of rows) if (!isOptedOut(p.meta) && out.length < want) out.push(p)
    if (rows.length < PAGE) break
  }
  return out
}

async function safe<T>(read: () => Promise<T>, fallback: T, what: string): Promise<T> {
  try {
    return await read()
  } catch (error) {
    console.error(`[frequency/admin] standing ${what} read failed:`, error)
    return fallback
  }
}

export async function loadStandingReads(): Promise<StandingReads> {
  const [onStreak, longest, season, allTime] = await Promise.all([
    safe<number | null>(
      async () => {
        const { count, error } = await createAdminClient()
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('is_active', true)
          .eq('is_system', false)
          .eq('is_demo', false)
          .gt('current_streak', 0)
        if (error) throw error
        return count ?? 0
      },
      null,
      'streak count',
    ),
    safe(() => topVisible('longest_streak', 1), [], 'longest streak'),
    safe(() => topVisible('current_season_zaps', BOARD), [], 'season board'),
    safe(() => topVisible('lifetime_zaps', BOARD), [], 'all-time board'),
  ])
  const top = longest[0] ?? null
  return {
    onStreak,
    longest: top ? { days: top.longest_streak ?? 0, name: top.display_name ?? top.handle } : null,
    season: season.map((p) => toRow(p, p.current_season_zaps)),
    allTime: allTime.map((p) => toRow(p, p.lifetime_zaps)),
  }
}
