// The unified "how you earned" ledger — the data behind the Vault points log.
//
// Gems and zaps each have their own transaction table (gem_transactions,
// zap_transactions); this merges a member's rows from both into one reverse-chron
// history, alongside their streaks and headline totals. Read-only, server-only.
// Uses the user-scoped client — RLS on all four tables enforces owner-only reads
// so the profileId filter is belt-and-suspenders, not the only guard. See ADR-174.

import { createClient } from '@/lib/supabase/server'

export type LedgerCurrency = 'gems' | 'zaps'

export interface LedgerEntry {
  id: string
  currency: LedgerCurrency
  actionType: string
  amount: number
  metadata: Record<string, unknown>
  createdAt: string
}

export type LedgerStreakType = 'attendance' | 'posting' | 'hosting' | 'login'

export interface StreakSummary {
  type: LedgerStreakType
  current: number
  longest: number
  lastActivityAt: string | null
}

export interface EarningLog {
  entries: LedgerEntry[]
  streaks: StreakSummary[]
  totals: {
    seasonZaps: number
    lifetimeZaps: number
    seasonGems: number
    lifetimeGems: number
    currentStreak: number
    longestStreak: number
    rank: string | null
    /** The locked, never-resetting peak rank (P2.6) — the durable Vault endorsement. */
    lifetimeRank: string | null
  }
}

interface TxnRow {
  id: string
  action_type: string
  amount: number
  metadata: Record<string, unknown> | null
  created_at: string
}

/** A member's merged gem + zap history (newest first), streaks, and totals. */
export async function getEarningLog(profileId: string, limit = 80): Promise<EarningLog> {
  const supabase = await createClient()

  const [gemRes, zapRes, streakRes, profRes] = await Promise.all([
    supabase
      .from('gem_transactions')
      .select('id, action_type, amount, metadata, created_at')
      .eq('profile_id', profileId)
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase
      .from('zap_transactions')
      .select('id, action_type, amount, metadata, created_at')
      .eq('profile_id', profileId)
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase
      .from('streaks')
      .select('streak_type, current_count, longest_count, last_activity_at')
      .eq('profile_id', profileId),
    supabase
      .from('profiles')
      .select(
        'current_season_zaps, lifetime_zaps, current_season_gems, lifetime_gems, current_streak, longest_streak, current_season_rank, lifetime_rank',
      )
      .eq('id', profileId)
      .maybeSingle(),
  ])

  const toEntry = (currency: LedgerCurrency) => (r: TxnRow): LedgerEntry => ({
    id: r.id,
    currency,
    actionType: r.action_type,
    amount: r.amount,
    metadata: (r.metadata ?? {}) as Record<string, unknown>,
    createdAt: r.created_at,
  })

  const gems = ((gemRes.data as TxnRow[] | null) ?? [])
    // Season-convert rows of 0, etc. still count; only drop true no-ops.
    .filter((r) => r.amount !== 0)
    .map(toEntry('gems'))
  const zaps = ((zapRes.data as TxnRow[] | null) ?? [])
    .filter((r) => r.amount !== 0)
    .map(toEntry('zaps'))

  const entries = [...gems, ...zaps]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)

  const streaks: StreakSummary[] = (
    (streakRes.data as
      | { streak_type: LedgerStreakType; current_count: number; longest_count: number; last_activity_at: string | null }[]
      | null) ?? []
  ).map((s) => ({
    type: s.streak_type,
    current: s.current_count,
    longest: s.longest_count,
    lastActivityAt: s.last_activity_at,
  }))

  const p = profRes.data as {
    current_season_zaps: number | null
    lifetime_zaps: number | null
    current_season_gems: number | null
    lifetime_gems: number | null
    current_streak: number | null
    longest_streak: number | null
    current_season_rank: string | null
    lifetime_rank: string | null
  } | null

  return {
    entries,
    streaks,
    totals: {
      seasonZaps: p?.current_season_zaps ?? 0,
      lifetimeZaps: p?.lifetime_zaps ?? 0,
      seasonGems: p?.current_season_gems ?? 0,
      lifetimeGems: p?.lifetime_gems ?? 0,
      currentStreak: p?.current_streak ?? 0,
      longestStreak: p?.longest_streak ?? 0,
      rank: p?.current_season_rank ?? null,
      lifetimeRank: p?.lifetime_rank ?? null,
    },
  }
}

// Friendly, member-facing labels for each ledger action_type. Kept here so the
// log and any future surface read the same. Unknown types humanize gracefully.
const LEDGER_LABELS: Record<string, string> = {
  // Gems — on-platform
  post_create: 'Shared a post',
  comment_reply: 'Replied in a thread',
  reaction: 'Reacted to a post',
  daily_login: 'Daily check-in',
  welcome_member: 'Welcomed a newcomer',
  event_rsvp: 'RSVP’d to an event',
  circle_join: 'Joined a circle',
  achievement: 'Achievement unlocked',
  challenge_complete: 'Completed a season challenge',
  quest_complete: 'Quest progress',
  season_convert: 'Season zaps converted to gems',
  // Zaps — real-life / outreach
  circle_start: 'Founded a circle',
  event_host: 'Hosted an event',
  circle_activate: 'Activated a circle',
  invite_accepted: 'An invite you sent joined',
  referral_activated: 'A member you brought in showed up',
  event_attend: 'Showed up (verified check-in)',
  outreach_task: 'Completed an outreach task',
  crew_task: 'Completed a crew task',
  practice_logged: 'Logged a real-world practice',
  node_capture: 'Captured a node out in the world',
  gift_zap: 'Received a zap',
  program_run: 'Ran a program',
  entry_point_created: 'Set up an entry point',
  manual: 'Adjustment',
}

export function ledgerLabel(actionType: string): string {
  return (
    LEDGER_LABELS[actionType] ??
    actionType.replace(/[_.]/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
  )
}
