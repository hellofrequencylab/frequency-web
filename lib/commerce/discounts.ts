// DISCOUNT CODE EVALUATION (DEF-ETSY P7, docs/ETSY-GRADE-PLAN.md). PURE: it reads the priced lines it is
// handed and returns a verdict; it reads no database, calls no API and moves no money. Storing codes,
// counting redemptions and applying the result at checkout are separate, later slices, so this can be
// pinned against every cart shape without a Stripe key (the same shape as ./funds-flow).
//
// RULES (each is a test):
//   • A code belongs to ONE seller and discounts only that seller's lines. A cart of two sellers evaluates
//     the code against the lines of its own seller; the other seller's lines are never touched.
//   • Integer cents only. A percent code rounds DOWN, so a discount is never larger than it was promised.
//   • A fixed code is in one currency and refuses a line in another, never converting.
//   • The discount can never exceed the subtotal it applies to, so a total cannot go negative.
//   • A cap (`maxDiscountCents`) and a minimum spend (`minSubtotalCents`) both hold.
//   • Window, redemption limit and per-buyer limit are checked against the counts the caller passes in.
//   • The per-line split sums EXACTLY to the discount (largest remainder), so an order's lines add up.
//
// WHAT IT DOES NOT DECIDE: who funds the discount, or the platform fee on the discounted amount. Both are
// fee-rung questions answered where the fee is priced.

type DiscountKind = { kind: 'percent'; bps: number } | { kind: 'fixed'; cents: number; currency: string }

export interface DiscountCode {
  /** Compared case-insensitively, ignoring surrounding spaces. */
  code: string
  /** The seller this code belongs to; must equal the cart line's `sellerKey` to apply. */
  sellerKey: string
  discount: DiscountKind
  minSubtotalCents?: number
  maxDiscountCents?: number
  /** ISO timestamps; either end may be absent. */
  startsAt?: string
  endsAt?: string
  maxRedemptions?: number
  perBuyerLimit?: number
}

export interface DiscountLine {
  /** Stable key for the line (a cart line id); the split is keyed by it. */
  key: string
  sellerKey: string
  currency: string
  qty: number
  unitCents: number
}

interface DiscountUsage {
  /** Redemptions of this code so far, all buyers. */
  redemptions: number
  /** Redemptions of this code by this buyer so far. */
  buyerRedemptions: number
}

type DiscountRefusal =
  | 'unknown-code'
  | 'not-started'
  | 'expired'
  | 'sold-out'
  | 'buyer-limit'
  | 'no-eligible-lines'
  | 'currency-mismatch'
  | 'below-minimum'
  | 'invalid-code'

type DiscountVerdict =
  | { ok: true; discountCents: number; subtotalCents: number; perLine: Record<string, number> }
  | { ok: false; reason: DiscountRefusal }

export const normalizeCode = (raw: string) => raw.trim().toUpperCase()

const isCents = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0

/** Spread `total` over `weights` so the parts are integers that sum to exactly `total`
 *  (largest remainder; ties go to the earlier line). A zero weight gets zero. */
export function allocateCents(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0)
  if (sum <= 0 || total <= 0) return weights.map(() => 0)
  const raw = weights.map((w) => (total * w) / sum)
  const parts = raw.map(Math.floor)
  let left = total - parts.reduce((a, b) => a + b, 0)
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .filter((x) => weights[x.i] > 0)
    .sort((a, b) => b.frac - a.frac || a.i - b.i)
  for (let k = 0; left > 0 && order.length > 0; k = (k + 1) % order.length, left--) parts[order[k].i] += 1
  return parts
}

/** Evaluate `entered` against the known `codes` for a cart. `now` is injected so a test owns the clock. */
export function evaluateDiscount(
  entered: string,
  codes: DiscountCode[],
  lines: DiscountLine[],
  usage: DiscountUsage,
  now: Date,
): DiscountVerdict {
  const wanted = normalizeCode(entered)
  const code = wanted ? codes.find((c) => normalizeCode(c.code) === wanted) : undefined
  if (!code) return { ok: false, reason: 'unknown-code' }

  const d = code.discount
  const valid =
    (d.kind === 'percent' && Number.isInteger(d.bps) && d.bps > 0 && d.bps <= 10000) ||
    (d.kind === 'fixed' && isCents(d.cents) && d.cents > 0 && d.currency.length > 0)
  if (!valid) return { ok: false, reason: 'invalid-code' }

  const t = now.getTime()
  if (code.startsAt && t < Date.parse(code.startsAt)) return { ok: false, reason: 'not-started' }
  if (code.endsAt && t >= Date.parse(code.endsAt)) return { ok: false, reason: 'expired' }
  if (code.maxRedemptions !== undefined && usage.redemptions >= code.maxRedemptions) return { ok: false, reason: 'sold-out' }
  if (code.perBuyerLimit !== undefined && usage.buyerRedemptions >= code.perBuyerLimit) return { ok: false, reason: 'buyer-limit' }

  const own = lines.filter((l) => l.sellerKey === code.sellerKey && l.qty > 0 && isCents(l.unitCents))
  if (own.length === 0) return { ok: false, reason: 'no-eligible-lines' }
  if (d.kind === 'fixed' && own.some((l) => l.currency !== d.currency)) return { ok: false, reason: 'currency-mismatch' }
  if (new Set(own.map((l) => l.currency)).size > 1) return { ok: false, reason: 'currency-mismatch' }

  const totals = own.map((l) => l.qty * l.unitCents)
  const subtotalCents = totals.reduce((a, b) => a + b, 0)
  if (code.minSubtotalCents !== undefined && subtotalCents < code.minSubtotalCents) return { ok: false, reason: 'below-minimum' }

  let discountCents = d.kind === 'percent' ? Math.floor((subtotalCents * d.bps) / 10000) : d.cents
  if (code.maxDiscountCents !== undefined) discountCents = Math.min(discountCents, code.maxDiscountCents)
  discountCents = Math.min(discountCents, subtotalCents)

  const split = allocateCents(discountCents, totals)
  const perLine: Record<string, number> = {}
  own.forEach((l, i) => {
    perLine[l.key] = (perLine[l.key] ?? 0) + split[i]
  })
  return { ok: true, discountCents, subtotalCents, perLine }
}
