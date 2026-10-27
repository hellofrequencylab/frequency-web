import { DESIGNER_TOKENS_CSS } from '@/lib/theme/designer'
import { DESIGNER_BLOCKS_CSS } from '@/components/sites/designer-blocks-css'

// THE DESIGNER SKIN. Scoped under [data-house-theme="designer"] so every house section keeps its markup and
// content; values come only from the token block (lib/theme/designer.ts), never raw. It layers after the house
// sheets (components/sites/site-chrome.tsx): the page chrome here (the parchment header with its hairline, the
// charcoal button, the deep rounded footer), then the Designer block sheet.

const N = '[data-house-theme="designer"]'
const EASE = 'var(--dz-ease)'
const LABEL = 'font-family:var(--dz-sans);text-transform:uppercase;letter-spacing:.16em;font-weight:500'

export const DESIGNER_CSS = `${DESIGNER_TOKENS_CSS}
${N} .hs-root{background:var(--color-canvas);color:var(--color-text);font-size:var(--dz-size-body);line-height:var(--dz-leading-body)}
${N} .hs-h1,${N} .hs-h2,${N} .hs-brand{font-family:var(--dz-display);font-weight:400;letter-spacing:var(--dz-tracking-display);line-height:var(--dz-leading-tight)}
${N} .hs-h1 em,${N} .hs-h2 em{font-style:italic}
${N} .hs-eyebrow,${N} .hs-label,${N} .hs-badge{${LABEL};letter-spacing:var(--dz-tracking-label)}
${N} .hs-card{background:var(--dz-parchment);border:0;border-radius:var(--dz-r-2);box-shadow:var(--dz-shadow-1)}
${N} a{transition:color var(--dz-dur-base) ${EASE}}
${N} a:hover{color:var(--dz-terracotta-deep)}
${N} :focus-visible{outline:2px solid var(--dz-ochre);outline-offset:3px}
${N} .hs-btn,${N} .hs-btn-primary,${N} .hs-btn-dark{${LABEL};font-size:var(--dz-size-label);letter-spacing:var(--dz-tracking-button);min-height:48px;padding:0 26px;border-radius:var(--dz-r-1)}
${N} .hs-btn-primary,${N} .hs-btn-dark{background:var(--dz-charcoal);color:var(--dz-plaster);border:1px solid var(--dz-charcoal);box-shadow:var(--dz-shadow-btn)}
${N} .hs-btn-primary:hover,${N} .hs-btn-dark:hover{background:var(--dz-ink);color:var(--dz-plaster)}
${N} .hs-btn-soft{background:transparent;color:var(--dz-charcoal);border:1px solid var(--dz-charcoal)}
${N} .hs-btn-soft:hover{background:var(--dz-charcoal);color:var(--dz-plaster)}

/* The header: parchment bar with a warm hairline shadow, tracked-caps links, a charcoal call. */
${N} .hs-header{position:sticky;top:0;z-index:40;padding:0;background:transparent;transition:none}
${N} .hs-header[data-hidden]{opacity:1;transform:none;pointer-events:auto}
${N} .hs-pill{max-width:none;margin:0;padding:0 var(--dz-gutter);min-height:var(--dz-header-h);border-radius:0;column-gap:var(--dz-gutter);background:var(--dz-parchment);-webkit-backdrop-filter:none;backdrop-filter:none;border:0;box-shadow:var(--dz-shadow-header);overflow:visible;animation:none}
@media (min-width:940px){${N} .hs-pill{grid-template-columns:auto minmax(0,1fr) auto;grid-template-areas:"logo nav cta"}${N} .hs-nav-track{margin:0 0 0 auto}}
${N} .hs-brand{font-size:26px;letter-spacing:.12em;text-transform:uppercase;color:var(--dz-charcoal)}
${N} .hs-brand-name{font-family:var(--dz-display);font-weight:500}
${N} .hs-logo-image{border-radius:0;max-height:52px;width:auto;mix-blend-mode:multiply}
${N} .hs-nav{-webkit-mask-image:none;mask-image:none}
${N} .hs-nav-track{gap:36px;padding:0}
${N} .hs-nav a,${N} .hs-nav-mega{position:relative;padding:10px 0;border-radius:0;background:none;${LABEL};font-size:var(--dz-size-label);color:var(--dz-charcoal);transition:color var(--dz-dur-base) ${EASE}}
${N} .hs-nav a:hover,${N} .hs-nav-mega:hover,${N} .hs-nav-mega[aria-expanded="true"]{background:none;color:var(--dz-terracotta)}
${N} .hs-nav a::after,${N} .hs-nav-mega::after{content:"";position:absolute;left:0;right:0;bottom:-2px;height:1px;background:var(--dz-ochre);transform:scaleX(0);transform-origin:left;transition:transform var(--dz-dur-base) ${EASE}}
${N} .hs-nav a:hover::after,${N} .hs-nav a[aria-current="page"]::after,${N} .hs-nav-mega[aria-expanded="true"]::after{transform:scaleX(1)}
${N} .hs-nav a[aria-current="page"]{color:var(--dz-charcoal)}
${N} .hs-header-actions{gap:16px}
${N} .hs-header .hs-btn-dark,${N} .hs-header .hs-btn-primary{min-height:48px;padding:0 24px}
${N} .hs-menu-button{background:transparent;color:var(--dz-charcoal);border:1px solid var(--dz-line);border-radius:var(--dz-r-pill)}
${N} .hs-menu-panel,${N} .hs-mega-panel{border-radius:var(--dz-r-2);background:var(--dz-paper);-webkit-backdrop-filter:none;backdrop-filter:none;box-shadow:var(--dz-shadow-3);border:0}
${N} .hs-menu-panel a,${N} .hs-mega-links a{border-radius:var(--dz-r-1);color:var(--dz-charcoal)}
${N} .hs-mega-links a:hover{background:var(--dz-linen)}
${N} .hs-mega-label,${N} .hs-mega-feature-title{font-family:var(--dz-display)}
${N} .hs-member{padding:8px 16px;border-radius:var(--dz-r-pill);background:transparent;border:1px solid var(--dz-line);color:var(--dz-charcoal)}
@media (max-width:939px){${N} .hs-pill{min-height:72px}${N} .hs-nav-track{justify-content:center}}

/* The footer: deep ink with rounded top corners, tracked-caps column titles. */
${N} .hs-footer-top{position:relative;max-width:none;margin:0;padding:var(--dz-section-y) max(var(--dz-gutter),calc((100% - var(--dz-container)) / 2)) var(--dz-section-head);background:var(--dz-ink);color:var(--dz-on-dark);border-radius:var(--dz-r-section) var(--dz-r-section) 0 0;gap:40px;grid-template-columns:minmax(0,1.2fr) repeat(auto-fit,minmax(min(100%,10rem),1fr))}
${N} .hs-footer-brand{gap:20px}
${N} .hs-footer-brand .hs-brand,${N} .hs-footer-brand p{color:var(--dz-on-dark)}
${N} .hs-footer-brand p{font-size:var(--dz-size-small);color:var(--dz-on-dark-muted);max-width:30ch}
${N} .hs-footer-col{display:flex;flex-direction:column;align-items:flex-start;gap:12px}
${N} .hs-footer-col-title{margin:0 0 6px;${LABEL};font-size:var(--dz-size-micro);letter-spacing:.2em;color:var(--dz-sand)}
${N} .hs-footer-col a,${N} .hs-footer-links a{font-size:var(--dz-size-small);color:var(--dz-on-dark-muted);text-decoration:none}
${N} .hs-footer-col a:hover,${N} .hs-footer-links a:hover{color:var(--dz-sand)}
${N} .hs-footer-links{gap:12px 32px}
${N} .hs-footer{max-width:none;margin:0;padding:28px max(var(--dz-gutter),calc((100% - var(--dz-container)) / 2));background:var(--dz-ink);border-top:1px solid var(--dz-rule-dark);font-size:13px;color:var(--dz-on-dark-muted)}
${N} .hs-footer a{color:var(--dz-on-dark-muted)}
${N} .hs-footer a:hover{color:var(--dz-sand)}
${N} .hs-footer-line,${N} .hs-footer-note{color:var(--dz-on-dark-muted)}
${N} .hs-footer a.hs-partner{border-color:var(--dz-rule-dark);background:transparent;color:var(--dz-on-dark-muted)}
${N} .hs-footer a.hs-partner b{color:var(--dz-on-dark)}
@media (max-width:959px){${N} .hs-footer-top{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}${N} .hs-footer-brand{grid-column:1 / -1}}
@media (max-width:600px){${N} .hs-footer-top{grid-template-columns:minmax(0,1fr)}}
@media (prefers-reduced-motion:reduce){${N} *{transition:none!important;animation:none!important}}
${DESIGNER_BLOCKS_CSS}`
