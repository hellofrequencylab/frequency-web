// Dispatches from Vera — the next assignment at the end of an On Air session
// (ADR-229, docs/ON-AIR.md). Distinct from broadcast Dispatches (`dispatches`,
// /broadcast): a Vera Dispatch is personal, one per member per day, and CACHED —
// generated once, replayed from the table, never live on revisit.
//
// Two-layer design:
//   * The WHAT is deterministic — resolveAssignment() picks the single
//     highest-leverage next thing from systems that already exist (Journey step
//     due, challenge near completion, weekly rhythm gap, depth mark, default).
//     No AI is needed to be correct.
//   * The VOICE is Vera's — P1 ships tight template copy in the brand voice
//     (camp counselor, plain sentences, no em dashes, never narrate feelings);
//     P2 layers AI phrasing over the same payload with a budget gate and these
//     templates as the fallback. The cache row shape doesn't change.

import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'

function db(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient
}

export interface VeraDispatch {
  day: string
  kind: string
  copy: string
  actionHref: string | null
  actionLabel: string
}

interface Assignment {
  kind: string
  copy: string
  actionHref: string | null
  actionLabel: string
  payload: Record<string, unknown>
}

const todayUTC = () => new Date().toISOString().slice(0, 10)

/** Pick the single highest-leverage next thing. Priority order is deliberate:
 *  the Journey rhythm first (the daily spine), then a challenge within reach,
 *  then the circle rhythm, then the practice depth mark, then the steady default. */
async function resolveAssignment(profileId: string): Promise<Assignment> {
  const admin = db()

  // 1. Next Journey step not yet logged today — the daily spine.
  try {
    const { getActiveJourneyProgress } = await import('@/lib/journey-plans')
    const progress = await getActiveJourneyProgress(profileId)
    for (const p of progress) {
      const next = p.nextItem?.practice
      if (next?.id && next.title) {
        return {
          kind: 'journey_step',
          copy: `Next on ${p.plan.title}: ${next.title}. One log keeps the week on track.`,
          actionHref: `/on-air?practice=${next.id}`,
          actionLabel: 'Queue it up',
          payload: { planId: p.plan.id, practiceId: next.id },
        }
      }
    }
  } catch {
    // journey read is best-effort; fall through
  }

  // 2. A season challenge more than half done — finish what's close.
  try {
    const { data: rows } = await admin
      .from('challenge_progress')
      .select('current, challenge:season_challenges!inner(name, target, is_active)')
      .eq('profile_id', profileId)
      .is('completed_at', null)
    const near = ((rows ?? []) as unknown as {
      current: number
      challenge: { name: string; target: number; is_active: boolean } | null
    }[])
      .filter((r) => r.challenge?.is_active && r.current > 0 && r.current / r.challenge.target >= 0.5)
      .sort((a, b) => b.current / b.challenge!.target - a.current / a.challenge!.target)[0]
    if (near?.challenge) {
      const left = near.challenge.target - near.current
      return {
        kind: 'challenge_close',
        copy: `${near.challenge.name} is ${left} ${left === 1 ? 'step' : 'steps'} from done. Close it out this week.`,
        actionHref: '/crew/challenges',
        actionLabel: 'See the board',
        payload: { left },
      }
    }
  } catch {
    // fall through
  }

  // 3. The circle rhythm — no event attendance this week.
  try {
    const { data: streak } = await admin
      .from('streaks')
      .select('last_activity_at')
      .eq('profile_id', profileId)
      .eq('streak_type', 'attendance')
      .maybeSingle()
    const last = (streak as { last_activity_at: string | null } | null)?.last_activity_at
    const days = last ? (Date.now() - new Date(last).getTime()) / 86_400_000 : Infinity
    if (days > 5) {
      return {
        kind: 'show_up',
        copy: 'The screen part is done. Find one gathering this week and be in the room.',
        actionHref: '/events',
        actionLabel: 'Find a gathering',
        payload: {},
      }
    }
  } catch {
    // fall through
  }

  // 4. A depth mark within reach on their most-practiced thing.
  try {
    const { data: top } = await admin
      .from('practice_streaks')
      .select('lifetime_logs, practice:practices(title)')
      .eq('profile_id', profileId)
      .order('lifetime_logs', { ascending: false })
      .limit(1)
      .maybeSingle()
    const row = top as unknown as { lifetime_logs: number; practice: { title: string } | null } | null
    if (row?.practice?.title) {
      const next = [10, 25, 50, 100].find((m) => m > row.lifetime_logs)
      const left = next ? next - row.lifetime_logs : null
      if (next && left !== null && left <= 5) {
        return {
          kind: 'depth_mark',
          copy: `${left} more ${left === 1 ? 'log' : 'logs'} and ${row.practice.title} hits ${next} Deep. Keep digging.`,
          actionHref: '/on-air',
          actionLabel: 'Go again tomorrow',
          payload: { mark: next, left },
        }
      }
    }
  } catch {
    // fall through
  }

  // 5. The steady default.
  return {
    kind: 'steady',
    copy: 'Same time tomorrow. Bring one practice. The streak does the rest.',
    actionHref: '/on-air',
    actionLabel: 'See you then',
    payload: {},
  }
}

/** Today's Dispatch — generated once per (member, day), then read from the cache
 *  forever (replays never re-generate; the insert losing a race reads the winner). */
export async function getOrCreateDispatch(profileId: string): Promise<VeraDispatch> {
  const admin = db()
  const day = todayUTC()

  const { data: existing } = await admin
    .from('vera_dispatches')
    .select('day, kind, copy, action_href, payload')
    .eq('profile_id', profileId)
    .eq('day', day)
    .maybeSingle()
  if (existing) return fromRow(existing as DispatchRow)

  const assignment = await resolveAssignment(profileId)
  const { error } = await admin.from('vera_dispatches').insert({
    profile_id: profileId,
    day,
    kind: assignment.kind,
    copy: assignment.copy,
    action_href: assignment.actionHref,
    payload: { ...assignment.payload, actionLabel: assignment.actionLabel },
  })
  if (error) {
    // Unique race: someone else generated it this instant — read the winner.
    const { data: winner } = await admin
      .from('vera_dispatches')
      .select('day, kind, copy, action_href, payload')
      .eq('profile_id', profileId)
      .eq('day', day)
      .maybeSingle()
    if (winner) return fromRow(winner as DispatchRow)
  }
  return {
    day,
    kind: assignment.kind,
    copy: assignment.copy,
    actionHref: assignment.actionHref,
    actionLabel: assignment.actionLabel,
  }
}

interface DispatchRow {
  day: string
  kind: string
  copy: string
  action_href: string | null
  payload: { actionLabel?: string } | null
}

function fromRow(r: DispatchRow): VeraDispatch {
  return {
    day: r.day,
    kind: r.kind,
    copy: r.copy,
    actionHref: r.action_href,
    actionLabel: r.payload?.actionLabel ?? 'Open',
  }
}

/** Past Dispatches, newest first — the scroll-back archive (no live Vera). */
export async function listDispatches(profileId: string, limit = 14): Promise<VeraDispatch[]> {
  const { data } = await db()
    .from('vera_dispatches')
    .select('day, kind, copy, action_href, payload')
    .eq('profile_id', profileId)
    .order('day', { ascending: false })
    .limit(limit)
  return ((data ?? []) as DispatchRow[]).map(fromRow)
}
