'use server'

// On Air session completion (ADR-229). One action gathers the whole reveal:
// record the sit → log the practice through the EXISTING engine (same
// idempotency, zaps, bonuses, streaks — On Air is a stage, not a second
// economy) → read the post-log state → today's Dispatch from Vera.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { logPractice, getPracticesToLogToday, type LogPracticeResult } from '@/lib/practices'
import { getPracticeStreak } from '@/lib/practice-streak'
import { amplitudeLevel } from '@/lib/amplitude'
import { getOrCreateDispatch } from '@/lib/vera-dispatch'
import { getNextGathering } from '@/lib/quest/next-gathering'
import { buildSessionDispatch, modeHasNote, statSessionLabel } from '@/lib/on-air'
import { loadOnAirSessionData, type OnAirSessionData } from '@/lib/on-air/session-data'
import type { DispatchKind, OnAirPrefs, RevealPayload, SessionMode } from '@/lib/on-air'

/** Map a completed session to the Dispatch opener kind (task D). A Movement sit
 *  reports its movementMode (walk / run / yoga / strength / stretch / play) — that
 *  names the line. A plain Mindless sit reports no movementMode, so the sit mode
 *  (timer / breath / journal / stillness / ritual / log) names it instead. A legacy
 *  'workout' movementMode maps to 'strength' to match the six-mode engine. */
function dispatchKindFor(
  movementMode: string | null | undefined,
  mode: SessionMode,
): DispatchKind {
  if (movementMode) {
    const m = movementMode === 'workout' ? 'strength' : movementMode
    const known = ['walk', 'run', 'yoga', 'strength', 'stretch', 'play']
    if (known.includes(m)) return m as DispatchKind
  }
  return mode
}

function db(): SupabaseClient {
  return createAdminClient()
}

/** Load the member's On Air setup state for the global Mindless overlay — the
 *  same assembly the /on-air route does (shared loader), but callable from the
 *  client so the overlay can open from anywhere in the app. The overlay handles
 *  the empty (no adopted practices) case in-place, so an empty `practices` list
 *  is a valid result, not an error; only "not signed in" fails. */
export async function loadOnAirSession(
  requestedPracticeId?: string,
): Promise<ActionResult<OnAirSessionData>> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Not signed in')
  return ok(await loadOnAirSessionData(profileId, requestedPracticeId ?? null))
}

export interface CompleteSessionInput {
  practiceId: string
  circleId?: string | null
  mode: SessionMode
  pattern: string | null
  seconds: number
  startedAt: string | null
  /** "Finish Practice" resume: seconds already banked on today's partial log (and already
   *  proven in the first session). The reported `seconds` is the TOTAL (banked + this
   *  session), so the timer-proof validates only THIS session's slice (`seconds -
   *  resumeFromSec`) and a legitimate resume is never rejected. 0/omitted = a fresh sit. */
  resumeFromSec?: number
  /** Movement timer (WEBSITE-CHANGES-PLAN §4 C.6): the chosen mode (walk/yoga/play/workout).
   *  Tags the practice_sessions row so a Movement sit is distinguishable from a Mindless one
   *  in history; the economy + timer-proof path is unchanged (Movement still claims a timed sit
   *  via mode 'timer'). Omitted for a plain Mindless sit. */
  movementMode?: string | null
  /** Custom-pattern seconds + cue toggles, remembered with the rest of the setup (P3). */
  customIn?: number
  customHold?: number
  customOut?: number
  bell?: boolean
  bellTone?: string
  bellVolume?: 'quiet' | 'medium' | 'loud'
  endBell?: boolean
  bellEveryMin?: number
  haptics?: boolean
  /** Ambient loop slug, null = none. */
  ambientTrack?: string | null
  /** The warm-up countdown length (3 | 5 | 10s), remembered with the rest of the setup. */
  warmupSec?: number
  /** The optional free-text reflection from a Journal / Just Log session. Trimmed + capped
   *  server-side; empty becomes null. Stored on the session history row, never the economy. */
  note?: string | null
}

/** The longest a stored session note may be (characters). Trimmed + capped server-side so a
 *  crafted request can't write an unbounded blob into history. */
const SESSION_NOTE_MAX = 2000

/** Trim + cap a session note; an empty string (or whitespace) becomes null. */
function cleanSessionNote(v: string | null | undefined): string | null {
  const t = (v ?? '').trim().slice(0, SESSION_NOTE_MAX)
  return t.length ? t : null
}

export async function completeSession(
  input: CompleteSessionInput,
): Promise<ActionResult<RevealPayload>> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Not signed in')

  const admin = db()
  const seconds = Math.max(0, Math.min(4 * 60 * 60, Math.round(input.seconds)))
  // The banked portion of a "Finish Practice" resume (already proven first time round). The
  // proof below validates only this session's slice (seconds - resumeFromSec); logPractice
  // still gets the TOTAL `seconds` so it can top the partial up to its full target.
  const resumeFromSec = Math.max(0, Math.min(seconds, Math.round(input.resumeFromSec ?? 0)))

  // 1. The sit itself (history + minutes stats). Errors never block the log. A
  // Movement sit tags its mode (movement:<walk|yoga|play|workout>) into the free-text
  // `mode` column so it reads back distinct from a Mindless sit; everything else
  // (economy, timer-proof) treats it as the timed sit it is.
  const sessionMode = input.movementMode ? `movement:${input.movementMode}` : input.mode
  // The Journal / Just Log reflection rides on the history row (nullable, trimmed + capped).
  // Only these note-bearing modes can carry one; anything else stores null.
  const note = modeHasNote(input.mode) ? cleanSessionNote(input.note) : null
  const sessionRow = {
    profile_id: profileId,
    practice_id: input.practiceId,
    mode: sessionMode,
    pattern: input.mode === 'breath' ? input.pattern : null,
    seconds,
    started_at: input.startedAt,
  }
  // `note` is newer than the generated types (ADR-246); the cast keeps the base fields
  // type-checked while still sending the column. Regenerate lib/database.types.ts to drop it.
  await admin.from('practice_sessions').insert({ ...sessionRow, note } as typeof sessionRow)

  // Logging ENDS the run: drop the server-authoritative active timer session (ADR-521)
  // so it never resumes after the sit is banked. Self-scoped (profile_id), best-effort
  // (a failure never blocks the log; the client also clears its localStorage cache).
  try {
    await admin.from('practice_timer_sessions' as never).delete().eq('profile_id', profileId)
  } catch {
    // clearing the active-session row is a safety net, never a blocker
  }

  // Remember the setup so tomorrow opens ready (zero-config repeat), and keep
  // the lifetime airtime counter (hosted PostgREST has aggregates off, so the
  // running total lives in meta; the sessions table can always recompute it).
  let totalSeconds = seconds
  try {
    const { data: prof } = await admin.from('profiles').select('meta').eq('id', profileId).maybeSingle()
    const meta = ((prof as { meta: Record<string, unknown> | null } | null)?.meta ?? {}) as Record<string, unknown>
    totalSeconds = Number((meta.onAirTotalSeconds as number | undefined) ?? 0) + seconds
    // Merge over what's already stored: a timer session must not wipe the
    // member's custom-pattern sliders or cue toggles (and old prefs without
    // the P3 keys keep working untouched).
    const prior = (meta.onAir ?? {}) as Partial<OnAirPrefs>
    const phaseSec = (v: number | undefined, lo: number) =>
      typeof v === 'number' && Number.isFinite(v)
        ? Math.min(8, Math.max(lo, Math.round(v)))
        : undefined
    const prefs: OnAirPrefs = {
      mode: input.mode,
      pattern: input.pattern ?? 'box',
      minutes: Math.max(1, Math.round(seconds / 60)) || 5,
      customIn: phaseSec(input.customIn, 3) ?? prior.customIn,
      customHold: phaseSec(input.customHold, 0) ?? prior.customHold,
      customOut: phaseSec(input.customOut, 3) ?? prior.customOut,
      bell: typeof input.bell === 'boolean' ? input.bell : prior.bell,
      bellTone: typeof input.bellTone === 'string' ? input.bellTone : prior.bellTone,
      bellVolume:
        input.bellVolume === 'quiet' || input.bellVolume === 'medium' || input.bellVolume === 'loud'
          ? input.bellVolume
          : prior.bellVolume,
      endBell: typeof input.endBell === 'boolean' ? input.endBell : prior.endBell,
      bellEveryMin:
        typeof input.bellEveryMin === 'number' && Number.isFinite(input.bellEveryMin)
          ? Math.max(0, Math.round(input.bellEveryMin))
          : prior.bellEveryMin,
      haptics: typeof input.haptics === 'boolean' ? input.haptics : prior.haptics,
      // null = the member turned it off (persist that); undefined = keep prior.
      ambientTrack: input.ambientTrack === undefined ? prior.ambientTrack : input.ambientTrack,
      // The warm-up length (3 | 5 | 10s), clamped to a valid preset; keep prior otherwise.
      warmupSec:
        input.warmupSec === 3 || input.warmupSec === 5 || input.warmupSec === 10
          ? input.warmupSec
          : prior.warmupSec,
    }
    await admin
      .from('profiles')
      .update({ meta: { ...meta, onAir: prefs, onAirTotalSeconds: totalSeconds } })
      .eq('id', profileId)
  } catch {
    // prefs + counter are a nicety, never a blocker
  }

  // 2. The log — the one and only economy entry point.
  //
  // Timer-completion proof (anti-cheat D5): a `uses_timer` practice that CLAIMS a
  // timed sit (any mode but Just Log, with real seconds) must have a server-checkable
  // sit behind it. We trust our own clock, not the client's number: the wall-clock
  // gap from started_at to now has to plausibly cover the claimed seconds. A forged
  // request claiming a long sit with a started_at moments ago (or none at all) earns
  // nothing — we still keep the session row above for history, but skip the economy
  // so a timer practice can't be logged with no real sit. Just Log (mode 'log') is the
  // sanctioned no-sit path and is never gated here.
  const timedClaim = input.mode !== 'log' && seconds > 0
  let timerProofFailed = false
  // The practice's authored length (seconds), the target a timed log is measured against.
  // Read alongside the timer-proof flag so we only round-trip once.
  let durationTargetSec = 0
  if (timedClaim) {
    const { data: pRow } = await admin
      .from('practices')
      .select('uses_timer, duration_min')
      .eq('id', input.practiceId)
      .maybeSingle()
    const row = pRow as { uses_timer: boolean | null; duration_min: number | null } | null
    const usesTimer = row?.uses_timer ?? false
    durationTargetSec = Math.max(0, Math.round((row?.duration_min ?? 0) * 60))
    if (usesTimer) {
      const startedMs = input.startedAt ? Date.parse(input.startedAt) : NaN
      // Real wall-clock elapsed since the sit was armed. A generous half-of-claimed
      // floor (plus a small absolute floor) absorbs the 5s pre-roll, pauses, and
      // clock skew, while still catching a fabricated long sit on a started_at that
      // can't support it.
      const serverElapsed = Number.isFinite(startedMs) ? (Date.now() - startedMs) / 1000 : NaN
      const plausible =
        Number.isFinite(serverElapsed) &&
        serverElapsed >= 5 &&
        serverElapsed >= (seconds - resumeFromSec) * 0.5
      if (!plausible) timerProofFailed = true
    }
  }

  // Completion economy (partial / full / finish). A timed sit measures the actual elapsed
  // seconds against a target: the practice's authored length (duration_min*60) when set, else
  // the claimed seconds for an open / Free sit (target = done → a full, complete sit). Just Log
  // (mode 'log') stays the one-tap FULL path — no target, so logPractice pays the full reward.
  // The same treatment applies to a Movement sit (it claims a timed sit via mode 'timer').
  const secondsTarget = input.mode === 'log' ? null : durationTargetSec > 0 ? durationTargetSec : seconds
  const secondsDone = input.mode === 'log' ? null : seconds

  const log: LogPracticeResult = timerProofFailed
    ? { logged: false, zapsAwarded: 0 }
    : await logPractice({
        profileId,
        practiceId: input.practiceId,
        circleId: input.circleId ?? null,
        secondsDone,
        secondsTarget,
      })

  // 3. Post-log state for the reveal. Today's airtime is a handful of rows;
  //    summed in JS (PostgREST aggregates are disabled on hosted projects).
  const [practiceRow, streak, profRow, depthRow, todayRows] = await Promise.all([
    admin.from('practices').select('title').eq('id', input.practiceId).maybeSingle(),
    getPracticeStreak(profileId),
    admin.from('profiles').select('amplitude').eq('id', profileId).maybeSingle(),
    // Lifetime depth for this practice = completed practice_logs rows. (The old
    // practice_streaks.lifetime_logs source was dropped by the rewards-v3 teardown;
    // reading it always errored and pinned the depth stat to 0.) head+count avoids
    // pulling rows, and works with hosted PostgREST aggregates disabled.
    admin
      .from('practice_logs')
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', profileId)
      .eq('practice_id', input.practiceId)
      .eq('completed', true),
    admin
      .from('practice_sessions')
      .select('seconds')
      .eq('profile_id', profileId)
      .gte('ended_at', `${new Date().toISOString().slice(0, 10)}T00:00:00Z`),
  ])

  const todaySeconds = ((todayRows.data as { seconds: number }[] | null) ?? []).reduce(
    (s, r) => s + (r.seconds ?? 0),
    0,
  )
  const lifetimeLogs = Number(depthRow.count ?? 0)
  const amplitude = Number((profRow.data as { amplitude: number | null } | null)?.amplitude ?? 0)

  // 4. Today's Dispatch from Vera — tied to the member's real state right now:
  //    what's still on their list to log today, whether they're done, and the
  //    next gathering they've RSVP'd to. One warm, specific line, with the close
  //    button (label + href) matching exactly what she mentioned. No new writes —
  //    both reads already exist and are best-effort; either failing just drops
  //    that branch. Only when BOTH reads throw do we fall back to the cached
  //    Vera Dispatch so the card never blanks.
  // What was actually practiced — drives both the Dispatch opener and the stats-card
  // session label, so a walk never reads "Good sit" / "This sit" (ADR-443).
  const dispatchKind = dispatchKindFor(input.movementMode, input.mode)
  let dispatch: RevealPayload['dispatch']
  try {
    const [toLog, gathering] = await Promise.all([
      getPracticesToLogToday(profileId).catch(() => null),
      getNextGathering(profileId).catch(() => null),
    ])
    if (toLog === null && gathering === null) throw new Error('state reads failed')
    dispatch = buildSessionDispatch({
      practicesLeft: (toLog ?? []).map((p) => p.title),
      gathering:
        gathering && gathering.rsvped
          ? { title: gathering.title, slug: gathering.slug }
          : null,
      kind: dispatchKind,
    })
  } catch {
    // Last resort only: the cached, AI-voiced Dispatch from Vera.
    dispatch = {
      copy: 'Same time tomorrow. Bring one practice. The streak does the rest.',
      actionHref: '/feed',
      actionLabel: 'Back to feed',
    }
    try {
      const d = await getOrCreateDispatch(profileId)
      dispatch = { copy: d.copy, actionHref: d.actionHref, actionLabel: d.actionLabel }
    } catch {
      // the template default above stands
    }
  }

  return ok({
    logged: log.logged,
    zapsAwarded: log.zapsAwarded,
    bonuses: (log.journey?.bonuses ?? []).map((b) => ({
      label: b.label,
      kind: b.kind,
      amount: b.amount,
    })),
    welcomeBack: !!log.welcomeBack,
    // Completion economy: surface partial / finish so the reveal can message "1 Zap now,
    // finish for the rest." Absent (undefined) on the unchanged full / one-tap path.
    partial: !!log.partial,
    finished: !!log.finished,
    practiceTitle: (practiceRow.data as { title: string } | null)?.title ?? 'Practice',
    streak: {
      current: streak.current,
      longest: streak.longest,
      freezeTokens: streak.freezeTokens,
      nextMilestone: streak.nextMilestone,
      toNext: streak.toNext,
    },
    stats: {
      sessionSeconds: seconds,
      sessionLabel: statSessionLabel(dispatchKind),
      todaySeconds,
      totalSeconds,
      lifetimeLogs,
      nextDepthMark: [10, 25, 50, 100].find((m) => m > lifetimeLogs) ?? null,
      amplitude,
      amplitudeLevel: amplitudeLevel(amplitude),
    },
    dispatch,
  })
}
