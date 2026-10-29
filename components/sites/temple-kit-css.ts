import { TEMPLE_KIT_TOKENS_CSS, TEMPLE_KIT_VARIANTS_CSS } from '@/lib/theme/temple-kit'
import { TEMPLE_KIT_CHROME_CSS } from '@/components/sites/temple-kit-chrome-css'
import { TEMPLE_KIT_BLOCKS_CSS } from '@/components/sites/temple-kit-blocks-css'
import { TEMPLE_KIT_INNER_CSS } from '@/components/sites/temple-kit-inner/inner-css'
import { TEMPLE_KIT_INNER_B_CSS } from '@/components/sites/temple-kit-inner/inner-b-css'

// THE TEMPLE KIT SKIN, FOUNDATION LAYER. Scoped under [data-house-theme="temple-kit"], so it can only ever dress the
// stand-alone site render (components/sites/site-chrome.tsx sets that attribute on the site root, and nothing in
// a member, Space console or admin area does: app/(main)/no-site-theme-in-member-area.test.ts guards it). Every
// value reads the token block (lib/theme/temple-kit.ts); no raw colour or size lives here.
//
// This layer is the ground and the type primitives only: the plaster with two sun pools and the sand grain, the
// heading, body, label, link, button, focus and selection rules from the design's typography.css and effects.css.
// The header, footer and chrome are the next pass; the house sheets stay underneath until then.

const N = '[data-house-theme="temple-kit"]'
const EASE = 'var(--ease-out)'

export const TEMPLE_KIT_CSS = `${TEMPLE_KIT_TOKENS_CSS}${TEMPLE_KIT_VARIANTS_CSS}${N}{background-color:var(--color-canvas);background-image:radial-gradient(90% 60% at 12% -6%,color-mix(in srgb,var(--tk-saffron-400) 20%,transparent),transparent 70%),radial-gradient(70% 50% at 100% 8%,color-mix(in srgb,var(--tk-clay-500) 10%,transparent),transparent 66%),var(--texture-sand);background-size:auto,auto,200px;background-attachment:fixed,fixed,fixed;background-repeat:no-repeat,no-repeat,repeat;background-blend-mode:normal,normal,multiply;color:var(--color-text);font-family:var(--font-sans);font-size:var(--text-body);font-weight:var(--weight-light);line-height:var(--leading-relaxed);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
${N} .hs-root{background:transparent;color:var(--color-text)}
${N} h1,${N} h2,${N} h3,${N} .hs-h2,${N} .hs-brand{font-family:var(--font-display);font-weight:var(--weight-display);line-height:var(--leading-display);letter-spacing:var(--tracking-display);text-wrap:balance}
${N} h4,${N} h5,${N} h6{font-family:var(--font-display);font-weight:var(--weight-regular);line-height:var(--leading-snug);letter-spacing:var(--tracking-tight)}
${N} .hs-h1{font-family:var(--font-hero);font-weight:400;line-height:var(--leading-tight);letter-spacing:var(--tracking-display);text-wrap:balance}
${N} .hs-h1 em,${N} .hs-h2 em{font-style:var(--display-em-style)}
${N} strong,${N} b{font-weight:var(--weight-medium)}
${N} p,${N} li,${N} figcaption,${N} blockquote{text-wrap:pretty}
${N} .hs-lead{font-size:var(--text-lead);line-height:var(--leading-relaxed)}
${N} .hs-eyebrow,${N} .hs-label,${N} .hs-badge{font-family:var(--font-label);font-size:var(--text-eyebrow);font-weight:var(--weight-medium);text-transform:uppercase;letter-spacing:var(--label-tracking)}
${N} blockquote{font-family:var(--font-quote);font-style:italic;font-weight:var(--weight-light);font-size:var(--text-quote);line-height:1.28;color:var(--color-text)}
${N} a{color:var(--text-accent);text-decoration:none;transition:color var(--motion-fast) ${EASE},border-color var(--motion-fast) ${EASE}}
${N} a:hover{color:var(--tk-clay-700)}
${N} .hs-btn,${N} .hs-btn-primary,${N} .hs-btn-dark{font-family:var(--font-label);font-weight:var(--weight-medium);border-radius:var(--radius-control);transition:background-color var(--motion-fast) ${EASE},box-shadow var(--motion-fast) ${EASE},transform var(--motion-fast) ${EASE}}
${N} .hs-btn-primary,${N} .hs-btn-dark{background:var(--mn-solid);color:var(--kit-on-solid);border:1px solid var(--mn-solid);box-shadow:var(--shadow-button)}
${N} .hs-btn-primary:hover,${N} .hs-btn-dark:hover{background:var(--mn-solid-hover);border-color:var(--mn-solid-hover);color:var(--kit-on-solid);box-shadow:var(--shadow-button-hover)}
${N} .hs-btn:active{transform:scale(var(--press-scale))}
${N} :focus-visible{outline:none;box-shadow:var(--ring-focus)}
${N} ::selection{background:var(--color-selection);color:var(--tk-umber-900)}
@media (prefers-reduced-motion:reduce){${N},${N} *{--motion-instant:0ms;--motion-fast:0ms;--motion-base:0ms;--motion-slow:0ms;--motion-veil:0ms;animation-duration:.01ms!important;transition-duration:.01ms!important}}
${TEMPLE_KIT_CHROME_CSS}
${TEMPLE_KIT_BLOCKS_CSS}
${TEMPLE_KIT_INNER_CSS}
${TEMPLE_KIT_INNER_B_CSS}
`
