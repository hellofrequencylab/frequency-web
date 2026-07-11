// LONE-WOLF -> LOCAL-HOST graduation prompts (Beta P2 "Wolf-to-host prompts") — the
// server-side core deciding whether a solo member sees ONE calm nudge to start a
// Circle, host an Event, or gather locally. Server-only (service-role admin client).
//
// Two prompts, resolved in priority order by resolveHostPrompt:
//   1. rank      the celebratory "you're ready" moment. Shown once a member reaches
//                the host-ready season rank (HOST_PROMPT_MIN_RANK, default Initiate =
//                one finished Journey this season). This is the high-moment ask.
//   2. near_you  the "a few people near you are into this" ignition. Shown when the
//                member's metro has ~2-3 OTHER members logging the same Practice
//                (lib/growth/nearby-practice.ts).
//
// CALM, NOT NAGGY (owner directive): every (member, kind) prompt lives in the
// beta_host_prompts seen-state store. It goes quiet the moment the member dismisses
// it, and it self-quiets after a small number of surfaces (HOST_PROMPT_SEEN_CAP) so
// it never repeats forever. The whole surface is inert until an operator flips
// platform_flags.beta_host_prompts (betaHostPromptsFlag).
//
// FAIL-SAFE THROUGHOUT: any read error resolves to "show nothing" (a naggy repeat on
// a DB hiccup is worse than a missed nudge), and every seen-state write is
// best-effort so it never blocks the feed. Because the seen-state table ships
// unapplied (migration 20261124000000), the store is reached with untyped casts
// (ADR-246) and a missing table simply reads as "already seen".

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { betaHostPromptsFlag } from '@/lib/platform-flags'
import { rankIndex, type SeasonRank } from '@/lib/season-ranks'
import { nearbyPracticeSignal } from '@/lib/growth/nearby-practice'

function db(): SupabaseClient {
  return createAdminClient()
}

export type HostPromptKind = 'rank' | 'near_you'

/** The season rank a member must reach before the rank-gated host prompt appears.
 *  Initiate = one finished Journey this season (lib/season-ranks). One completed
 *  Journey is enough proof of value that the ask lands warm, not cold, so the
 *  celebratory "you're ready" moment fires at the FIRST graduation rung. Bump this to
 *  'adept' to hold the prompt for a second finished Journey. */
export const HOST_PROMPT_MIN_RANK: SeasonRank = 'initiate'

/** How many times a single (member, kind) prompt may surface before it goes quiet on
 *  its own (dismissal quiets it sooner). A few gentle appearances, then silence — the
 *  prompt never repeats forever. */
export const HOST_PROMPT_SEEN_CAP = 3

/** The resolved prompt the feed card renders. `nearBy` is present only for near_you. */
export interface HostPrompt {
  kind: HostPromptKind
  /** Headline. Plain, proper-noun-carried, never narrates the reader's feelings. */
  title: string
  /** One or two plain sentences leading into the two create CTAs. */
  body: string
  /** near_you only: the shared interest + how many OTHER members near them share it. */
  nearBy?: { practiceLabel: string; count: number }
}

interface HostPromptStateRow {
  kind: string
  seen_count: number | null
  dismissed_at: string | null
}

interface KindState {
  seenCount: number
  dismissed: boolean
}

/** Load a member's seen-state, keyed by kind. Fail-safe: any read error (including the
 *  table not being applied yet) reads as "every kind already seen and dismissed", so a
 *  DB hiccup never turns into a repeating nag. */
async function loadState(profileId: string): Promise<Map<HostPromptKind, KindState>> {
  const state = new Map<HostPromptKind, KindState>()
  try {
    const { data } = await db()
      .from('beta_host_prompts')
      .select('kind, seen_count, dismissed_at')
      .eq('profile_id', profileId)
    for (const row of (data ?? []) as HostPromptStateRow[]) {
      state.set(row.kind as HostPromptKind, {
        seenCount: row.seen_count ?? 0,
        dismissed: row.dismissed_at != null,
      })
    }
    return state
  } catch {
    state.set('rank', { seenCount: HOST_PROMPT_SEEN_CAP, dismissed: true })
    state.set('near_you', { seenCount: HOST_PROMPT_SEEN_CAP, dismissed: true })
    return state
  }
}

/** Is this kind still allowed to surface — not dismissed and under the seen cap? */
function eligible(state: Map<HostPromptKind, KindState>, kind: HostPromptKind): boolean {
  const s = state.get(kind)
  if (!s) return true // never surfaced yet
  return !s.dismissed && s.seenCount < HOST_PROMPT_SEEN_CAP
}

/** The member's stored current season rank (profiles.current_season_rank — the same
 *  value digest + achievements read). Defaults to 'ghost' on any miss. */
async function currentSeasonRank(profileId: string): Promise<SeasonRank> {
  try {
    const { data } = await createAdminClient()
      .from('profiles')
      .select('current_season_rank')
      .eq('id', profileId)
      .maybeSingle()
    return ((data?.current_season_rank as SeasonRank | null) ?? 'ghost')
  } catch {
    return 'ghost'
  }
}

/** Record that a prompt surfaced (increment its seen meter). Best-effort + non-blocking:
 *  the feed never waits on it, and a failure just means the meter does not advance. */
export async function recordHostPromptSeen(profileId: string, kind: HostPromptKind): Promise<void> {
  try {
    const client = db()
    const { data } = await client
      .from('beta_host_prompts')
      .select('seen_count')
      .eq('profile_id', profileId)
      .eq('kind', kind)
      .maybeSingle()
    const seen = (((data as { seen_count?: number | null } | null)?.seen_count) ?? 0) + 1
    await client
      .from('beta_host_prompts')
      .upsert(
        { profile_id: profileId, kind, seen_count: seen, last_seen_at: new Date().toISOString() },
        { onConflict: 'profile_id,kind' },
      )
  } catch {
    // Seen-state is best-effort; a failed meter write must never break the feed.
  }
}

/** Copy for each prompt. Voice canon (CONTENT-VOICE §10): plain sentences, proper nouns
 *  carry the magic, never narrate the reader's feelings, no em dashes. */
function rankPrompt(): HostPrompt {
  return {
    kind: 'rank',
    title: 'You are ready to start a Circle',
    body: 'You finished a Journey, so you know how this works. Start a Circle and a handful of people get a place to show up. Host an Event and gather everyone at once.',
  }
}

function nearYouPrompt(practiceLabel: string, count: number): HostPrompt {
  return {
    kind: 'near_you',
    title: `A few people near you are into ${practiceLabel}`,
    body: `${count} members in your area log ${practiceLabel} too. Start a Circle and give them one place to land, or host an Event and bring them together.`,
    nearBy: { practiceLabel, count },
  }
}

/**
 * The one decision the feed card asks for: which host prompt (if any) to show this
 * member right now. Returns null when the flag is off, nothing is eligible, or the
 * member has not earned a prompt yet.
 *
 * Priority: the rank-gated graduation moment wins over the near-you ignition, so a
 * member who just crossed the host-ready rank sees the celebratory ask first. Only one
 * prompt ever surfaces per resolve, and surfacing it advances its seen meter
 * (best-effort) so it steps toward going quiet on its own.
 */
export async function resolveHostPrompt(profileId: string): Promise<HostPrompt | null> {
  if (!(await betaHostPromptsFlag())) return null // inert until an operator turns it on

  const state = await loadState(profileId)

  // 1. Rank-gated host prompt — the high-moment graduation ask.
  if (eligible(state, 'rank')) {
    const rank = await currentSeasonRank(profileId)
    if (rankIndex(rank) >= rankIndex(HOST_PROMPT_MIN_RANK)) {
      void recordHostPromptSeen(profileId, 'rank')
      return rankPrompt()
    }
  }

  // 2. Near-you ignition — only when the rank prompt is not the one showing.
  if (eligible(state, 'near_you')) {
    const near = await nearbyPracticeSignal(profileId)
    if (near) {
      void recordHostPromptSeen(profileId, 'near_you')
      return nearYouPrompt(near.practiceLabel, near.count)
    }
  }

  return null
}
