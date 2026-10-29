import { NETWORK_KIT_TOKENS_CSS } from '@/lib/theme/network-kit'
import { NETWORK_KIT_BLOCKS_CSS } from '@/components/sites/network-kit-blocks-css'
import { NETWORK_KIT_MORE_CSS } from '@/components/sites/network-kit-more-css'
import { NETWORK_KIT_INNER_CSS } from '@/components/sites/network-kit-inner/inner-css'
import { NETWORK_KIT_INNER_B_CSS } from '@/components/sites/network-kit-inner/inner-b-css'

// THE NETWORK THEME KIT SKIN (code id `network-kit`, shown as Network). Scoped under [data-house-theme="network-kit"]
// so every house section keeps its markup and content; every value is a token (lib/theme/network-kit.ts), never a
// raw colour. It layers after the house sheets (components/sites/site-chrome.tsx), and AFTER the owner's look sheet
// (site-look-css.ts) so the kit's shapes follow the --nk-radius-* tokens the look axes re-point.
//
// What the design asks for, in one place:
//   · white, ink, one hero colour: paper ground, card tint, deep ink band, one solid accent;
//   · pill controls (44/48/56 targets, rise 1px, press .97), 28px cards, 32px photo panels, a leaf crop once a page;
//   · sentence-case labels with one accent dot, never uppercase or tracked;
//   · a fine film grain over the page (22% multiply, 18% on Ocean), a warm grade on photos in [data-grade];
//   · focus is a 2px ink outline, 3px off; reduced motion removes every move.
// Classes: `.hs-*` restyles the house sections; `.nk-*` are the kit's own primitives for the blocks.

const N = '[data-house-theme="network-kit"]'
const M = '[data-house-site][data-house-theme="network-kit"]'
const COL = 'max(var(--nk-space-gutter),calc((100% - var(--nk-column)) / 2))'
const WAVE_FOOT = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 60' preserveAspectRatio='none'%3E%3Cpath d='M0 30C200 8 360 12 600 22S1000 46 1200 18V60H0Z'/%3E%3C/svg%3E\")"
const WAVE_TOP = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 40' preserveAspectRatio='none'%3E%3Cpath d='M0 0H1200V18C1100 32 1000 6 900 18S700 32 600 18 400 6 300 18 100 32 0 18Z'/%3E%3C/svg%3E\")"
const FOCAL: [string, string][] = [['01', '50% 55%'], ['02', '50% 72%'], ['03', '50% 60%'], ['04', '45% 28%'], ['05', '40% 62%'], ['06', '50% 40%'], ['07', '50% 60%'], ['08', '42% 32%'], ['09', '35% 32%'], ['10', '50% 55%'], ['11', '50% 30%'], ['12', '50% 50%']]
const BTN = '.hs-btn,.nk-btn'
const SOLID = `${N} .hs-btn-primary,${N} .nk-btn,${N} .nk-btn--primary,${N} .hs-header .hs-btn-dark`

export const NETWORK_KIT_CSS = `${NETWORK_KIT_TOKENS_CSS}
${N}{--nk-column:1280px;position:relative;isolation:isolate;font-size:var(--nk-text-body);line-height:var(--nk-leading-relaxed);font-weight:var(--nk-weight-regular);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
/* The page grain: the design's opt-in .page-grain, applied on the site root because the readme asks for it on every page. */
${N}::before{content:"";position:absolute;inset:0;z-index:1;pointer-events:none;background-image:var(--nk-tg-grain);opacity:var(--nk-tg-grain-opacity);mix-blend-mode:multiply}
${N} .hs-h1,${N} .hs-h2,${N} .hs-brand,${N} .nk-display{font-family:var(--nk-display);font-weight:var(--nk-weight-display);letter-spacing:var(--nk-tracking-display);line-height:var(--nk-leading-display);font-optical-sizing:auto;font-kerning:normal;text-wrap:balance}
${N} .hs-h1{font-size:var(--nk-text-display-h1);letter-spacing:-.03em}
${N} .hs-h2{font-size:var(--nk-text-display-h2)}
${N} .hs-h1 em,${N} .hs-h2 em,${N} .hs-accent,${N} .nk-display em{font-family:var(--nk-accent-face);font-style:var(--nk-display-em-style);font-weight:var(--nk-weight-regular);letter-spacing:-.005em;color:inherit;padding-right:.04em}
${N} .hs-lead,${N} .nk-lead{font-size:var(--nk-text-lead);line-height:1.5;color:var(--color-text-muted)}
${N} .nk-meta{font-size:var(--nk-size-sm);color:var(--color-text-subtle)}
${N} p,${N} li,${N} figcaption,${N} blockquote{text-wrap:pretty}
${N} .hs-lead a,${N} .nk-prose a{color:var(--color-accent-strong);text-decoration:underline;text-decoration-thickness:1.5px;text-decoration-color:color-mix(in srgb,currentColor 40%,transparent);text-underline-offset:3px;transition:color var(--nk-motion-fast) var(--nk-ease-out),text-decoration-color var(--nk-motion-fast) var(--nk-ease-out)}
${N} .hs-lead a:hover,${N} .nk-prose a:hover{color:var(--color-text);text-decoration-color:currentColor}
${N} :focus-visible{outline:2px solid var(--color-focus-ring);outline-offset:3px}

/* Section labels: one accent dot, sentence case, never uppercase or tracked. */
${N} .hs-eyebrow,${N} .nk-eyebrow{display:inline-flex;align-items:center;gap:10px;font-family:var(--nk-sans);font-size:var(--nk-text-eyebrow);font-weight:var(--nk-weight-medium);line-height:1.3;letter-spacing:0;text-transform:none;color:var(--color-text-muted)}
${N} .hs-eyebrow::before,${N} .nk-eyebrow::before{content:"";flex:none;width:8px;height:8px;border-radius:50%;background:var(--color-accent)}
${N} .nk-eyebrow--bare::before{display:none}
${N} .nk-eyebrow--pill{padding:8px 16px;border-radius:var(--nk-radius-pill);background:var(--color-glass);color:var(--color-text);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px)}
${N} .nk-on-media .nk-eyebrow{color:var(--color-on-media)}
${N} .nk-on-media .nk-eyebrow--pill{color:var(--color-text)}

/* Buttons: soft pills. Rise 1px on hover, press .97, arrows slide 3px. 44 / 48 / 56 targets. */
${N} ${BTN.split(',').join(`,${N} `)}{display:inline-flex;align-items:center;justify-content:center;gap:10px;box-sizing:border-box;min-height:var(--nk-control-h);padding:0 26px;border:0;border-radius:var(--nk-radius-control);font-family:var(--nk-sans);font-size:var(--nk-text-ui);font-weight:var(--nk-weight-medium);line-height:1.2;letter-spacing:0;text-transform:none;text-decoration:none;white-space:nowrap;cursor:pointer;transition:background var(--nk-motion-fast) var(--nk-ease-out),color var(--nk-motion-fast) var(--nk-ease-out),transform var(--nk-motion-fast) var(--nk-ease-out),box-shadow var(--nk-motion-fast) var(--nk-ease-out)}
${N} .nk-btn--sm{min-height:var(--nk-control-h-sm);padding:0 20px;font-size:var(--nk-text-label);gap:8px}
${N} .nk-btn--lg{min-height:var(--nk-control-h-lg);padding:0 32px;font-size:18px;gap:12px}
${SOLID}{background:var(--color-accent);color:var(--color-text-on-accent);box-shadow:var(--nk-shadow-button)}
${N} .hs-btn-primary:hover,${N} .nk-btn:hover,${N} .nk-btn--primary:hover,${N} .hs-header .hs-btn-dark:hover{background:var(--color-accent-hover);color:var(--color-text-on-accent)}
${N} .hs-btn-soft,${N} .hs-btn-light,${N} .nk-btn--secondary{background:transparent;color:var(--color-text);box-shadow:inset 0 0 0 1px var(--color-border-strong)}
${N} .hs-btn-soft:hover,${N} .hs-btn-light:hover,${N} .nk-btn--secondary:hover{background:var(--color-surface);color:var(--color-text)}
${N} .nk-btn--ghost{background:transparent;color:var(--color-text);padding:0 16px;box-shadow:none}
${N} .nk-btn--ghost:hover{background:color-mix(in srgb,var(--color-accent) 12%,transparent);color:var(--color-text)}
${N} .nk-btn--dark,${N} .hs-btn-dark{background:var(--color-ink);color:var(--color-on-ink);box-shadow:var(--nk-shadow-button)}
${N} .nk-btn--dark:hover,${N} .hs-btn-dark:hover{background:var(--color-ink-elevated);color:var(--color-on-ink)}
${N} .hs-btn-glass,${N} .nk-btn--glass{background:color-mix(in srgb,var(--color-on-media) 22%,transparent);color:var(--color-on-media);box-shadow:none;-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px)}
${N} .hs-btn-glass:hover,${N} .nk-btn--glass:hover{background:color-mix(in srgb,var(--color-on-media) 34%,transparent);color:var(--color-on-media)}
${N} .hs-btn:hover,${N} .nk-btn:hover{transform:translateY(-1px)}
${N} .hs-btn:active,${N} .nk-btn:active{transform:scale(.97)}
${N} .nk-btn[disabled],${N} .nk-btn[aria-disabled="true"]{opacity:.5;cursor:not-allowed;transform:none}
${N} .nk-btn__arrow{display:inline-flex;transition:transform var(--nk-motion-fast) var(--nk-ease-out)}
${N} .nk-btn:hover .nk-btn__arrow{transform:translateX(3px)}

/* Cards: 28px, a soft top highlight and warm low depth. Lift 3px on hover; photos inside ease in 1.035. */
${N} .hs-card,${N} .nk-card{box-sizing:border-box;background:var(--color-surface);border:0;border-radius:var(--nk-radius-card);box-shadow:var(--nk-depth-sm);padding:28px;transition:transform var(--nk-motion-base) var(--nk-ease-out),box-shadow var(--nk-motion-base) var(--nk-ease-out)}
${N} .nk-card--lift:hover{transform:translateY(-3px);box-shadow:var(--nk-depth-md)}
${N} .nk-card--tint{background:var(--color-surface-elevated);box-shadow:none}
${N} .nk-card--outline{background:transparent;box-shadow:inset 0 0 0 1px var(--color-border-strong)}
${N} .nk-card--feature{position:relative;overflow:hidden;background:var(--color-ink);color:var(--color-on-ink);box-shadow:var(--nk-depth-md)}
${N} .nk-card .nk-photo img{transition:transform var(--nk-motion-slow) var(--nk-ease-out)}
${N} .nk-card--lift:hover .nk-photo img{transform:scale(1.035)}
${N} .nk-badge{display:inline-flex;align-items:center;gap:6px;box-sizing:border-box;min-height:28px;padding:0 12px;border-radius:var(--nk-radius-pill);background:var(--color-surface-elevated);color:var(--color-text-muted);font-family:var(--nk-sans);font-size:var(--nk-text-2xs);font-weight:var(--nk-weight-medium);line-height:1.2;letter-spacing:0;text-transform:none;white-space:nowrap}
${N} .nk-badge--accent{background:var(--color-accent-bg);color:var(--color-accent-strong)}
${N} .nk-badge--solid{background:var(--color-accent);color:var(--color-text-on-accent)}
${N} .nk-input{box-sizing:border-box;width:100%;min-height:var(--nk-control-h-lg);padding:0 22px;border:0;border-radius:var(--nk-radius-field);background:var(--color-surface);color:var(--color-text);font-family:var(--nk-sans);font-size:var(--nk-text-body);box-shadow:inset 0 0 0 1px var(--color-border);transition:box-shadow var(--nk-motion-fast) var(--nk-ease-out)}
${N} .nk-input:focus{outline:none;box-shadow:inset 0 0 0 1.5px var(--color-accent)}
${N} .nk-input:focus-visible{outline:2px solid var(--color-focus-ring);outline-offset:3px}

/* Photography: full colour, warm grade, a leaf crop on the hero photo. */
${N} [data-grade],${N} .nk-photo{position:relative;isolation:isolate;overflow:hidden;background:var(--color-surface-elevated)}
${N} [data-grade] img,${N} .nk-photo img{display:block;width:100%;height:100%;object-fit:cover;filter:saturate(1.05) contrast(1.03)}
${N} [data-grade]::before,${N} .nk-photo::before{content:"";position:absolute;inset:0;z-index:1;pointer-events:none;border-radius:inherit;background:var(--nk-tg-photo-grade);mix-blend-mode:soft-light}
${N} .nk-leaf{border-radius:var(--nk-radius-leaf);overflow:hidden;box-shadow:var(--nk-depth-md)}
${N} .nk-frame-media{border-radius:var(--nk-radius-media);overflow:hidden}
${N} .nk-protect{position:relative}
${N} .nk-protect::after{content:"";position:absolute;inset:0;pointer-events:none;border-radius:inherit;background:var(--nk-gradient-media-protect)}
${FOCAL.map(([n, pos]) => `${N} img[src*="photo-${n}."]{object-position:${pos}}`).join('\n')}

/* Texture: the card-level grain, the faint contour, the light pool. Neutral only. */
${N} .nk-grain{position:relative;isolation:isolate}
${N} .nk-grain::after{content:"";position:absolute;inset:0;z-index:1;pointer-events:none;border-radius:inherit;background-image:var(--nk-tg-grain);opacity:.35;mix-blend-mode:soft-light}
${N} .nk-contour{position:relative;isolation:isolate}
${N} .nk-contour::before{content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;border-radius:inherit;background-image:var(--nk-tg-contour);background-repeat:no-repeat;background-size:cover;background-position:center;opacity:.06}
${N} .nk-mist{position:absolute;inset:0;z-index:0;pointer-events:none;opacity:var(--nk-mist-opacity);background:radial-gradient(ellipse 60% 55% at var(--mist-x,75%) var(--mist-y,30%),color-mix(in srgb,var(--nk-glow-sun) 90%,transparent),transparent 70%),radial-gradient(ellipse 50% 45% at calc(var(--mist-x,75%) - 30%) calc(var(--mist-y,30%) + 40%),color-mix(in srgb,var(--nk-glow-sand) 80%,transparent),transparent 70%)}
${N} .nk-mist--corner{background:radial-gradient(ellipse 60% 55% at 95% 0%,color-mix(in srgb,var(--nk-glow-sun) 90%,transparent),transparent 70%)}

/* Layout: one content column of 1280px, a section rhythm from the spacing axis, bands that alternate paper and sand. */
${N} .nk-section{box-sizing:border-box;padding:var(--nk-space-section) ${COL}}
${N} .nk-section--tight{padding-block:var(--nk-space-section-tight)}
${N} .nk-band{position:relative;background:transparent}
${N} .nk-band--sand{background:var(--nk-tg-sand)}
${N} .nk-band--sand::before{content:"";position:absolute;left:0;right:0;top:-1px;z-index:1;width:100%;height:clamp(24px,3vw,40px);background:var(--color-canvas);-webkit-mask:${WAVE_TOP} center/100% 100% no-repeat;mask:${WAVE_TOP} center/100% 100% no-repeat;pointer-events:none}
${N} .nk-split{display:grid;max-width:var(--nk-column);margin-inline:auto;box-sizing:border-box;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:clamp(40px,5vw,88px);row-gap:40px;align-items:center}
${N} .nk-grid-cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:clamp(12px,1.6vw,24px)}
${N} .nk-grid-cards:has(> :nth-child(3):last-child),${N} .nk-grid-cards:has(> :nth-child(5):last-child),${N} .nk-grid-cards:has(> :nth-child(6):last-child){grid-template-columns:repeat(3,minmax(0,1fr))}
${N} .nk-grid-cards:has(> :nth-child(2):last-child){grid-template-columns:repeat(2,minmax(0,1fr))}
${N} .hs-section,${N} .hs-wide{padding-bottom:var(--nk-space-section)}
${N} .hs-section-first{padding-top:var(--nk-space-section)}
@media (max-width:1100px){${N} .nk-grid-cards{grid-template-columns:repeat(2,minmax(0,1fr))}${N} .nk-grid-cards:has(> :nth-child(3):last-child),${N} .nk-grid-cards:has(> :nth-child(5):last-child),${N} .nk-grid-cards:has(> :nth-child(6):last-child){grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:900px){${N} .nk-split{grid-template-columns:minmax(0,1fr)}}
@media (max-width:560px){${N} .nk-grid-cards,${N} .nk-grid-cards:has(> :nth-child(3):last-child),${N} .nk-grid-cards:has(> :nth-child(5):last-child),${N} .nk-grid-cards:has(> :nth-child(6):last-child),${N} .nk-grid-cards:has(> :nth-child(2):last-child){grid-template-columns:minmax(0,1fr)}}

/* The top: a 40px announce bar over the header bar, both sticky together. The bar folds away once the page scrolls. */
${N} .nk-top{position:sticky;top:0;z-index:40}
${N} .nk-top .hs-header{position:relative;top:auto}
${N} .nk-bar{height:40px;overflow:hidden;background:var(--color-surface-elevated);transition:height var(--nk-motion-fast) var(--nk-ease-out)}
${N}[data-scrolled] .nk-bar{height:0}
${N} .nk-bar-in{box-sizing:border-box;height:40px;display:flex;align-items:center;justify-content:space-between;gap:24px;padding:0 ${COL}}
${N} .nk-bar-now{display:flex;align-items:center;gap:10px;margin:0;min-width:0;overflow:hidden;white-space:nowrap;font-size:var(--nk-text-meta);font-weight:var(--nk-weight-medium);color:var(--color-text)}
${N} .nk-bar-now::before{content:"";flex:none;width:8px;height:8px;border-radius:50%;background:var(--color-accent)}
${N} .nk-bar-now span{overflow:hidden;text-overflow:ellipsis}
${N} .nk-bar-links{display:none;gap:24px}
${N} .nk-bar-links a{font-size:var(--nk-text-meta);font-weight:var(--nk-weight-medium);color:var(--color-text-muted)}
${N} .nk-bar-links a:hover{color:var(--color-text)}
@media (min-width:1240px){${N} .nk-bar-links{display:flex}}

/* The header bar: frosted canvas, a hairline under it, 76px (64 once scrolled). The pill floats inset at 68px. */
${N} .hs-header{padding:0;background:transparent;transition:none}
${N} .hs-header[data-hidden]{opacity:1;transform:none;pointer-events:auto}
${M} .hs-pill{position:relative;box-sizing:border-box;max-width:none;margin:0;height:var(--nk-site-header-height);padding:0 ${COL};column-gap:32px;row-gap:0;border-radius:0;overflow:visible;background:color-mix(in srgb,var(--color-canvas) 88%,transparent);-webkit-backdrop-filter:blur(16px) saturate(1.1);backdrop-filter:blur(16px) saturate(1.1);border-bottom:1px solid var(--color-border);box-shadow:none;animation:none;transition:height var(--nk-motion-fast) var(--nk-ease-out),box-shadow var(--nk-motion-fast) var(--nk-ease-out)}
${M}[data-scrolled] .hs-pill{height:calc(var(--nk-site-header-height) - 12px);box-shadow:0 1px 0 var(--color-border),0 10px 26px -18px color-mix(in srgb,var(--color-ink) 30%,transparent)}
${M}[data-site-header="pill"] .hs-header{padding:12px var(--nk-space-gutter) 0}
${M}[data-site-header="pill"] .hs-pill{max-width:var(--nk-column);margin:0 auto;padding:0 12px 0 20px;border:0;border-radius:var(--nk-site-header-radius);background:color-mix(in srgb,var(--color-surface) 92%,transparent);box-shadow:var(--nk-depth-md)}
${M}[data-site-header="pill"][data-scrolled] .hs-pill{height:var(--nk-site-header-height);box-shadow:var(--nk-depth-md)}
${N} .hs-header .hs-brand{overflow:visible;padding-left:4px;font-size:inherit;letter-spacing:normal}
${N} .nk-logo{display:inline-flex;align-items:center;gap:14px;color:var(--color-text)}
${N} .nk-logo-mark{position:relative;flex:none;width:44px;height:44px;border-radius:var(--nk-radius-pill);display:flex;align-items:center;justify-content:center;overflow:hidden;background:var(--color-accent);color:var(--color-text-on-accent);box-shadow:0 0 0 3px var(--color-surface),0 0 0 4px var(--color-border)}
${N} .nk-logo-mark img{width:100%;height:100%;object-fit:cover}
${N} .nk-logo{min-width:0}
${N} .nk-logo-text{display:flex;flex-direction:column;align-items:flex-start;line-height:1;min-width:0}
${N} .nk-logo-name{font-family:var(--nk-display);font-size:24px;font-weight:var(--nk-weight-display);letter-spacing:var(--nk-tracking-display);line-height:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
${N} .nk-logo-tag{margin-top:5px;font-family:var(--nk-sans);font-size:var(--nk-text-meta);font-weight:var(--nk-weight-medium);letter-spacing:0;color:var(--color-text-subtle);white-space:nowrap}
${N} .hs-nav{-webkit-mask-image:none;mask-image:none;overflow:visible}
${N} .hs-nav-track{width:auto;justify-content:center;gap:30px;padding:0;font-size:16px;font-weight:var(--nk-weight-medium)}
${N} .hs-nav a,${N} .hs-nav-mega{position:relative;padding:12px 0;border-radius:0;background:none;font-family:var(--nk-sans);font-size:16px;font-weight:var(--nk-weight-medium);letter-spacing:0;text-transform:none;color:var(--color-text-muted);transition:color var(--nk-motion-fast) var(--nk-ease-out)}
${N} .hs-nav a:hover,${N} .hs-nav-mega:hover,${N} .hs-nav-mega[aria-expanded="true"]{background:none;color:var(--color-text)}
${N} .hs-nav a[aria-current="page"]{color:var(--color-text)}
${N} .hs-nav a[aria-current="page"]::after{content:"";position:absolute;left:50%;bottom:2px;width:6px;height:6px;border-radius:50%;background:var(--color-accent);transform:translateX(-50%)}
${N} .hs-header-actions{gap:4px}
${N} .hs-header .hs-btn-dark::after{content:"\\2192";display:inline-block;margin-left:2px;transition:transform var(--nk-motion-fast) var(--nk-ease-out)}
${N} .hs-header .hs-btn-dark:hover::after{transform:translateX(3px)}
${N} .hs-member{min-height:var(--nk-target-min);padding:0 16px;font-size:var(--nk-text-label);font-weight:var(--nk-weight-medium);background:var(--color-accent-bg);color:var(--color-accent-strong)}
${N} .hs-menu-button{width:var(--nk-target-min);height:var(--nk-target-min);border-radius:var(--nk-radius-pill);background:transparent;color:var(--color-text)}
${N} .hs-menu-button:hover{background:var(--color-surface-elevated)}
${N} .hs-menu-panel,${N} .hs-mega-panel{border-radius:var(--nk-radius-card);background:var(--color-surface);-webkit-backdrop-filter:none;backdrop-filter:none;box-shadow:var(--nk-shadow-float)}
${N} .hs-menu-panel{top:calc(100% + 8px);padding:12px}
${N} .hs-menu-panel a,${N} .hs-mega-links a{font-family:var(--nk-sans);font-size:18px;font-weight:var(--nk-weight-medium);color:var(--color-text);border-radius:var(--nk-radius-sm)}
${N} .hs-menu-panel a[aria-current="page"]{display:flex;align-items:center;gap:8px}
${N} .hs-menu-panel a[aria-current="page"]::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--color-accent)}
${N} .hs-mega-links a:hover,${N} .hs-menu-panel a:hover{background:var(--color-surface-elevated)}
${N} .hs-mega-label{font-family:var(--nk-display)}
@media (min-width:1240px){${N} .hs-menu{display:none}${M} .hs-pill{grid-template-columns:auto minmax(0,1fr) auto;grid-template-areas:"logo nav cta"}${N} .hs-nav-track{margin:0 auto}}
/* Under 1240px the links live in the drawer: hamburger, logo, then the button (the design's "not wide" header). */
@media (max-width:1239px){${N} .hs-nav{display:none}${M} .hs-pill{grid-template-columns:auto minmax(0,1fr) auto auto;grid-template-areas:"menu logo member cta";column-gap:12px;padding-inline:var(--nk-space-gutter)}${N} .hs-header-actions{display:contents}${N} .hs-menu{display:flex;grid-area:menu;order:-1}${N} .hs-member{grid-area:member}${N} .hs-header .hs-btn-dark{grid-area:cta;min-height:var(--nk-control-h-sm);padding:0 20px;font-size:var(--nk-text-label)}${N} .nk-logo{gap:10px}${N} .nk-logo-mark{width:34px;height:34px}${N} .nk-logo-name{font-size:20px}${N} .nk-logo-tag{display:none}${N} .hs-menu-panel{left:var(--nk-space-gutter);right:var(--nk-space-gutter)}}

@media (max-width:639px){${N} .hs-header .hs-btn-dark{padding:0 16px}${N} .hs-header .hs-btn-dark::after{display:none}${N} .nk-logo-name{font-size:18px}}

/* The footer: a wave into one deep ink band. Full carries the brand and link columns; minimal keeps the legal line. */
${N} .nk-footer-ground{position:relative;margin-top:calc(var(--nk-space-12) + clamp(28px,4vw,60px));padding:var(--nk-space-12) 0 var(--nk-space-6);background:var(--color-ink);color:var(--color-on-ink)}
${N} .nk-footer-ground::before{content:"";position:absolute;left:0;right:0;bottom:calc(100% - 1px);height:clamp(28px,4vw,60px);background:var(--color-ink);-webkit-mask:${WAVE_FOOT} center/100% 100% no-repeat;mask:${WAVE_FOOT} center/100% 100% no-repeat;pointer-events:none}
${N} .nk-footer-ground :focus-visible{outline-color:var(--color-on-ink)}
${N} .nk-footer-ground[data-footer="minimal"]{padding-top:var(--nk-space-6)}
${N} .hs-footer-top{box-sizing:border-box;width:min(var(--nk-column),calc(100% - 2 * var(--nk-space-gutter)));max-width:none;margin:0 auto;padding:0;border:0;gap:clamp(24px,3vw,48px);align-items:start;grid-template-columns:minmax(0,1.3fr) repeat(auto-fit,minmax(min(100%,11rem),1fr))}
${N} .hs-footer-brand{gap:0}
${N} .hs-footer-brand .hs-brand{font-family:var(--nk-display);font-size:28px;font-weight:var(--nk-weight-display);letter-spacing:var(--nk-tracking-display);color:var(--color-on-ink)}
${N} .hs-footer-brand p{margin:14px 0 0;max-width:30ch;font-size:var(--nk-text-body-sm);color:var(--color-on-ink-muted)}
${N} .hs-footer-col{display:flex;flex-direction:column;align-items:flex-start;gap:0}
${N} .hs-footer-col-title{margin:0 0 10px;font-size:var(--nk-text-label);font-weight:var(--nk-weight-medium);letter-spacing:0;text-transform:none;color:var(--color-on-ink-subtle)}
${N} .hs-footer-col a,${N} .hs-footer-links a{padding:8px 0;font-size:var(--nk-text-body-sm);color:var(--color-on-ink-muted)}
${N} .hs-footer-col a:hover,${N} .hs-footer-links a:hover{color:var(--color-on-ink)}
${N} .hs-footer-links{gap:0 32px}
${N} .hs-footer{box-sizing:border-box;width:min(var(--nk-column),calc(100% - 2 * var(--nk-space-gutter)));max-width:none;margin:var(--nk-space-12) auto 0;padding:20px 0 0;border-top:1px solid var(--color-ink-border);gap:16px;font-size:var(--nk-text-meta);color:var(--color-on-ink-subtle)}
${N} .nk-footer-ground[data-footer="minimal"] .hs-footer{margin-top:0;padding-top:20px}
${N} .hs-footer a{color:var(--color-on-ink-muted);font-weight:var(--nk-weight-regular)}
${N} .hs-footer a:hover{color:var(--color-on-ink)}
${N} .hs-footer-line,${N} .hs-footer-note{color:var(--color-on-ink-subtle)}
${N} .nk-powered{font-size:var(--nk-text-meta);color:var(--color-on-ink-subtle)}
${N} .hs-footer a.hs-partner{padding:6px 14px;border:0;background:transparent;box-shadow:inset 0 0 0 1px var(--color-ink-border);color:var(--color-on-ink-muted);font-size:var(--nk-text-meta);font-weight:var(--nk-weight-regular)}
${N} .hs-footer a.hs-partner b{font-weight:var(--nk-weight-semibold);color:var(--color-on-ink)}
${N} .hs-footer a.hs-partner svg{color:var(--color-accent)}
${N} .hs-footer a.hs-partner:hover{color:var(--color-on-ink);box-shadow:inset 0 0 0 1px var(--color-on-ink-subtle)}
@media (max-width:1099px){${N} .hs-footer-top{grid-template-columns:repeat(2,minmax(0,1fr))}${N} .hs-footer-brand{grid-column:1 / -1}}
@media (max-width:559px){${N} .hs-footer-top{grid-template-columns:minmax(0,1fr)}}

${NETWORK_KIT_BLOCKS_CSS}

${NETWORK_KIT_MORE_CSS}

${NETWORK_KIT_INNER_CSS}

${NETWORK_KIT_INNER_B_CSS}

/* Reduced motion: every duration is zero in the token block; here the moves themselves go. */
@media (prefers-reduced-motion:reduce){${N} *,${N} *::before,${N} *::after{transition:none!important;animation:none!important}${N} :is(.hs-btn,.nk-btn,.hs-card,.nk-card):is(:hover,:active),${N} .nk-card--lift:hover .nk-photo img,${N} .nk-btn:hover .nk-btn__arrow,${N} .hs-header .hs-btn-dark:hover::after{transform:none!important}}`
