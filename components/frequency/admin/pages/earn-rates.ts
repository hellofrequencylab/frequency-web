import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ZAP_AMOUNTS } from '@/lib/zaps'

// WHAT A MEMBER EARNS, READ LIVE (Standing and Economy bodies). The design ships these rates as sample data
// (assets/economy/economy.json); in code they are the tunable `zap_config` and `gem_config` rows, read with
// the same select the janitor's reward editor uses (components/widgets/gamification/gamification-rewards.tsx).
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

type CfgRow = { action_type: string; amount: number; is_active: boolean }

export async function loadEarnRates(): Promise<EarnRate[]> {
  const zaps = new Map<string, CfgRow>()
  const gems = new Map<string, CfgRow>()
  try {
    const cfg = createAdminClient()
    const [{ data: zapRows }, { data: gemRows }] = await Promise.all([
      cfg.from('zap_config').select('action_type, zaps_amount, is_active'),
      cfg.from('gem_config').select('action_type, gems_amount, is_active'),
    ])
    for (const r of (zapRows ?? []) as { action_type: string; zaps_amount: number; is_active: boolean }[]) {
      zaps.set(r.action_type, { action_type: r.action_type, amount: r.zaps_amount, is_active: r.is_active })
    }
    for (const r of (gemRows ?? []) as { action_type: string; gems_amount: number; is_active: boolean }[]) {
      gems.set(r.action_type, { action_type: r.action_type, amount: r.gems_amount, is_active: r.is_active })
    }
  } catch {
    // fall through: Zaps read their static defaults, Gems read empty
  }
  return RULES.map((rule) => {
    const row = (rule.kind === 'zap' ? zaps : gems).get(rule.key)
    const amount = row ? (row.is_active ? row.amount : 0) : (rule.fallback ?? null)
    return { key: rule.key, label: rule.label, kind: rule.kind, amount }
  })
}
