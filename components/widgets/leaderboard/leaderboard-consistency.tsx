import { CalendarCheck, PenTool, Mic, Flame, Shield } from 'lucide-react'
import { getMyProfileId } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getPracticeStreak,
  derivePracticeStreak,
  frozenDaysFrom,
  isResting,
  shiftDay,
  type RestWindow,
} from '@/lib/practice-streak'
import { memberDay } from '@/lib/member-day'
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

/** How many Circle mates the at-risk scan covers before the selector picks its (capped) few. The
 *  scan is bounded because a Circle is a small room and the nudge row only ever shows the top three
 *  anyway — it is no longer bounded by round trips: every mate's streak is now derived from two
 *  batched reads rather than a `getPracticeStreak` call of its own. */
const MATE_SCAN_CAP = 12

/** How far back the batched log read reaches. Mirrors the (module-private) WINDOW_DAYS in
 *  lib/practice-streak.ts, which is the window `getPracticeStreak` reads and the cap
 *  `derivePracticeStreak` stops its own walk at — so reading a day or two FURTHER back than a given
 *  mate's own floor cannot change the number that comes out. */
const STREAK_WINDOW_DAYS = 400

/** PostgREST truncates a response at the project's `max_rows` (1000 — supabase/config.toml), and a
 *  member can hold MORE THAN ONE log row per day (practice_logs is unique on
 *  (profile_id, practice_id, logged_for), not on the day). So one `.in()` over twelve mates × a
 *  400-day window is not guaranteed to fit, and a truncated response would silently shorten
 *  somebody's streak. The window is read in small mate CHUNKS instead: each chunk gets the whole
 *  row budget, and every chunk goes out in the SAME wave, so the latency is one round trip either
 *  way. Rows come back newest-first, so a chunk that ever did hit the cap would lose the OLDEST
 *  days — the ones furthest from a walk that starts at today. */
const MATE_LOG_CHUNK = 2
const MATE_LOG_ROW_BUDGET = 1000

/** The mate columns the streak derivation needs, plus the name the nudge row renders. */
type MateProfileRow = {
  id: string
  display_name: string | null
  handle: string | null
  home_timezone: string | null
  meta: unknown
}

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

    // ── Every mate's streak, from TWO batched reads ──────────────────────────────────────────
    // This was `mateIds.map((id) => getPracticeStreak(id))`. Each of those calls does a serial
    // `profiles.home_timezone` read (resolveMemberDay) and THEN a two-query wave of its own, so
    // twelve mates cost ~36 round trips — plus a thirteenth read afterwards, just for the names.
    // None of that fan-out was needed: every input is a column on a row we can fetch by `.in(...)`.
    //
    // So: one `profiles` read for the zone + meta of all of them (carrying `display_name`/`handle`
    // too, which retires the follow-up name query entirely), one windowed `practice_logs` read, and
    // then the streak per mate is DERIVED in memory through the very same pure functions the
    // per-member reader uses — `frozenDaysFrom` for the bridged days, `derivePracticeStreak` for the
    // count, `isResting` for the calm case. The rules are not restated here; they are called.
    const now = new Date()
    // A member's local day is at most one day either side of UTC's, so a floor built from the UTC
    // day (minus one) is at or below every mate's own floor. Over-reaching is free — see
    // STREAK_WINDOW_DAYS.
    const logFloor = shiftDay(memberDay(null, now), -(STREAK_WINDOW_DAYS + 1))
    const mateChunks: string[][] = []
    for (let i = 0; i < mateIds.length; i += MATE_LOG_CHUNK) {
      mateChunks.push(mateIds.slice(i, i + MATE_LOG_CHUNK))
    }

    const [{ data: profs }, logChunks] = await Promise.all([
      admin.from('profiles').select('id, display_name, handle, home_timezone, meta').in('id', mateIds),
      Promise.all(
        mateChunks.map((ids) =>
          admin
            .from('practice_logs')
            .select('profile_id, logged_for')
            .in('profile_id', ids)
            .gte('logged_for', logFloor)
            .order('logged_for', { ascending: false })
            .limit(MATE_LOG_ROW_BUDGET),
        ),
      ),
    ])

    const profById = new Map(((profs ?? []) as unknown as MateProfileRow[]).map((p) => [p.id, p]))
    // The DAYS a mate practised, deduped per mate — the shape derivePracticeStreak takes.
    const loggedByMate = new Map<string, Set<string>>()
    for (const chunk of logChunks) {
      for (const row of (chunk.data ?? []) as unknown as { profile_id: string; logged_for: string }[]) {
        let days = loggedByMate.get(row.profile_id)
        if (!days) {
          days = new Set<string>()
          loggedByMate.set(row.profile_id, days)
        }
        days.add(String(row.logged_for))
      }
    }

    const states: CircleMateStreak[] = mateIds.map((id) => {
      const prof = profById.get(id) ?? null
      const meta = (prof?.meta ?? null) as Record<string, unknown> | null
      // THEIR local day, the same boundary logPractice writes `logged_for` under and the same one
      // resolveMemberDay resolves inside getPracticeStreak: durable profiles.home_timezone, else
      // UTC (a server scan of other people has no client tz to offer, and never did — the old
      // per-mate getPracticeStreak call passed none either).
      const today = memberDay(prof?.home_timezone ?? null, now)
      const logged = loggedByMate.get(id) ?? new Set<string>()
      const frozen = frozenDaysFrom(meta, today)
      const { current, loggedToday, alive } = derivePracticeStreak(logged, frozen, today)
      const rest = ((meta?.practiceStreak ?? {}) as { rest?: RestWindow | null }).rest ?? null
      // At risk only when alive, unlogged, AND not resting — a mate on a planned rest is calm,
      // not a nudge target.
      return { profileId: id, current, atRisk: alive && !loggedToday && !isResting(rest, today) }
    })

    const flagged = circleMatesToNudge(states, profileId)
    if (flagged.length === 0) return []

    return flagged.map((f) => {
      const p = profById.get(f.profileId)
      return {
        profileId: f.profileId,
        name: p?.display_name || p?.handle || 'A Circle mate',
        current: f.current,
      }
    })
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
