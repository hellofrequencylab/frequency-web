import type { EntityIdentity } from './context'
import type { SpotlightData } from '@/lib/spotlight/data'
import type { SpotlightStatsContext } from '@/components/spotlight/blocks/render'
import type { TopFriend } from '@/lib/spotlight/top-friends.types'
import {
  SPOTLIGHT_STAT_KEYS,
  type BlockType,
  type LinkItem,
  type SpotlightBlock,
  type SpotlightStatKey,
} from '@/lib/spotlight/blocks/schema'

// The MEMBER (Spotlight) side of the unified entity-block adapter (ADR-508, U2a). Mirrors the SPACE
// adapter (lib/spaces/profile-modules toProfileContext) so the SAME registry + module renderer drive a
// member profile. PURE (types + a data transform, no React / Next / Supabase IO): it takes the already
// resolved SpotlightData (from getPublishedSpotlight, the ONE reader — never a new query) and derives
//   1. the common EntityIdentity every profile header reads, and
//   2. a per-block DATA bag, keyed so each member block component reads ONLY its slice.
// Being pure, it is trivially unit-testable and safe to import from an RSC render or the pure lib alike.
//
// The Spotlight layout is AUTHORED (a member arranges many block instances), whereas the unified
// registry layout is keyed by block TYPE. So the DATA blocks (about/stats/links/topfriends) resolve
// from the member's resolved data, and the authored CONTENT blocks are grouped by type here — the
// per-instance authoring order is the editor's concern (U2b), not this type-keyed preview.

/** The subset of a member's Spotlight each block component reads, keyed by block. Kept React-free so
 *  every block imports the SAME shape and the pure resolver + its test share it. Built from a resolved
 *  SpotlightData by `resolveMemberBlockData`. */
export interface MemberBlockData {
  /** The About body (the member's bio), or null when they have none. */
  about: string | null
  /** Authoritative gamification values (resolved server-side, never member-supplied) for `stats`. */
  stats: SpotlightStatsContext
  /** Which stat keys to surface, in order: the union chosen across the member's authored stats blocks,
   *  else every key (the resolver below shows whatever data actually exists). */
  statKeys: SpotlightStatKey[]
  /** The bio-link rows, flattened from every authored `links` block in layout order. */
  links: LinkItem[]
  /** The member's ordered Top Friends, resolved server-side (never member-supplied). */
  topFriends: TopFriend[]
  /** The optional Top Friends grid heading (first authored `topfriends` block's title), or undefined. */
  topFriendsTitle?: string
  /** Every authored block grouped by its type, in layout order. Content blocks (heading/text/image/
   *  gallery/quote/embed/divider) render from their slice; the data-block slices are unused (their
   *  values come from the fields above), but present so the map is total. */
  blocksByType: Record<BlockType, SpotlightBlock[]>
}

/** The props every member block component receives (parity with the space block signature
 *  `{ space, data }`). `member` is the common identity; `data` is the keyed block bag. */
export interface MemberBlockProps {
  member: EntityIdentity
  data: MemberBlockData
}

/** Build the common EntityIdentity for a member from their resolved Spotlight. Values are already
 *  resolved (never a blank name: falls back to `@handle`). Mirrors `toProfileContext` for a space. */
export function toMemberEntity(data: SpotlightData): EntityIdentity {
  const p = data.profile
  return {
    kind: 'member',
    id: p.id,
    slug: p.handle,
    displayName: p.display_name?.trim() || `@${p.handle}`,
    logoUrl: p.avatar_url,
    coverUrl: p.header_image_url,
    tagline: p.bio ?? null,
  }
}

/** An empty per-type map so every BlockType key is present (a total record). */
function emptyBlocksByType(): Record<BlockType, SpotlightBlock[]> {
  return {
    heading: [], text: [], links: [], image: [], gallery: [],
    quote: [], stats: [], topfriends: [], embed: [], divider: [],
  }
}

/**
 * Resolve the per-block DATA bag from a member's Spotlight. PURE: groups the authored blocks by type,
 * flattens the bio-link rows, unions the chosen stat keys (falling back to every key so the preview
 * surfaces whatever numbers exist), and lifts the authoritative stat values + Top Friends the reader
 * already resolved. Never carries a member-supplied stat number or friend identity.
 */
export function resolveMemberBlockData(data: SpotlightData): MemberBlockData {
  const { profile, totalZaps, topFriends } = data

  const blocksByType = emptyBlocksByType()
  for (const block of data.layout.blocks) {
    blocksByType[block.type].push(block)
  }

  // Bio-link rows: every authored `links` block, flattened in layout order.
  const links: LinkItem[] = blocksByType.links.flatMap((b) => (b.type === 'links' ? b.items : []))

  // Stat keys: the union chosen across authored `stats` blocks (in first-seen order); else every key,
  // since the stat view already hides any key without a value.
  const chosen: SpotlightStatKey[] = []
  const seen = new Set<SpotlightStatKey>()
  for (const b of blocksByType.stats) {
    if (b.type !== 'stats') continue
    for (const key of b.show) {
      if (!seen.has(key)) {
        seen.add(key)
        chosen.push(key)
      }
    }
  }
  const statKeys = chosen.length > 0 ? chosen : [...SPOTLIGHT_STAT_KEYS]

  // The first authored Top Friends grid heading, if any.
  const firstTopFriends = blocksByType.topfriends.find((b) => b.type === 'topfriends')
  const topFriendsTitle = firstTopFriends?.type === 'topfriends' ? firstTopFriends.title : undefined

  return {
    about: profile.bio ?? null,
    stats: {
      zaps: totalZaps,
      streak: profile.current_streak,
      gems: profile.lifetime_gems,
      joinedYear: profile.created_at ? new Date(profile.created_at).getFullYear() : null,
      region: profile.nexus_regions?.name ?? null,
    },
    statKeys,
    links,
    topFriends,
    topFriendsTitle,
    blocksByType,
  }
}
