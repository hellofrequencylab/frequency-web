'use server'

// THE CLIENT-CALLABLE SERVER ACTIONS for the network-follow ledger (ENTITY-SPACES-BUILD §A.4).
//
// A 'use server' module may export ONLY async functions, so it cannot also hold the read helpers or
// the types. Those live in lib/spaces/follows.ts (no directive: the IO + the action implementations,
// all unit-testable). This thin file is the seam the CLIENT surface imports, so the mutations cross
// the network boundary as proper Server Actions:
//   follow-space-button.tsx -> followSpace / unfollowSpace
//
// SERVER components (the Space profile layout, the /spaces directory) import the READ helpers
// (isFollowing / listFollowedSpaceIds) directly from lib/spaces/follows.ts: they never cross a
// client boundary, so they need no wrapper. The auth check lives in the implementations
// (getMyProfileId); these wrappers just re-expose them.

import {
  followSpace as followSpaceImpl,
  unfollowSpace as unfollowSpaceImpl,
} from '@/lib/spaces/follows'
import { type ActionResult } from '@/lib/action-result'

/** Follow a Space. Any authenticated member; idempotent (re-following is a no-op success). */
export async function followSpace(spaceId: string): Promise<ActionResult> {
  return followSpaceImpl(spaceId)
}

/** Unfollow a Space. Any authenticated member; idempotent (unfollowing what you don't follow is a no-op). */
export async function unfollowSpace(spaceId: string): Promise<ActionResult> {
  return unfollowSpaceImpl(spaceId)
}
