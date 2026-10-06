import 'server-only'
import type {
  CircleView,
  EventView,
  FeedPostView,
  PeerView,
  PracticeView,
  ProfileView,
} from '@/lib/contract'
import type { FeedRow } from '@/lib/feed/feed-page'
import type { Practice } from '@/lib/practices'
import type { NotificationItem } from '@/lib/notifications-map'

// The lib rows a /api/v1 route reads, mapped to the contract's view models (LIVE-716). The views
// are camelCase and carry only what the app shows; a lib row can grow a column without the wire
// changing. Pure, so each mapping is tested once here and every route uses the same one.

type PeerRow = { id: string; handle?: string | null; display_name?: string | null; avatar_url?: string | null }

export function toPeerView(p: PeerRow): PeerView {
  return { id: p.id, handle: p.handle ?? null, displayName: p.display_name ?? null, avatarUrl: p.avatar_url ?? null }
}

export function toFeedPostView(p: FeedRow, callerId: string): FeedPostView {
  return {
    id: p.id,
    body: p.body,
    postType: p.post_type,
    createdAt: p.created_at,
    mediaUrls: p.media_urls ?? [],
    visibility: p.visibility,
    scopeId: p.scope_id,
    isPinned: !!p.is_pinned,
    reactionCount: p.reaction_count ?? 0,
    commentCount: p.comment_count ?? 0,
    author: toPeerView(p.author),
    myReactions: [...new Set((p.reactions ?? []).filter((r) => r.profile_id === callerId).map((r) => r.reaction_type))],
  }
}

type CircleRow = {
  id: string
  slug: string
  name: string
  about: string | null
  type: string
  member_count: number | null
  status: string
  image_url?: string | null
}

export function toCircleView(c: CircleRow): CircleView {
  return {
    id: c.id,
    slug: c.slug,
    name: c.name,
    about: c.about,
    type: c.type,
    memberCount: c.member_count ?? 0,
    status: c.status,
    imageUrl: c.image_url ?? null,
  }
}

type EventRow = {
  id: string
  slug: string
  title: string
  description: string | null
  starts_at: string
  ends_at: string | null
  city: string | null
  circle_id: string | null
  circle_name: string | null
  price_cents: number | null
}

export function toEventView(e: EventRow): EventView {
  return {
    id: e.id,
    slug: e.slug,
    title: e.title,
    description: e.description,
    startsAt: e.starts_at,
    endsAt: e.ends_at,
    city: e.city,
    circleId: e.circle_id,
    circleName: e.circle_name,
    priceCents: e.price_cents,
  }
}

export function toPracticeView(p: Practice): PracticeView {
  return {
    id: p.id,
    slug: p.slug ?? null,
    title: p.title,
    summary: p.summary,
    description: p.description,
    icon: p.icon,
    headerImage: p.header_image,
    cadence: p.cadence,
    durationMin: p.duration_min,
    usesTimer: !!p.uses_timer,
    timerKind: p.timer_kind ?? 'none',
  }
}

export function toNotificationView(n: NotificationItem) {
  return {
    id: n.id,
    type: n.type,
    referenceType: n.reference_type,
    referenceId: n.reference_id,
    body: n.body,
    readAt: n.read_at,
    createdAt: n.created_at,
    actor: n.actor ? toPeerView(n.actor) : null,
  }
}

type ProfileRow = PeerRow & {
  header_image_url?: string | null
  bio?: string | null
  website?: string | null
  city?: string | null
  community_role?: string | null
  membership_tier?: string | null
  created_at?: string | null
}

export function toProfileView(p: ProfileRow): ProfileView {
  return {
    ...toPeerView(p),
    headerImageUrl: p.header_image_url ?? null,
    bio: p.bio ?? null,
    website: p.website ?? null,
    city: p.city ?? null,
    communityRole: p.community_role ?? null,
    membershipTier: p.membership_tier ?? null,
    createdAt: p.created_at ?? null,
  }
}
