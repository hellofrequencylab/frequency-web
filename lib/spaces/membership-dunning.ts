// SPACE MEMBERSHIP DUNNING DISPLAY (LIVE-429 / ADR-1478).
//
// The webhook already writes space_memberships.payment_status (lib/billing/space-subscriptions.ts).
// Access still ignores that column on purpose (private.is_space_paid_member, isSpacePaidMember,
// ADR-1092): a past_due member stays a member while Stripe retries, and a free join is often
// status=active with payment_status=pending. What was missing is the SHOWING: Crew has
// PastDueBanner on Settings, and Space dues had nowhere to appear.
//
// This module is display only. It does not revoke Circle access, Journey enrol, or member tickets.
// pending is never past due. Fail-safe is [] / not-past-due. ROOT never lists.

import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { billingLive } from '@/lib/pricing/settings'
import { getSpaceById } from '@/lib/spaces/store'

export type SpaceMembershipPayment = 'pending' | 'active' | 'past_due' | 'canceled'

export type PastDueSpaceMembership = {
  membershipId: string
  spaceId: string
  spaceName: string
  spaceSlug: string
  tierName: string
}

/** PURE. Only Stripe's past_due recovery state. pending is the free-join default. */
export function isPastDueSpaceMembership(paymentStatus: string | null | undefined): boolean {
  return paymentStatus === 'past_due'
}

export function spacePastDueMemberTitle(): string {
  return 'Your last payment did not go through'
}

export function spacePastDueMemberBody(spaceName: string): string {
  return `We could not charge your card for ${spaceName}. You are still a member. Update the card Stripe emailed you about, or leave from the Space.`
}

export function spacePastDueOwnerLabel(): string {
  return 'Payment failed'
}

/**
 * The viewer's active Space memberships whose card failed. Empty when billing is off,
 * when the viewer is signed out, or when the read misses. ROOT is omitted.
 */
export async function listMyPastDueSpaceMemberships(): Promise<PastDueSpaceMembership[]> {
  const profileId = await getMyProfileId()
  if (!profileId) return []
  try {
    if (!(await billingLive())) return []
    const admin = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (c: string, v: string) => {
            eq: (c: string, v: string) => {
              eq: (c: string, v: string) => Promise<{
                data: {
                  id: string
                  space_id: string
                  tier_id: string
                  payment_status: string | null
                }[] | null
                error: { message?: string } | null
              }>
            }
          }
        }
      }
    }
    const { data, error } = await admin
      .from('space_memberships')
      .select('id, space_id, tier_id, payment_status')
      .eq('member_profile_id', profileId)
      .eq('status', 'active')
      .eq('payment_status', 'past_due')
    if (error || !data?.length) return []

    const out: PastDueSpaceMembership[] = []
    for (const row of data) {
      if (!isPastDueSpaceMembership(row.payment_status)) continue
      const space = await getSpaceById(row.space_id)
      if (!space || space.type === 'root') continue
      const tiers = await adminTiers(row.space_id)
      const tierName = tiers.get(row.tier_id) ?? 'Member'
      out.push({
        membershipId: row.id,
        spaceId: space.id,
        spaceName: space.brandName?.trim() || space.name.trim() || 'this Space',
        spaceSlug: space.slug,
        tierName,
      })
    }
    return out
  } catch {
    return []
  }
}

async function adminTiers(spaceId: string): Promise<Map<string, string>> {
  const names = new Map<string, string>()
  try {
    const admin = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (c: string, v: string) => Promise<{
            data: { id: string; name: string | null }[] | null
          }>
        }
      }
    }
    const { data } = await admin.from('space_membership_tiers').select('id, name').eq('space_id', spaceId)
    for (const t of data ?? []) {
      if (t.id) names.set(t.id, (t.name ?? '').trim() || 'Member')
    }
  } catch {
    return names
  }
  return names
}
