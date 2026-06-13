// Per-practice streaks + the Practice Shelf (Rewards Economy v2).
//
// Two ladders per (member, practice), cached in `practice_streaks` (truth always
// derives from practice_logs):
//   * Consistency (cadence-aware): consecutive Mon–Sun weeks "on track" — distinct
//     log days >= the practice's weekly target (weeklyTargetFromCadence — canonical,
//     never duplicated). Maintained by the nightly job (lib/practice-streaks-job.ts);
//     a missed week resets the current run to 0, best_on_track_weeks keeps the peak.
//     Tiers at 2 / 4 / 8 / 13 weeks. Full Cycle (13) pays a one-time +50⚡ per
//     practice; every other tier is badge-only — with a large practice library this
//     must not inflate the economy.
//   * Depth: lifetime_logs increments on every log (bumpPracticeDepth, called from
//     logPractice). Never resets. Awards at 10 / 25 / 50 / 100.
//
// The Shelf is the profile module listing every practice with >=1 award from either
// ladder — highest consistency tier + depth count, Full Cycle ring, depth desc.

import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'

function db(): SupabaseClient {
  return createAdminClient()
}

// Consistency ladder (weeks on track). NAMING note: "Deep Groove" / "N Deep" are
// documented exceptions in docs/NAMING.md — award proper nouns, not the retired
// Spark/Current/Deep depth-tier terms.
export const PRACTICE_STREAK_WEEKS = {
  in_motion: 2,
  groove: 4,
  deep_groove: 8,
  full_cycle: 13,
} as const

export const CONSISTENCY_TIERS = [
  { weeks: PRACTICE_STREAK_WEEKS.in_motion,   slug: 'in_motion',   label: 'In Motion' },
  { weeks: PRACTICE_STREAK_WEEKS.groove,      slug: 'groove',      label: 'Groove' },
  { weeks: PRACTICE_STREAK_WEEKS.deep_groove, slug: 'deep_groove', label: 'Deep Groove' },
  { weeks: PRACTICE_STREAK_WEEKS.full_cycle,  slug: 'full_cycle',  label: 'Full Cycle' },
] as const

// Depth ladder (lifetime logs). The 100 mark is the animated one.
export const PRACTICE_DEPTH_COUNTS = [10, 25, 50, 100] as const

/** Highest consistency tier for a best-weeks count (null below In Motion). */
export function consistencyTier(bestWeeks: number) {
  let tier: (typeof CONSISTENCY_TIERS)[number] | null = null
  for (const t of CONSISTENCY_TIERS) if (bestWeeks >= t.weeks) tier = t
  return tier
}

/** Highest depth award reached (null below 10). */
export function depthAward(lifetimeLogs: number): number | null {
  let mark: number | null = null
  for (const c of PRACTICE_DEPTH_COUNTS) if (lifetimeLogs >= c) mark = c
  return mark
}

/** "N Deep" label for a depth mark. */
export function depthLabel(mark: number): string {
  return `${mark} Deep`
}

/**
 * Increment the depth counter for one (member, practice). Called once per log —
 * the unique (profile, practice, day) guard upstream makes that exactly-once.
 * Insert-then-increment so a first log creates the row.
 */
export async function bumpPracticeDepth(profileId: string, practiceId: string): Promise<void> {
  const admin = db()
  const { data: row } = await admin
    .from('practice_streaks')
    .select('lifetime_logs')
    .eq('profile_id', profileId)
    .eq('practice_id', practiceId)
    .maybeSingle()
  if (!row) {
    await admin.from('practice_streaks').insert({
      profile_id: profileId,
      practice_id: practiceId,
      lifetime_logs: 1,
    })
    return
  }
  await admin
    .from('practice_streaks')
    .update({
      lifetime_logs: ((row as { lifetime_logs: number }).lifetime_logs ?? 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('profile_id', profileId)
    .eq('practice_id', practiceId)
}

export interface ShelfEntry {
  practiceId: string
  title: string
  icon: string | null
  /** Highest consistency tier reached (null = none yet). */
  tier: { slug: string; label: string; weeks: number } | null
  /** Current consecutive on-track weeks (for "keep it going" copy). */
  currentWeeks: number
  lifetimeLogs: number
  /** Highest depth award reached (10/25/50/100; null = none yet). */
  depthMark: number | null
  /** Full Cycle reached — permanent ring treatment. */
  fullCycle: boolean
}

/**
 * The Practice Shelf: every practice where the member holds >=1 award from either
 * ladder, highest-first by depth. Pure read (the cache table), cheap per profile.
 */
export async function getPracticeShelf(profileId: string): Promise<ShelfEntry[]> {
  const { data } = await db()
    .from('practice_streaks')
    .select(
      'practice_id, consecutive_on_track_weeks, best_on_track_weeks, lifetime_logs, full_cycle_paid, practice:practices(title, icon)',
    )
    .eq('profile_id', profileId)
    .order('lifetime_logs', { ascending: false })

  const rows = (data ?? []) as unknown as {
    practice_id: string
    consecutive_on_track_weeks: number
    best_on_track_weeks: number
    lifetime_logs: number
    full_cycle_paid: boolean
    practice: { title: string; icon: string | null } | null
  }[]

  return rows
    .map((r) => {
      const tier = consistencyTier(r.best_on_track_weeks ?? 0)
      const mark = depthAward(r.lifetime_logs ?? 0)
      return {
        practiceId: r.practice_id,
        title: r.practice?.title ?? 'Practice',
        icon: r.practice?.icon ?? null,
        tier: tier ? { slug: tier.slug, label: tier.label, weeks: tier.weeks } : null,
        currentWeeks: r.consecutive_on_track_weeks ?? 0,
        lifetimeLogs: r.lifetime_logs ?? 0,
        depthMark: mark,
        fullCycle: (r.best_on_track_weeks ?? 0) >= PRACTICE_STREAK_WEEKS.full_cycle,
      }
    })
    .filter((e) => e.tier !== null || e.depthMark !== null)
}
