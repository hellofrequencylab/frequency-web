// On Air — the session data loader (ADR-229, docs/ON-AIR.md). Shared by the
// route page (app/(main)/on-air/page.tsx) and the global Mindless overlay's
// server action (app/(main)/on-air/actions.ts), so both assemble the SAME
// member-state in one place: adopted practices + today's logs, remembered
// setup prefs, and today's presence count.
//
// Pure data assembly — no economy here (a session ends through the existing
// completeSession action). Lives in lib/ (not the page) so the overlay can
// reuse it without importing route code.

import { createAdminClient } from '@/lib/supabase/admin'
import { getMemberPractices } from '@/lib/practices'
import { DEFAULT_PREFS, type OnAirPrefs } from '@/lib/on-air'
import type { OnAirPractice } from '@/components/on-air/session'

/** Everything OnAirSession needs to render the setup screen for a member. */
export interface OnAirSessionData {
  practices: OnAirPractice[]
  defaultPracticeId: string | null
  prefs: OnAirPrefs
  /** Distinct members with a practice log today (presence line, shown at >=3). */
  practicedToday: number
}

/** Load a member's On Air setup state. `requestedPracticeId` pre-selects a
 *  practice when it's one the member has adopted; otherwise the first practice
 *  not yet logged today leads. Returns the practices empty when the member has
 *  adopted none — the caller renders the "adopt a practice first" empty state. */
export async function loadOnAirSessionData(
  profileId: string,
  requestedPracticeId?: string | null,
): Promise<OnAirSessionData> {
  const admin = createAdminClient()
  const today = new Date().toISOString().slice(0, 10)
  const [mine, { data: prof }, { data: todayLogs }, { data: presenceRows }] = await Promise.all([
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
  ])

  const loggedToday = new Set(
    ((todayLogs ?? []) as { practice_id: string | null }[])
      .map((l) => l.practice_id)
      .filter(Boolean) as string[],
  )
  const practices: OnAirPractice[] = mine.map((p) => ({
    id: p.id,
    title: p.title,
    loggedToday: loggedToday.has(p.id),
  }))

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
    haptics: stored.haptics,
  }

  const defaultPracticeId =
    requestedPracticeId && practices.some((p) => p.id === requestedPracticeId)
      ? requestedPracticeId
      : practices.find((p) => !p.loggedToday)?.id ?? null

  return { practices, defaultPracticeId, prefs, practicedToday }
}
