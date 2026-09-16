/**
 * The one place a price becomes a button label (LIVE-366).
 *
 * `$44.00` -> `$44`. A trailing `.00` is two characters of noise in a CTA that has to survive
 * truncation on a phone; `$44.50` keeps its cents, because dropping those would be a lie. The same
 * rule `receiptAmount` applies in the money emails, so the button and the receipt agree on what a
 * purchase cost.
 *
 * Shared rather than duplicated because BOTH ticket doors print it — the member button and the
 * guest door — and a member and a guest buying the same ticket must not read different copy. The
 * help centre names this label in one sentence that has to be true for both
 * (`content/help/groups/events.md`).
 */
export function compactPrice(label: string): string {
  return label.replace(/\.00\b/, '')
}

/** What every ticket door's trigger says. `null` price -> no number, because a price in a CTA is a
 *  promise and there are tiers this control may not charge for (free, members-only). */
export function ticketCtaLabel(priceLabel: string | null): string {
  return priceLabel ? `Get tickets - ${compactPrice(priceLabel)}` : 'Get ticket'
}
