// Pure classification of a gem-store redemption's fulfillment path (ADR-280). Lives
// outside the `'use server'` action (which may only export async functions) so it can
// export a sync, unit-testable function. The rule: never charge Gems for something we
// cannot actually deliver.
//
// ⚠️ LIVE-013 (2026-08-17) found the rule was only half enforced. `classifyRedemption` read the
// SKU's metadata and asked "does this name a cosmetic type?" — never "and can we PAINT it?".
// Nothing painted any of them: the three cosmetic columns on `profiles` had no reader outside a
// text chip in the buyer's own Vault. Worse, the untyped shelf rows (metadata `{}`) fell through
// to `pending`, which means "an operator will honor this" — and there was no operator queue, so
// five SKUs whose copy promises a visible profile change took Gems and did nothing at all.
//
// The classifier now resolves against the RENDER REGISTRY (`lib/store/cosmetics.ts`), so
// "deliverable" means a thing exists that draws it, and a fourth outcome — `undeliverable` —
// refuses the sale BEFORE the charge instead of banking it as pending.

import { cosmeticForItem, type CosmeticType, type ShelfItem } from './cosmetics'

export type RedemptionPlan =
  /** A cosmetic that applies to the profile immediately, and that something renders. */
  | { kind: 'cosmetic'; cosmeticType: CosmeticType; value: string }
  /** An operator-honored perk (feature SKUs + the guest pass): the store_redemptions
   *  row IS the fulfillment record an operator acts on (the queue lives on /admin/store);
   *  the member is told "Recorded". */
  | { kind: 'pending' }
  /** A membership BILLING CREDIT (membership-1mo / membership-3mo: type 'membership' with
   *  a months count) — a paid-tier credit we cannot grant in-app until the Stripe
   *  billing-credit rail exists. Refuse rather than silently swallow the Gems. */
  | { kind: 'refuse' }
  /** A cosmetic/title SKU that resolves to nothing renderable. Refuse: "pending" would be a
   *  lie, because no operator can hand-deliver a profile border. */
  | { kind: 'undeliverable' }

/** The SKU context the classifier needs beyond its metadata. Optional so the historical
 *  one-argument call (and its tests) keep their exact meaning: metadata alone can still say
 *  "cosmetic", "billing credit" or "operator-honored". */
export type RedemptionItem = Pick<ShelfItem, 'slug' | 'category'>

/** Decide how a store item should be fulfilled (ADR-280, extended by LIVE-013). */
export function classifyRedemption(metadata: unknown, item?: RedemptionItem): RedemptionPlan {
  const meta = (metadata ?? null) as { type?: string; months?: number } | null
  if (meta?.type === 'membership' && typeof meta.months === 'number') {
    return { kind: 'refuse' }
  }

  const cosmetic = cosmeticForItem({ slug: item?.slug ?? '', metadata })
  if (cosmetic) return { kind: 'cosmetic', cosmeticType: cosmetic.type, value: cosmetic.value }

  // A metadata blob that NAMES a cosmetic type but resolves to nothing renderable is the
  // silent-loss case: it looks delivered and is not. Refuse it whether or not the caller
  // passed the SKU, because the metadata alone is enough to know.
  if (meta?.type === 'border' || meta?.type === 'flair' || meta?.type === 'title') {
    return { kind: 'undeliverable' }
  }

  // Untyped metadata in a category that PROMISES a visible profile change (cosmetic / title).
  // Without the SKU we cannot tell those apart from an operator perk, so this arm needs the
  // second argument — which is why the redeem path always passes it.
  if (item && (item.category === 'cosmetic' || item.category === 'title')) {
    return { kind: 'undeliverable' }
  }

  return { kind: 'pending' }
}

/** Member-facing copy for a refused sale. One place, so the store grid and the server action
 *  cannot say different things about the same SKU. Voice: plain, no em dashes, and it says
 *  where the Gems went (nowhere) rather than narrating how the member feels about it. */
export const UNDELIVERABLE_MESSAGE =
  'This one is not ready to wear yet, so we are not taking Gems for it. Your Gems stay safe.'

// ── Streak freeze: the grant is part of the sale (L6-12, 2026-09-05) ─────────────────────────────
//
// The 'streak-freeze' SKU is the one store item whose fulfilment is a second write AFTER the Gems are
// charged (redeem_store_item_atomic debits; grantStreakFreeze banks the token). Before this the grant's
// result was thrown away (`.catch(() => {})`, return `ok`), so a member at the freeze cap, or one who
// lost the cap race between the pre-check and the charge, paid 50 Gems and received nothing while the
// action reported success. The rule of this module applies to the second write too: never keep Gems
// for something we did not deliver. This helper decides the outcome from the grant result; the IO
// (the real grant, the refund of the debit row) is injected so it stays unit-testable beside
// classifyRedemption and imports nothing from Supabase.

export interface StreakFreezeGrantOutcome {
  /** A freeze token was banked. */
  granted: boolean
  /** The grant was refused because the member is already holding the most freezes allowed. */
  atCap: boolean
}

export interface StreakFreezeFulfillmentDeps {
  /** Bank the token (lib/practice-streak grantStreakFreeze). A throw counts as not granted. */
  grant: () => Promise<StreakFreezeGrantOutcome>
  /** Reverse the debit through the same unit the charge wrote: delete the store_redemptions row the
   *  RPC returned. Resolves `{ error: null }` when the Gems are back. */
  refund: () => Promise<{ error: { message: string } | null }>
}

export type StreakFreezeFulfillment =
  | { ok: true }
  /** Not delivered. `refunded` says whether the Gems made it back; the message says so to the member. */
  | { ok: false; refunded: boolean; atCap: boolean; message: string }

/** Member-facing copy. Plain, no em dashes, and each one says where the Gems are. */
export const STREAK_FREEZE_AT_CAP_MESSAGE =
  'You already have the most streak freezes you can hold, so nothing was banked. Your Gems are back in your Vault.'
export const STREAK_FREEZE_GRANT_FAILED_MESSAGE =
  'We could not bank that freeze. Your Gems are back in your Vault.'
export const STREAK_FREEZE_REFUND_FAILED_MESSAGE =
  'We could not bank that freeze, and we could not return your Gems automatically. Reach out and we will put them back.'

/**
 * Settle a streak-freeze purchase AFTER the Gems are charged: grant the token, and if the grant did
 * not happen (at cap, a false return, or a throw), refund the debit and report a failure. The action
 * must return `ok` ONLY on `{ ok: true }`; every other branch is a refusal with honest copy.
 */
export async function fulfillStreakFreeze(deps: StreakFreezeFulfillmentDeps): Promise<StreakFreezeFulfillment> {
  let outcome: StreakFreezeGrantOutcome
  try {
    outcome = await deps.grant()
  } catch {
    outcome = { granted: false, atCap: false }
  }
  if (outcome.granted) return { ok: true }

  let refundError: { message: string } | null
  try {
    refundError = (await deps.refund()).error
  } catch (err) {
    refundError = { message: err instanceof Error ? err.message : String(err) }
  }
  if (refundError) {
    return { ok: false, refunded: false, atCap: outcome.atCap, message: STREAK_FREEZE_REFUND_FAILED_MESSAGE }
  }
  return {
    ok: false,
    refunded: true,
    atCap: outcome.atCap,
    message: outcome.atCap ? STREAK_FREEZE_AT_CAP_MESSAGE : STREAK_FREEZE_GRANT_FAILED_MESSAGE,
  }
}
