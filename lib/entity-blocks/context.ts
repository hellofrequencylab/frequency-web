import { ENTITY_BLOCKS, blocksForKind, type EntityKind } from './registry'

// The render abstraction for the unified block system (ADR-508, U1b). Generalizes S2's
// SpaceProfileContext so the SAME block + the same grid editor (U2) work for a member (Spotlight) or a
// space (Spaces). PURE (types + data), additive: the live renders are untouched until U3.
//
// A block reads TWO things: the entity's IDENTITY (name/logo/cover/tagline — the common header a block
// may reference) and, for a DATA block, the kind-appropriate data bag resolved by the caller (space →
// getSpaceContentData; member → the Spotlight readers). U1b defines the identity + the per-kind fresh
// default layout; the data adapters land with the U2 renderer.

/** The common identity every entity profile has, kind-discriminated. Built by a per-kind adapter
 *  (a space from its row, a member from their profile). Values are already resolved (never blank name). */
export interface EntityIdentity {
  kind: EntityKind
  /** Stable id (space id / member profile id). */
  id: string
  /** URL slug (space slug / member handle). */
  slug: string
  /** Brand/display name, already resolved, never blank. */
  displayName: string
  logoUrl: string | null
  coverUrl: string | null
  /** One-line tagline (space tagline / member bio line), or null. */
  tagline: string | null
}

// The member (Spotlight) fresh default: identity-led and content-forward (a member authors their page),
// with the two shared DATA blocks up top. Space defaults are resolved by lib/spaces/profile-modules
// resolveProfileLayout (function-gated). Only ids that support 'member' and exist in the registry.
const MEMBER_DEFAULT_ORDER: readonly string[] = ['about', 'stats', 'links', 'topfriends']

/** The fresh-default ordered block ids for a MEMBER profile (Spotlight), before any editor
 *  customization. Filtered to blocks that actually support the member kind, in the given order,
 *  then any remaining member-supporting blocks appended in registry order (so a new member block
 *  appears without editing this list). */
export function defaultMemberLayout(): string[] {
  const memberIds = new Set(blocksForKind('member').map((b) => b.id))
  const ordered = MEMBER_DEFAULT_ORDER.filter((id) => memberIds.has(id))
  const seen = new Set(ordered)
  for (const b of ENTITY_BLOCKS) {
    if (b.kinds.includes('member') && !seen.has(b.id)) {
      ordered.push(b.id)
      seen.add(b.id)
    }
  }
  return ordered
}
