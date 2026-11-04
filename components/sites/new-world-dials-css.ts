// NEW WORLD'S DIAL SHEET (LIVE-2175, manifest schema 2). Laid straight after NEW_WORLD_CSS wherever the New World skin is drawn
// (components/sites/site-chrome.tsx and the coming-soon page in site-page.tsx). It ports the theme editor handoff's dial rules
// (design_handoff_theme_editor/reference/tokens/base.css, effects.css and frequency.css) onto New World's real markup: the blocks
// it composes (`.sv-*`, components/page-editor/blocks/services.tsx) and the house chrome (`.hs-*`). New World's block sheet
// (new-world-blocks-css.ts) already carries the Services voices, image treatments and motion switches re-scoped; this sheet adds
// what New World's handoff draws that those miss. Theme fence: every rule is scoped under [data-house-theme="new-world"] on the
// site root, so it can never reach a member, Space console or admin area. Tokens only.
//
//  Type voice  caps (Display) is the theme's own voice and needs no rule. editorial: the serif leads and the display face
//              becomes the small capitals phrase (base.css [data-type="editorial"]). quiet is the block sheet's sentence-case voice.
//  Images      glow is the theme's own. mono and grain reach the photo hero's background too (base.css .v-photo); clean drops the
//              grain, which New World draws only when grain is picked, so on New World clean draws like glow.
//  Motion      calm slows the drifting glow (the block sheet) and stills the pulsing dot; off stops every loop (effects.css).
//              prefers-reduced-motion still wins: NEW_WORLD_CSS stops every animation under it with !important.
//  Corners     the handoff's radius steps (frequency.css [data-site-corners]) on New World's radius tokens, so cards and photos follow.
//  Spacing     the handoff's section rhythm (frequency.css --section-y, and compact's gutter) on the block wrapper.

const N = '[data-house-theme="new-world"]'
const GRAIN = `content:"";position:absolute;inset:0;pointer-events:none;opacity:.22;mix-blend-mode:overlay;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")`
const Y = (value: string, y: string) => `${N}[data-site-spacing="${value}"] .sv-wrap{padding-top:${y};padding-bottom:${y}}`

export const NEW_WORLD_DIALS_CSS = `
${N}[data-type="editorial"] .sv-display{font-family:var(--nw-font-accent);font-style:normal;text-transform:none;font-stretch:100%;font-weight:var(--nw-fw-regular);letter-spacing:-.015em;line-height:1.02}
${N}[data-type="editorial"] .sv-display em{font-family:var(--nw-font-display);font-style:normal;font-weight:var(--nw-fw-bold);font-stretch:100%;text-transform:uppercase;font-size:.62em;letter-spacing:.02em;line-height:inherit;vertical-align:.12em}
${N}[data-image="mono"] .sv-hero-bg--photo{filter:grayscale(1) contrast(1.05)}
${N}[data-image="grain"] .sv-hero-bg--photo::before{${GRAIN};z-index:1}
${N}[data-image="clean"] .sv-photo::after,${N}[data-image="clean"] .sv-hero-bg--photo::before{content:none}
${N}[data-motion="calm"] .hs-dot,${N}[data-motion="off"] .hs-dot{animation:none}
${N}[data-motion="off"] .sv-orb,${N}[data-motion="off"] .sv-ticker-track,${N}[data-motion="off"] .hs-pill{animation:none}
${N}[data-site-corners="soft"]{--nw-radius-lg:20px;--nw-radius-xl:28px}
${N}[data-site-corners="subtle"]{--nw-radius-md:8px;--nw-radius-lg:10px;--nw-radius-xl:16px}
${N}[data-site-corners="square"]{--nw-radius-sm:0;--nw-radius-md:0;--nw-radius-lg:0;--nw-radius-xl:0}
${Y('balanced', 'clamp(64px,7.5vw,104px)')}
${Y('compact', 'clamp(48px,5vw,72px)')}
${N}[data-site-spacing="compact"]{--nw-gutter:clamp(16px,3vw,32px)}
`
