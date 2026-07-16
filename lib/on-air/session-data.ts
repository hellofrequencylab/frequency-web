// On Air — the session data loader (ADR-229, docs/ON-AIR.md). Shared by the
// route page (app/(main)/on-air/page.tsx) and the global Mindless overlay's
// server action (app/(main)/on-air/actions.ts), so both assemble the SAME
// member-state in one place.
//
// The list a member sees (ADR-304 follow-up): a **Free sit** is always offered
// (the open timer, never blocked) plus the practices due RIGHT NOW — the current
// leg of every Journey they are enrolled in; with no Journey, their adopted
// practices. A practice opened from a Journey step (or a /on-air?practice link)
// is pinned + pre-selected even when it isn't adopted yet (a previewing author).
// Each practice carries its own duration so the timer can default to it.
//
// Pure data assembly — no economy here (a session ends through the existing
// completeSession action). Lives in lib/ (not the page) so the overlay can
// reuse it without importing route code.

import { createAdminClient } from '@/lib/supabase/admin'
import { resolveMemberDay } from '@/lib/member-day'
import { getMemberPractices, type TimerKind, type MindlessMode, type PartialToday } from '@/lib/practices'
import type { MovementConfig } from '@/lib/movement'
import { getCurrentLegPracticeIds } from '@/lib/journeys/current-leg'
import { DEFAULT_PREFS, coerceBellVolume, coerceAmbientVolume, type OnAirPrefs } from '@/lib/on-air'
import type { OnAirPractice } from '@/components/on-air/session'

/** The synthetic "Free sit" chip id. Selecting it runs the open timer; on completion it logs the
 *  default sit practice (so the one economy path, logPractice, is unchanged). Never a real id. */
export const FREE_SIT_ID = '__free_sit__'

/** The synthetic "Free Practice" chip id for the Get Moving side. Mirrors FREE_SIT_ID but logs the
 *  default MOVEMENT practice, so a generic Get Moving run banks a movement practice, never a sit. */
export const FREE_MOVE_ID = '__free_move__'

/** The practice a Free sit logs (the canonical short Mind sit). Resolved by slug so swapping it is
 *  data, not code. */
const DEFAULT_SIT_SLUG = 'morning-stillness'

/** The practice a Get Moving Free Practice logs (the canonical daily walk). Resolved by slug so a
 *  generic Get Moving session banks a MOVEMENT practice instead of the Be Still sit (item #1). */
const DEFAULT_MOVE_SLUG = 'daily-walk'

/** Everything OnAirSession needs to render the setup screen for a member. */
export interface OnAirSessionData {
  practices: OnAirPractice[]
  defaultPracticeId: string | null
  prefs: OnAirPrefs
  /** Distinct members with a practice log today (presence line, shown at >=3). */
  practicedToday: number
}

type PracticeRow = {
  id: string
  title: string
  duration_min: number | null
  timer_kind: string | null
  mindless_mode: string | null
  movement_config: unknown
  duration_locked: boolean | null
  warmup_message: string | null
  warmup_sec: number | null
}

// The columns every practice row needs so the timer can ROUTE it (timer_kind), open to the right
// Mindless sub-mode / Movement config, and respect a locked duration. Untyped admin handle reads the
// freshly-added columns (ADR-246) until lib/database.types.ts regenerates.
const PRACTICE_TIMER_COLS = 'id, title, duration_min, timer_kind, mindless_mode, movement_config, duration_locked, warmup_message, warmup_sec'

/** Load a member's On Air setup state. `requestedPracticeId` pins + pre-selects a practice (the
 *  Journey "Practice" button, or a /on-air?practice link). The list is never empty — Free sit is
 *  always offered — so the timer is reachable for everyone. */
export async function loadOnAirSessionData(
  profileId: string,
  requestedPracticeId?: string | null,
): Promise<OnAirSessionData> {
  const admin = createAdminClient()
  // "Today" must be the member's LOCAL calendar day (profiles.home_timezone), the SAME day
  // logPractice writes logged_for under — NOT UTC. With UTC, the practice day rolled at UTC
  // midnight (~5pm Pacific), so an evening partial logged earlier the same local day stopped
  // matching and the timer opened fresh instead of resuming. resolveMemberDay fixes the boundary.
  const today = await resolveMemberDay(profileId)
  const [
    legIds,
    mine,
    { data: prof },
    { data: todayLogs },
    { data: presenceRows },
    { data: sitRow },
    { data: moveRow },
  ] = await Promise.all([
      getCurrentLegPracticeIds(profileId),
      getMemberPractices(profileId),
      admin.from('profiles').select('meta').eq('id', profileId).maybeSingle(),
      // Today's logs carry the completion columns (seconds_done/target, completed) so a
      // banked-but-unfinished sit surfaces as a `partialToday` the timer can auto-resume from,
      // not just a `loggedToday` flag. Read through the untyped admin handle (ADR-246) since the
      // completion columns are newer than the generated types.
      admin
        .from('practice_logs')
        .select('practice_id, seconds_done, seconds_target, completed')
        .eq('profile_id', profileId)
        .eq('logged_for', today),
      // Presence: distinct members with a log today. Row-count + Set in JS —
      // PostgREST aggregates are disabled on hosted projects.
      admin.from('practice_logs').select('profile_id').eq('logged_for', today).limit(10000),
      // The Free sit's target practice (the canonical short sit).
      admin.from('practices').select('id, title').eq('slug', DEFAULT_SIT_SLUG).maybeSingle(),
      // The Get Moving Free Practice's target practice (the canonical daily walk).
      admin.from('practices').select('id, title').eq('slug', DEFAULT_MOVE_SLUG).maybeSingle(),
    ])

  type TodayLogRow = {
    practice_id: string | null
    seconds_done: number | null
    seconds_target: number | null
    completed: boolean | null
  }
  const todayRows = (todayLogs ?? []) as TodayLogRow[]
  const loggedToday = new Set(
    todayRows.map((l) => l.practice_id).filter(Boolean) as string[],
  )

  // A partial today = a banked-but-unfinished sit the timer can RESUME (run only the remaining
  // time, report the total). Keyed by practice_id so each practice can attach its own. Per the
  // completion economy: completed=false AND banked < target AND banked > 0 (a zero-banked or
  // already-finished log is not a resume). Last write wins if (rarely) two logs share a practice.
  const partialByPractice = new Map<string, PartialToday>()
  for (const l of todayRows) {
    if (!l.practice_id || l.completed === true) continue
    const bankedSec = Math.max(0, Math.round(l.seconds_done ?? 0))
    const targetSec = Math.max(0, Math.round(l.seconds_target ?? 0))
    if (bankedSec <= 0 || targetSec <= 0 || targetSec - bankedSec <= 0) continue
    partialByPractice.set(l.practice_id, { bankedSec, targetSec })
  }

  // The base list: when enrolled, ONLY the current leg's practices (the things due now); otherwise
  // the member's adopted practices. Free sit rides on top of either.
  let base: PracticeRow[]
  if (legIds.length) {
    const { data: legRows } = await admin.from('practices').select(PRACTICE_TIMER_COLS).in('id', legIds)
    base = (legRows ?? []) as unknown as PracticeRow[]
  } else {
    base = mine.map((p) => ({
      id: p.id,
      title: p.title,
      duration_min: p.duration_min,
      timer_kind: p.timer_kind,
      mindless_mode: p.mindless_mode,
      movement_config: p.movement_config,
      duration_locked: p.duration_locked,
      warmup_message: p.warmup_message,
      warmup_sec: p.warmup_sec,
    }))
  }

  // A practice opened from a Journey step (or a /on-air?practice link) is pinned + selected even if
  // it isn't in the leg/adopted set yet (e.g. a previewing author who hasn't enrolled).
  if (
    requestedPracticeId &&
    requestedPracticeId !== FREE_SIT_ID &&
    !base.some((p) => p.id === requestedPracticeId)
  ) {
    const { data: reqRow } = await admin
      .from('practices')
      .select(PRACTICE_TIMER_COLS)
      .eq('id', requestedPracticeId)
      .maybeSingle()
    const r = reqRow as unknown as PracticeRow | null
    if (r) base = [r, ...base]
  }

  const practices: OnAirPractice[] = base.map((p) => ({
    id: p.id,
    title: p.title,
    loggedToday: loggedToday.has(p.id),
    // The partial-today resume point, when this practice has a banked-but-unfinished sit today.
    // Non-null is what tells each engine to auto-resume (run the remaining time, report the total).
    partialToday: partialByPractice.get(p.id) ?? null,
    durationMin: p.duration_min ?? null,
    timerKind: (p.timer_kind ?? 'mindless') as TimerKind,
    mindlessMode: (p.mindless_mode ?? null) as MindlessMode | null,
    movementConfig: (p.movement_config ?? null) as MovementConfig | null,
    durationLocked: p.duration_locked ?? false,
    warmupMessage: p.warmup_message ?? null,
    warmupSec: p.warmup_sec ?? null,
  }))

  // Free sit — always available so the timer is never blocked; it logs the default sit practice.
  // An OPEN-LENGTH Mindless sit (no durationMin, no locked length). Appended last so a real Journey
  // practice leads the default. timerKind 'mindless' so chooseAndStart runs the timer (never Just Log).
  const sit = sitRow as { id: string; title: string } | null
  if (sit) {
    practices.push({
      id: FREE_SIT_ID,
      // The neutral open-length entry. Labeled "Free Practice" so it reads the same on the
      // Be Still and Get Moving sides of the door (item #4); kept short so it never wraps.
      title: 'Free Practice',
      loggedToday: false,
      // An open-length sit has no target, so it can never be a partial-today resume.
      partialToday: null,
      durationMin: null,
      logsAs: sit.id,
      timerKind: 'mindless',
      mindlessMode: null,
      movementConfig: null,
      durationLocked: false,
      warmupMessage: null,
      warmupSec: null,
    })
  }

  // Free Practice (Get Moving) — the movement counterpart of the Free sit, so a generic Get Moving
  // run banks a MOVEMENT practice (the daily walk) instead of the Be Still sit (item #1). timerKind
  // 'movement' so the Get Moving engine resolves it as its default; open-length (no partial resume).
  const move = moveRow as { id: string; title: string } | null
  if (move) {
    practices.push({
      id: FREE_MOVE_ID,
      title: 'Free Practice',
      loggedToday: false,
      partialToday: null,
      durationMin: null,
      logsAs: move.id,
      timerKind: 'movement',
      mindlessMode: null,
      movementConfig: { mode: 'walk' } as MovementConfig,
      durationLocked: false,
      warmupMessage: null,
      warmupSec: null,
    })
  }

  const practicedToday = new Set(
    ((presenceRows ?? []) as { profile_id: string | null }[])
      .map((l) => l.profile_id)
      .filter(Boolean) as string[],
  ).size

  const meta = (prof?.meta ?? {}) as Record<string, unknown>
  const stored = (meta.onAir ?? {}) as Partial<OnAirPrefs>
  const prefs: OnAirPrefs = {
    mode: stored.mode ?? DEFAULT_PREFS.mode,
    pattern: stored.pattern ?? DEFAULT_PREFS.pattern,
    minutes: stored.minutes ?? DEFAULT_PREFS.minutes,
    customIn: stored.customIn,
    customHold: stored.customHold,
    customOut: stored.customOut,
    bell: stored.bell,
    bellTone: stored.bellTone,
    // Coerce migrates a legacy quiet/medium/loud string pref to the 0..1 slider scale.
    bellVolume: coerceBellVolume(stored.bellVolume),
    endBell: stored.endBell ?? DEFAULT_PREFS.endBell,
    bellEveryMin: stored.bellEveryMin ?? DEFAULT_PREFS.bellEveryMin,
    haptics: stored.haptics,
    ambientTrack: stored.ambientTrack,
    ambientVolume: coerceAmbientVolume(stored.ambientVolume),
    warmupSec: stored.warmupSec ?? DEFAULT_PREFS.warmupSec,
  }

  // What the timer auto-resolves to when it opens. The manual "Select practice" step is GONE
  // (owner directive 2026-07-06): the door resolves ONE thing to run and Start begins it, no picking.
  //
  //  1. A SPECIFIC entry pre-selects THAT practice (a practice page, the streak box, a Journey
  //     step, or a /on-air?practice link — requestedPracticeId), opening in its routed mode.
  //  2. A GENERIC entry (the header Mindless/Movement button, the Zap menu) auto-defaults to the
  //     member's adopted practice DUE TODAY that isn't done yet: the first real (current-leg when
  //     enrolled, else adopted) practice not completed today. A partial counts as "still to do" and
  //     pre-selects so the timer resumes the remaining time. This completes today's assigned
  //     practice with correct duration / type / logging, no picking.
  //  3. Once every adopted practice is done for the day (or there are none), the door defaults to
  //     Free Practice so the member can keep practicing beyond their daily requirement.
  // A practice with a banked-but-unfinished sit today is the FIRST thing the door resolves to —
  // it counts as "still to do" even though it has a log row (loggedToday is true for a partial), so
  // opening the timer picks up this morning's unfinished practice and resumes the remaining time.
  // Then a practice not yet logged at all; Free Practice is the last resort.
  // The shared default targets the Be Still side (a generic open lands there); exclude BOTH synthetic
  // Free Practice chips so it is always a real practice, else the Free sit. The Get Moving engine
  // resolves its own movement default (including the Free Move chip) from the same list.
  const isReal = (p: OnAirPractice) => p.id !== FREE_SIT_ID && p.id !== FREE_MOVE_ID
  const resumableId = practices.find((p) => isReal(p) && p.partialToday)?.id ?? null
  const notLoggedId = practices.find((p) => isReal(p) && !p.loggedToday)?.id ?? null
  const dueTodayId = resumableId ?? notLoggedId
  const defaultPracticeId =
    requestedPracticeId && practices.some((p) => p.id === requestedPracticeId)
      ? requestedPracticeId
      : dueTodayId ?? (sit ? FREE_SIT_ID : practices.find((p) => isReal(p))?.id ?? null)

  return { practices, defaultPracticeId, prefs, practicedToday }
}
