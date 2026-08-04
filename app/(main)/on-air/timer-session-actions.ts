'use server'

// Server-authoritative ACTIVE timer session (ADR-521). The ONE source of truth for
// "this member has a timer running right now", so a running Mindless sit / Get Moving
// run persists and keeps running across reloads, navigation, and DEVICES, until the
// member logs (completeSession clears the row) or cancels.
//
// localStorage (lib/on-air/live-session.ts) stays the fast same-browser cache; this
// row is what makes the resume CROSS-DEVICE. The engines write it at the same
// lifecycle points they already call saveLiveSession / clearLiveSession (start / begin
// / pause / finish / leave / discard), and MindlessProvider reads it on load to
// re-open the timer as RUNNING (never a prompt).
//
// Every action is SELF-gated: the profile is derived from the session (getMyProfileId),
// never a caller-supplied id, so no member can read or write another's active session.
// All writes go through the admin client (the table has no client write policy); the
// owner scope IS the gate. Idempotent + fail-safe: a failure degrades to "no server
// row" (the localStorage cache still recovers same-browser), never throws into the UI.

import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { LIVE_SESSION_MAX_AGE_MS, type LiveSessionRecord, type LiveTimerKind } from '@/lib/on-air/live-session'

// The untyped active-timer query builder (practice_timer_sessions is not in the
// generated types yet, ADR-246 — regenerate lib/database.types.ts after this
// migration applies, then drop the cast).
interface TimerRow {
  profile_id: string
  practice_id: string | null
  mode: string
  setup: { resumeFromSec?: number; payload?: unknown } | null
  started_at: string
  paused_at: string | null
  seconds_target: number | null
}
function timerTable() {
  return (createAdminClient() as unknown as {
    from: (t: string) => {
      upsert: (v: Record<string, unknown>, o?: Record<string, unknown>) => Promise<{ error: unknown }>
      update: (v: Record<string, unknown>) => { eq: (c: string, val: string) => Promise<{ error: unknown }> }
      delete: () => { eq: (c: string, val: string) => Promise<{ error: unknown }> }
      select: (c: string) => { eq: (c: string, val: string) => { maybeSingle: () => Promise<{ data: TimerRow | null; error: unknown }> } }
    }
  }).from('practice_timer_sessions')
}

/** What the client sends to open (or replace) its one active session. Mirrors the
 *  localStorage LiveSessionRecord fields; startedAt/pausedAt are epoch ms. */
export interface StartTimerSessionInput {
  kind: LiveTimerKind
  practiceId: string
  /** Wall-clock start, epoch ms (pause-adjusted, same value written to localStorage). */
  startedAt: number
  /** Epoch ms the run is paused at (armed pre-roll or a real pause), or null while running. */
  pausedAt: number | null
  /** Seconds already banked by an earlier partial (a "Finish Practice" resume); 0 fresh. */
  resumeFromSec: number
  /** The run's full target length in seconds, or null for an open-ended run. */
  secondsTarget: number | null
  /** The opaque per-engine payload to rebuild the run (sit setup / movement config). */
  setup: unknown
}

/** Open or REPLACE the caller's active timer session (upsert on the unique profile_id).
 *  Called from start() / begin() and any transition that changes the wall clock. */
export async function startTimerSession(
  input: StartTimerSessionInput,
): Promise<ActionResult<true>> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Not signed in')
  try {
    const { error } = await timerTable().upsert(
      {
        profile_id: profileId,
        practice_id: input.practiceId || null,
        mode: input.kind,
        setup: { resumeFromSec: Math.max(0, Math.round(input.resumeFromSec || 0)), payload: input.setup },
        started_at: new Date(input.startedAt).toISOString(),
        paused_at: input.pausedAt != null ? new Date(input.pausedAt).toISOString() : null,
        seconds_target: input.secondsTarget != null ? Math.round(input.secondsTarget) : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'profile_id' },
    )
    if (error) return fail('Could not save the active session')
    return ok(true)
  } catch {
    return fail('Could not save the active session')
  }
}

/** Mark the caller's active session paused at the given epoch ms. Idempotent. */
export async function pauseTimerSession(pausedAt: number): Promise<ActionResult<true>> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Not signed in')
  try {
    const { error } = await timerTable()
      .update({ paused_at: new Date(pausedAt).toISOString(), updated_at: new Date().toISOString() })
      .eq('profile_id', profileId)
    if (error) return fail('Could not pause the active session')
    return ok(true)
  } catch {
    return fail('Could not pause the active session')
  }
}

/** Resume the caller's active session, clearing paused_at and adopting the client's
 *  pause-adjusted startedAt (epoch ms) so the server clock stays exact. Idempotent. */
export async function resumeTimerSession(startedAt: number): Promise<ActionResult<true>> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Not signed in')
  try {
    const { error } = await timerTable()
      .update({ paused_at: null, started_at: new Date(startedAt).toISOString(), updated_at: new Date().toISOString() })
      .eq('profile_id', profileId)
    if (error) return fail('Could not resume the active session')
    return ok(true)
  } catch {
    return fail('Could not resume the active session')
  }
}

/** Drop the caller's active session (cancel / leave / discard). Idempotent: a missing
 *  row is a no-op success, so a double cancel never errors. */
export async function cancelTimerSession(): Promise<ActionResult<true>> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Not signed in')
  try {
    const { error } = await timerTable().delete().eq('profile_id', profileId)
    if (error) return fail('Could not clear the active session')
    return ok(true)
  } catch {
    return fail('Could not clear the active session')
  }
}

/** Read the caller's active timer session as a LiveSessionRecord (or null), so the
 *  engine can resume it as RUNNING. Self-scoped: returns only the caller's own row. */
/** How long an ARMED-but-never-begun row (started_at == paused_at) may live before it is
 *  treated as orphaned. A real warm-up hands over in seconds; this is generous enough to
 *  survive a slow network and short enough that a dead row never outlives one page visit. */
const ARMED_PREROLL_MAX_AGE_MS = 5 * 60 * 1000

export async function getActiveTimerSession(): Promise<ActionResult<LiveSessionRecord | null>> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Not signed in')
  try {
    const { data, error } = await timerTable()
      .select('profile_id, practice_id, mode, setup, started_at, paused_at, seconds_target')
      .eq('profile_id', profileId)
      .maybeSingle()
    if (error) return fail('Could not read the active session')
    if (!data) return ok(null)
    const kind: LiveTimerKind = data.mode === 'movement' ? 'movement' : 'mindless'
    const startedMs = Date.parse(data.started_at)
    if (!Number.isFinite(startedMs)) return ok(null)
    const pausedMs = data.paused_at ? Date.parse(data.paused_at) : null

    // ── STALENESS. This used to read: "the server row IS live by definition (the staleness
    // guard is a localStorage concern)". That assumption is what broke the timer.
    //
    // A row is written the instant Start is tapped, ARMED and paused, before the warm-up
    // hands over to the live run. If the surface goes away in that window -- which is the
    // documented mobile behaviour lib/on-air/live-session.ts exists for, a phone
    // backgrounding and the tab being discarded -- the row is orphaned with
    // `started_at == paused_at` and is never written again.
    //
    // MindlessProvider reads this on EVERY authed mount and force-opens the overlay in the
    // row's mode. So one orphan turns every page load into a dead 00:00 "Resume" screen, in
    // the wrong engine, with no toggle back (the mode switch only exists on setup). It cannot
    // self-heal: the abandonment auto-finalize deliberately skips paused records, and close()
    // does not clear the row. Observed in production 2026-08-04.
    //
    // Two windows, because the two shapes rot at different speeds:
    const age = Date.now() - Math.max(startedMs, pausedMs ?? 0)
    const armedNeverBegun = pausedMs !== null && pausedMs === startedMs
    //   · an ARMED pre-roll lasts seconds. Minutes old means the hand-over never happened.
    //   · a genuine paused/running sit gets the same 6h the localStorage cache gets, so the
    //     cross-device resume this table exists for still works across a normal day.
    const stale = armedNeverBegun ? age > ARMED_PREROLL_MAX_AGE_MS : age > LIVE_SESSION_MAX_AGE_MS
    if (stale) {
      // Clear it so the next read is clean, and so a member who never opens a support
      // channel is not stuck behind a row only an operator could see. Best-effort: a failed
      // delete still returns null, which is the behaviour that matters.
      try {
        await timerTable().delete().eq('profile_id', profileId)
      } catch {
        /* the null return below is the fix; the delete is housekeeping */
      }
      return ok(null)
    }

    const record: LiveSessionRecord = {
      kind,
      startedAt: startedMs,
      pausedAt: pausedMs,
      practiceId: data.practice_id ?? '',
      resumeFromSec: Math.max(0, Math.round(data.setup?.resumeFromSec ?? 0)),
      secondsTarget: data.seconds_target ?? null,
      // Stamped on read: the row passed the staleness gate above, so it is live as of now.
      savedAt: Date.now(),
      setup: data.setup?.payload ?? {},
    }
    return ok(record)
  } catch {
    return fail('Could not read the active session')
  }
}
