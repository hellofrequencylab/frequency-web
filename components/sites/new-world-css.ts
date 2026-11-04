import { NEW_WORLD_BLOCKS_CSS } from '@/components/sites/new-world-blocks-css'
import { NEW_WORLD_SECTIONS_CSS } from '@/components/sites/new-world-sections-css'
import { NEW_WORLD_DAY_CSS, NEW_WORLD_DETAIL_CSS, NEW_WORLD_TOKENS_CSS } from '@/lib/theme/new-world'

// THE NEW WORLD SKIN. Scoped under [data-house-theme="new-world"] so every house section keeps its markup and content; values come
// only from the token block (lib/theme/new-world.ts), never raw. It layers after the house sheets (components/sites/site-chrome.tsx):
// the site's own colour names (--color-*) re-pointed at the register in force (Night by default, Day on `data-th="day"`, or a
// section marked either), the faces, then the page chrome: the header bar, pill buttons, cards and the footer. The owner's accent
// (--color-primary*) comes from newWorldAccentVars and is never set here. Theme fence: this sheet only reaches the stand-alone render.

const N = '[data-house-theme="new-world"]'
const R = `${N},${N} [data-th]`
const EASE = 'var(--nw-ease-out)'
const LABEL = 'font-family:var(--nw-font-mono);text-transform:uppercase;letter-spacing:var(--nw-ls-mono);font-weight:var(--nw-fw-medium);font-size:11px'

export const NEW_WORLD_CSS = `${NEW_WORLD_TOKENS_CSS}${NEW_WORLD_DAY_CSS}${NEW_WORLD_DETAIL_CSS}
${NEW_WORLD_BLOCKS_CSS}
${NEW_WORLD_SECTIONS_CSS}
${N}{--nw-font-display:var(--font-nw-unbounded,'Unbounded'),'Hanken Grotesk',system-ui,sans-serif;--nw-font-body:var(--font-nw-hanken,'Hanken Grotesk'),system-ui,-apple-system,'Segoe UI',sans-serif;--nw-font-accent:var(--font-nw-instrument,'Instrument Serif'),Georgia,serif;--nw-font-mono:var(--nw-font-display)}
${R}{color-scheme:inherit;--color-canvas:var(--nw-ink-900);--color-surface:var(--nw-ink-850);--color-surface-post:var(--nw-ink-850);--color-surface-elevated:var(--nw-ink-800);--color-surface-hover:var(--nw-ink-700);--color-border:var(--nw-border-default);--color-border-strong:var(--nw-border-strong);--color-text:var(--nw-text-primary);--color-text-muted:var(--nw-text-secondary);--color-text-subtle:var(--nw-text-muted);--color-focus-ring:var(--nw-focus-ring);--color-success:var(--nw-success-500);--color-warning:var(--nw-warning-500);--color-danger:var(--nw-danger-500);--color-info:var(--nw-halo-500);--color-ink:var(--color-primary);--color-on-ink:var(--color-text-on-primary);--radius-control:var(--nw-radius-pill);--radius-card:var(--nw-radius-lg);--radius-cover:var(--nw-radius-xl);--radius-media:var(--nw-radius-lg);--font-display:var(--nw-font-display);--font-body:var(--nw-font-body);--font-label:var(--nw-font-mono)}
${N}{font-family:var(--nw-font-body);line-height:var(--nw-lh-body);background:var(--nw-surface-page);color:var(--color-text)}
${N} .hs-root{background:var(--nw-surface-page);color:var(--color-text)}
${N} .hs-h1,${N} .hs-h2,${N} .hs-brand{font-family:var(--nw-font-display);font-stretch:var(--nw-stretch-display);font-weight:var(--nw-fw-display);letter-spacing:var(--nw-ls-display);line-height:var(--nw-lh-display)}
/* The root carries data-design="frequency", whose heading rule paints h1 to h4 in the console's ink; on a New World site that ink is pointed at the register's text colour instead. */
${R}{--fq-text-strong:var(--color-text)}
${N} .hs-h1 em,${N} .hs-h2 em{font-family:var(--nw-font-accent);font-style:italic;font-weight:var(--nw-fw-regular);font-size:var(--nw-em-size);letter-spacing:-.01em;color:var(--color-primary-strong)}
${N} .hs-eyebrow,${N} .hs-label,${N} .hs-badge{${LABEL}}
/* Filled accent buttons carry white labels (Daniel, 2026-11-04). The shared Services button reads --action-primary-text, which on a Night
   site is the ink of the white pill; the accent fill reads the on-accent token instead. */
${N} .sv-btn--accent,${N} .sv-btn--accent:hover{color:var(--nw-text-on-accent)}
${N} .hs-card{background:var(--nw-surface-card);border:var(--nw-border-hairline) solid var(--nw-border-subtle);border-radius:var(--nw-radius-lg);box-shadow:var(--nw-depth-md)}
${N} a{transition:color var(--nw-dur-fast) ${EASE}}
${N} a:hover{color:var(--nw-text-link-hover)}
${N} :focus-visible{outline:2px solid var(--nw-focus-ring);outline-offset:3px}
${N} .hs-btn,${N} .hs-btn-primary,${N} .hs-btn-dark{${LABEL};letter-spacing:var(--nw-ls-button);min-height:44px;padding:0 24px;border-radius:var(--nw-radius-pill)}
${N} .hs-btn-primary,${N} .hs-btn-dark{background:var(--color-primary);color:var(--color-text-on-primary);border:0;box-shadow:var(--nw-action-glow)}
${N} .hs-btn-primary:hover,${N} .hs-btn-dark:hover{background:var(--color-primary-hover);color:var(--color-text-on-primary)}
${N} .hs-btn-soft{background:transparent;color:var(--color-text);border:var(--nw-border-hairline) solid var(--nw-border-default)}
${N} .hs-btn-soft:hover{background:var(--nw-accent-tint);color:var(--color-text)}
/* THE KIT'S HEADER (handoff ui_kits/site/Chrome.jsx SiteHeader, look "bar"): a full-width ink bar with a glow hairline under it, the
   brand left, the menu in a glass capsule on the right with the flare dot on the current page, then the small accent button. Over a
   photo hero it lies on the picture under a soft top shade. Never the house's floating rounded pill. */
${N} .hs-header{position:sticky;top:0;z-index:40;padding:0;background:linear-gradient(180deg,color-mix(in oklab,var(--nw-chrome-50) 3.5%,transparent),transparent),var(--nw-ink-950);border-bottom:var(--nw-border-hairline) solid var(--nw-border-subtle);box-shadow:0 20px 40px -24px color-mix(in oklab,var(--nw-ink-950) 70%,transparent)}
${N} .hs-header::after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:1px;background:linear-gradient(90deg,transparent 0%,color-mix(in oklab,var(--nw-flare-400) 55%,transparent) 30%,color-mix(in oklab,var(--nw-swell-300) 50%,transparent) 55%,color-mix(in oklab,var(--nw-halo-300) 45%,transparent) 75%,transparent 100%);opacity:.7;pointer-events:none}
${N}:has(#top .sv-hero-bg--photo) .hs-header{position:absolute;left:0;right:0;background:linear-gradient(180deg,color-mix(in oklab,var(--nw-ink-950) 55%,transparent) 0%,transparent 100%);border-bottom-color:transparent;box-shadow:none}
${N} .hs-pill{max-width:var(--nw-frame);margin:0 auto;padding:18px var(--nw-gutter);border-radius:0;background:none;box-shadow:none;-webkit-backdrop-filter:none;backdrop-filter:none;border:0;animation:none;overflow:visible}
${N} .hs-header .hs-brand{padding-left:0;color:var(--nw-chrome-50);text-decoration:none}
${N} .hs-nav{-webkit-mask-image:none;mask-image:none}
${N} .hs-header-actions .hs-btn,${N} .hs-header-actions .hs-btn-primary,${N} .hs-header-actions .hs-btn-dark{min-height:36px;padding:0 18px;font-size:11px}
@media (min-width:940px){${N} .hs-pill{grid-template-columns:auto minmax(0,1fr) auto;column-gap:32px}
${N} .hs-nav{justify-self:end;width:max-content;max-width:100%;padding:10px 22px;border-radius:var(--nw-radius-pill);border:var(--nw-border-hairline) solid var(--nw-border-subtle);background:linear-gradient(180deg,color-mix(in oklab,var(--nw-chrome-50) 5%,transparent),color-mix(in oklab,var(--nw-chrome-50) 1%,transparent));-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);box-shadow:inset 0 1px 0 color-mix(in oklab,var(--nw-chrome-50) 6%,transparent)}
${N} .hs-nav-track{gap:32px;padding:0}${N} .hs-nav a,${N} .hs-nav-mega{padding:0;background:none}${N} .hs-header-actions{gap:24px}}
@media (max-width:939px){${N} .hs-nav{display:none}${N} .hs-pill{padding:14px var(--nw-gutter)}}
/* The owner's logo or photo in the bar: house-css sizes only .hs-logo-avatar and .hs-logo-image, and a skinned header prints a bare .hs-logo, so without this the image fills the bar and the header and headline vanish. */
${N} .hs-logo{flex:none;display:block;height:clamp(28px,6vw,36px);width:auto;max-width:160px;object-fit:contain;border-radius:var(--nw-radius-sm)}
/* A hero is a photo under a wash: the wash is Night ink and the words are light in both registers (the bridge above points ink at the accent for bands, which turned the wash teal and the headline dark). */
${N} .hs-hero{--color-ink:var(--nw-ink-950);--color-on-ink:var(--nw-chrome-50);--color-on-ink-muted:var(--nw-chrome-200)}
/* THE CLOSING CARD ("Find me locally", a Call to action card): the shared page sheet paints it with --color-ink, and here the bridge above points ink at the accent, so the card went flat accent with accent-on-accent copy and a button the same colour as its ground. It is a Night card instead: the register's card colour, its own text steps, and the accent kept for the button and the italic word. */
${N} .mw-closing.mw-closing{--color-ink:var(--nw-surface-card);--color-on-ink:var(--nw-text-primary);--color-on-ink-muted:var(--nw-text-secondary);background:var(--nw-surface-card);color:var(--nw-text-primary);border:var(--nw-border-hairline) solid var(--nw-border-subtle);box-shadow:var(--nw-depth-md)}
${N} .mw-closing .mw-kicker{color:var(--color-primary-strong)}
${N} .mw-closing .mw-display em{color:var(--color-primary-strong)}
${N} .hs-nav a,${N} .hs-nav-mega{display:inline-flex;align-items:center;gap:8px;${LABEL};letter-spacing:.14em;color:var(--nw-chrome-200);white-space:nowrap}
${N} .hs-nav a::before{content:"";width:5px;height:5px;border-radius:var(--nw-radius-pill);background:var(--color-primary);opacity:0;transition:opacity var(--nw-dur-fast) ${EASE}}
${N} .hs-nav a:hover,${N} .hs-nav a[aria-current="page"]{color:var(--nw-chrome-50)}
${N} .hs-nav a:hover::before,${N} .hs-nav a[aria-current="page"]::before{opacity:1}
${N} .hs-menu-panel,${N} .hs-mega-panel{background:var(--nw-ink-800);border:var(--nw-border-hairline) solid var(--nw-border-subtle);border-radius:var(--nw-radius-lg);box-shadow:var(--nw-depth-lg)}
/* THE KIT'S FOOTER (handoff Chrome.jsx SiteFooter): the sky ground under a glow line, the wordmark and closing line with the accent
   button first, the columns with mono heads, contact lines with their icons, the dim wordmark across the width, and the mono base line. */
${N} > div:has(> .hs-footer-top){position:relative;overflow:hidden;background:var(--nw-glow-sky,none),var(--nw-ink-950);border-top:var(--nw-border-hairline) solid var(--nw-border-subtle)}
${N} > div:has(> .hs-footer-top)::before{content:"";position:absolute;left:0;right:0;top:-1px;height:1px;background:linear-gradient(90deg,transparent 0%,color-mix(in oklab,var(--nw-flare-400) 55%,transparent) 30%,color-mix(in oklab,var(--nw-swell-300) 50%,transparent) 55%,color-mix(in oklab,var(--nw-halo-300) 45%,transparent) 75%,transparent 100%);opacity:.7;pointer-events:none}
${N} .hs-footer-top{max-width:var(--nw-frame);margin:0 auto;padding:96px var(--nw-gutter) 56px;gap:48px;background:none;border:0}
${N} .hs-footer-brand{display:flex;flex-direction:column;align-items:flex-start;gap:20px}
${N} .hs-footer-brand p{margin:0;color:var(--nw-text-secondary)}
${N} .sv-wordmark{display:block;font-family:var(--nw-font-display);font-stretch:var(--nw-stretch-display);font-weight:var(--nw-fw-display);letter-spacing:var(--nw-ls-display);line-height:1;font-size:clamp(24px,2.4vw,30px);color:var(--nw-chrome-50)}
${N} .sv-foot-band{margin:0;font-size:34px;line-height:1.05}
${N} .hs-footer-col-title{${LABEL};letter-spacing:.14em;color:var(--nw-text-muted)}
${N} .hs-footer-col{display:flex;flex-direction:column;align-items:flex-start;gap:12px}
${N} .hs-footer-col a,${N} .sv-foot-line{display:inline-flex;align-items:center;gap:10px;font-size:15px;color:var(--nw-chrome-200)}
${N} .hs-footer-col a:hover{color:var(--nw-chrome-50)}
${N} .sv-foot-icon{display:inline-flex;color:var(--color-primary-strong)}
${N} .sv-foot-mark{position:relative;max-width:var(--nw-frame);margin:0 auto;padding:0 var(--nw-gutter);font-family:var(--nw-font-display);font-stretch:var(--nw-stretch-display);font-weight:var(--nw-fw-display);text-transform:uppercase;line-height:.8;letter-spacing:-.01em;font-size:clamp(44px,9vw,150px);text-align:center;color:var(--nw-chrome-50);opacity:.07;user-select:none;overflow:hidden;white-space:nowrap}
${N} .hs-footer{max-width:var(--nw-frame);margin:0 auto;padding:24px var(--nw-gutter);${LABEL};font-size:10.5px;letter-spacing:.12em;color:var(--nw-text-muted);border-top:0;background:none}
@media (prefers-reduced-motion:reduce){${N} *{transition:none!important;animation:none!important}}
`
