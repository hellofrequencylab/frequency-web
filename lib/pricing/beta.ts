// BETA PRICING WINDOW (ADR-811 go-live). The Community Collective launches with BETA anchor pricing:
// Business $19 (under the $29 list) and Collective $49 (under the $79 list). These beta anchors are the
// CHARGED price for everyone who subscribes before the cutover; on the cutover instant the checkout
// begins charging the LIST price instead, and the pricing surfaces drop the beta framing. This is the
// auto-revert: no manual step, no re-sync (both the beta and list Stripe prices are minted active by the
// catalog sync, so the checkout just resolves the other key past the deadline).
//
// GRANDFATHERING: a Space that subscribes during the beta window keeps its rate for life. Its founding
// (beta) Stripe price id is persisted as the locked price on its subscription item, and the loadout
// checkout re-bills that lock before ever consulting this window (space-plan-checkout.ts
// resolveLoadoutPriceId). So only a NEW subscriber, subscribing AFTER the cutover, pays list.
//
// PURE + framework-free (no Supabase/Next), like the rest of lib/pricing/*: it takes `now` (defaulted to
// the live clock at the one call site that reads it) so every consumer stays testable with a fixed date.

import {
  catalogPriceKey,
  type BillingInterval,
  type CatalogAmounts,
  type CatalogItemKey,
} from '@/lib/billing/pricing-keys'

/** The instant the beta window closes. Owner-editable: moving this one constant shifts the whole
 *  auto-revert (checkout price + every pricing surface).
 *
 *  CLOSED EARLY — owner decision, 2026-08-17 (ADR-1060): "scratch the beta pricing and just charge
 *  full price. They can get 2 months free for purchasing the year."
 *  It was 2026-09-01T07:00:00.000Z (midnight Pacific on Sep 1). It is now a past instant, so the
 *  window is shut and list pricing is what every surface shows and every checkout charges.
 *
 *  WHAT IT MOVES, and nothing else: Business $19 -> $29 and Collective $49 -> $79 monthly, with the
 *  annual figures following at 10x (see yearlyFromMonthly — two months free is the house rule and is
 *  unchanged by this). Independent, Nonprofit and the AI add-on already carried listCents ==
 *  foundingCents, so their prices do not move at all.
 *
 *  🔴 ONE PERSON IS OWED A BETA RATE AND THE CODE CANNOT SEE IT. The grandfathering below protects a
 *  Space that subscribed through Stripe during the window by re-billing its LOCKED price id. On
 *  2026-08-17 there were zero such Spaces — 0 rows in space_subscription_items, 0 profiles carrying a
 *  stripe_customer_id, 0 stripe_webhook_events ever received. That measurement is true and it is NOT
 *  the whole story: @ishasetlumi claimed the Collective beta rate and PAID IN CASH, and her Space
 *  (`templeofaset`) carries plan='collective' granted directly in the database. She has no
 *  subscription item, so she has no lock, so `resolveLoadoutPriceId` has nothing to re-bill. She paid
 *  $490 — the ANNUAL Collective beta rate ($49 x 10, two months free), so she has bought a full year,
 *  not a month. Two obligations follow and neither is recorded anywhere the code can read: she must
 *  not be charged at all until that year runs out, and when it renews it renews at $490, not the $790
 *  list annual. OWN-022 carries both. The founding price still exists in Stripe to point a lock at,
 *  because the catalog sync mints BOTH variants active.
 *
 *  The general lesson is worth more than the instance: an obligation settled outside the system is
 *  invisible to every gate in it. Cash paid is still a promise made. */
export const BETA_PRICING_ENDS_AT = '2026-08-17T00:00:00.000Z'

/** Is the beta anchor pricing still in effect at `now`? True before the cutover, false on/after it.
 *  FAIL-SAFE: an unparseable constant would make this false (charge list, never under-charge). */
export function isBetaPricingActive(now: Date = new Date()): boolean {
  const cutover = Date.parse(BETA_PRICING_ENDS_AT)
  if (!Number.isFinite(cutover)) return false
  return now.getTime() < cutover
}

/** The amounts a pricing SURFACE should show given the beta window: during beta, the real {founding, list}
 *  split (a struck list over the beta anchor); after beta, list becomes the charged price and the founding
 *  anchor collapses to it, so no strike / no beta caption renders. PURE. Mirrors what the checkout charges
 *  (the founding key during beta, the list key after), so display and billing never diverge. */
export function effectiveCatalogAmounts(amounts: CatalogAmounts, betaActive: boolean): CatalogAmounts {
  if (betaActive) return amounts
  return { listCents: amounts.listCents, foundingCents: amounts.listCents }
}

// ── THE PRIVATE BETA PRICE GRANT (ADR-1061) — a per-Space grant, never a public offer ────────────
// The owner, 2026-08-17, the same day they closed the window above: *"I still have a couple people
// that I've offered the Beta pricing to, and I want to keep that open for them. But I don't want to
// advertise that Beta pricing as a package on the website. I just want regular pricing."*
//
// Two requirements that pull in opposite directions, and one mechanism that serves both: the PUBLIC
// ladder is list ($29 / $79) and the beta framing is gone, while a NAMED Space still checks out at the
// founding rate. Re-opening `BETA_PRICING_ENDS_AT` cannot do this — it is one global constant read by
// every pricing surface, so moving it would put the beta rate back on `/pricing` for everyone. The
// grant is therefore a per-Space fact (`spaces.beta_price_grant`) that ONLY the checkout reads.
//
// 🔴 THE GRANT IS NOT THE LOCK, AND THAT IS THE WHOLE POINT. The grandfathering machinery below the
// window (readLockedPriceId) is a RECORD, not a promise: `space_subscriptions.ts` writes
// `locked_price_id` from whatever checkout actually charged. With the window shut, a person promised
// $49 would check out at $79 and their lock would faithfully record $79 — forever. The lock preserves
// a number; it cannot know the number is wrong. The grant is what makes the FIRST charge right, and
// once that charge happens the lock takes over and re-bills it for the life of the subscription. That
// is exactly why the grant carries NO EXPIRY: it is consumed by the first successful checkout and is
// irrelevant from then on. Leaving it set costs nothing (the lock arm wins ahead of it); revoking it
// after they subscribe changes nothing either.
//
// PURE + framework-free, like the rest of this file: the caller resolves the three facts and this
// decides. That is what makes the charge decision testable without a database.

/** Which price a loadout item is charged at. Three arms, checked in this order:
 *  - `lock`     — the Space already holds a grandfathered `locked_price_id` for this item. Re-bill it,
 *                 whatever it is. A lock is a live subscription's own price and outranks everything.
 *  - `founding` — no lock, and either the beta WINDOW is open (everyone gets it) or THIS Space carries
 *                 the private grant (only they do). Charge the founding catalog key.
 *  - `list`     — no lock, no window, no grant. Charge the `_list` catalog key. The default. */
export type LoadoutChargeArm = 'lock' | 'founding' | 'list'

/** The three facts the charge decision needs. Resolved by the caller (IO), decided here (pure). */
export interface LoadoutChargeInput {
  /** The Space's grandfathered locked price id for THIS item, or null/blank when it holds none
   *  (`readLockedPriceId`, which already fail-safes a lapsed / canceled item to null). */
  lockedPriceId?: string | null
  /** Is the global beta window open at `now`? (`isBetaPricingActive()`.) */
  betaActive: boolean
  /** Does THIS Space carry the private beta price grant? (`spaces.beta_price_grant`, read fail-safe
   *  FALSE — an unreadable answer charges list, so a failure never under-charges.) */
  spaceHasBetaGrant: boolean
}

/** Decide which price arm a loadout item is charged at. PURE + total (ADR-1061).
 *
 *  The order is the meaning: a lock wins if present, because a live subscription's own price is not
 *  ours to re-decide; otherwise the founding rate is charged when EITHER the window is open (the
 *  public offer) or this Space was privately granted it; otherwise list.
 *
 *  FAIL-SAFE DIRECTION (inherited from isBetaPricingActive): every unknown resolves toward LIST. A
 *  blank / whitespace lock id is treated as no lock rather than as a price id, so a malformed row can
 *  never be handed to Stripe as a price. */
export function loadoutChargeArm(input: LoadoutChargeInput): LoadoutChargeArm {
  const locked = (input.lockedPriceId ?? '').trim()
  if (locked) return 'lock'
  if (input.betaActive || input.spaceHasBetaGrant) return 'founding'
  return 'list'
}

/** The `pricing_stripe_prices` key a loadout item resolves to on a NON-lock arm. PURE.
 *
 *  The founding arm takes the plain catalog key (`collective_base_month`) and the list arm takes the
 *  `_list` variant (`collective_base_month_list`). Both variants are minted ACTIVE by the catalog sync,
 *  which is what makes the grant a pure key switch with no re-sync and no new Stripe object: the $49
 *  price a granted Space is charged is the same price id the window used to charge everyone.
 *
 *  The `lock` arm is deliberately not representable here — a lock is a concrete price id, not a key,
 *  so a caller that reaches this function has already ruled it out. */
export function loadoutChargePriceKey(
  catalogKey: CatalogItemKey,
  interval: BillingInterval,
  arm: Exclude<LoadoutChargeArm, 'lock'>,
): string {
  return catalogPriceKey(catalogKey, interval, arm === 'list')
}

// ── THE BETA GRACE WINDOW (ADR-874) — selling and gating are different decisions ─────────────────
// The window above governs WHAT WE CHARGE. This one governs WHETHER THE FEATURE GATES BITE. They are
// separate decisions on separate dates, and conflating them is the bug this exists to kill: turning
// `billing_live` on so checkout is sellable used to ALSO revoke every paid feature from every free
// Space in the same instant, because featureAllowed short-circuited on `billingLive()` alone.
//
// The founder's shape: billing on NOW (people may buy), gates OFF until the beta runs out, then the
// ladder bites. `billingLive()` keeps its meaning (may we charge). `featureGatesLive()`
// (lib/pricing/settings.ts) is the new, separate answer: billing live AND the grace window ended.
//
// The window is an operator-editable pricing setting (`beta_grace`, the same mechanism as `trial` /
// `annual_discount` / `founding`). PURE + framework-free here, like the rest of lib/pricing/*.

/** The `beta_grace` pricing setting. `until` is the ISO date (or full instant) the grace window ENDS.
 *  null / blank = NO grace window: the gates follow `billingLive()` exactly, the pre-ADR-874 semantics. */
export interface BetaGraceConfig {
  /** ISO calendar date ('2026-09-01') or a full ISO instant. null = no grace, gates follow billing. */
  until: string | null
}

/** The code default when NO `beta_grace` row exists (the settings layer falls back to code defaults for
 *  an absent key, so no migration seeds this — see getBetaGrace in lib/pricing/settings.ts).
 *
 *  It matches the beta pricing cutover DATE above, because the two halves of "the beta runs out" should
 *  land on the same day. Defaulting to a real window rather than to `{ until: null }` is deliberate and
 *  fail-safe in the repo's direction: an operator who flips `billing_live` on before touching this row
 *  gets a SELLABLE checkout with the gates still soft, which is the intended go-live, instead of an
 *  instant lockout of every free Space. Clearing the field (`{ until: null }`) is the explicit opt out. */
export const BETA_GRACE_DEFAULT: BetaGraceConfig = { until: '2026-09-01' }

/** Narrow a raw `beta_grace` jsonb value to a BetaGraceConfig. An absent / malformed value reads as the
 *  DEFAULT window (grace on) rather than as no-grace, so a bad row can never enforce the gates early.
 *  An EXPLICIT null / blank `until` is honoured as "no grace window". PURE. */
export function asBetaGrace(raw: unknown): BetaGraceConfig {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return BETA_GRACE_DEFAULT
  const until = (raw as { until?: unknown }).until
  if (until === null) return { until: null } // explicit: no grace window
  if (typeof until === 'string') {
    const trimmed = until.trim()
    return { until: trimmed || null }
  }
  // A row with no `until` field (or a non-string one) is malformed — fail-safe to the default window.
  return BETA_GRACE_DEFAULT
}

/** The instant a grace `until` value ends, in ms, or null when it does not parse. A bare calendar date
 *  ('2026-09-01') is normalized to 00:00:00 UTC explicitly rather than left to Date.parse, so a full ISO
 *  string without a zone can never be read in the server's local time. PURE. */
export function betaGraceEndsAtMs(until: string | null | undefined): number | null {
  const raw = (until ?? '').trim()
  if (!raw) return null
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00.000Z` : raw
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? ms : null
}

/** Is the beta grace window still open at `now`? PURE.
 *
 *  BOUNDARY (the semantics, locked here and in ADR-874): the grace date is EXCLUSIVE of itself — the
 *  gates begin enforcing ON the date at 00:00 UTC, so `until: '2026-09-01'` means the last soft day is
 *  Aug 31 and Sep 1 is the first ENFORCED day. Same convention as isBetaPricingActive above.
 *
 *  FAIL-SAFE DIRECTION (opposite of the pricing window on purpose): an unparseable `until` reads as
 *  grace STILL ON (grant), never as gates-on. Under-charging is a revenue problem; wrongly revoking a
 *  member's or a Space's features is a trust problem, and this repo's posture is never-lock-out. */
export function betaGraceActive(grace: BetaGraceConfig | null | undefined, now: Date = new Date()): boolean {
  const until = grace?.until ?? null
  if (!until || !until.trim()) return false // no window configured: the gates follow billingLive exactly
  const ends = betaGraceEndsAtMs(until)
  if (ends === null) return true // garbage date: keep granting, never enforce early
  return now.getTime() < ends
}
