import { asSpacePlan, type SpacePlan } from '@/lib/pricing/plans'

export const INCLUDED_MEMBER_SPACES = 5
export function isCollectivePlan(plan: string | null | undefined): boolean {
  return plan === 'collective' || plan === 'nonprofit_collective'
}

/** Only live purchased collective_space quantity expands the included five. */
export function memberSpaceCapacity(items: readonly { item_key: string; status: string; quantity: number }[]): number {
  return INCLUDED_MEMBER_SPACES + items.reduce((n, item) =>
    item.item_key === 'collective_space' && ['active', 'trialing', 'past_due'].includes(item.status)
      && Number.isSafeInteger(item.quantity) && item.quantity > 0 ? n + item.quantity : n, 0)
}

/** Inheritance is read-time only. Detach or a parent's downgrade restores the child's own plan. */
export function memberSpacePlan(ownPlan: string | null | undefined, parent: { plan?: string | null; status?: string | null } | null): SpacePlan {
  const own = asSpacePlan(ownPlan)
  return own === 'free' && parent?.status === 'active' && isCollectivePlan(parent.plan) ? 'business' : own
}
