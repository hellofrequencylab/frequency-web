import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Compass, Zap, Flame, Gem, Check, ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { IndexTemplate } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { LogPracticeButton } from '@/components/practice/log-practice-button'
import { getActiveJourneyProgress, planPillarMap } from '@/lib/journey-plans'
import { getPillars, pillarsById } from '@/lib/pillars'
import { SEASON_RANKS, getRankDef, rankForZaps } from '@/lib/season-ranks'

// "Your Journey" — the Active-Journey progress tab of the Dashboard. Shows the
// member's adopted seasonal journey(s) as an ordered checklist across the four
// domains, with the current step front-and-centre, and ties the practice log to
// the game: logging a journey's practice is what advances it AND earns the
// zaps / rank / streak shown up top. Derived progress, no schema (see
// getActiveJourneyProgress).
export default async function JourneyPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('id, current_season_zaps, lifetime_gems, current_streak')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!profile) notFound()

  const seasonZaps = (profile as { current_season_zaps: number }).current_season_zaps ?? 0
  const gems = (profile as { lifetime_gems: number }).lifetime_gems ?? 0
  const streak = (profile as { current_streak: number | null }).current_streak ?? 0

  const rank = rankForZaps(seasonZaps)
  const rankIdx = SEASON_RANKS.findIndex((r) => r.rank === rank)
  const nextRank = rankIdx < SEASON_RANKS.length - 1 ? SEASON_RANKS[rankIdx + 1] : null
  const toNext = nextRank ? Math.max(0, nextRank.minZaps - seasonZaps) : 0

  const [journeys, pillars] = await Promise.all([
    getActiveJourneyProgress(profile.id),
    getPillars(),
  ])
  const byId = pillarsById(pillars)

  return (
    <IndexTemplate
      title="Your Journey"
      description="Your season's practices across Mind · Body · Spirit · Expression — keep each one on its cadence this week. Logging is the one move that advances your journey and earns the rank, streak, and gems."
    >
      {/* Gamification panel — the practice log is what drives these. */}
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard
          label={`${getRankDef(rank).label} · this season`}
          value={seasonZaps.toLocaleString()}
          icon={Zap}
          delta={
            nextRank
              ? { label: `${toNext.toLocaleString()} to ${getRankDef(nextRank.rank).label}`, trend: 'up' }
              : { label: 'Top rank', trend: 'flat' }
          }
          href="/crew"
        />
        <StatCard label="Current streak" value={`${streak}w`} icon={Flame} href="/crew/streaks" />
        <StatCard label="Gems" value={gems.toLocaleString()} icon={Gem} href="/crew/store" />
      </div>

      {journeys.length === 0 ? (
        <EmptyState
          icon={Compass}
          title="You haven't started a Journey yet"
          description="Journeys are seasonal sets of practices you move through — solo or with your circle. Adopt one to fill your days with something for each part of a whole life."
          action={
            <Link
              href="/journeys"
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
            >
              Browse Journeys <ArrowRight className="h-4 w-4" />
            </Link>
          }
        />
      ) : (
        <div className="space-y-10">
          {journeys.map((j) => (
            <section key={j.plan.id}>
              <SectionHeader
                title={j.plan.title}
                action={
                  <span className="text-xs font-semibold tabular-nums text-subtle">
                    {j.done} / {j.total} on track · {j.percent}%
                  </span>
                }
              />
              {j.plan.summary && <p className="-mt-2 mb-3 text-sm text-muted">{j.plan.summary}</p>}

              {/* Progress bar */}
              <div className="mb-4 h-2 overflow-hidden rounded-full bg-surface-elevated">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${j.percent}%` }} />
              </div>

              {/* Pillar coverage — the four domains this journey touches. */}
              <div className="mb-5 flex flex-wrap gap-2">
                {planPillarMap(j.items).map((slice) => {
                  const p = slice.domainId ? byId.get(slice.domainId) : null
                  return (
                    <span
                      key={slice.domainId ?? 'none'}
                      className="inline-flex items-center gap-1.5 rounded-md bg-surface-elevated px-2 py-1 text-xs font-medium text-muted"
                    >
                      {p?.accent ? (
                        <span className="h-2 w-2 rounded-full" style={{ background: p.accent }} />
                      ) : (
                        <span className="h-2 w-2 rounded-full bg-border-strong" />
                      )}
                      {p?.name ?? 'Unsorted'} · {slice.count}
                    </span>
                  )
                })}
              </div>

              {/* The ordered steps — cadence met ✓ this week, the current step highlighted. */}
              <ol className="space-y-2">
                {j.items.map((it, idx) => {
                  const isNext = j.nextItem?.id === it.id
                  return (
                    <li
                      key={it.id}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${
                        isNext ? 'bg-primary-bg' : 'bg-surface-elevated/60'
                      }`}
                    >
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                          it.met
                            ? 'bg-success text-on-primary'
                            : isNext
                              ? 'bg-primary text-on-primary'
                              : 'bg-surface text-subtle ring-1 ring-border'
                        }`}
                      >
                        {it.met ? <Check className="h-3.5 w-3.5" /> : idx + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={`truncate text-sm font-medium ${it.met ? 'text-muted' : 'text-text'}`}>
                          {it.practice?.title ?? 'Practice'}
                        </p>
                        <p className="text-xs">
                          {it.met ? (
                            <span className="font-semibold text-success">On track · {it.loggedThisWeek}/{it.target} this week</span>
                          ) : isNext ? (
                            <span className="font-semibold text-primary-strong">Your next step · {it.loggedThisWeek}/{it.target} this week</span>
                          ) : (
                            <span className="text-subtle">{it.loggedThisWeek}/{it.target} this week</span>
                          )}
                        </p>
                      </div>
                      {!it.met && <LogPracticeButton practiceId={it.practice_id} label="Log" />}
                    </li>
                  )
                })}
              </ol>
            </section>
          ))}
        </div>
      )}
    </IndexTemplate>
  )
}
