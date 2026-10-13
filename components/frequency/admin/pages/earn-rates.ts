import 'server-only'
import { loadRewardRows } from '@/components/widgets/gamification/gamification-rewards'
import { ZAP_AMOUNTS } from '@/lib/zaps'

// WHAT A MEMBER EARNS, READ LIVE (Standing and Economy bodies). The design ships these rates as sample data
// (assets/economy/economy.json); in code they are the tunable `zap_config` and `gem_config` rows, read with
// the janitor's reward editor's own read (loadRewardRows, components/widgets/gamification/gamification-rewards.tsx).
// A missing Zap row falls back to ZAP_AMOUNTS, exactly as the award path does (awardZapsForAction), so the
// number shown is the number paid. A missing Gem row has no fallback and reads as null (the caller renders
// the empty value). An inactive row pays nothing and reads 0. Read-only: nothing here edits a rate.
//
// Only rules that exist in the repo are listed. The design's two placeholder bonuses ("Finish Get started",
// "Today's goal: show up 3 times") are not rules and are never shown (owner ruling 2026-10-13).

export interface EarnRate {
  key: string
  label: string
  kind: 'zap' | 'gem'
  amount: number | null
}

const RULES: { key: string; label: string; kind: 'zap' | 'gem'; fallback?: number }[] = [
  { key: 'event_attend', label: 'Verified check-in', kind: 'zap', fallback: ZAP_AMOUNTS.event_attend },
  { key: 'event_host', label: 'Host an event', kind: 'zap', fallback: ZAP_AMOUNTS.event_host },
  { key: 'outreach_task', label: 'Outreach task (flyer or QR)', kind: 'zap', fallback: ZAP_AMOUNTS.outreach_task },
  { key: 'circle_start', label: 'Found a Circle', kind: 'zap', fallback: ZAP_AMOUNTS.circle_start },
  { key: 'event_rsvp', label: 'RSVP to your event', kind: 'gem' },
]

export async function loadEarnRates(): Promise<EarnRate[]> {
  let zaps = new Map<string, { amount: number; is_active: boolean }>()
  let gems = new Map<string, { amount: number; is_active: boolean }>()
  try {
    const rows = await loadRewardRows()
    zaps = new Map(rows.zaps.map((r) => [r.action_type, r]))
    gems = new Map(rows.gems.map((r) => [r.action_type, r]))
  } catch {
    // fall through: Zaps read their static defaults, Gems read empty
  }
  return RULES.map((rule) => {
    const row = (rule.kind === 'zap' ? zaps : gems).get(rule.key)
    const amount = row ? (row.is_active ? row.amount : 0) : (rule.fallback ?? null)
    return { key: rule.key, label: rule.label, kind: rule.kind, amount }
  })
}
