import { asSpacePlan, NETWORK_PLAN, type SpacePlan } from '@/lib/pricing/plans'

const INCLUDED_MEMBER_SPACES = 5
export function isCollectivePlan(plan: string | null | undefined): boolean {
  return plan === 'collective' || plan === 'nonprofit_collective'
}

/** Network (SCAN-956) is one owner running many groups: its same-owner children are its chapters. */
export function isNetworkPlan(plan: string | null | undefined): boolean {
  return plan === 'network'
}

/** A plan whose Space can hold same-owner children: Network's chapters, and the member Spaces existing
 *  Collectives already bought (kept, never taken away). Extra-Space billing stays Collective only. */
export function isChapterParentPlan(plan: string | null | undefined): boolean {
  return isNetworkPlan(plan) || isCollectivePlan(plan)
}

/** Only live purchased quantity expands what a plan includes: collective_space past a Collective's five,
 *  network_chapter past a Network's ten (SCAN-1008). A Network never exceeds NETWORK_PLAN.maxChapters
 *  through self-serve; past that is a quote. */
export function memberSpaceCapacity(items: readonly { item_key: string; status: string; quantity: number }[], plan?: string | null): number {
  const network = isNetworkPlan(plan)
  const extraKey = network ? 'network_chapter' : 'collective_space'
  const extra = items.reduce((n, item) =>
    item.item_key === extraKey && ['active', 'trialing', 'past_due'].includes(item.status)
      && Number.isSafeInteger(item.quantity) && item.quantity > 0 ? n + item.quantity : n, 0)
  return network ? Math.min(NETWORK_PLAN.maxChapters, NETWORK_PLAN.includedChapters + extra) : INCLUDED_MEMBER_SPACES + extra
}

/** Inheritance is read-time only. Detach or a parent's downgrade restores the child's own plan. */
export function memberSpacePlan(ownPlan: string | null | undefined, parent: { plan?: string | null; status?: string | null } | null,
  relationship?: { childOwnerId?: string | null; parentOwnerId?: string | null; childStatus?: string | null; childType?: string | null; parentType?: string | null; parentParentId?: string | null }): SpacePlan {
  const own = asSpacePlan(ownPlan)
  return own === 'free' && parent?.status === 'active' && isChapterParentPlan(parent.plan)
    && !!relationship?.childOwnerId && relationship.childOwnerId === relationship.parentOwnerId
    && relationship.childStatus === 'active' && relationship.childType !== 'root'
    && relationship.parentType !== 'root' && relationship.parentParentId === null ? 'business' : own
}
