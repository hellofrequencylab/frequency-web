// ── WHO JUST ARRIVED, AND WHO SHOULD SAY HELLO (ADR-1393) ───────────────────────────────────────
//
// The engagement half of the Circle pass. A Circle already told a NEW member to introduce
// themselves (the `justJoined` nudge, 7 days). Nothing told anyone ELSE that they had arrived, so
// every introduction landed in a room where nobody had been given a reason to look. Community
// research is consistent on which half matters: structured onboarding lifts 90-day retention by
// roughly half again, and the lift comes from the welcome being RECEIVED, not from the newcomer
// being told to post.
//
// So one fact, read two ways from the roster the page has already loaded:
//   • to a newcomer  — who else is new, so their first post has an obvious audience.
//   • to everyone in — who to greet, which is the lowest-friction contribution a member can make
//     and the one the "make the middle 60% successful" finding says to ask for.
//
// PURE, so the window and the ordering are unit-testable without a render or a database, and FREE:
// every field it reads is already on the `members` rows `loadCircleShell` returns for the roster.
// No new query, on any Circle.

/** The roster fields the rule reads. Structural, so a `MemberRow` satisfies it as-is. */
export interface ArrivalMember {
  joined_at: string
  profile: { id: string; display_name: string; handle: string; avatar_url: string | null }
}

/** A newcomer, as the strip renders one. */
export interface Arrival {
  id: string
  displayName: string
  handle: string
  avatarUrl: string | null
}

/** How recently someone must have joined to still count as new, in days.
 *
 *  FOURTEEN, not the seven the `justJoined` self-nudge uses, and the two windows are deliberately
 *  different because they answer different questions. Seven days is "are YOU still finding your
 *  feet", which is about the newcomer's own sense of arrival. Fourteen is "is there anyone here I
 *  have not met", which is about the room, and a Circle that meets weekly needs a window wider than
 *  its own cadence or half its newcomers are never visible to anyone on a gathering day. */
export const ARRIVAL_WINDOW_DAYS = 14

/** The most names a greeting strip prints before it counts the rest. Three fits one line on a
 *  phone; past that the strip stops reading as people and starts reading as a list. */
export const ARRIVAL_NAMES_SHOWN = 3

/**
 * Who joined this Circle within the window, most recent first, excluding the viewer.
 *
 * `sinceIso` is passed in rather than computed, so the caller's ONE clock decides the window (the
 * same discipline the circle event floors keep) and a test does not have to travel in time.
 *
 * A row with an unparseable or missing `joined_at` is DROPPED, not admitted: this drives a message
 * that names people out loud, and "Sam just joined" about someone who joined in March is worse than
 * saying nothing at all.
 */
export function newArrivals(
  members: readonly ArrivalMember[],
  sinceIso: string,
  opts: { excludeProfileId?: string | null; limit?: number } = {},
): Arrival[] {
  const since = new Date(sinceIso).getTime()
  if (!Number.isFinite(since)) return []
  const exclude = opts.excludeProfileId ?? null

  return members
    .filter((m) => {
      if (!m?.profile?.id) return false
      if (m.profile.id === exclude) return false
      const at = new Date(m.joined_at).getTime()
      return Number.isFinite(at) && at >= since
    })
    .sort((a, b) => new Date(b.joined_at).getTime() - new Date(a.joined_at).getTime())
    .slice(0, opts.limit ?? ARRIVAL_NAMES_SHOWN)
    .map((m) => ({
      id: m.profile.id,
      displayName: m.profile.display_name,
      handle: m.profile.handle,
      avatarUrl: m.profile.avatar_url,
    }))
}

/**
 * The names, as an English list: "Sam", "Sam and Alex", "Sam, Alex and Jo".
 *
 * `extra` is how many MORE there are beyond the ones named, so a busy Circle reads
 * "Sam, Alex and 4 others" instead of printing eleven names. Kept here rather than in the component
 * because a comma and an "and" in the wrong place is the kind of copy bug that only shows up at one
 * specific roster size, which is exactly the thing a unit test is cheaper than a screenshot for.
 */
export function arrivalNames(arrivals: readonly Arrival[], extra = 0): string {
  const names = arrivals.map((a) => a.displayName.trim()).filter(Boolean)
  if (names.length === 0) return ''

  const tail = extra > 0 ? `${extra} other${extra === 1 ? '' : 's'}` : null
  const parts = tail ? [...names, tail] : names

  if (parts.length === 1) return parts[0]
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}
