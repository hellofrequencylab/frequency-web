// The "Made with Frequency" mark (LIVE-804, ADR-1720 workstream 6). A small line on the pages and
// receipts a Space's customers see, linking back to the home page with a UTM so a booking or an
// order can bring the next Host in. Pure and client-safe: the surfaces render the words themselves
// and take the link from here, so every mark lands on one campaign.

/** Where the mark was seen. Sent as utm_medium, so each surface can be read on its own. */
type MadeWithSurface = 'booking-page' | 'booking-email' | 'order-receipt'

/** The campaign every mark shares (the first-touch cookie reads it as utm_campaign). */
export const MADE_WITH_CAMPAIGN = 'made-with-frequency'

/** The home page with the mark's UTM. `base` is the absolute origin for email; '' keeps it relative. */
export function madeWithUrl(surface: MadeWithSurface, base = ''): string {
  const q = new URLSearchParams({ utm_source: 'made-with', utm_medium: surface, utm_campaign: MADE_WITH_CAMPAIGN })
  return `${base.replace(/\/$/, '')}/?${q.toString()}`
}
