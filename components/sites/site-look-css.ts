// THE GLOBAL STYLES' LOOK (ADR-1728). A site wears its theme (Frequency: HOUSE_CSS + FREQUENCY_PAGE_CSS;
// Bold: MENSWORK_CSS + MENSWORK_PAGE_CSS) and, on top, the owner's corners, spacing and header choices
// (lib/theme/site-style.ts). The site root carries a `data-site-*` attribute ONLY for a choice that differs
// from its theme's own (siteLookOverrides), so a site the owner never restyled renders exactly as before and
// this sheet never meets it. Each rule names its value, so it reads the same in either theme. The footer
// choice needs no CSS: it picks whether the full footer is drawn (components/sites/site-chrome.tsx).
// Tokens only; the theme's palette paints every surface.

const R = '[data-house-site]'

/** Everything with a shape: buttons, cards, frames, photos, panels and chips, in both themes' sections. */
const SHAPED = [
  '.hs-btn', '.hs-card', '.hs-photo', '.hs-panel', '.hs-band', '.hs-tier', '.hs-faq', '.hs-sign', '.hs-start',
  '.hs-start-row', '.hs-contact', '.hs-mega-panel', '.hs-mega-feature', '.hs-hero-pill', '.hs-chip', '.hs-menu-panel',
  '.mw-photo', '.mw-chamfer', '.mw-frame', '.mw-grid>*', '.mw-beat', '.mw-strip', '.mw-note', '.mw-closing', '.mw-date-row',
  '.mw-circle-row', '.mw-weeks li', '.mw-modules li', '.mw-head-card', '.mw-tag', '.mw-badge', '.mw-tag-chev', '.mw-week-tag',
]
/** The round-ended shapes (buttons and chips) that go fully round when corners are soft. */
const PILLS = ['.hs-btn', '.hs-hero-pill', '.hs-chip', '.mw-tag', '.mw-badge', '.mw-tag-chev', '.mw-week-tag']

const each = (value: string, list: string[]) => list.map((c) => `${R}[data-site-corners="${value}"] ${c}`).join(',')

export const SITE_LOOK_CSS = `
${each('square', SHAPED)}{border-radius:0}
${each('subtle', SHAPED)}{border-radius:10px;clip-path:none}
${each('soft', SHAPED)}{border-radius:clamp(18px,2.4vw,28px);clip-path:none}
${each('soft', PILLS)}{border-radius:999px}
${R}[data-site-corners="subtle"] :is(.mw-frame,.mw-tag,.hs-btn)::after,${R}[data-site-corners="soft"] :is(.mw-frame,.mw-tag,.hs-btn)::after{content:none}

${R}[data-site-spacing="airy"] .hs-section,${R}[data-site-spacing="airy"] .hs-wide{padding-bottom:clamp(112px,13vw,180px)}
${R}[data-site-spacing="airy"] .hs-section-first{padding-top:clamp(112px,13vw,180px)}
${R}[data-site-spacing="airy"] .mw-sec{padding-top:clamp(72px,9vw,128px)}
${R}[data-site-spacing="balanced"] .hs-section,${R}[data-site-spacing="balanced"] .hs-wide{padding-bottom:clamp(80px,10vw,128px)}
${R}[data-site-spacing="balanced"] .hs-section-first{padding-top:clamp(80px,10vw,128px)}
${R}[data-site-spacing="balanced"] .mw-sec{padding-top:clamp(48px,7vw,88px)}
${R}[data-site-spacing="compact"] .hs-section,${R}[data-site-spacing="compact"] .hs-wide{padding-bottom:clamp(48px,6vw,80px)}
${R}[data-site-spacing="compact"] .hs-section-first{padding-top:clamp(56px,7vw,88px)}
${R}[data-site-spacing="compact"] .mw-sec{padding-top:clamp(32px,4.5vw,56px)}
${R}[data-site-spacing="compact"] .hs-plain{padding-bottom:clamp(48px,6vw,72px)}

${R}[data-site-header="bar"] .hs-header{padding:0}
${R}[data-site-header="bar"] .hs-pill{max-width:none;margin:0;border-radius:0;padding:8px clamp(16px,3vw,32px);background:var(--color-surface);box-shadow:0 1px 0 var(--color-border);animation:none}
${R}[data-site-header="pill"] .hs-header{padding:12px clamp(10px,3vw,32px) 0;background:transparent;border-bottom:0}
${R}[data-site-header="pill"] .hs-pill{max-width:1240px;margin:0 auto;padding:6px 8px 6px clamp(14px,2vw,20px);border-radius:28px;background:var(--color-surface);border:1px solid var(--color-border)}
@media (min-width:940px){${R}[data-site-header="pill"] .hs-pill{border-radius:999px}}
`
