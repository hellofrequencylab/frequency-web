import { asSpacePlan, SPACE_EMAIL_CUSTOM_IDENTITY_KEY } from '@/lib/pricing/plans'
import { spaceHasEntitlement, type SpaceLike } from './entitlements'

export type EmailIdentityPolicySpace = SpaceLike & { id: string; plan?: string | null }

/** Loaded by the server from its authorized registry, never from an outbox payload. */
export type VerifiedSpaceEmailIdentity = {
  id: string
  spaceId: string
  sendingVerified: boolean
  paused: boolean
}

export type EmailIdentityPolicyDecision =
  | { allowed: true }
  | { allowed: false; reason: 'space_unavailable' | 'paid_identity_required' | 'identity_unavailable' }

/** Sending only: downgrade must never disable receiving replies to previously sent mail.
 * Call with fresh server state immediately before custom delivery. A hold preserves the
 * selected identity; callers must not silently substitute a Frequency From address.
 * This capability does not replace consent, volume, lifecycle or operator authorization.
 */
export function spaceEmailIdentityPolicy(
  space: EmailIdentityPolicySpace | null,
  selected: { kind: 'frequency' } | { kind: 'space'; identityId: string },
  verifiedIdentity: VerifiedSpaceEmailIdentity | null = null,
): EmailIdentityPolicyDecision {
  if (!space) return { allowed: false, reason: 'space_unavailable' }
  if (selected.kind === 'frequency') return { allowed: true }
  // A website entitlement or a leftover billing key cannot retain paid mail after downgrade.
  if (
    asSpacePlan(space.plan) === 'free' ||
    !spaceHasEntitlement(space, SPACE_EMAIL_CUSTOM_IDENTITY_KEY)
  ) return { allowed: false, reason: 'paid_identity_required' }
  if (
    !verifiedIdentity || verifiedIdentity.id !== selected.identityId ||
    verifiedIdentity.spaceId !== space.id || !verifiedIdentity.sendingVerified ||
    verifiedIdentity.paused
  ) return { allowed: false, reason: 'identity_unavailable' }
  return { allowed: true }
}
