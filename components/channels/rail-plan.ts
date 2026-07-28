// The Channel scope rail's PURE decisions — which modules the rail carries on a given tab, and
// how the activity pulse turns raw counts into tiles. Kept free of React/Supabase so both rules
// are unit-testable (rail-plan.test.ts) and the rail component stays presentation only.
//
// Pairs with components/channels/channel-rail.tsx (the rendering) and
// lib/layout/page-chrome.ts (which suppresses the GLOBAL rail on this route so the two never
// stack). See docs/PAGE-FRAMEWORK.md §3 Template C: a Detail page's rail is scope-aware.

/** The Channel detail page's segmented body (`?tab=`). Mirrors the page's own union. */
export type ChannelTab = 'home' | 'feed' | 'groups' | 'about'

/** The rail modules, in render order. */
export type ChannelRailModuleId = 'activity' | 'upcoming' | 'groups'

const ALL: readonly ChannelRailModuleId[] = ['activity', 'upcoming', 'groups']

/** Which rail modules a tab carries. The rail is otherwise persistent across tabs (one spatial
 *  logic, learned once): the only exception is the Circles/Chapters directory tab, where the body
 *  IS the full directory, so repeating a short list of the same Circles beside it is noise. */
export function channelRailModules(tab: ChannelTab): ChannelRailModuleId[] {
  return ALL.filter((id) => !(id === 'groups' && tab === 'groups'))
}

/** The raw counts the pulse reads (the shape `loadChannelHomeStats` returns). */
export interface ChannelPulseInput {
  tunedIn: number
  circleCount: number
  postCount: number
  /** Messages in the Channel's open room over the last 7 days; null = the Channel has no room. */
  roomMessages7d: number | null
}

/** One tile in the pulse grid. `icon` is a key the component maps to a Lucide glyph, so this
 *  module stays free of React imports. */
export interface ChannelPulseTile {
  key: 'tuned-in' | 'groups' | 'posts' | 'room'
  label: string
  value: number
  icon: 'users' | 'circle' | 'message' | 'hash'
}

/** The activity pulse as tiles. Zero is a real, calm answer here (a new Channel reads 1 / 1 / 0),
 *  so tiles are never dropped for being zero. The room tile is dropped only when the Channel has
 *  no open room at all, because there is then no such thing to count. */
export function channelPulseTiles(
  stats: ChannelPulseInput,
  groupNounPlural: string,
): ChannelPulseTile[] {
  const tiles: ChannelPulseTile[] = [
    { key: 'tuned-in', label: 'Tuned in', value: stats.tunedIn, icon: 'users' },
    { key: 'groups', label: groupNounPlural, value: stats.circleCount, icon: 'circle' },
    { key: 'posts', label: 'Forum posts', value: stats.postCount, icon: 'message' },
  ]
  if (stats.roomMessages7d != null) {
    tiles.push({ key: 'room', label: 'Room this week', value: stats.roomMessages7d, icon: 'hash' })
  }
  return tiles
}

/** True when nothing has happened here yet: no posts and no room traffic. The pulse adds one
 *  quiet orienting line in that case instead of leaving four zeros to speak for themselves. */
export function isChannelPulseQuiet(stats: ChannelPulseInput): boolean {
  return stats.postCount === 0 && (stats.roomMessages7d ?? 0) === 0
}
