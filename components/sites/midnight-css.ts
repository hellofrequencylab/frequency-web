import { MIDNIGHT_TOKENS_CSS } from '@/lib/theme/midnight'

// THE MIDNIGHT SKIN. Drop-in at components/sites/midnight-css.ts. A STARTER: the token block plus the few
// rules that make the shared house sections read as Midnight. Scoped under [data-house-theme="midnight"] so
// every house section keeps its markup and content; values come only from the token block, never raw.
// Extend section by section against components/sites/temple-css.ts, and mirror temple-css.test.ts (every
// selector scoped, reduced motion honoured).

const N = '[data-house-theme="midnight"]'
const M = '[data-house-site][data-house-theme="midnight"]'

export const MIDNIGHT_CSS = `${MIDNIGHT_TOKENS_CSS}
${N} .hs-root{background:var(--color-canvas);color:var(--color-text)}
${N} .hs-h1,${N} .hs-h2,${N} .hs-brand{font-family:var(--mn-display);font-weight:400;letter-spacing:var(--mn-tracking-display);line-height:var(--mn-leading-display)}
${N} .hs-h1 em,${N} .hs-h2 em{font-style:italic}
${N} .hs-eyebrow,${N} .hs-label,${N} .hs-btn,${N} .hs-badge{font-family:var(--mn-label);text-transform:uppercase;letter-spacing:var(--mn-tracking-eyebrow)}
${N} .hs-btn-primary{background:var(--mn-solid);color:var(--mn-on-solid);border-radius:var(--mn-r-control)}
${N} .hs-btn-primary:hover{background:var(--mn-solid-hover)}
${N} .hs-card{background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--mn-r-card);box-shadow:none}
${M} img{filter:grayscale(1) contrast(1.08) brightness(.9)}
${N} a:hover{color:var(--color-accent)}
${N} :focus-visible{outline:1px solid var(--color-focus-ring);outline-offset:3px}
@media (prefers-reduced-motion:reduce){${N} *{transition:none!important;animation:none!important}}
`
