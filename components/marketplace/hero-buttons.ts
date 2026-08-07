// Shared hero action-button classes for the unified surface headers (Events, Marketplace Events,
// Business Spaces, Circles). Every hero's Primary + Secondary buttons render identically over the
// dark MarketHero band, so the four browse surfaces read as one header. The on-ink/xx utilities are
// opacity ramps on the ink pair's light tone for the on-ink secondary (the site's overlay-hero
// grammar), so the ramp rethemes with the skin instead of pinning raw white. No em dashes.

// Compact on mobile (px-3 / text-meta) so a hero's two actions sit on ONE row instead of
// wrapping to a second; full size from sm up. Keeps the four browse surfaces identical.
/** The primary CTA on a hero band (Add Event / Create a space / Start a circle). */
export const HERO_PRIMARY_BTN =
  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-control bg-primary px-3 py-2 text-meta font-semibold text-on-primary transition-colors hover:bg-primary-hover sm:px-4 sm:text-body-sm'

/** The secondary, on-ink action riding the dark hero image (Manage / My drafts). */
export const HERO_SECONDARY_BTN =
  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-control border border-on-ink/30 bg-on-ink/10 px-3 py-2 text-meta font-semibold text-on-ink transition-colors hover:bg-on-ink/20 sm:px-4 sm:text-body-sm'
