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
${N}{background:var(--dz-plaster-tex),var(--color-canvas);font-size:var(--dz-size-body);line-height:var(--dz-leading-body)}
/* The film grain: one fixed overlay over the whole page, photos included (design: body::after). */
${N}::after{content:"";position:fixed;inset:0;z-index:9999;pointer-events:none;background-image:var(--dz-grain);opacity:var(--dz-grain-opacity);mix-blend-mode:multiply}
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

/* The header (design: SiteHeader). A utility bar over a main bar, both parchment with a hairline shadow. Over a
   hero it is CLEAR (a dark-to-nothing wash, light type, an outline call, the logo on a white tab) and turns solid
   once the page has scrolled 60px (DesignerHeaderState sets data-scrolled). */
${N} .dz-top{position:sticky;top:0;z-index:50;background:var(--dz-parchment);box-shadow:var(--dz-shadow-header);transition:background var(--dz-dur-base) ${EASE},box-shadow var(--dz-dur-base) ${EASE}}
${N}:has(#top .dz-hero) .dz-top{position:fixed;left:0;right:0}
${N}:has(#top .dz-hero):not([data-scrolled]) .dz-top{background:var(--dz-scrim-header);box-shadow:none}
${N} .dz-util{display:flex;align-items:center;justify-content:space-between;gap:24px;max-width:var(--dz-container);height:42px;margin:0 auto;padding:0 var(--dz-gutter);border-bottom:1px solid var(--dz-line-soft);font-size:13px;letter-spacing:.04em;color:var(--dz-stone)}
${N} .dz-util a{color:inherit;text-decoration:none}
${N} .dz-util-left{font-size:11px;letter-spacing:.16em;text-transform:uppercase}
${N} .dz-util-items{display:flex;align-items:center;gap:28px}
${N}:has(#top .dz-hero):not([data-scrolled]) .dz-util{border-color:var(--dz-util-edge);color:var(--dz-on-dark-muted)}
${N}[data-scrolled] .dz-util{display:none}
${N} .dz-top .hs-header{position:static;top:auto;z-index:auto;padding:0;background:transparent;transition:none}
${N} .dz-top .hs-header[data-hidden]{opacity:1;transform:none;pointer-events:auto}
${N} .dz-top .hs-pill{max-width:var(--dz-container);margin:0 auto;padding:0 var(--dz-gutter);min-height:var(--dz-header-h);border-radius:0;column-gap:var(--dz-gutter);background:transparent;-webkit-backdrop-filter:none;backdrop-filter:none;border:0;box-shadow:none;overflow:visible;animation:none;transition:min-height var(--dz-dur-base) ${EASE}}
${N}[data-scrolled] .dz-top .hs-pill{min-height:76px}
@media (min-width:940px){${N} .dz-top .hs-pill{grid-template-columns:auto minmax(0,1fr) auto;grid-template-areas:"logo nav cta"}${N} .hs-nav-track{margin:0 0 0 auto}}
${N} .hs-brand{font-size:26px;letter-spacing:.12em;text-transform:uppercase;color:var(--dz-charcoal)}
${N} .hs-brand-name{font-family:var(--dz-display);font-weight:500}
${N} .hs-logo-image{border-radius:0;max-height:48px;width:auto;mix-blend-mode:multiply}
${N}:has(#top .dz-hero):not([data-scrolled]) .dz-top .hs-header .hs-brand{padding:8px 14px;border-radius:var(--dz-r-1);background:var(--dz-paper);box-shadow:var(--dz-shadow-tab)}
${N}:has(#top .dz-hero):not([data-scrolled]) .dz-top .hs-logo-image{max-height:42px;mix-blend-mode:normal}
${N} .hs-nav{-webkit-mask-image:none;mask-image:none}
${N} .hs-nav-track{gap:40px;padding:0}
${N} .hs-nav a,${N} .hs-nav-mega{position:relative;padding:10px 0;border-radius:0;background:none;${LABEL};font-size:var(--dz-size-label);color:var(--dz-charcoal);transition:color var(--dz-dur-base) ${EASE}}
${N}:has(#top .dz-hero):not([data-scrolled]) .dz-top .hs-nav a,${N}:has(#top .dz-hero):not([data-scrolled]) .dz-top .hs-nav-mega{color:var(--dz-plaster);text-shadow:var(--dz-text-shadow)}
${N} .hs-nav-mega{display:inline-flex;align-items:center;gap:8px}
${N} .hs-nav a:hover,${N} .hs-nav-mega:hover,${N} .hs-nav-mega[aria-expanded="true"]{background:none;color:var(--dz-terracotta)}
${N}:has(#top .dz-hero):not([data-scrolled]) .dz-top .hs-nav a:hover,${N}:has(#top .dz-hero):not([data-scrolled]) .dz-top .hs-nav-mega:hover{color:var(--dz-sand)}
${N} .hs-nav a::after,${N} .hs-nav-mega::after{content:"";position:absolute;left:0;right:0;bottom:-2px;height:1px;background:var(--dz-ochre);transform:scaleX(0);transform-origin:left;transition:transform var(--dz-dur-base) ${EASE}}
${N} .hs-nav a:hover::after,${N} .hs-nav a[aria-current="page"]::after,${N} .hs-nav-mega[aria-expanded="true"]::after{transform:scaleX(1)}
${N} .hs-nav a[aria-current="page"]{color:var(--dz-charcoal)}
${N} .hs-header-actions{gap:16px}
${N} .dz-top .hs-btn-dark,${N} .dz-top .hs-btn-primary{${LABEL};font-size:12px;letter-spacing:var(--dz-tracking-button);min-height:0;padding:15px 24px;border-radius:var(--dz-r-1);background:var(--dz-charcoal);border:1px solid var(--dz-charcoal);color:var(--dz-plaster);box-shadow:var(--dz-shadow-btn);transition:all var(--dz-dur-base) ${EASE}}
${N}:has(#top .dz-hero):not([data-scrolled]) .dz-top .hs-btn-dark,${N}:has(#top .dz-hero):not([data-scrolled]) .dz-top .hs-btn-primary{background:transparent;border-color:var(--dz-outline-light);box-shadow:none}
${N} .hs-menu-button{width:48px;height:48px;background:var(--dz-paper);color:var(--dz-charcoal);border:1px solid var(--dz-line);border-radius:var(--dz-r-pill)}
${N}:has(#top .dz-hero):not([data-scrolled]) .dz-top .hs-menu-button{background:transparent;color:var(--dz-plaster);border-color:var(--dz-outline-light)}
${N} .hs-menu-panel,${N} .hs-mega-panel{border-radius:var(--dz-r-2);background:var(--dz-paper);-webkit-backdrop-filter:none;backdrop-filter:none;box-shadow:var(--dz-shadow-3);border:0}
${N} .hs-mega-panel{min-width:340px;padding:10px}
${N} .hs-menu-panel a,${N} .hs-mega-links a{border-radius:var(--dz-r-1);color:var(--dz-charcoal)}
${N} .hs-mega-links a{display:flex;flex-direction:column;gap:6px;padding:14px 18px}
${N} .hs-mega-links a:hover{background:var(--dz-linen)}
${N} .hs-mega-label,${N} .hs-mega-feature-title{font-family:var(--dz-display);font-size:20px;font-weight:400;line-height:1.2;letter-spacing:0;text-transform:none}
${N} .hs-mega-desc{font-size:13px;line-height:1.3;color:var(--dz-stone)}
${N} .hs-member{padding:8px 16px;border-radius:var(--dz-r-pill);background:transparent;border:1px solid var(--dz-line);color:var(--dz-charcoal)}
/* Phone (design: the 48px round button and a full-height parchment sheet; the call and the nav live in the sheet). */
@media (max-width:939px){
${N} .dz-util{display:none}
${N} .dz-top .hs-pill{position:static;display:flex;align-items:center;justify-content:space-between;min-height:var(--dz-header-h)}
${N}[data-scrolled] .dz-top .hs-pill{min-height:76px}
${N} .dz-top .hs-brand{flex:none}
${N} .dz-top .hs-nav,${N} .dz-top .hs-header-actions>.hs-btn{display:none}
${N} .dz-top .hs-menu{position:static}
${N} .hs-menu-panel{position:absolute;left:0;right:0;top:100%;max-width:none;height:calc(100vh - 76px);margin:0;padding:16px var(--dz-gutter) 40px;gap:6px;overflow-y:auto;border-radius:0;background:var(--dz-parchment);box-shadow:inset 0 1px 0 var(--dz-line-soft)}
${N} .hs-menu-panel a{padding:14px 0;border-bottom:1px solid var(--dz-line-soft);border-radius:0;font-family:var(--dz-display);font-size:24px;font-weight:400;line-height:1.2;color:var(--dz-charcoal)}
${N} .hs-menu-panel a[data-cta]{display:block;margin-top:28px;padding:18px;border:0;border-radius:var(--dz-r-1);background:var(--dz-charcoal);text-align:center;color:var(--dz-plaster);box-shadow:var(--dz-shadow-btn);${LABEL};font-size:var(--dz-size-label);letter-spacing:var(--dz-tracking-button);line-height:1}
}

/* The footer (design: SiteFooter). Deep ink with rounded top corners, a closing band, the brand tile and link
   columns, the letter. The legal row is the house footer's, drawn inside the same container. */
${N} .dz-foot{position:relative;overflow:hidden;width:100%;max-width:none;margin:0;padding:var(--dz-section-y) max(var(--dz-gutter),calc((100% - var(--dz-container)) / 2)) 0;display:block;border:0;background:var(--dz-ink);color:var(--dz-plaster);border-radius:var(--dz-r-section) var(--dz-r-section) 0 0}
${N} .dz-foot::before{content:"";position:absolute;inset:0;pointer-events:none;background:var(--dz-glow-foot)}
${N} .dz-foot::after{content:"";position:absolute;inset:0;pointer-events:none;opacity:.07;background-image:var(--dz-grain-light)}
${N} .dz-foot>*{position:relative;z-index:1}
${N} .dz-foot-band{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:40px;padding-bottom:var(--dz-section-head);margin-bottom:var(--dz-section-head);border-bottom:1px solid var(--dz-hairline-dark)}
${N} .dz-foot-band h2{margin:0;max-width:720px;font-family:var(--dz-display);font-weight:400;font-size:var(--dz-size-display-l);line-height:1.02;text-wrap:balance}
${N} .dz-foot-band h2 em{font-style:italic;color:var(--dz-sand)}
${N} .dz-foot-band .dz-actions{margin:0}
${N}:has(.dz-inquiry) .dz-foot-band{display:none}
${N} .dz-foot-grid{display:grid;grid-template-columns:minmax(0,1.2fr) repeat(var(--dz-foot-cols,3),minmax(0,1fr)) minmax(0,1.7fr);gap:40px}
${N} .dz-foot-grid:not([data-subscribe]){grid-template-columns:minmax(0,1.2fr) repeat(var(--dz-foot-cols,3),minmax(0,1fr))}
${N} .dz-foot-brand{display:flex;flex-direction:column;align-items:flex-start;gap:20px}
${N} .dz-foot-tile{display:block;padding:16px 20px;border-radius:var(--dz-r-2);background:var(--dz-parchment);box-shadow:var(--dz-shadow-tile)}
${N} .dz-foot-tile img{display:block;height:104px;width:auto;mix-blend-mode:multiply}
${N} .dz-foot-cslb{${LABEL};font-size:var(--dz-size-micro);letter-spacing:.2em;line-height:1;color:var(--dz-sage)}
${N} .hs-footer-col{display:flex;flex-direction:column;align-items:flex-start;gap:0}
${N} .hs-footer-col-title{margin:0 0 18px;${LABEL};font-size:var(--dz-size-micro);letter-spacing:.2em;line-height:1;color:var(--dz-sand)}
${N} .hs-footer-col p{margin:0;font-size:var(--dz-size-small);line-height:1.8;color:var(--dz-on-dark-text)}
${N} .hs-footer-col p+p{margin-top:12px}
${N} .hs-footer-col a,${N} .hs-footer-links a{color:var(--dz-plaster);text-decoration:none}
${N} .hs-footer-col a:hover,${N} .hs-footer-links a:hover{color:var(--dz-sand)}
${N} .dz-letter{display:flex;flex-direction:column;gap:16px;color:var(--dz-plaster)}
${N} .dz-letter h3{margin:0;font-family:var(--dz-display);font-weight:400;font-size:var(--dz-size-h2);line-height:1.1}
${N} .dz-letter-body{margin:0;max-width:440px;font-size:var(--dz-size-small);line-height:1.6;color:var(--dz-on-dark-soft)}
${N} .dz-letter-well{display:flex;gap:6px;margin-top:6px;padding:6px;border:1px solid var(--dz-well-edge);border-radius:var(--dz-r-2);background:var(--dz-well);box-shadow:var(--dz-well-inset);transition:border-color var(--dz-dur-base) ${EASE},box-shadow var(--dz-dur-base) ${EASE}}
${N} .dz-letter-well:focus-within{border-color:var(--dz-ochre);box-shadow:var(--dz-ring)}
${N} .dz-letter-input{flex:1;border:0;outline:0;background:transparent;min-width:0;padding:12px;font:400 var(--dz-size-small)/1.4 var(--dz-sans);color:var(--dz-plaster)}
${N} .dz-letter-input::placeholder{color:var(--dz-on-dark-faint)}
${N} .dz-letter-well button{flex:none;padding:0 20px;border:0;border-radius:var(--dz-r-1);background:var(--dz-sand);color:var(--dz-charcoal);box-shadow:var(--dz-shadow-btn);cursor:pointer;${LABEL};font-size:12px;letter-spacing:var(--dz-tracking-button)}
${N} .dz-letter-fine{font-size:13px;line-height:1.4;color:var(--dz-on-dark-faint)}
${N} .dz-letter-done{margin:8px 0 0;font-family:var(--dz-display);font-style:italic;font-size:24px;line-height:1.3;color:var(--dz-sand)}
${N} .hs-footer{position:relative;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:16px;max-width:none;margin:0;padding:var(--dz-section-head) max(var(--dz-gutter),calc((100% - var(--dz-container)) / 2)) 28px;border:0;background:var(--dz-ink);font-size:13px;line-height:1.4;color:var(--dz-on-dark-faint)}
${N} .hs-footer::before{content:"";position:absolute;top:var(--dz-section-head);left:max(var(--dz-gutter),calc((100% - var(--dz-container)) / 2));right:max(var(--dz-gutter),calc((100% - var(--dz-container)) / 2));height:1px;background:var(--dz-hairline-dark)}
${N} .hs-footer>*{position:relative;padding-top:28px}
${N} .hs-footer a{color:var(--dz-on-dark-faint)}
${N} .hs-footer a:hover{color:var(--dz-sand)}
${N} .hs-footer-line,${N} .hs-footer-note{color:var(--dz-on-dark-faint);font-style:italic}
${N} .hs-footer-line{margin-left:auto}
/* The design's footer follows the last section directly (no page tail, no footer top margin). */
${N} .mw-page{padding-bottom:0}
${N} .hs-footer a.hs-partner{border-color:var(--dz-rule-dark);background:transparent;color:var(--dz-on-dark-muted)}
${N} .hs-footer a.hs-partner b{color:var(--dz-on-dark)}
@media (max-width:900px){${N} .dz-foot-grid{grid-template-columns:repeat(2,minmax(0,1fr))}${N} .dz-foot-grid:not([data-subscribe]){grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:560px){${N} .dz-foot-grid{grid-template-columns:minmax(0,1fr)}}
@media (prefers-reduced-motion:reduce){${N} *{transition:none!important;animation:none!important}}
${DESIGNER_BLOCKS_CSS}`
