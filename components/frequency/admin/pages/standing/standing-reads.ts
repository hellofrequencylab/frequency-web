import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { RANK_LABELS, type SeasonRank } from '@/lib/season-ranks'

// THE STANDING READS (Frequency /admin/gamification). Platform-wide, read-only, fail-quiet; the route's
// requireAdmin gate ran first. Every number is a profiles column the gamification engine already keeps:
// current_streak, longest_streak, current_season_zaps, lifetime_zaps and current_season_rank.

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
  current_season_zaps: number | null
  lifetime_zaps: number | null
  current_season_rank: string | null
}

const COLS = 'id, display_name, handle, avatar_url, current_streak, current_season_zaps, lifetime_zaps, current_season_rank'
const BOARD = 10

function toRow(p: ProfileRow, zaps: number | null): StandingRow {
  const rank = p.current_season_rank && p.current_season_rank in RANK_LABELS ? RANK_LABELS[p.current_season_rank as SeasonRank] : null
  return { id: p.id, name: p.display_name ?? p.handle, handle: p.handle, avatarUrl: p.avatar_url, rank, streak: p.current_streak ?? 0, zaps: zaps ?? 0 }
}

export async function loadStandingReads(): Promise<StandingReads> {
  const admin = createAdminClient()
  const [streaks, longest, season, allTime] = await Promise.all([
    admin.from('profiles').select('id', { count: 'exact', head: true }).gt('current_streak', 0),
    admin.from('profiles').select('display_name, handle, longest_streak').gt('longest_streak', 0).order('longest_streak', { ascending: false }).limit(1),
    admin.from('profiles').select(COLS).gt('current_season_zaps', 0).order('current_season_zaps', { ascending: false }).limit(BOARD),
    admin.from('profiles').select(COLS).gt('lifetime_zaps', 0).order('lifetime_zaps', { ascending: false }).limit(BOARD),
  ])
  const top = (longest.data?.[0] ?? null) as { display_name: string | null; handle: string; longest_streak: number } | null
  return {
    onStreak: streaks.error ? null : (streaks.count ?? 0),
    longest: top ? { days: top.longest_streak, name: top.display_name ?? top.handle } : null,
    season: ((season.data ?? []) as ProfileRow[]).map((p) => toRow(p, p.current_season_zaps)),
    allTime: ((allTime.data ?? []) as ProfileRow[]).map((p) => toRow(p, p.lifetime_zaps)),
  }
}
