// The contract layer - presentation-neutral view models shared by web (RSC) and
// the future mobile app. See docs/SCALE-ARCHITECTURE.md and CAPABILITIES-AND-MOBILE.md.
//
// Convention: every view model carries the viewer's `capabilities` for that
// entity, so clients render affordances directly from the contract and never
// recompute policy. Phase 2 implements `SECURITY DEFINER` RPCs that RETURN these
// shapes; this file is the agreed shape both sides code against.
//
// These are a first draft of the shapes - pure types, no runtime. Refine as the
// RPCs land.

import type { Capability } from '@/lib/core'

/** Wrap any payload with the viewer's capabilities for that scope. */
export interface WithCapabilities<T> {
  data: T
  capabilities: Capability[]
}

export type CircleMode = 'in-person' | 'virtual'

export interface CircleView {
  id: string
  slug: string
  name: string
  about: string | null
  /** Virtual is the default; `in-person` is the additive designator. */
  mode: CircleMode
  city: string | null
  memberCount: number
  memberCap: number
  hostId: string | null
  /** What the viewer may do here (circle.post, circle.editSettings, …). */
  capabilities: Capability[]
}

export interface ProfileView {
  id: string
  handle: string
  displayName: string
  avatarUrl: string | null
  bio: string | null
  /** Includes `profile.edit` when the viewer owns it (or is a janitor). */
  capabilities: Capability[]
}

export interface FeedItem {
  id: string
  kind: 'post' | 'event' | 'dispatch'
  authorHandle: string
  authorName: string
  createdAt: string
  body: string | null
}

export interface FeedView {
  items: FeedItem[]
  nextCursor: string | null
}
