'use server'

// On Air session completion (ADR-229). One action gathers the whole reveal:
// record the sit → log the practice through the EXISTING engine (same
// idempotency, zaps, bonuses, streaks — On Air is a stage, not a second
// economy) → read the post-log state → today's Dispatch from Vera.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { logPractice } from '@/lib/practices'
import { getPracticeStreak } from '@/lib/practice-streak'
import { amplitudeLevel } from '@/lib/amplitude'
import { getOrCreateDispatch } from '@/lib/vera-dispatch'
import { loadOnAirSessionData, type OnAirSessionData } from '@/lib/on-air/session-data'
import type { OnAirPrefs, RevealPayload, SessionMode } from '@/lib/on-air'

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
}

export async function completeSession(
  input: CompleteSessionInput,
): Promise<ActionResult<RevealPayload>> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Not signed in')

  const admin = db()
  const seconds = Math.max(0, Math.min(4 * 60 * 60, Math.round(input.seconds)))

  // 1. The sit itself (history + minutes stats). Errors never block the log.
  await admin.from('practice_sessions').insert({
    profile_id: profileId,
    practice_id: input.practiceId,
    mode: input.mode,
    pattern: input.mode === 'breath' ? input.pattern : null,
    seconds,
    started_at: input.startedAt,
  })

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
    }
    await admin
      .from('profiles')
      .update({ meta: { ...meta, onAir: prefs, onAirTotalSeconds: totalSeconds } })
      .eq('id', profileId)
  } catch {
    // prefs + counter are a nicety, never a blocker
  }

  // 2. The log — the one and only economy entry point.
  const log = await logPractice({
    profileId,
    practiceId: input.practiceId,
    circleId: input.circleId ?? null,
  })

  // 3. Post-log state for the reveal. Today's airtime is a handful of rows;
  //    summed in JS (PostgREST aggregates are disabled on hosted projects).
  const [practiceRow, streak, profRow, depthRow, todayRows] = await Promise.all([
    admin.from('practices').select('title').eq('id', input.practiceId).maybeSingle(),
    getPracticeStreak(profileId),
    admin.from('profiles').select('amplitude').eq('id', profileId).maybeSingle(),
    admin
      .from('practice_streaks')
      .select('lifetime_logs')
      .eq('profile_id', profileId)
      .eq('practice_id', input.practiceId)
      .maybeSingle(),
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
  const lifetimeLogs = Number(
    (depthRow.data as { lifetime_logs: number | null } | null)?.lifetime_logs ?? 0,
  )
  const amplitude = Number((profRow.data as { amplitude: number | null } | null)?.amplitude ?? 0)

  // 4. Today's Dispatch from Vera — generated once, cached, replayed forever.
  let dispatch: RevealPayload['dispatch'] = {
    copy: 'Same time tomorrow. Bring one practice. The streak does the rest.',
    actionHref: '/on-air',
    actionLabel: 'See you then',
  }
  try {
    const d = await getOrCreateDispatch(profileId)
    dispatch = { copy: d.copy, actionHref: d.actionHref, actionLabel: d.actionLabel }
  } catch {
    // the template default above stands
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
