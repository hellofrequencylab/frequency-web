// The Quiet Ones — 5 secret awards (Rewards Economy v2, Season 1).
//
// Hidden until earned (achievements.is_secret), badge-only (0⚡), and NEVER
// announced anywhere in member-visible UI or docs. Each needs its own query, so
// they are evaluated here rather than in the generic criteria engine
// (lib/achievements.ts safely ignores their criteria types):
//   dawn_patrol   — 10 practice logs with LOCAL time < 06:00 (profiles.home_timezone;
//                   members without a timezone can't qualify — acceptable for a secret)
//   radio_silence — 3 completed Screen-Free day practice logs (tag slug 'screen-free',
//                   title fallback)
//   four_pillars  — ≥1 log in each of the 4 Pillars within one Mon–Sun week
//   carrier_wave  — 10 Co-op Pulse days (lib/coop-pulse.ts calls in)
//   long_range    — verified node captures in 3 distinct cities (nodes.city)
//
// All best-effort: callers guard, and a failed check never blocks the hot path.

import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'

function db(): SupabaseClient {
  return createAdminClient()
}

/** Unlock an achievement by slug, exactly-once (unique profile+achievement). */
async function unlock(profileId: string, slug: string): Promise<boolean> {
  const admin = db()
  const { data: achievement } = await admin
    .from('achievements')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()
  const id = (achievement as { id: string } | null)?.id
  if (!id) return false
  const { error } = await admin
    .from('user_achievements')
    .insert({ profile_id: profileId, achievement_id: id })
  return !error
}

async function alreadyEarned(profileId: string, slug: string): Promise<boolean> {
  const admin = db()
  const { data } = await admin
    .from('user_achievements')
    .select('id, achievement:achievements!inner(slug)')
    .eq('profile_id', profileId)
    .eq('achievement.slug', slug)
    .limit(1)
    .maybeSingle()
  return !!data
}

// --- dawn_patrol ------------------------------------------------------------

async function checkDawnPatrol(profileId: string): Promise<void> {
  if (await alreadyEarned(profileId, 'dawn-patrol')) return
  const admin = db()
  const { data: prof } = await admin
    .from('profiles')
    .select('home_timezone')
    .eq('id', profileId)
    .maybeSingle()
  const tz = (prof as { home_timezone: string | null } | null)?.home_timezone
  if (!tz) return

  const { data: logs } = await admin
    .from('practice_logs')
    .select('created_at')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(500)

  let fmt: Intl.DateTimeFormat
  try {
    fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false })
  } catch {
    return // junk timezone string
  }
  let early = 0
  for (const l of (logs ?? []) as { created_at: string }[]) {
    const hour = Number(fmt.format(new Date(l.created_at)))
    if (hour < 6) early++
    if (early >= 10) break
  }
  if (early >= 10) await unlock(profileId, 'dawn-patrol')
}

// --- radio_silence ----------------------------------------------------------

async function checkRadioSilence(profileId: string): Promise<void> {
  if (await alreadyEarned(profileId, 'radio-silence')) return
  const admin = db()

  // Screen-Free practices: the canonical tag, with a title fallback.
  const ids = new Set<string>()
  const { data: def } = await admin
    .from('practice_tag_defs')
    .select('id')
    .eq('slug', 'screen-free')
    .maybeSingle()
  if (def) {
    const { data: tagged } = await admin
      .from('practice_tags')
      .select('practice_id')
      .eq('tag_id', (def as { id: string }).id)
    for (const t of (tagged ?? []) as { practice_id: string }[]) ids.add(t.practice_id)
  }
  const { data: titled } = await admin
    .from('practices')
    .select('id')
    .ilike('title', '%screen%free%')
  for (const t of (titled ?? []) as { id: string }[]) ids.add(t.id)
  if (ids.size === 0) return

  const { count } = await admin
    .from('practice_logs')
    .select('id', { count: 'exact', head: true })
    .eq('profile_id', profileId)
    .in('practice_id', [...ids])
  if ((count ?? 0) >= 3) await unlock(profileId, 'radio-silence')
}

// --- four_pillars -----------------------------------------------------------

function mondayOfCurrentWeekUTC(): string {
  const now = new Date()
  const dow = now.getUTCDay() // 0 = Sun
  const back = dow === 0 ? 6 : dow - 1
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - back))
  return monday.toISOString().slice(0, 10)
}

async function checkFourPillars(profileId: string): Promise<void> {
  if (await alreadyEarned(profileId, 'four-pillars')) return
  const admin = db()
  const weekStart = mondayOfCurrentWeekUTC()
  const { data: logs } = await admin
    .from('practice_logs')
    .select('practice:practices!inner(domain_id)')
    .eq('profile_id', profileId)
    .gte('logged_for', weekStart)
  const pillars = new Set(
    ((logs ?? []) as unknown as { practice: { domain_id: string | null } | null }[])
      .map((l) => l.practice?.domain_id)
      .filter((d): d is string => !!d),
  )
  if (pillars.size >= 4) await unlock(profileId, 'four-pillars')
}

// --- carrier_wave (called by the Co-op Pulse job) ----------------------------

export async function unlockCarrierWaveIfEarned(profileId: string): Promise<void> {
  if (await alreadyEarned(profileId, 'carrier-wave')) return
  const admin = db()
  const { data: grants } = await admin
    .from('reward_grants')
    .select('rule_key')
    .eq('profile_id', profileId)
    .like('rule_key', 'coop.pulse:%')
  const days = new Set(((grants ?? []) as { rule_key: string }[]).map((g) => g.rule_key.split(':')[2]))
  if (days.size >= 10) await unlock(profileId, 'carrier-wave')
}

// --- long_range (call after a verified node capture) -------------------------

export async function evaluateSecretAwardsForCapture(profileId: string): Promise<void> {
  try {
    if (await alreadyEarned(profileId, 'long-range')) return
    const admin = db()
    const { data: captures } = await admin
      .from('captures')
      .select('node:nodes!inner(city)')
      .eq('actor_profile_id', profileId)
      .eq('verified', true)
    const cities = new Set(
      ((captures ?? []) as unknown as { node: { city: string | null } | null }[])
        .map((c) => c.node?.city?.trim().toLowerCase())
        .filter((c): c is string => !!c),
    )
    if (cities.size >= 3) await unlock(profileId, 'long-range')
  } catch {
    // never let a badge check break a capture
  }
}

// --- the per-log entry point --------------------------------------------------

/** Evaluate the log-driven Quiet Ones. Best-effort; called after a fresh log. */
export async function evaluateSecretAwardsForLog(profileId: string): Promise<void> {
  await checkDawnPatrol(profileId).catch(() => {})
  await checkRadioSilence(profileId).catch(() => {})
  await checkFourPillars(profileId).catch(() => {})
}
