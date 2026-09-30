// ── THIS WEEK AGAINST LAST WEEK, FOR ONE MEMBER (LIVE-685, ADR-1666) ──────────────────────────
//
// The Vault's stat row answers "did I do more this week than last?" from the ledger it already
// reads. No weekly snapshot table and no cron: `zap_transactions` is an append-only ledger of
// `profile_id · amount · created_at` (indexed on profile_id), so any past week is a sum over it.
// A snapshot would be a second copy of a number the ledger can already produce, and a copy that
// drifts the first time a row is corrected.
//
// THE WINDOWS are the Circle board's (lib/quest/effort.ts `weekBucket`): "this week" is the last
// 7 × 24 hours and "last week" the 7 before that. Rolling windows compare two whole weeks on
// every day of the week; a calendar week would compare Monday morning's zero against a full
// Sunday-ended week and read every Monday as a drop.
//
// NON-POSITIVE ROWS ARE NOT EFFORT (same rule as the board): a correction or clawback does not
// make a week read lighter.
//
// THE COPY NEVER SHAMES (docs/CONTENT-VOICE.md, "Warm"). More than last week is named and marked
// up. A lighter week is never a red arrow and never "down": it states last week's number, flat,
// and the member draws their own conclusion. Pure: no React, no Supabase, no clock of its own.

import { weekBucket, type EffortEntry } from '@/lib/quest/effort'

export interface ZapWeeks {
  /** Zaps earned in the last 7 days. */
  thisWeek: number
  /** Zaps earned in the 7 days before that. */
  lastWeek: number
}

/** The StatCard delta shape (components/ui/stat-card.tsx `StatDelta`), minus the red arm. */
export interface WeekDelta {
  label: string
  /** 'up' when this week is ahead; 'flat' otherwise. Never 'down'. */
  trend: 'up' | 'flat'
}

/** Sum a member's ledger rows into this week and last week. */
export function zapWeeks(entries: EffortEntry[], now: number): ZapWeeks {
  let thisWeek = 0
  let lastWeek = 0
  for (const entry of entries) {
    const amount = Number(entry?.amount)
    if (!Number.isFinite(amount) || amount <= 0) continue
    const bucket = weekBucket(now, entry.at)
    if (bucket === 0) thisWeek += amount
    else if (bucket === 1) lastWeek += amount
  }
  return { thisWeek, lastWeek }
}

/** How this week reads against last week, as calm StatCard copy. */
export function weekOverWeekDelta({ thisWeek, lastWeek }: ZapWeeks): WeekDelta {
  if (thisWeek > lastWeek) {
    return { label: `${(thisWeek - lastWeek).toLocaleString('en-US')} more than last week`, trend: 'up' }
  }
  if (thisWeek === lastWeek) return { label: 'Same as last week', trend: 'flat' }
  return { label: `Last week: ${lastWeek.toLocaleString('en-US')}`, trend: 'flat' }
}
