// The server-resolved data the Spotlight Puck blocks read at RENDER time, injected
// through `<Render metadata={{ spotlight }} />` (a plain object on Puck's metadata
// channel — the same mechanism the marketing "live" blocks use, see
// components/page-editor/blocks/dynamic.tsx). Keeping these values on metadata,
// never on a block's stored props, is the SECURITY boundary: the Stats numbers and
// the Top Friends grid are resolved server-side from the allowlisted profile row +
// the spotlight_top_friends table, so a tampered `profiles.meta` blob can, at worst,
// choose WHICH stat to surface or rename the grid, never fake a value or a face.
//
// PURE + client-safe: only types + a default. Imported by the client blocks and the
// RSC render bridge alike, so no `server-only` module is ever reachable from <Puck>.

import type { SpotlightStatsContext } from '@/components/spotlight/blocks/render'
import type { TopFriend } from '@/lib/spotlight/top-friends.types'

export interface SpotlightRenderMeta {
  /** Authoritative gamification values a Stats block surfaces (never member-supplied). */
  stats: SpotlightStatsContext
  /** The member's ordered Top Friends, resolved server-side (never member-supplied). */
  topFriends: TopFriend[]
  /** The public-bucket base URL the Image/Gallery blocks derive an asset URL from. */
  publicBase: string
}

/** The shape a block reads off `puck.metadata`. Everything optional so a block on a
 *  page rendered WITHOUT spotlight metadata (e.g. a stray copy in a marketing draft)
 *  degrades to empty rather than throwing. */
export interface SpotlightPuckMetadata {
  spotlight?: SpotlightRenderMeta
}

/** A safe empty context so a block renders nothing (not a crash) when metadata is absent. */
export const EMPTY_SPOTLIGHT_META: SpotlightRenderMeta = {
  stats: { zaps: null, streak: null, gems: null, joinedYear: null, region: null },
  topFriends: [],
  publicBase: '',
}
