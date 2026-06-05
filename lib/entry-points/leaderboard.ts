// Entry-point recruiter leaderboard + tiers (ADR-134, Entry Points Phase 3).
// Ranks crew by the reach of their entry points: scans driven + signups referred
// (profiles.referred_by_profile_id — the same owner-level credit the zaps model uses).
// Tiers recognise cumulative signups. The pure bits (recruiterTier, rankRecruiters)
// are unit-tested; listEntryPointLeaderboard does the I/O. Server-only.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

export interface RecruiterTier {
  key: string
  label: string
  emoji: string
  /** Minimum signups to reach this tier. */
  min: number
}

// Ascending by `min`. A recruiter's tier is the highest whose threshold they meet.
export const RECRUITER_TIERS: RecruiterTier[] = [
  { key: 'scout',      label: 'Scout',      emoji: '🌱', min: 0 },
  { key: 'connector',  label: 'Connector',  emoji: '🔗', min: 3 },
  { key: 'recruiter',  label: 'Recruiter',  emoji: '📣', min: 10 },
  { key: 'ambassador', label: 'Ambassador', emoji: '🌟', min: 25 },
  { key: 'luminary',   label: 'Luminary',   emoji: '🔥', min: 50 },
]

/** The tier a recruiter has earned for `signups` people brought in. */
export function recruiterTier(signups: number): RecruiterTier {
  const n = Number.isFinite(signups) && signups > 0 ? signups : 0
  let tier = RECRUITER_TIERS[0]
  for (const t of RECRUITER_TIERS) if (n >= t.min) tier = t
  return tier
}

/** Signups needed for the next tier, or null at the top tier. */
export function signupsToNextTier(signups: number): { next: RecruiterTier; remaining: number } | null {
  const n = Number.isFinite(signups) && signups > 0 ? signups : 0
  const next = RECRUITER_TIERS.find((t) => t.min > n)
  return next ? { next, remaining: next.min - n } : null
}

export interface RecruiterRow {
  id: string
  displayName: string
  handle: string
  avatarUrl: string | null
  entryPoints: number
  scans: number
  signups: number
  tier: RecruiterTier
}

/** Rank by signups, then scans, then entry-point count — pure + stable. */
export function rankRecruiters(rows: RecruiterRow[]): RecruiterRow[] {
  return [...rows].sort(
    (a, b) => b.signups - a.signups || b.scans - a.scans || b.entryPoints - a.entryPoints,
  )
}

/** The recruiter leaderboard: every crew member who owns an entry point, ranked. */
export async function listEntryPointLeaderboard(limit = 50): Promise<RecruiterRow[]> {
  const db = createAdminClient() as unknown as SupabaseClient

  // 1. Aggregate entry-point count + scans per owner.
  const { data: codes } = await db
    .from('qr_codes')
    .select('owner_profile_id, scan_count')
    .not('template_id', 'is', null)
  const reach = new Map<string, { entryPoints: number; scans: number }>()
  for (const c of (codes as { owner_profile_id: string | null; scan_count: number | null }[] | null) ?? []) {
    if (!c.owner_profile_id) continue
    const r = reach.get(c.owner_profile_id) ?? { entryPoints: 0, scans: 0 }
    r.entryPoints += 1
    r.scans += c.scan_count ?? 0
    reach.set(c.owner_profile_id, r)
  }
  const ownerIds = [...reach.keys()]
  if (ownerIds.length === 0) return []

  // 2. Signups referred by those owners + 3. owner identity (one IN each).
  const [{ data: refs }, { data: owners }] = await Promise.all([
    db.from('profiles').select('referred_by_profile_id').in('referred_by_profile_id', ownerIds),
    db.from('profiles').select('id, display_name, handle, avatar_url').in('id', ownerIds).eq('is_active', true).eq('is_system', false),
  ])

  const signups = new Map<string, number>()
  for (const r of (refs as { referred_by_profile_id: string | null }[] | null) ?? []) {
    if (!r.referred_by_profile_id) continue
    signups.set(r.referred_by_profile_id, (signups.get(r.referred_by_profile_id) ?? 0) + 1)
  }

  const rows: RecruiterRow[] = ((owners as { id: string; display_name: string; handle: string; avatar_url: string | null }[] | null) ?? []).map((o) => {
    const s = signups.get(o.id) ?? 0
    return {
      id: o.id,
      displayName: o.display_name,
      handle: o.handle,
      avatarUrl: o.avatar_url,
      entryPoints: reach.get(o.id)?.entryPoints ?? 0,
      scans: reach.get(o.id)?.scans ?? 0,
      signups: s,
      tier: recruiterTier(s),
    }
  })

  return rankRecruiters(rows).slice(0, limit)
}
