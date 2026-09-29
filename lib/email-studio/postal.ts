// The platform's CAN-SPAM postal line: the ONE source every commercial Frequency email footer prints
// (LIVE-728, ADR-1663). The block-built shell (lib/email-studio/shell.ts) reads it for its legal footer, and
// the plain-text renderers (the Space campaign composer, the Space scheduled send, the Space drip, the lead
// nurture drip and the platform campaign composer) append it under their unsubscribe line. Before LIVE-728
// only the block shell carried it, so a plain Space campaign or drip step went out with no postal address.
//
// Pure + framework-free (no lib/site import, which pulls the nav registry), so a cron runner can import it.
// A per-Space send may still override the block shell's line with EmailBrand.address; the plain renderers
// have no brand input and always print this one.

/** The legal sender name the footer prints. Mirrors lib/site.ts ORG_LEGAL_NAME. */
const ORG_LEGAL_NAME = 'Frequency Labs Holdings'

/** The physical postal address for Frequency Labs Holdings. */
const POSTAL_ADDRESS = '802 Caminito Azul, Carlsbad, CA 92011'

/** "Frequency Labs Holdings, 802 Caminito Azul, Carlsbad, CA 92011": the line a footer prints verbatim. */
export const PLATFORM_POSTAL_LINE = `${ORG_LEGAL_NAME}, ${POSTAL_ADDRESS}`

/** The postal line as a muted footer paragraph for the plain-text email renderers. Inline styles + hex are
 *  correct here: the email renders in mail clients, outside the DAWN shell, where CSS tokens do not resolve.
 *  The constant carries no HTML-special characters, so it is printed as is. */
export function postalFooterHtml(): string {
  // token-ok: email HTML renders in mail clients, where CSS custom properties do not resolve
  return `<p style="font-size:12px;color:#999;line-height:1.6;margin:8px 0 0;">${PLATFORM_POSTAL_LINE}</p>`
}
