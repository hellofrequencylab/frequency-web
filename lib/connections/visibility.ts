// The PURE decision behind setVisibility for a network contact (ADR-778). Framework-free and
// unit-testable so the 'shared'-tier rules are auditable in one place, separate from the server
// action's IO (auth resolution, the operate check, the DB write).
//
// THE RULES (ADR-154 tier 'shared', scoped to a Space the owner OPERATES):
//   • 'network' → visibility='network', shared_space_id cleared. (The cross-steward tier, ADR-132.)
//   • 'shared'  → allowed ONLY with a shared_space_id the owner actually operates (verified
//                 server-side, NEVER client-trusted). A shared request with no space, or a space the
//                 caller does not operate, COERCES to 'private' (fail-closed) and clears the scope.
//   • anything else (incl. an invalid forged value) → 'private', shared_space_id cleared.
// Moving AWAY from 'shared' (to private or network) always clears shared_space_id, so a stale scope
// can never linger on a downgraded row (mirrored by the DB check constraint).

import type { Visibility } from './types'

export interface ResolveVisibilityInput {
  /** The tier the client asked for (untrusted). */
  requested: Visibility
  /** The Space the client asked to share with, when requesting 'shared' (untrusted). */
  sharedSpaceId?: string | null
  /** Whether the caller ACTUALLY operates `sharedSpaceId` — resolved server-side against the DB,
   *  never read from the client. Only meaningful for a 'shared' request. */
  operatesTargetSpace: boolean
}

export interface ResolvedVisibility {
  visibility: Visibility
  /** The scope to persist: a space id for a valid 'shared', else null (cleared). */
  sharedSpaceId: string | null
}

/** Resolve a requested visibility change to the (visibility, sharedSpaceId) that is safe to persist.
 *  PURE, fail-closed: an unauthorized or unscoped 'shared' collapses to 'private'. */
export function resolveVisibilityChange(input: ResolveVisibilityInput): ResolvedVisibility {
  if (input.requested === 'network') return { visibility: 'network', sharedSpaceId: null }

  if (input.requested === 'shared') {
    const spaceId = (input.sharedSpaceId ?? '').trim()
    if (spaceId && input.operatesTargetSpace) {
      return { visibility: 'shared', sharedSpaceId: spaceId }
    }
    // No space, or a space the caller does not operate → fail closed to private.
    return { visibility: 'private', sharedSpaceId: null }
  }

  // 'private' and any invalid/forged value.
  return { visibility: 'private', sharedSpaceId: null }
}
