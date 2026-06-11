// Rewards Economy v2 — operator metrics (brief §10). Server Component, rendered
// behind <Suspense> on the gamification admin. Each metric carries its healthy
// band; tune with the levers in priority order: Full Day bonus first, base
// practice rates second (±2 max), thresholds never mid-season.

import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AdminSection } from '@/components/admin/admin-page'

function db(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient
}

interface Metric {
  label: string
  value: string
  band: string
  ok: boolean | null // null = no data yet
}

function pct(n: number, d: number): number | null {
  return d > 0 ? Math.round((n / d) * 100) : null
}

async function computeMetrics(): Promise<Metric[]> {
  const admin = db()
  const since7 = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10)

  const [logs7, adopters30, completions, adoptions, profiles, redemptions, challenges, progress] =
    await Promise.all([
      admin.from('practice_logs').select('profile_id').gte('logged_for', since7),
      admin
        .from('journey_plan_adoptions')
        .select('profile_id')
        .eq('active', true)
        .gte('adopted_at', new Date(Date.now() - 30 * 86_400_000).toISOString()),
      admin.from('reward_grants').select('profile_id').like('rule_key', 'journey.complete:%'),
      admin.from('journey_plan_adoptions').select('plan_id, profile_id').eq('active', true),
      admin
        .from('profiles')
        .select('id, current_streak, current_season_zaps, current_season_rank, lifetime_gems')
        .eq('is_active', true)
        .eq('is_system', false),
      admin.from('store_redemptions').select('gems_spent'),
      admin.from('season_challenges').select('id, difficulty').eq('is_active', true),
      admin.from('challenge_progress').select('challenge_id, completed_at'),
    ])

  const wamSet = new Set(((logs7.data ?? []) as { profile_id: string }[]).map((r) => r.profile_id))
  const wam = wamSet.size

  const profileRows = (profiles.data ?? []) as {
    id: string
    current_streak: number | null
    current_season_zaps: number | null
    current_season_rank: string | null
    lifetime_gems: number | null
  }[]
  const byId = new Map(profileRows.map((p) => [p.id, p]))

  // Day-7 streak rate for new Journey adopters (adopted in the last 30 days).
  const adopterIds = [...new Set(((adopters30.data ?? []) as { profile_id: string }[]).map((r) => r.profile_id))]
  const adoptersAt7 = adopterIds.filter((id) => (byId.get(id)?.current_streak ?? 0) >= 7).length
  const day7Rate = pct(adoptersAt7, adopterIds.length)

  // Journey completion rate: members with >=1 completion / members with >=1 adoption.
  const adoptionRows = (adoptions.data ?? []) as { plan_id: string; profile_id: string }[]
  const adopterAll = new Set(adoptionRows.map((r) => r.profile_id))
  const completers = new Set(((completions.data ?? []) as { profile_id: string }[]).map((r) => r.profile_id))
  const completionRate = pct(completers.size, adopterAll.size)

  // 14-day streak share of WAM.
  const wam14 = [...wamSet].filter((id) => (byId.get(id)?.current_streak ?? 0) >= 14).length
  const share14 = pct(wam14, wam)

  // Circle Journey alignment is reported by the Co-op Pulse run (circles with 3+
  // members on the same Journey); approximate here as plans with 3+ adopters.
  const adoptersByPlan = new Map<string, number>()
  for (const r of adoptionRows) adoptersByPlan.set(r.plan_id, (adoptersByPlan.get(r.plan_id) ?? 0) + 1)
  const alignedPlans = [...adoptersByPlan.values()].filter((n) => n >= 3).length
  const alignment = pct(alignedPlans, adoptersByPlan.size)

  // Season Zap distribution.
  const seasonZaps = profileRows.map((p) => p.current_season_zaps ?? 0).filter((z) => z > 0).sort((a, b) => a - b)
  const median = seasonZaps.length ? seasonZaps[Math.floor(seasonZaps.length / 2)] : 0
  const ranked = profileRows.filter((p) => (p.current_season_zaps ?? 0) > 0)
  const beaconPlus = ranked.filter((p) => ['beacon', 'conduit', 'luminary'].includes(p.current_season_rank ?? '')).length
  const luminary = ranked.filter((p) => p.current_season_rank === 'luminary').length
  const beaconRate = pct(beaconPlus, ranked.length)
  const luminaryRate = pct(luminary, ranked.length)

  // Gem sink rate: Gems spent ÷ Gems earned (watch for hoarding).
  const earned = profileRows.reduce((s, p) => s + (p.lifetime_gems ?? 0), 0)
  const spent = ((redemptions.data ?? []) as { gems_spent: number | null }[]).reduce((s, r) => s + (r.gems_spent ?? 0), 0)
  const sinkRate = pct(spent, earned)

  // Challenge completion by difficulty (targets: E>75 / N>45 / H>20 / L<5).
  const challengeRows = (challenges.data ?? []) as { id: string; difficulty: string }[]
  const diffById = new Map(challengeRows.map((c) => [c.id, c.difficulty]))
  const participantRows = new Map<string, number>() // difficulty → progress rows started
  const completedBy = new Map<string, number>()
  for (const p of (progress.data ?? []) as { challenge_id: string; completed_at: string | null }[]) {
    const d = diffById.get(p.challenge_id)
    if (!d) continue
    participantRows.set(d, (participantRows.get(d) ?? 0) + 1)
    if (p.completed_at) completedBy.set(d, (completedBy.get(d) ?? 0) + 1)
  }
  const diffRate = (d: string) => pct(completedBy.get(d) ?? 0, participantRows.get(d) ?? 0)

  const metrics: Metric[] = [
    { label: 'WAM (North Star) — verified practice, 7d', value: wam.toLocaleString(), band: 'growth metric', ok: null },
    { label: 'Day-7 streak rate, new Journey adopters', value: day7Rate === null ? '—' : `${day7Rate}%`, band: '> 40%', ok: day7Rate === null ? null : day7Rate > 40 },
    { label: 'Journey completion rate', value: completionRate === null ? '—' : `${completionRate}%`, band: '> 30%', ok: completionRate === null ? null : completionRate > 30 },
    { label: '14-day streak share of WAM', value: share14 === null ? '—' : `${share14}%`, band: '> 25%', ok: share14 === null ? null : share14 > 25 },
    { label: 'Circle Journey alignment', value: alignment === null ? '—' : `${alignment}%`, band: '> 40%', ok: alignment === null ? null : alignment > 40 },
    { label: 'Median season Zaps', value: median.toLocaleString(), band: '800–1,500', ok: seasonZaps.length === 0 ? null : median >= 800 && median <= 1500 },
    { label: '% reaching Beacon', value: beaconRate === null ? '—' : `${beaconRate}%`, band: '25–35%', ok: beaconRate === null ? null : beaconRate >= 25 && beaconRate <= 35 },
    { label: 'Luminary rate', value: luminaryRate === null ? '—' : `${luminaryRate}%`, band: '< 5%', ok: luminaryRate === null ? null : luminaryRate < 5 },
    { label: 'Challenge completion E / N / H / L', value: ['easy', 'normal', 'hard', 'legendary'].map((d) => (diffRate(d) === null ? '—' : `${diffRate(d)}%`)).join(' / '), band: 'E>75 · N>45 · H>20 · L<5', ok: null },
    { label: 'Gem sink rate (spent ÷ earned)', value: sinkRate === null ? '—' : `${sinkRate}%`, band: 'watch for hoarding', ok: null },
  ]
  return metrics
}

export async function MetricsPanel() {
  const metrics = await computeMetrics()
  return (
    <AdminSection title="Economy metrics (Rewards v2)">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {metrics.map((m) => (
          <div key={m.label} className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5">
            <span className="text-sm">{m.ok === null ? '·' : m.ok ? '✅' : '⚠️'}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-text">{m.label}</p>
              <p className="text-xs text-subtle">healthy: {m.band}</p>
            </div>
            <span className="shrink-0 text-sm font-bold tabular-nums text-text">{m.value}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-subtle">
        Tuning levers, in priority order: Full Day bonus first, base practice rates second (±2 max), thresholds never mid-season.
      </p>
    </AdminSection>
  )
}
