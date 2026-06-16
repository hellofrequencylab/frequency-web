// The auto-fire read for the Quest finish / rank-up / season-complete celebration.
//
// The Quest hub greets a member with the HeroMoment exactly once per finished
// Journey, on their next visit after the completion lands. The trigger is a
// comparison: the member's most recent `journey_completions` row this season
// versus a seen-marker kept in `profiles.meta.lastSeenJourneyCompletionId` (the
// same per-user jsonb settings store the streak pause + leaderboard opt-out
// already use, so no migration). A newer completion than the marker = an unseen
// finish to celebrate. The marker is written by a server action when the member
// sees it, so the moment fires once and then rests. Server-only (admin client).
//
// Master is the season's apex (the 3rd Journey finished). When this unseen finish
// lands the member ON Master, the read flags `seasonComplete` and resolves the
// "what's next" pointer (the upcoming season's name/date when one is scheduled,
// else a plain "the next Quest opens soon"). The hub uses that to fire the bigger,
// distinct season-complete moment that re-lights the next goal, instead of just
// another rank-up. Reusing the same seen-marker path so it still shows once.

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentSeason, getUpcomingSeason } from '@/lib/seasons'
import { rankForCompletion, type SeasonRank } from '@/lib/season-ranks'

const SEEN_MARKER_KEY = 'lastSeenJourneyCompletionId'

/** The "what comes next" pointer the season-complete beat re-lights the goal with. */
export interface NextSeasonPointer {
  /** The upcoming season's name when one is scheduled (e.g. "Bloom"), else null. */
  name: string | null
  /** Its start date (ISO) when known, else null. */
  startsAt: string | null
}

/** The celebration the hub should fire — everything the HeroMoment needs. */
export interface UnseenCompletion {
  /** The `journey_completions` row id — the token the mark-seen action records. */
  completionId: string
  /** The Journey just finished, named for the celebration. */
  journeyTitle: string
  /** The rank the member now holds after this finish. */
  rank: SeasonRank
  /** True when this finish moved the member up a rung (shows the new-rank line). */
  rankAdvanced: boolean
  /** True when this finish lands the member on Master — the season's apex. The hub
   *  fires the distinct season-complete moment, not just another rank-up. */
  seasonComplete: boolean
  /** Where the season ends: the next Quest, named/dated when scheduled. Only resolved
   *  for the seasonComplete case (null otherwise — the regular finish doesn't need it). */
  next: NextSeasonPointer | null
}

/**
 * Read the member's most recent UNSEEN Journey completion this season, or null
 * when there's nothing new to celebrate (no completion, or the latest one is
 * already marked seen). Best-effort: any read error degrades to null so the
 * hub never breaks on a celebration miss.
 *
 * Rank-advanced is derived from the completion count: finishing the Nth Journey
 * advances a rung whenever rankForCompletion(N) outranks rankForCompletion(N-1).
 * Reaching Master (the 3rd finish) also flags `seasonComplete` and resolves the
 * next-season pointer that re-lights the goal.
 */
export async function readUnseenCompletion(profileId: string): Promise<UnseenCompletion | null> {
  try {
    const season = await getCurrentSeason()
    if (!season) return null

    const admin = createAdminClient()

    // The seen-marker lives in profiles.meta; read it alongside nothing else.
    const { data: prof } = await admin
      .from('profiles')
      .select('meta')
      .eq('id', profileId)
      .maybeSingle()
    const meta = ((prof as { meta: Record<string, unknown> | null } | null)?.meta ?? {}) as Record<string, unknown>
    const lastSeenId = typeof meta[SEEN_MARKER_KEY] === 'string' ? (meta[SEEN_MARKER_KEY] as string) : null

    // This season's completions, newest first. The newest is the candidate; the
    // total count drives the rank + whether this finish advanced a rung.
    const { data: rows } = await admin
      .from('journey_completions')
      .select('id, journey_id, completed_at')
      .eq('profile_id', profileId)
      .eq('season', season.season_number)
      .order('completed_at', { ascending: false })
    const completions = (rows ?? []) as { id: string; journey_id: string; completed_at: string }[]
    if (completions.length === 0) return null

    const latest = completions[0]!
    if (latest.id === lastSeenId) return null // already celebrated this finish

    const finishedCount = completions.length
    const rank = rankForCompletion(finishedCount)
    const rankAdvanced = rank !== rankForCompletion(finishedCount - 1)
    // The season's apex: this unseen finish lands the member on Master AND it's the
    // finish that got them there (so it reads as the season-complete beat, once).
    const seasonComplete = rank === 'master' && rankAdvanced

    // Name the Journey just finished. Best-effort — fall back to a plain noun.
    const { data: plan } = await admin
      .from('journey_plans')
      .select('title')
      .eq('id', latest.journey_id)
      .maybeSingle()
    const journeyTitle = (plan as { title: string } | null)?.title ?? 'your Journey'

    // The "what's next" pointer only matters for the season-complete beat — resolve it
    // there so the regular finish stays a single light read.
    let next: NextSeasonPointer | null = null
    if (seasonComplete) {
      const upcoming = await getUpcomingSeason()
      next = { name: upcoming?.name ?? null, startsAt: upcoming?.starts_at ?? null }
    }

    return { completionId: latest.id, journeyTitle, rank, rankAdvanced, seasonComplete, next }
  } catch {
    return null
  }
}

/**
 * Record that the member has seen the celebration for `completionId`, writing the
 * marker into profiles.meta.lastSeenJourneyCompletionId so it never fires again.
 * Read-modify-write of the whole meta blob so sibling keys (streak, opt-out) are
 * never clobbered. Service-role path: profileId always comes from the session at
 * the call site, never the client. Best-effort.
 */
export async function recordCompletionSeen(profileId: string, completionId: string): Promise<void> {
  const admin = createAdminClient()
  const { data: prof } = await admin
    .from('profiles')
    .select('meta')
    .eq('id', profileId)
    .maybeSingle()
  const meta = ((prof as { meta: Record<string, unknown> | null } | null)?.meta ?? {}) as Record<string, unknown>
  const nextMeta = { ...meta, [SEEN_MARKER_KEY]: completionId }
  await admin.from('profiles').update({ meta: nextMeta }).eq('id', profileId)
}
