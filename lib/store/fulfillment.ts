// Pure classification of a gem-store redemption's fulfillment path (ADR-280). Lives
// outside the `'use server'` action (which may only export async functions) so it can
// export a sync, unit-testable function. The rule: never charge Gems for something we
// cannot actually deliver.

export type RedemptionPlan =
  /** A cosmetic that applies to the profile immediately. */
  | { kind: 'cosmetic'; cosmeticType: 'border' | 'flair' | 'title' }
  /** An operator-honored perk (feature SKUs + the guest pass): the store_redemptions
   *  row IS the fulfillment record an operator acts on; the member is told "Recorded". */
  | { kind: 'pending' }
  /** A membership BILLING CREDIT (membership-1mo / membership-3mo: type 'membership' with
   *  a months count) — a paid-tier credit we cannot grant in-app until the Stripe
   *  billing-credit rail exists. Refuse rather than silently swallow the Gems. */
  | { kind: 'refuse' }

/** Decide how a store item's `metadata` should be fulfilled (ADR-280). */
export function classifyRedemption(metadata: unknown): RedemptionPlan {
  const meta = (metadata ?? null) as { type?: string; months?: number } | null
  if (meta?.type === 'membership' && typeof meta.months === 'number') {
    return { kind: 'refuse' }
  }
  if (meta?.type === 'border' || meta?.type === 'flair' || meta?.type === 'title') {
    return { kind: 'cosmetic', cosmeticType: meta.type }
  }
  return { kind: 'pending' }
}
