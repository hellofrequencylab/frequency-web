import { type CommunityRole } from '@/lib/community-roles'

// Shared types for the circle DETAIL page and its layout modules. Extracted so the page,
// the request-scoped context (active-circle.ts), and every circle module read one shape.

export type CircleDetail = {
  id: string
  name: string
  slug: string
  about: string | null
  image_url: string | null
  type: 'in-person' | 'online'
  member_count: number
  member_cap: number
  status: string
  is_demo: boolean
  resonance_public: boolean
  latitude: number | null
  longitude: number | null
  neighborhood: string | null
  city: string | null
  host: { id: string; display_name: string; handle: string; avatar_url: string | null } | null
  /** The Space Circle (ADR-1391): the one primary Circle a Space always has. Its page names the SPACE as
   *  host; `host` above stays the person who runs it behind the scenes. */
  is_space_primary?: boolean
  /** The owning Space, for the Space Circle's host line. Null on a personal (root) Circle. */
  space?: { slug: string; name: string; brand_name: string | null; type: string } | null
  /** `circles.space_id` (ADR-857). Already selected by `loadCircleShell`; typed here because the
   *  Space Circle's event arm reads it through `spaceCircleEventScope` (ADR-1393). Root on a
   *  personal Circle, which is exactly why that resolver refuses a root Space. */
  space_id?: string | null
  hub: {
    id: string
    name: string
    slug: string
    nexus: {
      id: string
      name: string
      slug: string
      outpost: { id: string; name: string; region: { name: string } | null } | null
    } | null
  } | null
  /** Raw jsonb holding the per-circle Page-text override ({ text }); freed for this use by ADR-406. */
  sidebar_order?: unknown
}

export type MemberRow = {
  id: string
  volunteer_role: CommunityRole | null
  joined_at: string
  profile: {
    id: string
    display_name: string
    handle: string
    avatar_url: string | null
    community_role: CommunityRole
    /** Entitlement tier — drives endorsement (PB.1i: flair keys off the tier, not the role). */
    membership_tier: string | null
    current_season_rank: string | null
    current_streak: number
    achievement_count: number
  }
}

/** A circle's "this week's practice" (host-assigned), as the modules need it. */
export type CirclePractice = { id: string; title: string; description: string | null }

/** A journey the host can start a run of, for the journey-run module. */
export type RunnableJourney = { id: string; title: string; slug: string; emoji: string | null }
