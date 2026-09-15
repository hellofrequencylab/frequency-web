// MEMBER BENEFITS — THE EDITOR'S PURE DRAFT LAYER (ADR-1372, backlog LIVE-093). The shape an
// operator types into, and the two-way conversion between it and the wire contract in
// lib/spaces/benefits.ts.
//
// WHY THIS IS A MODULE AND NOT PART OF THE FORM. The editor holds every number as a STRING so an
// input can carry a half-typed value ("12." on the way to "12.5"), which means each save runs a
// parse that can fail, and money parsing is the part worth testing. The house habit is to test pure
// helpers in lib/, never the client component, so the rules live here beside their test
// (lib/spaces/benefits-form.test.ts) and components/spaces/membership-benefits-form.tsx is left
// holding state and markup only.
//
// SECURITY POSTURE: NONE, AND THAT IS DELIBERATE. Nothing here is a gate. Every value this module
// produces is re-normalized server-side by normalizeBenefit and re-checked against the Space's own
// tiers inside setSpaceBenefits (canEditProfile plus the memberships function gate). These rules
// exist so an operator sees a clear inline message instead of a row that vanishes on save, and for
// no other reason. Treat a green result here as convenience, never as authorization.
//
// THE PREVIEW LINE CALLS THE REAL RESOLVER. benefitDiscountCents from lib/spaces/benefits.ts is the
// one function that decides what comes off a price, so the operator-facing "what a member pays"
// sentence is computed with it rather than re-derived. A second copy of that arithmetic here would
// be a number the product does not actually charge.
//
// Voice: plain, sentence case, contractions, no em dashes (CONTENT-VOICE §5e, §10).

import {
  benefitDiscountCents,
  type BenefitKind,
  type BenefitPeriod,
  type BenefitScope,
  type MemberBenefit,
} from '@/lib/spaces/benefits'

// ── The draft shape ─────────────────────────────────────────────────────────────────────────────

/** One row in the editor. `value`, `maxUses`, `startsAt` and `endsAt` are STRINGS so an input can
 *  hold a value that is not yet a number (or a date). Converted on save, never before. */
export interface BenefitDraft {
  /** Present once the row has been saved at least once; preserved so assignments and the
   *  redemption ledger keep pointing at the same row (see planBenefitSetOps). */
  id?: string
  label: string
  kind: BenefitKind
  /** Percent for `percent` ("15"), dollars for `amount_off` and `fixed_price` ("18.70"). Ignored
   *  for `included`. */
  value: string
  scope: BenefitScope
  /** Whole number of redemptions; blank means no cap. */
  maxUses: string
  period: BenefitPeriod
  /** A date input's own YYYY-MM-DD, or blank for no bound. */
  startsAt: string
  endsAt: string
  isActive: boolean
  tierIds: string[]
}

/** The operator-facing option lists. Exported so the form renders one source of labels. */
export const BENEFIT_KIND_OPTIONS: readonly { value: BenefitKind; label: string }[] = [
  { value: 'percent', label: 'Percent off' },
  { value: 'amount_off', label: 'Amount off' },
  { value: 'fixed_price', label: 'Set member price' },
  { value: 'included', label: 'Included, they pay nothing' },
]

export const BENEFIT_SCOPE_OPTIONS: readonly { value: BenefitScope; label: string }[] = [
  { value: 'space_events', label: 'Your events' },
  { value: 'guest_events', label: 'Guest host events' },
  { value: 'stays', label: 'Stays' },
  { value: 'products', label: 'Products' },
  { value: 'all', label: 'Everything you sell' },
]

/** The window a use cap counts over. A blank value is a lifetime total. */
export const BENEFIT_PERIOD_OPTIONS: readonly { value: string; label: string }[] = [
  { value: '', label: 'Lifetime total' },
  { value: 'month', label: 'Every month' },
  { value: 'year', label: 'Every year' },
]

/** What the value input is asking for, per kind. Blank for `included`, which carries no value. */
export const BENEFIT_VALUE_LABEL: Record<BenefitKind, string> = {
  included: '',
  percent: 'Percent off',
  amount_off: 'Dollars off',
  fixed_price: 'Member price in dollars',
}

/** The noun the preview sentence prices, per scope. Plain words, not internal scope keys. */
const SCOPE_NOUN: Record<BenefitScope, string> = {
  space_events: 'ticket',
  guest_events: 'guest host ticket',
  stays: 'stay',
  products: 'product',
  all: 'item',
}

/** The list price the preview sentence prices against. One number, so every row's example reads the
 *  same way and an operator can compare two rows at a glance. */
export const SAMPLE_PRICE_CENTS = 2200

// ── PURE: number conversion ─────────────────────────────────────────────────────────────────────

/** Dollars string to integer cents, or null when malformed. Blank reads as 0. */
export function dollarsToCents(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return 0
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null
  const cents = Math.round(Number(trimmed) * 100)
  return Number.isFinite(cents) && cents >= 0 ? cents : null
}

/** Integer cents to a plain dollars string for an input (whole dollars drop the cents). */
export function centsToDollars(cents: number): string {
  if (!Number.isFinite(cents) || cents <= 0) return ''
  const dollars = cents / 100
  return Number.isInteger(dollars) ? String(dollars) : dollars.toFixed(2)
}

/** Percent string to BASIS POINTS ("15" to 1500), or null when malformed or above 100. */
export function percentToBps(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return 0
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null
  const bps = Math.round(Number(trimmed) * 100)
  if (!Number.isFinite(bps) || bps < 0 || bps > 10_000) return null
  return bps
}

/** Basis points to a plain percent string for an input (1500 to "15"). */
export function bpsToPercent(bps: number): string {
  if (!Number.isFinite(bps) || bps <= 0) return ''
  const percent = bps / 100
  return Number.isInteger(percent) ? String(percent) : percent.toFixed(2)
}

/** A draft's `value` in the units the wire wants (basis points or cents), or null when malformed.
 *  `included` carries no value, so it is always 0. */
export function parseBenefitValue(kind: BenefitKind, raw: string): number | null {
  if (kind === 'included') return 0
  if (kind === 'percent') return percentToBps(raw)
  return dollarsToCents(raw)
}

/** A wire value back into the string the input shows. */
export function formatBenefitValue(kind: BenefitKind, value: number): string {
  if (kind === 'included') return ''
  if (kind === 'percent') return bpsToPercent(value)
  return centsToDollars(value)
}

/** A YYYY-MM-DD from a date input to an ISO timestamp at UTC midnight, or null when blank or
 *  malformed. Midnight UTC keeps the boundary in the same place the redemption period keys use. */
export function dateToIso(raw: string): string | null {
  const trimmed = raw.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null
  const ms = Date.parse(`${trimmed}T00:00:00.000Z`)
  if (!Number.isFinite(ms)) return null
  return new Date(ms).toISOString()
}

/** An ISO timestamp back to the YYYY-MM-DD a date input can show. Blank when unreadable. */
export function isoToDate(iso: string | null): string {
  if (!iso) return ''
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return ''
  return new Date(ms).toISOString().slice(0, 10)
}

// ── PURE: draft seeding ─────────────────────────────────────────────────────────────────────────

/** A blank row. Percent off is the default because it is the benefit most Spaces write first, and
 *  a new row starts assigned to nobody so nothing goes live by accident. */
export function emptyDraft(): BenefitDraft {
  return {
    label: '',
    kind: 'percent',
    value: '',
    scope: 'space_events',
    maxUses: '',
    period: null,
    startsAt: '',
    endsAt: '',
    isActive: true,
    tierIds: [],
  }
}

/** Saved benefits back into editable rows. Tier ids that no longer exist are dropped here rather
 *  than silently re-sent, so the editor shows the assignment the server would actually keep. */
export function toDrafts(
  benefits: readonly MemberBenefit[],
  knownTierIds: readonly string[] = [],
): BenefitDraft[] {
  const known = new Set(knownTierIds)
  return benefits.map((b) => ({
    id: b.id,
    label: b.label,
    kind: b.kind,
    value: formatBenefitValue(b.kind, b.value),
    scope: b.scope,
    maxUses: b.maxUses != null ? String(b.maxUses) : '',
    period: b.period,
    startsAt: isoToDate(b.startsAt),
    endsAt: isoToDate(b.endsAt),
    isActive: b.isActive,
    tierIds: known.size > 0 ? b.tierIds.filter((t) => known.has(t)) : [...b.tierIds],
  }))
}

// ── PURE: the preview sentence ──────────────────────────────────────────────────────────────────

/** "Members", "Members and Guardians", "Members, Guardians and Founders". No serial comma before
 *  the final "and", matching how the rest of the product writes a list. */
export function joinNames(names: readonly string[]): string {
  if (names.length === 0) return ''
  if (names.length === 1) return names[0]!
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** Cents to a plain price label, e.g. 2200 to "$22" and 1870 to "$18.70". Whole dollars drop the
 *  cents, the way the membership join card writes a price. USD only. */
export function formatPrice(cents: number): string {
  const safe = Number.isFinite(cents) && cents > 0 ? cents : 0
  const dollars = safe / 100
  const whole = Number.isInteger(dollars)
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(dollars)
}

/**
 * What a buyer sees, in a sentence, for one row as it currently stands.
 *
 * Every number in it comes from benefitDiscountCents, so the preview can never promise a discount
 * the checkout would not apply. A row that cannot price anything yet says so plainly instead of
 * showing a made-up total.
 */
export function draftEffectLine(
  draft: Pick<BenefitDraft, 'kind' | 'value' | 'scope'>,
  tierNames: readonly string[],
  sampleCents: number = SAMPLE_PRICE_CENTS,
): string {
  if (tierNames.length === 0) return 'Pick a tier. A benefit with no tier applies to nobody.'

  const value = parseBenefitValue(draft.kind, draft.value)
  const noun = SCOPE_NOUN[draft.scope] ?? 'item'
  const sample = formatPrice(sampleCents)

  if (value == null) return `Add a number and we'll show what a member pays for a ${sample} ${noun}.`

  const discount = benefitDiscountCents({ kind: draft.kind, value }, sampleCents)
  if (discount <= 0) return `Nothing comes off a ${sample} ${noun} yet.`

  const paid = formatPrice(sampleCents - discount)
  return `Example: on a ${sample} ${noun}, ${joinNames(tierNames)} pay ${paid}.`
}

// ── PURE: draft to wire ─────────────────────────────────────────────────────────────────────────

/** A converted set, or the first thing an operator has to fix. */
export type BenefitConversion =
  | { ok: true; benefits: MemberBenefit[] }
  | { ok: false; error: string }

/**
 * Every row into the wire shape, or the first clear message. Order matters: the checks run top
 * to bottom within a row so the message always names the field nearest the top of the card.
 *
 * FAIL LOUD HERE, FAIL CLOSED THERE. normalizeBenefit drops a row it cannot make valid, which is
 * right for a server but wrong for an editor: an operator who left a tier unticked would watch the
 * row disappear on save with nothing to read. So the same conditions are checked here and reported.
 */
export function draftsToBenefits(
  drafts: readonly BenefitDraft[],
  spaceId: string,
): BenefitConversion {
  const benefits: MemberBenefit[] = []

  for (const d of drafts) {
    const label = d.label.trim()
    if (!label) return { ok: false, error: 'Give every benefit a name members will see.' }

    const value = parseBenefitValue(d.kind, d.value)
    if (value == null) {
      return d.kind === 'percent'
        ? { ok: false, error: 'Use a percent like 15 or 12.5, up to 100.' }
        : { ok: false, error: 'Use an amount like 5 or 5.50.' }
    }
    if (d.kind === 'percent' && value === 0)
      return { ok: false, error: 'A percent off needs a percent above zero.' }
    if (d.kind === 'amount_off' && value === 0)
      return { ok: false, error: 'An amount off needs a dollar amount above zero.' }

    if (d.tierIds.length === 0)
      return { ok: false, error: 'Pick at least one tier for every benefit.' }

    const maxUsesRaw = d.maxUses.trim()
    if (maxUsesRaw && !/^\d+$/.test(maxUsesRaw))
      return { ok: false, error: 'Uses is a whole number, or blank for no limit.' }
    const maxUses = maxUsesRaw ? Number(maxUsesRaw) : null
    if (maxUses === 0) return { ok: false, error: 'Uses is a whole number above zero, or blank.' }

    const startsAt = d.startsAt.trim() ? dateToIso(d.startsAt) : null
    if (d.startsAt.trim() && !startsAt)
      return { ok: false, error: 'Use a real start date, or leave it blank.' }
    const endsAt = d.endsAt.trim() ? dateToIso(d.endsAt) : null
    if (d.endsAt.trim() && !endsAt)
      return { ok: false, error: 'Use a real end date, or leave it blank.' }
    if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt))
      return { ok: false, error: 'The end date has to come after the start date.' }

    benefits.push({
      id: d.id,
      spaceId,
      kind: d.kind,
      value,
      scope: d.scope,
      label,
      maxUses,
      period: maxUses != null ? d.period : null,
      startsAt,
      endsAt,
      isActive: d.isActive,
      tierIds: [...new Set(d.tierIds)],
    })
  }

  return { ok: true, benefits }
}
