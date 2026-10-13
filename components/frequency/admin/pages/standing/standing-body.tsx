import { Suspense } from 'react'
import Link from 'next/link'
import { FqIcon } from '@/components/frequency/icon'
import { AwardLauncher } from '@/app/(main)/admin/gamification/award-launcher'
import { GamificationSeason } from '@/components/widgets/gamification/gamification-season'
import { GamificationRewards } from '@/components/widgets/gamification/gamification-rewards'
import { GamificationMetrics } from '@/components/widgets/gamification/gamification-metrics'
import { GamificationAchievements } from '@/components/widgets/gamification/gamification-achievements'
import { GamificationChallenges } from '@/components/widgets/gamification/gamification-challenges'
import { countAchievementUnlocks } from '@/components/widgets/gamification/gamification-stats'
import { loadTopAchievers } from '@/components/widgets/gamification/gamification-top-achievers'
import { getCurrentSeason } from '@/lib/seasons'
import { AdminHead, AdminPageBody, Av, EMPTY, Kpi, n } from '../shared'
import { loadEarnRates } from '../earn-rates'

// STANDING, FREQUENCY (design_handoff/frequency/templates/admin/Standing.html). /admin/gamification under
// SITE_DESIGN=frequency; DAWN keeps the module-driven page. The page's own gate (requireAdmin host or
// community staff) ran before this renders. Reads are the page's existing ones: the current season
// (getCurrentSeason), the awards tally (user_achievements, GamificationStats), the top achievers
// (GamificationTopAchievers' profiles read) and the live Zap rates (loadEarnRates). Every action the page
// had follows the design body unchanged: Award an achievement (the head button), the season control, the
// janitor's reward editor, the metrics, and the achievements and challenges tables.
//
// NO READING, SO THE DESIGN'S EMPTY VALUE ("—"): On a streak, Longest streak, Freezes used, every trend, and
// the leaderboard's Rank column. The design's "This week / Season" tabs and the leaderboard opt-out switch
// have no reader or action, so they are not drawn; nor is "Save rules" (the rates are edited by the janitor's
// reward editor below).

function daysLeft(endsAt: string | null): number | null {
  if (!endsAt) return null
  const ms = Date.parse(endsAt) - Date.now()
  return Number.isFinite(ms) ? Math.max(0, Math.ceil(ms / 86_400_000)) : null
}

export async function FqStandingBody() {
  const [season, awards, leaders, rates] = await Promise.all([
    getCurrentSeason(),
    countAchievementUnlocks(),
    loadTopAchievers(),
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
        <Kpi label="On a streak" value={EMPTY} />
        <Kpi label="Longest streak" value={EMPTY} />
        <Kpi label="Awards given" value={n(awards)} />
        <Kpi label="Freezes used" value={EMPTY} note={season ? 'This season' : undefined} />
      </div>

      <div className="ap-cols adp-split sec">
        <div>
          <div className="sec-h">
            <span className="h2">Leaderboard</span>
            <span className="t2">Most achievements</span>
          </div>
          <div className="panel tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Member</th>
                  <th>Rank</th>
                  <th>Streak</th>
                  <th>Zaps</th>
                </tr>
              </thead>
              <tbody>
                {leaders.length === 0 ? (
                  <tr>
                    <td className="t1" colSpan={5}>
                      No achievements earned yet.
                    </td>
                  </tr>
                ) : (
                  leaders.map((p, i) => (
                    <tr key={p.id}>
                      <td className="t1">{i + 1}</td>
                      <td>
                        <span className="row">
                          <Av url={p.avatar_url} />
                          <Link className="t1" href={`/people/${p.handle}`}>
                            {p.display_name ?? p.handle}
                          </Link>
                        </span>
                      </td>
                      <td>{EMPTY}</td>
                      <td>{n(p.current_streak ?? 0)}</td>
                      <td>
                        <FqIcon name="zap" size={14} /> {n(p.lifetime_zaps ?? 0)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

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
