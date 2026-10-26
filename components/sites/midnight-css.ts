import { MIDNIGHT_TOKENS_CSS } from '@/lib/theme/midnight'
import { MIDNIGHT_BLOCKS_CSS } from '@/components/sites/midnight-blocks-css'

// THE MIDNIGHT SKIN. Scoped under [data-house-theme="midnight"] so every house section keeps its markup and
// content; values come only from the token block (lib/theme/midnight.ts), never raw. It layers after the house
// sheets (components/sites/site-chrome.tsx): the page chrome here (the header bar, the footer, links, buttons,
// the house sections' type), then the Midnight block sheet. Reduced motion is honoured in the token block, and
// again here for the rules that move.

const N = '[data-house-theme="midnight"]'
const M = '[data-house-site][data-house-theme="midnight"]'
const EASE = 'var(--mn-ease)'
const LABEL = 'font-family:var(--mn-label);text-transform:uppercase;letter-spacing:var(--mn-tracking-label);font-weight:400'

export const MIDNIGHT_CSS = `${MIDNIGHT_TOKENS_CSS}
${N} .hs-root{background:var(--color-canvas);color:var(--color-text)}
${N} .hs-h1,${N} .hs-h2,${N} .hs-brand{font-family:var(--mn-display);font-weight:400;letter-spacing:var(--mn-tracking-display);line-height:var(--mn-leading-display)}
${N} .hs-h1 em,${N} .hs-h2 em{font-style:italic}
${N} .hs-eyebrow,${N} .hs-label,${N} .hs-badge{font-family:var(--mn-label);text-transform:uppercase;letter-spacing:var(--mn-tracking-eyebrow);font-weight:400}
${N} .hs-card{background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--mn-r-card);box-shadow:none}
${M} img{filter:grayscale(1) contrast(1.08) brightness(.9)}
${M} .hs-logo-avatar,${M} .hs-logo-image{filter:none}
${N} a{transition:color var(--mn-dur-fast) ${EASE}}
${N} a:hover{color:var(--color-accent)}
${N} .hs-btn:hover,${N} .hs-btn-primary:hover{color:var(--mn-on-solid)}
${N} .hs-btn-soft:hover{color:var(--mn-on-solid)}
${N} :focus-visible{outline:1px solid var(--color-focus-ring);outline-offset:3px}

/* The header: a full-width frosted bar with a strong hairline under it and a faint accent line along the foot. */
${N} .hs-header{position:sticky;top:0;z-index:40;padding:0;background:transparent;transition:none}
${N} .hs-header[data-hidden]{opacity:1;transform:none;pointer-events:auto}
${N} .hs-pill{position:relative;max-width:none;margin:0;padding:0 var(--mn-gutter);min-height:84px;border-radius:0;column-gap:var(--mn-gutter);background:color-mix(in srgb,var(--color-surface) 88%,transparent);-webkit-backdrop-filter:var(--mn-blur);backdrop-filter:var(--mn-blur);border-bottom:1px solid var(--mn-night-500);box-shadow:none;overflow:visible;animation:none}
${N} .hs-pill::after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:1px;opacity:.45;pointer-events:none;background:linear-gradient(90deg,transparent,var(--color-accent) 50%,transparent)}
@media (min-width:940px){${N} .hs-pill{grid-template-columns:auto minmax(0,1fr) auto;grid-template-areas:"logo nav cta"}${N} .hs-nav-track{margin:0 auto}}
${N} .hs-brand{padding-left:0;font-family:var(--mn-display);font-size:28px;letter-spacing:var(--mn-tracking-display);color:var(--color-text)}
${N} .hs-brand-name{font-family:var(--mn-display)}
${N} .hs-logo-avatar{box-shadow:0 0 0 1px var(--color-accent),var(--mn-glow);border-radius:50%}
${N} .hs-logo-image{border-radius:0}
${N} .hs-nav{-webkit-mask-image:none;mask-image:none}
${N} .hs-nav-track{gap:30px;padding:0;font-weight:400}
${N} .hs-nav a,${N} .hs-nav-mega{position:relative;padding:10px 0;border-radius:0;background:none;${LABEL};font-size:11.5px;letter-spacing:.18em;color:var(--color-text-muted);transition:color var(--mn-dur-fast) ${EASE}}
${N} .hs-nav a:hover,${N} .hs-nav-mega:hover,${N} .hs-nav-mega[aria-expanded="true"]{background:none;color:var(--color-text)}
${N} .hs-nav a::after,${N} .hs-nav-mega::after{content:"";position:absolute;left:0;right:0;bottom:-2px;height:1px;background:var(--color-accent);transform:scaleX(0);transform-origin:center;transition:transform var(--mn-dur-fast) ${EASE}}
${N} .hs-nav a[aria-current="page"]{color:var(--color-text)}
${N} .hs-nav a:hover::after,${N} .hs-nav a[aria-current="page"]::after,${N} .hs-nav-mega[aria-expanded="true"]::after{transform:scaleX(1)}
${N} .hs-header-actions{gap:16px}
${N} .hs-header .hs-btn-dark,${N} .hs-header .hs-btn-primary{min-height:44px;padding:0 22px;background:var(--mn-solid);color:var(--mn-on-solid);border:1px solid var(--mn-solid);border-radius:var(--mn-r-control)}
${N} .hs-header .hs-btn-dark:hover{background:var(--mn-solid-hover);color:var(--mn-on-solid)}
${N} .hs-menu-button{background:transparent;color:var(--color-text);border:1px solid var(--mn-night-500);border-radius:var(--mn-r-control)}
${N} .hs-menu-panel,${N} .hs-mega-panel{border-radius:var(--mn-r-card);background:var(--color-surface-elevated);-webkit-backdrop-filter:none;backdrop-filter:none;box-shadow:var(--mn-shadow-menu);border:1px solid var(--mn-night-500)}
${N} .hs-menu-panel a,${N} .hs-mega-links a{border-radius:var(--mn-r-control);${LABEL};color:var(--color-text-muted)}
${N} .hs-mega-links a:hover{background:var(--color-surface-hover);color:var(--color-text)}
${N} .hs-mega-label,${N} .hs-mega-feature-title{font-family:var(--mn-display)}
${N} .hs-member{padding:8px 16px;border-radius:var(--mn-r-pill);background:transparent;border:1px solid var(--mn-night-500);color:var(--color-text);${LABEL};font-size:11px}
${N} .hs-member:hover{background:var(--color-surface-hover);color:var(--color-text)}
${N} .hs-nav .hs-nav-admin{display:flex;align-items:center;gap:8px;margin-left:16px;padding:4px 4px 4px 12px;border-radius:var(--mn-r-pill);background:var(--color-surface-elevated);border:1px solid var(--mn-night-500)}
${N} .hs-nav-admin-tag{padding:0;color:var(--color-text-muted)}
${N} .hs-nav-admin a{padding:8px 12px;color:var(--color-text)}
${N} .hs-nav-admin a::after{content:none}
${N} .hs-nav-admin-colon,${N} .hs-nav-admin-sep{display:none}
@media (max-width:939px){${N} .hs-pill{min-height:72px;padding:12px var(--mn-gutter) 0}${N} .hs-nav-track{justify-content:center}}

/* The footer: columns of small-caps links over a ruled foot. */
${N} .hs-footer-top{max-width:var(--mn-max);margin:0 auto;padding:var(--mn-section-tight) var(--mn-gutter) 48px;border-top:1px solid var(--mn-night-300);gap:48px;grid-template-columns:minmax(0,1.4fr) repeat(auto-fit,minmax(min(100%,10rem),1fr))}
${N} .hs-footer-brand{gap:16px}
${N} .hs-footer-brand .hs-brand{font-family:var(--mn-display);font-size:28px;color:var(--color-text)}
${N} .hs-footer-brand p{font-size:var(--mn-size-body-sm);color:var(--color-text-muted);max-width:30ch}
${N} .hs-footer-col{display:flex;flex-direction:column;align-items:flex-start;gap:12px}
${N} .hs-footer-col-title{margin:0 0 12px;font-family:var(--mn-label);font-size:var(--mn-size-eyebrow);text-transform:uppercase;letter-spacing:var(--mn-tracking-eyebrow);font-weight:400;color:var(--color-text-subtle)}
${N} .hs-footer-col a,${N} .hs-footer-links a{font-size:var(--mn-size-body-sm);color:var(--color-text-muted)}
${N} .hs-footer-col a:hover,${N} .hs-footer-links a:hover{color:var(--color-accent)}
${N} .hs-footer-links{gap:12px 32px}
${N} .hs-footer{max-width:var(--mn-max);padding:24px var(--mn-gutter) 40px;border-top:1px solid var(--mn-night-300);font-size:var(--mn-size-meta);letter-spacing:.02em;color:var(--color-text-subtle)}
${N} .hs-footer a{color:var(--color-text-muted)}
${N} .hs-footer a:hover{color:var(--color-accent)}
${N} .hs-footer-line,${N} .hs-footer-note{color:var(--color-text-subtle)}
${N} .hs-footer a.hs-partner{border-color:var(--mn-night-500);background:transparent;color:var(--color-text-muted)}
${N} .hs-footer a.hs-partner b{color:var(--color-text)}
${N} .hs-footer a.hs-partner svg{color:var(--color-accent)}
${N} .hs-footer a.hs-partner:hover{border-color:var(--color-accent);color:var(--color-text)}
@media (max-width:959px){${N} .hs-footer-top{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}${N} .hs-footer-brand{grid-column:1 / -1}}
@media (max-width:600px){${N} .hs-footer-top{grid-template-columns:minmax(0,1fr)}}
@media (prefers-reduced-motion:reduce){${N} *{transition:none!important;animation:none!important}}
${MIDNIGHT_BLOCKS_CSS}`
