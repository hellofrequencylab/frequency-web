import { CalendarCheck, PenTool, Mic, Flame, Shield } from 'lucide-react'
import { getMyProfileId } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPracticeStreak } from '@/lib/practice-streak'
import { STREAK_CONFIG, isStreakActive, type StreakType } from '@/lib/gamification'
import { streakProgress } from '@/lib/streak'
import { circleMatesToNudge, type CircleMateStreak } from '@/lib/circles/social-fuel'
import { SectionHeader } from '@/components/ui/section-header'
import { StreakHero } from '@/components/quest/streak-hero'
import { NudgeMateButton } from './nudge-mate-button'

const STREAK_ICONS: Record<StreakType, React.ElementType> = {
  attendance: CalendarCheck,
  posting: PenTool,
  hosting: Mic,
  login: Flame,
}

function getRhythmColor(count: number): string {
  return count >= 1 ? 'text-primary' : 'text-subtle'
}

function getRhythmBg(count: number): string {
  return count >= 1 ? 'bg-primary-bg' : 'bg-surface-elevated'
}

type StreakRow = {
  streak_type: StreakType
  current_count: number | null
  longest_count: number | null
  last_activity_at: string | null
}

/** One Circle mate flagged for the one-tap nudge row, resolved for display. */
type MateAtRisk = { profileId: string; name: string; current: number }

/** How many Circle mates the at-risk scan reads before the selector picks its (capped) few. Each
 *  mate costs a real `getPracticeStreak` read (their own local day, their own reserve), so the scan
 *  is bounded — a Circle is a small room, and the nudge row only ever shows the top three anyway. */
const MATE_SCAN_CAP = 12

/**
 * The Circle mates worth a one-tap nudge (Resonance Engine Phase 5 · ADR-386): mates in the
 * viewer's active Circles whose own daily streak is alive, unlogged today, and worth saving.
 * Selection is the pure `circleMatesToNudge` (longest run first, capped, never the whole room).
 * FAIL-SAFE: any read error returns an empty list — a missing nudge row must never take the
 * Consistency module down with it.
 */
async function loadMatesAtRisk(
  admin: ReturnType<typeof createAdminClient>,
  profileId: string,
): Promise<MateAtRisk[]> {
  try {
    const { data: mine } = await admin
      .from('memberships')
      .select('circle_id')
      .eq('profile_id', profileId)
      .eq('status', 'active')
    const circleIds = [
      ...new Set(((mine ?? []) as { circle_id: string | null }[]).map((m) => m.circle_id).filter(Boolean) as string[]),
    ]
    if (circleIds.length === 0) return []

    const { data: mates } = await admin
      .from('memberships')
      .select('profile_id')
      .in('circle_id', circleIds)
      .eq('status', 'active')
      .neq('profile_id', profileId)
      .limit(60)
    const mateIds = [...new Set(((mates ?? []) as { profile_id: string }[]).map((m) => m.profile_id))].slice(
      0,
      MATE_SCAN_CAP,
    )
    if (mateIds.length === 0) return []

    // Each mate's streak through the real reader, so "at risk" honors THEIR local day, reserve,
    // and rest window — a mate on a planned rest is calm, not a nudge target.
    const states: CircleMateStreak[] = await Promise.all(
      mateIds.map(async (id) => {
        const s = await getPracticeStreak(id)
        return { profileId: id, current: s.current, atRisk: s.atRisk }
      }),
    )
    const flagged = circleMatesToNudge(states, profileId)
    if (flagged.length === 0) return []

    const { data: profs } = await admin
      .from('profiles')
      .select('id, display_name, handle')
      .in('id', flagged.map((f) => f.profileId))
    const nameById = new Map(
      ((profs ?? []) as { id: string; display_name: string | null; handle: string | null }[]).map((p) => [
        p.id,
        p.display_name || p.handle || 'A Circle mate',
      ]),
    )
    return flagged.map((f) => ({ profileId: f.profileId, name: nameById.get(f.profileId) ?? 'A Circle mate', current: f.current }))
  } catch {
    return []
  }
}

// Leaderboard layout module (ADR-270/294): "Consistency" — the daily practice streak (bounded
// forgiveness) + the weekly show-up rhythms, framed as how the steady person wins. A self-fetching
// RSC keyed only on the viewer (no scope/track facet, so it is a clean standalone block, unlike the
// scope-driven collective goal / standing band / individual board which stay hand-composed in the
// page). Returns null for a logged-out viewer (the module contract). Reads the streaks rows directly
// rather than the redirecting getStreaksData action so it can degrade to null instead of redirecting.
export async function LeaderboardConsistency() {
  const profileId = await getMyProfileId()
  if (!profileId) return null

  const admin = createAdminClient()
  const [{ data: streakRows }, practice, matesAtRisk] = await Promise.all([
    admin.from('streaks').select('streak_type, current_count, longest_count, last_activity_at').eq('profile_id', profileId),
    getPracticeStreak(profileId),
    loadMatesAtRisk(admin, profileId),
  ])

  const streaks = ((streakRows ?? []) as StreakRow[]).map((s) => ({
    ...s,
    streak_type: s.streak_type as StreakType,
  }))

  // Daily practice streak, the headline. Progress is the milestone ladder.
  const prog = streakProgress(practice.current)

  // When the member is resting, name the day the rest ends (server-formatted so the client
  // component stays presentational).
  const restEndsLabel = practice.rest
    ? new Date(`${practice.rest.through}T00:00:00Z`).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', timeZone: 'UTC',
      })
    : null

  // Weekly streaks (the show-up rhythms) sit below.
  const streakMap = new Map(streaks.map((s) => [s.streak_type, s]))
  const weeklyTypes: StreakType[] = ['attendance', 'posting', 'hosting']

  return (
    <section aria-labelledby="consistency-heading" className="scroll-mt-20">
      <SectionHeader title="Consistency" />
      <p className="-mt-2 mb-4 text-body-sm text-muted" id="consistency-heading">
        Showing up is how the steady person wins. Your daily practice streak is the
        heartbeat. One slip won’t break it, and a planned rest doesn’t count against you.
      </p>

      {/* Hero: daily practice streak (bounded forgiveness) */}
      <StreakHero
        streak={practice}
        progress={{ pct: prog.pct, next: prog.next ? { day: prog.next.day, label: prog.next.label } : null, toNext: prog.toNext }}
        restEndsLabel={restEndsLabel}
      />

      {/* How forgiveness works, the safety net made legible */}
      <div className="mt-6 rounded-2xl bg-signal-bg/40 p-5">
        <div className="flex items-start gap-3">
          <Shield className="mt-0.5 h-5 w-5 shrink-0 text-signal-strong" aria-hidden />
          <div className="min-w-0">
            <p className="text-body-sm font-semibold text-signal-strong">Your reserve</p>
            <p className="mt-1 text-body-sm leading-relaxed text-signal-strong">
              Miss one day and a reserve day bridges it the next time you log, so one
              slip never zeroes your streak. The rule is simple: never miss twice. Two
              days in a row and the streak starts fresh, with your best still on record.
            </p>
            <p className="mt-2 text-body-sm leading-relaxed text-signal-strong">
              You bank a reserve day (up to two) at the Week, Month, Century and Year
              badges, and one for every five Full Day bonuses on a Journey. Planning real
              time off? Set a rest above and the break won’t count against you.
            </p>
          </div>
        </div>
      </div>

      {/* Mates at risk (ADR-386 Phase 5): the one-tap "nudge a Circle mate about to break theirs"
          row. Social streaks beat solo ones, and a nudge re-lights both people. Compact by design:
          the selector caps it at three, longest run first, and it renders nothing when nobody in
          the viewer's Circles is on the line today. */}
      {matesAtRisk.length > 0 && (
        <div className="mt-6 rounded-2xl bg-surface-elevated/60 p-5">
          <p className="text-body-sm font-semibold text-text">Mates on the line</p>
          <p className="mt-1 text-body-sm text-muted">
            These Circle mates have a streak to keep and no practice logged yet today. One tap
            sends a nudge.
          </p>
          <ul className="mt-3 space-y-2">
            {matesAtRisk.map((m) => (
              <li key={m.profileId} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-body-sm font-semibold text-text">{m.name}</p>
                  <p className="text-meta text-subtle tabular-nums">
                    {m.current} {m.current === 1 ? 'day' : 'days'} going
                  </p>
                </div>
                <NudgeMateButton mateProfileId={m.profileId} mateName={m.name} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Weekly rhythms */}
      <div className="mt-8">
        <SectionHeader title="Weekly rhythms" />
      </div>
      <div className="space-y-4">
        {weeklyTypes.map((type) => {
          const streak = streakMap.get(type)
          const config = STREAK_CONFIG[type]
          const Icon = STREAK_ICONS[type]
          const current = streak?.current_count ?? 0
          const longest = streak?.longest_count ?? 0
          const active = streak ? isStreakActive(streak.last_activity_at, config.window_days) : false
          const milestones = [3, 4, 8, 13]

          return (
            <div key={type} className="rounded-2xl bg-surface-elevated/60">
              <div className="p-5">
                <div className="flex items-start gap-4">
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${getRhythmBg(current)}`}>
                    <Icon className={`h-6 w-6 ${getRhythmColor(current)}`} aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-body-sm font-semibold text-text">{config.label} streak</h3>
                      {active && current > 0 && (
                        <span className="rounded-md bg-success-bg px-1.5 py-0.5 text-meta font-semibold text-success">Active</span>
                      )}
                      {!active && current > 0 && (
                        <span className="rounded-md bg-surface px-1.5 py-0.5 text-meta font-semibold text-muted">Resting</span>
                      )}
                    </div>
                    <p className="mt-0.5 text-meta text-muted">{config.description}</p>
                    <div className="mt-3 flex items-center gap-4">
                      <div>
                        <span className="text-page-title font-bold text-text tabular-nums">{current}</span>
                        <span className="ml-1 text-meta text-subtle">{current === 1 ? 'week' : 'weeks'}</span>
                      </div>
                      <div className="h-6 w-px bg-border-strong" />
                      <div>
                        <span className="text-body-sm font-semibold text-muted tabular-nums">{longest}</span>
                        <span className="ml-1 text-meta text-subtle">best</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-5">
                  <div className="flex items-center justify-between gap-1">
                    {milestones.map((m) => {
                      const reached = current >= m
                      return (
                        <div key={m} className="flex flex-1 flex-col items-center gap-1">
                          <div className={`h-1.5 w-full rounded-pill ${reached ? 'bg-primary' : 'bg-surface-elevated'}`} />
                          <span className={`text-meta font-semibold ${reached ? 'text-primary-strong' : 'text-subtle'}`}>{m}w</span>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {streak?.last_activity_at && (
                  <p className="mt-3 text-meta text-subtle">
                    Last recorded: {new Date(streak.last_activity_at).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric',
                    })}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
