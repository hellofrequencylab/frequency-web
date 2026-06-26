// "People you'd click with" for the feed (Resonance Feed Phase 1+3, ADR-414/417). A
// thin composition over the existing suggestion engine (lib/people-suggestions.ts)
// that ALSO honors the hide list (suggestion_hidden) and folds in a QUIET streak
// signal: two people who both keep a daily streak share a discipline, so we surface
// that as a soft reason and a gentle nudge up the list. Real signals only; empty when
// there's nothing genuine to suggest.

import { createAdminClient } from '@/lib/supabase/admin'
import { getPeopleSuggestions, type PersonSuggestion } from '@/lib/people-suggestions'
import { getHiddenSuggestionIds } from './viewer-resonance'
import { getMyMatchPrefs, getMatchPrefsFor } from '@/lib/match/prefs'
import { sunSign, signCompatibility } from '@/lib/astrology/signs'

// Both keep a streak of at least this many days -> a quiet "you both keep a streak"
// match signal (never prominent, per the owner).
const STREAK_SIGNAL_MIN = 3

export interface FeedPersonSuggestion extends PersonSuggestion {
  /** The viewer and this member both keep a meaningful daily streak. */
  bothStreaking: boolean
  /** This member is verified (ADR-418). Null/false until a verification flow ships. */
  verified: boolean
  /** A quiet astrology note when both opted in + have birth dates (ADR-419), else null. */
  astroReason: string | null
}

export async function getFeedPeopleSuggestions(
  viewerProfileId: string,
  limit = 3,
): Promise<FeedPersonSuggestion[]> {
  // Over-fetch a little so the hide filter still leaves a full row.
  const [people, hidden] = await Promise.all([
    getPeopleSuggestions(viewerProfileId, limit + 6),
    getHiddenSuggestionIds(viewerProfileId),
  ])
  const visible = people.filter((p) => !hidden.has(p.id))
  if (visible.length === 0) return []

  // Quiet streak signal + verification: read the viewer's + candidates' streak and
  // verified_at in one go. verified_at is reached untyped until the types regenerate
  // (ADR-246), so this read goes through an untyped `from` handle.
  const admin = createAdminClient() as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        in: (
          col: string,
          vals: string[],
        ) => Promise<{ data: { id: string; current_streak: number | null; verified_at: string | null }[] | null }>
      }
    }
  }
  const ids = [viewerProfileId, ...visible.map((p) => p.id)]
  const { data: streakRows } = await admin.from('profiles').select('id, current_streak, verified_at').in('id', ids)
  const streakById = new Map<string, number>()
  const verifiedById = new Map<string, boolean>()
  for (const r of streakRows ?? []) {
    streakById.set(r.id, r.current_streak ?? 0)
    verifiedById.set(r.id, r.verified_at != null)
  }
  const viewerStreaking = (streakById.get(viewerProfileId) ?? 0) >= STREAK_SIGNAL_MIN

  // Astrology signal (ADR-419): a quiet "your signs click" reason, ONLY when the viewer
  // and the candidate both opted in and both have a birth date. Off entirely otherwise.
  const [viewerPrefs, candidatePrefs] = await Promise.all([
    getMyMatchPrefs(viewerProfileId),
    getMatchPrefsFor(visible.map((p) => p.id)),
  ])
  const viewerSign = viewerPrefs.astrologyOptIn ? sunSign(viewerPrefs.birthData?.date) : null

  const enriched: FeedPersonSuggestion[] = visible.map((p) => {
    let astroReason: string | null = null
    if (viewerSign) {
      const cp = candidatePrefs.get(p.id)
      const candSign = cp?.astrologyOptIn ? sunSign(cp.birthData?.date) : null
      if (candSign) astroReason = signCompatibility(viewerSign, candSign).reason
    }
    return {
      ...p,
      bothStreaking: viewerStreaking && (streakById.get(p.id) ?? 0) >= STREAK_SIGNAL_MIN,
      verified: verifiedById.get(p.id) ?? false,
      astroReason,
    }
  })

  // A stable nudge: shared-discipline + astrology matches edge up, without overturning
  // the strong graph signals (shared circles + mutual connections stay the spine).
  enriched.sort(
    (a, b) =>
      Number(b.bothStreaking) - Number(a.bothStreaking) ||
      Number(!!b.astroReason) - Number(!!a.astroReason),
  )
  return enriched.slice(0, limit)
}

/** Has the viewer acknowledged the meet-safely guidance (ADR-418)? Fail-open (treat a
 *  read error as "not yet", so the gentle note still shows). */
export async function hasAcknowledgedMeetupSafety(viewerProfileId: string): Promise<boolean> {
  try {
    // meetup_safety_ack_at reached untyped until the types regenerate (ADR-246).
    const admin = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (col: string, v: string) => {
            maybeSingle: () => Promise<{ data: { meetup_safety_ack_at: string | null } | null }>
          }
        }
      }
    }
    const { data } = await admin.from('profiles').select('meetup_safety_ack_at').eq('id', viewerProfileId).maybeSingle()
    return data?.meetup_safety_ack_at != null
  } catch {
    return false
  }
}
