import type { CircleCardData } from '@/components/circles/circle-card'
import type { SpaceCircleItem } from '@/lib/spaces/content-data'

// The Space-profile Circles block's adapter onto the SHARED circle card.
//
// `CircleCardData` (components/circles/circle-card.tsx) is the single definition of what a circle
// card shows, and three surfaces now feed it: the /circles index, the Space's public Circles tab,
// and this block. Each has its own row shape, so each needs an adapter; what they must NOT have is
// their own idea of what a card IS. Keeping this one in its own pure module (no React, no server
// imports — both imports are `import type` and erase at compile time) is what lets it be tested
// directly, which the block itself cannot be: the block's grid is an async Server Component and
// jsdom cannot render one.
//
// PURE + total: every field is either carried or defaulted, so a sparse row can never throw.

/** One `SpaceCircleItem` as the shared card wants it. */
export function spaceCircleToCardData(c: SpaceCircleItem): CircleCardData {
  return {
    id: c.id,
    name: c.name,
    slug: c.slug,
    about: c.about,
    type: c.type,
    member_count: c.memberCount,
    member_cap: c.memberCap,
    status: c.status,
    // The place line. NULL for an online circle on purpose: the card prints "Online" by itself, and
    // a neighbourhood on a circle that does not meet anywhere is a claim the data does not support.
    context: c.type === 'online' ? null : c.neighborhood,
    imageUrl: c.imageUrl,
    // AXIS 2 (ADR-1015). Carried so a LISTED CLOSED circle gets a link to its own page instead of a
    // Join button that `canJoinCircle` would refuse. Dropping this is what makes a card lie.
    access: c.access,
  }
}
