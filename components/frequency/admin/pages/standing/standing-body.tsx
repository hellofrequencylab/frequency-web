import { Suspense } from 'react'
import { FqIcon } from '@/components/frequency/icon'
import { AwardLauncher } from '@/app/(main)/admin/gamification/award-launcher'
import { GamificationSeason } from '@/components/widgets/gamification/gamification-season'
import { GamificationRewards } from '@/components/widgets/gamification/gamification-rewards'
import { GamificationMetrics } from '@/components/widgets/gamification/gamification-metrics'
import { GamificationAchievements } from '@/components/widgets/gamification/gamification-achievements'
import { GamificationChallenges } from '@/components/widgets/gamification/gamification-challenges'
import { countAchievementUnlocks } from '@/components/widgets/gamification/gamification-stats'
import { getCurrentSeason } from '@/lib/seasons'
import { AdminHead, AdminPageBody, EMPTY, Kpi, n } from '../shared'
import { loadEarnRates } from '../earn-rates'
import { loadStandingReads } from './standing-reads'
import { StandingLeaderboard } from './leaderboard'

// STANDING, FREQUENCY (design_handoff/frequency/templates/admin/Standing.html). /admin/gamification under
// SITE_DESIGN=frequency; DAWN keeps the module-driven page. The page's own gate (requireAdmin host or
// community staff) ran before this renders. Reads are the page's existing ones: the current season
// (getCurrentSeason), the awards tally (user_achievements, GamificationStats), the live Zap rates
// (loadEarnRates), and standing-reads.ts over the profiles columns the engine keeps: who is on a streak, the
// longest streak and its holder, and the two leaderboards (this season's Zaps and lifetime Zaps, each with
// the member's season rank). Every action the page had follows the design body unchanged: Award an
// achievement (the head button), the season control, the janitor's reward editor, the metrics, and the
// achievements and challenges tables.
//
// NO READING, SO THE DESIGN'S EMPTY VALUE ("—"): Freezes used (no freeze ledger) and every trend (no
// prior-period reader). The design's "This week" tab has no weekly Zap tally, so the tabs are Season and All
// time. The leaderboard opt-out switch and "Save rules" have no setting behind them and are not drawn (the
// rates are edited by the janitor's reward editor below).

function daysLeft(endsAt: string | null): number | null {
  if (!endsAt) return null
  const ms = Date.parse(endsAt) - Date.now()
  return Number.isFinite(ms) ? Math.max(0, Math.ceil(ms / 86_400_000)) : null
}

export async function FqStandingBody() {
  const [season, awards, standing, rates] = await Promise.all([
    getCurrentSeason(),
    countAchievementUnlocks(),
    loadStandingReads(),
    loadEarnRates(),
  ])
  const left = season ? daysLeft(season.ends_at) : null
  const meta = season
    ? `Season ${season.season_number}${left !== null ? ` · ${left} ${left === 1 ? 'day' : 'days'} left` : ''}`
    : 'No season running'
  const rules = rates.filter((r) => r.key === 'event_attend' || r.key === 'event_host')

  return (
    <AdminPageBody>
      <AdminHead
        kicker="Streaks, ranks and awards"
        title="Standing"
        meta={meta}
        actions={
          <Suspense fallback={null}>
            <AwardLauncher />
          </Suspense>
        }
      />

      <div className="g4">
        <Kpi label="On a streak" value={standing.onStreak === null ? EMPTY : n(standing.onStreak)} />
        <Kpi
          label="Longest streak"
          value={standing.longest ? `${n(standing.longest.days)} ${standing.longest.days === 1 ? 'day' : 'days'}` : EMPTY}
          note={standing.longest?.name}
        />
        <Kpi label="Awards given" value={n(awards)} />
        <Kpi label="Freezes used" value={EMPTY} note={season ? 'This season' : undefined} />
      </div>

      <div className="ap-cols adp-split sec">
        <StandingLeaderboard season={standing.season} allTime={standing.allTime} />

        <aside className="side">
          <div className="panel stack">
            <span className="k">Platform rules</span>
            <div className="list">
              {rules.map((r) => (
                <div key={r.key}>
                  <span className="grow">
                    <span className="t1 adp-block">{r.label}</span>
                    <span className="t2">Platform rate</span>
                  </span>
                  <span className="t1">
                    <FqIcon name="zap" size={14} /> {r.amount === null ? EMPTY : n(r.amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>

      {/* The page's existing operator controls, kept whole: season, the janitor's reward editor, metrics,
          and the achievements and challenges tables. Each is a self-fetching, fail-safe RSC. */}
      <div className="adp-legacy">
        <Suspense fallback={null}>
          <GamificationSeason />
        </Suspense>
        <Suspense fallback={null}>
          <GamificationRewards />
        </Suspense>
        <Suspense fallback={null}>
          <GamificationMetrics />
        </Suspense>
        <Suspense fallback={null}>
          <GamificationAchievements />
        </Suspense>
        <Suspense fallback={null}>
          <GamificationChallenges />
        </Suspense>
      </div>
    </AdminPageBody>
  )
}
