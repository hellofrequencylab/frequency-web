// MEMBER BENEFITS (ADR-1372). What a membership tier is WORTH at a checkout, as opposed to what it
// lets you through. The existing ADR-823 gate (`event_ticket_types.space_tier_id`) is binary: a
// ticket row names one tier and members of that tier may buy it. A benefit is the other half: a
// MODIFIER carrying a rate and a scope, assigned to any number of tiers, applied across events,
// stays and products without a row per tier per object.
//
// THE GATE IS SUBSUMED, NOT REPLACED. Today's free members ticket is exactly a benefit of kind
// `included` (100% off) scoped to `space_events`. Nothing about the gate changes in this pass; the
// two coexist and the gate still decides ADMISSION while a benefit decides PRICE.
//
// SHAPE (mirrors lib/spaces/memberships.ts): this module is PURE. No Supabase, no Next, no React,
// so every rule below is unit-testable without a database (lib/spaces/benefits.test.ts). The IO
// (service-role reads/writes) and the 'use server' action wrappers live in separate modules, the
// same split memberships.ts uses.
//
// 🔴 THE ONE RULE THAT COSTS REAL MONEY (ADR-1372 §2): a resolved benefit is applied to the price
// BEFORE the platform take-rate is computed. `spaceTakeRateCents` must receive the DISCOUNTED
// amount. Computing the fee on the list price bills the Space a percentage of money nobody paid,
// and it is invisible in every test that only checks the buyer's total.

// ── Types ─────────────────────────────────────────────────────────────────────────────────────

/** How a benefit changes a price.
 *  - `included`    the buyer pays nothing (100% off). The shape today's free members ticket takes.
 *  - `percent`     `value` is BASIS POINTS (1500 = 15%), so a rate never needs a float.
 *  - `amount_off`  `value` is cents removed from the list price.
 *  - `fixed_price` `value` is the cents the member pays instead of the list price. */
export type BenefitKind = 'included' | 'percent' | 'amount_off' | 'fixed_price'

/** What a benefit applies to. `all` matches every scope; everything else matches only itself.
 *  `space_events` is the Space's own events, `guest_events` is someone else's event hosted at the
 *  Space (the lane Royal Temple releases to guest hosts). */
export type BenefitScope = 'space_events' | 'guest_events' | 'stays' | 'products' | 'all'

/** The window a `maxUses` cap counts over. null = the cap is a lifetime total (or absent). */
export type BenefitPeriod = 'month' | 'year' | null

/** One benefit as the app consumes it (camelCased). `tierIds` is the assignment: a benefit with an
 *  empty tierIds list applies to NOBODY, which is the fail-closed default for a half-built row. */
export interface MemberBenefit {
  /** Absent for a not-yet-saved draft from the editor. */
  id?: string
  spaceId: string
  kind: BenefitKind
  /** Basis points for `percent`; cents for `amount_off` and `fixed_price`; ignored for `included`. */
  value: number
  scope: BenefitScope
  /** What the buyer sees on the line, e.g. "Temple Member, 15% off". Never the internal kind. */
  label: string
  /** Max redemptions per `period`; null = uncapped. This is what makes a guest pass real. */
  maxUses: number | null
  period: BenefitPeriod
  /** ISO timestamps, or null for "no bound". */
  startsAt: string | null
  endsAt: string | null
  isActive: boolean
  /** The membership tiers this benefit is assigned to (space_tier_benefits). */
  tierIds: string[]
}

/** The single benefit that won, resolved against one purchase. */
export interface AppliedBenefit {
  benefitId: string
  label: string
  /** Cents removed from the list price. Always within [0, listCents]. */
  discountCents: number
  /** What the buyer pays. Always `listCents - discountCents`, never below zero. */
  amountCents: number
}

/** Everything the resolver needs to know about the purchase in front of it. */
export interface BenefitContext {
  /** The list price in cents before any benefit. */
  listCents: number
  /** What is being bought. */
  scope: Exclude<BenefitScope, 'all'>
  /** The buyer's ACTIVE membership tier in this Space, or null when they hold none. */
  tierId: string | null
  /** Now, as an ISO timestamp. Injected so the window rules are testable without faking a clock.
   *  An UNPARSEABLE value fails CLOSED for any benefit carrying a window (see `benefitApplies`). */
  now: string
  /** The Space the purchase belongs to. When given, a benefit from another Space never applies, so
   *  a call site that assembles rows by hand cannot price a purchase with a foreign Space's offer.
   *  Optional because the store already filters by space_id on every read. */
  spaceId?: string
  /** How many times the buyer has already redeemed each benefit in the current period, by benefit
   *  id. A missing entry counts as zero. */
  usesByBenefitId?: Record<string, number>
}

// Hard caps, so a malformed or hostile row can never write an absurd value.
const MAX_LABEL_LEN = 80
const MAX_BPS = 10_000 // 100%
const MAX_CENTS = 100_000_000

const KINDS: readonly BenefitKind[] = ['included', 'percent', 'amount_off', 'fixed_price']
const SCOPES: readonly BenefitScope[] = [
  'space_events',
  'guest_events',
  'stays',
  'products',
  'all',
]

// ── PURE: normalization (no IO, fully testable) ────────────────────────────────────────────────

/** Clamp a raw value to a non-negative integer within [0, max]. Non-finite / negative floors to 0. */
function clampInt(raw: unknown, max: number): number {
  const n = Math.round(Number(raw))
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.min(n, max)
}

/** The ceiling a kind's `value` is clamped to: basis points for a rate, cents for an amount. */
export function valueCeilingFor(kind: BenefitKind): number {
  return kind === 'percent' ? MAX_BPS : MAX_CENTS
}

/** Coerce a raw value to a clean MemberBenefit, or null when it cannot be made valid. Fail-closed:
 *  an unknown kind or scope, a blank label, or no tier assignment drops the row rather than
 *  guessing, because every guess here is a guess about money. Pure. */
export function normalizeBenefit(raw: unknown, spaceId: string): MemberBenefit | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>

  const kind = KINDS.find((k) => k === r.kind)
  if (!kind) return null

  const scope = SCOPES.find((s) => s === r.scope)
  if (!scope) return null

  const label = typeof r.label === 'string' ? r.label.trim().slice(0, MAX_LABEL_LEN) : ''
  if (!label) return null

  const tierIds = Array.isArray(r.tierIds)
    ? [...new Set(r.tierIds.filter((t): t is string => typeof t === 'string' && !!t.trim()))]
    : []
  if (tierIds.length === 0) return null

  // Same reason as `benefitDiscountCents`: for a fixed price, 0 is a real offer and a broken number
  // must not silently become one. Reject the row rather than clamp it into the most generous shape.
  if (kind === 'fixed_price') {
    const raw = Math.round(Number(r.value))
    if (!Number.isFinite(raw) || raw < 0) return null
  }

  const period: BenefitPeriod = r.period === 'month' || r.period === 'year' ? r.period : null
  const maxUsesRaw = Math.round(Number(r.maxUses))
  const maxUses =
    r.maxUses != null && Number.isFinite(maxUsesRaw) && maxUsesRaw > 0 ? maxUsesRaw : null

  return {
    id: typeof r.id === 'string' && r.id ? r.id : undefined,
    spaceId,
    kind,
    // `included` carries no value; storing 0 keeps the column honest rather than a stale rate.
    value: kind === 'included' ? 0 : clampInt(r.value, valueCeilingFor(kind)),
    scope,
    label,
    maxUses,
    period,
    startsAt: typeof r.startsAt === 'string' && r.startsAt ? r.startsAt : null,
    endsAt: typeof r.endsAt === 'string' && r.endsAt ? r.endsAt : null,
    isActive: r.isActive !== false,
    tierIds,
  }
}

// ── PURE: the resolver ─────────────────────────────────────────────────────────────────────────

/** What ONE benefit takes off a given list price, clamped to [0, listCents]. A benefit can never
 *  hand money back and never discounts more than the thing costs. Pure. */
export function benefitDiscountCents(
  benefit: Pick<MemberBenefit, 'kind' | 'value'>,
  listCents: number,
): number {
  const list = clampInt(listCents, MAX_CENTS)
  if (list === 0) return 0

  let off: number
  switch (benefit.kind) {
    case 'included':
      off = list
      break
    case 'percent':
      // Basis points, so 1500 = 15%. Rounded to the nearest cent, in the buyer's favour on a tie
      // only by virtue of Math.round, which is close enough at cent scale and is deterministic.
      off = Math.round((list * clampInt(benefit.value, MAX_BPS)) / MAX_BPS)
      break
    case 'amount_off':
      off = clampInt(benefit.value, MAX_CENTS)
      break
    case 'fixed_price': {
      // The member pays `value`; anything at or above list is not a discount at all.
      //
      // 🔴 A malformed value is NOT free. `clampInt` floors a negative or NaN to 0, and 0 is a
      // LEGITIMATE fixed price (a member pays nothing), so the clamp alone cannot tell "this tier
      // is free" apart from "this number is broken" — and the broken case would resolve to 100%
      // off. Reject the malformed value here instead of letting it read as the most generous
      // possible offer. The DB's `value >= 0` check is the second line, not the first.
      const raw = Math.round(Number(benefit.value))
      if (!Number.isFinite(raw) || raw < 0) return 0
      off = list - Math.min(raw, MAX_CENTS)
      break
    }
  }

  if (!Number.isFinite(off) || off <= 0) return 0
  return Math.min(off, list)
}

/** Is this benefit live for this context? Tier assignment, scope, active flag, date window and the
 *  usage cap, in that order. Every miss is a silent no rather than a throw: a benefit that cannot
 *  be proven applicable simply does not apply. Pure. */
export function benefitApplies(benefit: MemberBenefit, ctx: BenefitContext): boolean {
  if (!benefit.isActive) return false
  if (!benefit.id) return false
  if (!ctx.tierId) return false
  if (!benefit.tierIds.includes(ctx.tierId)) return false
  if (benefit.scope !== 'all' && benefit.scope !== ctx.scope) return false
  // A benefit belongs to one Space. The store filters space_id on every read, so this only bites a
  // call site that assembled rows by hand, which is exactly the one with no other guard.
  if (ctx.spaceId && benefit.spaceId && benefit.spaceId !== ctx.spaceId) return false

  // 🔴 THE WINDOW FAILS CLOSED. An unparseable `now` used to skip the window checks entirely, so a
  // broken clock made an EXPIRED benefit apply — the one direction that costs money, and the only
  // axis here that did not fail closed. A benefit with no window is unaffected either way.
  const now = Date.parse(ctx.now)
  const hasWindow = !!benefit.startsAt || !!benefit.endsAt
  if (!Number.isFinite(now)) return !hasWindow

  if (benefit.startsAt) {
    const starts = Date.parse(benefit.startsAt)
    // An unparseable bound is a bound nobody can verify: refuse rather than ignore it.
    if (!Number.isFinite(starts) || now < starts) return false
  }
  if (benefit.endsAt) {
    const ends = Date.parse(benefit.endsAt)
    if (!Number.isFinite(ends) || now >= ends) return false
  }

  if (benefit.maxUses != null) {
    const used = ctx.usesByBenefitId?.[benefit.id] ?? 0
    if (used >= benefit.maxUses) return false
  }

  return true
}

/**
 * THE resolver. Returns the single best applicable benefit, or null when none applies.
 *
 * 🔴 BENEFITS NEVER STACK (ADR-1372 §1). Two benefits on one purchase resolve to the HIGHER of the
 * two, never to their sum. Stacking is how a 15% and a 20% row quietly become 35% off, and how a
 * percent plus a fixed price becomes a negative total. The rule is one line here on purpose, so it
 * can never be re-implemented differently at a second call site.
 *
 * Ties break on the benefit id, ascending, so the same inputs always resolve the same way and a
 * test never depends on array order.
 */
export function resolveBenefit(
  benefits: readonly MemberBenefit[],
  ctx: BenefitContext,
): AppliedBenefit | null {
  const list = clampInt(ctx.listCents, MAX_CENTS)
  if (list === 0) return null

  let best: AppliedBenefit | null = null

  for (const benefit of benefits) {
    if (!benefitApplies(benefit, ctx)) continue
    const discountCents = benefitDiscountCents(benefit, list)
    if (discountCents <= 0) continue

    const candidate: AppliedBenefit = {
      benefitId: benefit.id!,
      label: benefit.label,
      discountCents,
      amountCents: list - discountCents,
    }

    if (
      !best ||
      candidate.discountCents > best.discountCents ||
      (candidate.discountCents === best.discountCents && candidate.benefitId < best.benefitId)
    ) {
      best = candidate
    }
  }

  return best
}

/** The amount a checkout should CHARGE, after any benefit. The one helper every payment path calls,
 *  so nobody re-derives `list - discount` and gets the clamp wrong.
 *
 *  🔴 Feed THIS to spaceTakeRateCents, never ctx.listCents (ADR-1372 §2). */
export function payableCents(
  benefits: readonly MemberBenefit[],
  ctx: BenefitContext,
): { amountCents: number; applied: AppliedBenefit | null } {
  const applied = resolveBenefit(benefits, ctx)
  return {
    amountCents: applied ? applied.amountCents : clampInt(ctx.listCents, MAX_CENTS),
    applied,
  }
}
