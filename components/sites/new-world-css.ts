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
${N}{--nw-font-display:var(--font-nw-unbounded,'Unbounded'),'Hanken Grotesk',system-ui,sans-serif;--nw-font-body:var(--font-nw-hanken,'Hanken Grotesk'),system-ui,-apple-system,'Segoe UI',sans-serif;--nw-font-accent:var(--font-nw-instrument,'Instrument Serif'),Georgia,serif;--nw-font-mono:var(--nw-font-display)}
${R}{color-scheme:inherit;--color-canvas:var(--nw-ink-900);--color-surface:var(--nw-ink-850);--color-surface-post:var(--nw-ink-850);--color-surface-elevated:var(--nw-ink-800);--color-surface-hover:var(--nw-ink-700);--color-border:var(--nw-border-default);--color-border-strong:var(--nw-border-strong);--color-text:var(--nw-text-primary);--color-text-muted:var(--nw-text-secondary);--color-text-subtle:var(--nw-text-muted);--color-focus-ring:var(--nw-focus-ring);--color-success:var(--nw-success-500);--color-warning:var(--nw-warning-500);--color-danger:var(--nw-danger-500);--color-info:var(--nw-halo-500);--color-ink:var(--color-primary);--color-on-ink:var(--color-text-on-primary);--radius-control:var(--nw-radius-pill);--radius-card:var(--nw-radius-lg);--radius-cover:var(--nw-radius-xl);--radius-media:var(--nw-radius-lg);--font-display:var(--nw-font-display);--font-body:var(--nw-font-body);--font-label:var(--nw-font-mono)}
${N}{font-family:var(--nw-font-body);line-height:var(--nw-lh-body);background:var(--nw-surface-page);color:var(--color-text)}
${N} .hs-root{background:var(--nw-surface-page);color:var(--color-text)}
${N} .hs-h1,${N} .hs-h2,${N} .hs-brand{font-family:var(--nw-font-display);font-stretch:var(--nw-stretch-display);font-weight:var(--nw-fw-display);letter-spacing:var(--nw-ls-display);line-height:var(--nw-lh-display)}
${N} .hs-h1 em,${N} .hs-h2 em{font-family:var(--nw-font-accent);font-style:italic;font-weight:var(--nw-fw-regular);font-size:var(--nw-em-size);letter-spacing:-.01em;color:var(--color-primary-strong)}
${N} .hs-eyebrow,${N} .hs-label,${N} .hs-badge{${LABEL}}
${N} .hs-card{background:var(--nw-surface-card);border:var(--nw-border-hairline) solid var(--nw-border-subtle);border-radius:var(--nw-radius-lg);box-shadow:var(--nw-shadow-md)}
${N} a{transition:color var(--nw-dur-fast) ${EASE}}
${N} a:hover{color:var(--nw-text-link-hover)}
${N} :focus-visible{outline:2px solid var(--nw-focus-ring);outline-offset:3px}
${N} .hs-btn,${N} .hs-btn-primary,${N} .hs-btn-dark{${LABEL};letter-spacing:var(--nw-ls-button);min-height:44px;padding:0 24px;border-radius:var(--nw-radius-pill)}
${N} .hs-btn-primary,${N} .hs-btn-dark{background:var(--color-primary);color:var(--color-text-on-primary);border:0;box-shadow:var(--nw-action-glow)}
${N} .hs-btn-primary:hover,${N} .hs-btn-dark:hover{background:var(--color-primary-hover);color:var(--color-text-on-primary)}
${N} .hs-btn-soft{background:transparent;color:var(--color-text);border:var(--nw-border-hairline) solid var(--nw-border-default)}
${N} .hs-btn-soft:hover{background:var(--nw-accent-tint);color:var(--color-text)}
/* The header: a frosted bar with a hairline under it, labels in the mono voice. */
${N} .hs-header{position:sticky;top:0;z-index:40}
${N} .hs-pill{background:color-mix(in oklab,var(--nw-ink-900) 82%,transparent);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);border-bottom:var(--nw-border-hairline) solid var(--nw-border-subtle)}
${N} .hs-nav a,${N} .hs-nav-mega{${LABEL};color:var(--nw-text-secondary)}
${N} .hs-nav a:hover,${N} .hs-nav a[aria-current="page"]{color:var(--nw-text-primary)}
${N} .hs-menu-panel,${N} .hs-mega-panel{background:var(--nw-ink-800);border:var(--nw-border-hairline) solid var(--nw-border-subtle);border-radius:var(--nw-radius-lg);box-shadow:var(--nw-shadow-lg)}
/* The footer: sunk ground, mono labels. */
${N} .hs-footer-top{background:var(--nw-surface-sunken);border-top:var(--nw-border-hairline) solid var(--nw-border-subtle)}
${N} .hs-footer-col-title{${LABEL};color:var(--nw-text-muted)}
@media (prefers-reduced-motion:reduce){${N} *{transition:none!important;animation:none!important}}
`
