// Shared hero action-button classes for the unified surface headers (Events, Marketplace Events,
// Business Spaces, Circles). Every hero's Primary + Secondary buttons render identically over the
// dark MarketHero band, so the four browse surfaces read as one header. The white/xx utilities are
// opacity ramps on white for the on-ink secondary (the site's overlay-hero grammar), not hardcoded
// colors. No em dashes.

/** The primary CTA on a hero band (Add Event / Create a space / Start a circle). */
export const HERO_PRIMARY_BTN =
  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover'

/** The secondary, on-ink action riding the dark hero image (Manage / My drafts). */
export const HERO_SECONDARY_BTN =
  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-white/30 bg-white/10 px-4 py-2 text-sm font-semibold text-on-ink transition-colors hover:bg-white/20'
