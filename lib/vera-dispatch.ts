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
//   * The VOICE is Vera's — P2: AI phrasing over the deterministic payload,
//     budget-gated (aiAvailable + featureOverBudget, the creator-tips pattern)
//     and validated by cleanDispatchCopy; the P1 templates remain the always-on
//     fallback, so the screen never blanks. The cache row shape is unchanged —
//     whatever copy is minted (voiced or template) is what replays forever.

import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import { aiAvailable, featureOverBudget, recordAiUsage } from '@/lib/ai/usage'
import { completeText } from '@/lib/ai/complete'
import { withVoice } from '@/lib/ai/voice'

function db(): SupabaseClient {
  return createAdminClient()
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

// --- the voice layer (P2) ----------------------------------------------------

const FEATURE = 'vera-dispatch'
const MAX_COPY = 180

/** Validate + tidy a voiced line so a model hiccup can never reach a member:
 *  strip wrapping quotes / "Vera:" prefixes, collapse whitespace, swap em dashes
 *  for commas (voice canon), cap length. Returns null when unusable. Pure. */
export function cleanDispatchCopy(raw: string): string | null {
  let s = (raw ?? '').trim()
  s = s.replace(/^(vera|dispatch)\s*[:\-]\s*/i, '')
  s = s.replace(/^["'“‘]+|["'”’]+$/g, '')
  s = s.replace(/\s*—\s*/g, ', ').replace(/\s+/g, ' ').trim()
  if (!s || s.length < 12 || s.length > MAX_COPY) return null
  if (/[\u{1F300}-\u{1FAFF}]/u.test(s)) return null // no emojis in Vera's line
  return s
}

/** Vera phrases the deterministic assignment. Budget-gated; null = use the
 *  template. The facts are handed over verbatim and the model may only rephrase. */
async function voiceCopy(assignment: Assignment, profileId: string): Promise<string | null> {
  try {
    if (!(await aiAvailable())) return null
    if (await featureOverBudget(FEATURE)) return null

    const system = withVoice(
      'You are Vera writing a Dispatch: the one-line next assignment a member sees after finishing a practice session. Rephrase the FACT below in one or two short sentences, 140 characters max. Keep every name and number exactly as given. Add nothing new, no greeting, no sign-off, no questions, no emojis. Direct, warm, brisk, like a trusted operator on the radio. Output only the sentence(s).',
    )
    const res = await completeText({
      system,
      messages: [
        {
          role: 'user',
          content: `Kind: ${assignment.kind}\nFact: ${assignment.copy}`,
        },
      ],
      tier: 'haiku',
      maxTokens: 120,
      cacheSystem: true,
    })
    await recordAiUsage({
      feature: FEATURE,
      model: res.tier,
      usage: res.usage,
      costUsd: res.costUsd,
      profileId,
    })
    return cleanDispatchCopy(res.text)
  } catch {
    return null // the template fallback stands
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
  const voiced = await voiceCopy(assignment, profileId)
  if (voiced) assignment.copy = voiced
  const { error } = await admin.from('vera_dispatches').insert({
    profile_id: profileId,
    day,
    kind: assignment.kind,
    copy: assignment.copy,
    action_href: assignment.actionHref,
    payload: { ...assignment.payload, actionLabel: assignment.actionLabel, voiced: !!voiced },
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
