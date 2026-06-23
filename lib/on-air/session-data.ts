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
import { getMemberPractices, type TimerKind, type MindlessMode } from '@/lib/practices'
import type { MovementConfig } from '@/lib/movement'
import { getCurrentLegPracticeIds } from '@/lib/journeys/current-leg'
import { DEFAULT_PREFS, type OnAirPrefs } from '@/lib/on-air'
import type { OnAirPractice } from '@/components/on-air/session'

/** The synthetic "Free sit" chip id. Selecting it runs the open timer; on completion it logs the
 *  default sit practice (so the one economy path, logPractice, is unchanged). Never a real id. */
export const FREE_SIT_ID = '__free_sit__'

/** The practice a Free sit logs (the canonical short Mind sit). Resolved by slug so swapping it is
 *  data, not code. */
const DEFAULT_SIT_SLUG = 'morning-stillness'

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
}

// The columns every practice row needs so the timer can ROUTE it (timer_kind), open to the right
// Mindless sub-mode / Movement config, and respect a locked duration. Untyped admin handle reads the
// freshly-added columns (ADR-246) until lib/database.types.ts regenerates.
const PRACTICE_TIMER_COLS = 'id, title, duration_min, timer_kind, mindless_mode, movement_config, duration_locked'

/** Load a member's On Air setup state. `requestedPracticeId` pins + pre-selects a practice (the
 *  Journey "Practice" button, or a /on-air?practice link). The list is never empty — Free sit is
 *  always offered — so the timer is reachable for everyone. */
export async function loadOnAirSessionData(
  profileId: string,
  requestedPracticeId?: string | null,
): Promise<OnAirSessionData> {
  const admin = createAdminClient()
  const today = new Date().toISOString().slice(0, 10)
  const [legIds, mine, { data: prof }, { data: todayLogs }, { data: presenceRows }, { data: sitRow }] =
    await Promise.all([
      getCurrentLegPracticeIds(profileId),
      getMemberPractices(profileId),
      admin.from('profiles').select('meta').eq('id', profileId).maybeSingle(),
      admin
        .from('practice_logs')
        .select('practice_id')
        .eq('profile_id', profileId)
        .eq('logged_for', today),
      // Presence: distinct members with a log today. Row-count + Set in JS —
      // PostgREST aggregates are disabled on hosted projects.
      admin.from('practice_logs').select('profile_id').eq('logged_for', today).limit(10000),
      // The Free sit's target practice (the canonical short sit).
      admin.from('practices').select('id, title').eq('slug', DEFAULT_SIT_SLUG).maybeSingle(),
    ])

  const loggedToday = new Set(
    ((todayLogs ?? []) as { practice_id: string | null }[])
      .map((l) => l.practice_id)
      .filter(Boolean) as string[],
  )

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
    durationMin: p.duration_min ?? null,
    timerKind: (p.timer_kind ?? 'mindless') as TimerKind,
    mindlessMode: (p.mindless_mode ?? null) as MindlessMode | null,
    movementConfig: (p.movement_config ?? null) as MovementConfig | null,
    durationLocked: p.duration_locked ?? false,
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
      durationMin: null,
      logsAs: sit.id,
      timerKind: 'mindless',
      mindlessMode: null,
      movementConfig: null,
      durationLocked: false,
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
    bellVolume: stored.bellVolume ?? DEFAULT_PREFS.bellVolume,
    endBell: stored.endBell ?? DEFAULT_PREFS.endBell,
    bellEveryMin: stored.bellEveryMin ?? DEFAULT_PREFS.bellEveryMin,
    haptics: stored.haptics,
  }

  // A SPECIFIC entry pre-selects THAT practice so the setup opens already in its mode: a practice
  // page, the streak box's button, a Journey step, or a /on-air?practice link (requestedPracticeId).
  // A GENERIC entry passes no request (the header Mindless/Movement button, the Zap menu), and there
  // the setup opens NEUTRAL on the Free sit, never a random adopted practice: the member logs
  // anything from here, or selects a practice and the timer jumps to that practice's mode (owner
  // directive 2026-06-21). The first-real-practice fallback only applies when there is no Free sit.
  const defaultPracticeId =
    requestedPracticeId && practices.some((p) => p.id === requestedPracticeId)
      ? requestedPracticeId
      : sit
        ? FREE_SIT_ID
        : practices.find((p) => p.id !== FREE_SIT_ID && !p.loggedToday)?.id ??
          practices.find((p) => p.id !== FREE_SIT_ID)?.id ??
          null

  return { practices, defaultPracticeId, prefs, practicedToday }
}
