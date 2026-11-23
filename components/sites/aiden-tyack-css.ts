import { SERVICES_CSS } from '@/components/sites/services-css'
import { AIDEN_TYACK_ACCENT_CSS, AIDEN_TYACK_DIALS_CSS, AIDEN_TYACK_TOKENS_CSS } from '@/lib/theme/aiden-tyack'

// THE AIDEN TYACK SKIN (design: the Claude Design handoff "Aiden Tyack Design System", theme.css + rules.md + ui_kits/site). PRIVATE to
// aidentyack.com (PRIVATE_THEME_SITES). Scoped under [data-house-theme="aiden-tyack"], so every house section keeps its markup and
// content; values come only from the token block (lib/theme/aiden-tyack.ts), never raw. It layers after the house sheets
// (components/sites/site-chrome.tsx): the site's own colour names (--color-*) re-pointed at bone, pine and walnut, the three faces, then
// the page chrome.
//
// The look, in the design's words: headings in Grenze Gotisch 700, Title Case, never all caps and never under 28px; body in Archivo;
// buttons and labels in Archivo 600 uppercase with wide tracking; one Cormorant Garamond italic aside per section. The STITCH is the
// signature: a 1.5px dashed line 4px inside buttons, 7px inside cards and 9px inside photos, and the divider between list rows. Corners
// nearly square (2px, panels 3px). Warm shadows only, a 2-3px rise on hover. Grain on every surface, the hide grain on accent fills and
// bands. One band (pine in Day, bone in Night) per stretch of page. Motion is colour changes and lifts only, and stops under reduced motion.
// Theme fence: this sheet only reaches the stand-alone render (ADR-1906).

const A = '[data-house-theme="aiden-tyack"]'
const NIGHT = '[data-house-theme="aiden-tyack"][data-th="night"]'
const LABEL = 'font-family:var(--at-font-body);font-weight:600;font-size:12px;letter-spacing:.12em;text-transform:uppercase'
const EASE = 'var(--at-ease)'
/** The stitch: a dashed line `inset` px inside the box, in the stitch colour. Drawn as an outline so it never moves the layout. */
/** One selector per role layout for its items (no :is(), so every selector in the sheet starts at the theme root). */
const roleItems = (variants: string[], tail = '') => variants.map((v) => `${A} [data-role][data-variant="${v}"] [data-part="item"]${tail}`).join(',')
const stitch = (inset: number) => `outline:var(--at-frame) var(--at-stitch);outline-offset:-${inset}px`

// THE BLOCK SHEET. The kit composes the Services block family (components/page-editor/blocks/services.tsx, classes `.sv-*`) until Aiden
// Tyack cuts its own, as Mindless, New World and CyberWitch do. This derives the sheet from that one source: the scope moves to the theme
// root, `--sv-*` tokens become `--at-*`, and the values a block sets inline on itself (--sv-min, --sv-ratio, --sv-wm-len) keep their names.
// Every name the Services sheet reads that the design does not already define is answered below from the design's own roles.

/** The `--at-*` names the borrowed block sheet reads, answered in bone, pine and walnut. Every value is a design token. */
export const AIDEN_TYACK_BLOCK_ALIASES = `
${A}{
--at-ink-950:var(--at-sunken);
--at-ink-900:var(--at-canvas);
--at-ink-850:var(--at-surface);
--at-ink-800:var(--at-raised);
--at-ink-700:var(--at-sunken);
--at-chrome-50:var(--at-text);
--at-chrome-200:var(--at-text-muted);
--at-flare-300:var(--at-accent-hover);
--at-flare-400:var(--at-accent-text);
--at-flare-500:var(--at-accent);
--at-flare-600:var(--at-accent-deep);
--at-flare-700:var(--at-accent-deep);
--at-accent-tint:var(--at-accent-bg);
--at-surface-page:var(--at-canvas);
--at-surface-sunken:var(--at-sunken);
--at-surface-card:var(--at-surface);
--at-surface-raised:var(--at-raised);
--at-text-primary:var(--at-text);
--at-text-secondary:var(--at-text-muted);
--at-text-accent:var(--at-accent-text);
--at-border-hairline:1px;
--at-border-subtle:var(--at-line);
--at-border-default:var(--at-line);
--at-border-strong:var(--at-line-strong);
--at-swell-300:var(--at-text-subtle);
--at-swell-500:var(--at-text-muted);
--at-halo-300:var(--at-accent-soft);
--at-halo-500:var(--at-accent-soft);
--at-action-primary:var(--at-accent);
--at-action-primary-text:var(--at-on-accent);
--at-focus-ring:var(--at-focus);
--at-success-500:var(--at-success);
--at-warning-500:var(--at-warning);
--at-danger-500:var(--at-danger);
--at-font-mono:var(--at-font-body);
--at-font-accent:var(--at-font-voice);
--at-fs-body-l:20px;
--at-fw-regular:400;
--at-fw-medium:500;
--at-fw-bold:600;
--at-fw-heavy:700;
--at-lh-display:var(--at-lead-display);
--at-lh-body:1.6;
--at-ls-display:0;
--at-ls-button:.12em;
--at-ls-mono:.12em;
--at-stretch-display:100%;
--at-container-max:1200px;
--at-dur-base:var(--at-dur);
--at-ease-out:var(--at-ease);
--at-radius-sm:var(--at-r-control);
--at-radius-md:var(--at-r-card);
--at-radius-lg:var(--at-r-panel);
--at-radius-xl:var(--at-r-panel);
--at-radius-pill:var(--at-r-control);
--at-sheen:none;
--at-depth-sm:var(--at-shadow-card);
--at-depth-md:var(--at-shadow-card);
--at-depth-lg:var(--at-shadow-lift);
--at-shadow-glow:none;
--at-glow-sunset:var(--at-sunken);
--at-glow-sky:var(--at-canvas);
--at-spread-tr:none;
--at-spread-tl:none;
--at-spread-br:none;
--at-overlay-bottom:linear-gradient(180deg,transparent 40%,color-mix(in srgb,var(--at-photo-shade) 70%,transparent) 100%);
--at-overlay-scrim:linear-gradient(90deg,color-mix(in srgb,var(--at-photo-shade) 72%,transparent) 0%,color-mix(in srgb,var(--at-photo-shade) 35%,transparent) 50%,transparent 80%);
--at-grad-lit:linear-gradient(90deg,var(--at-accent),var(--at-accent));
}`

export const AIDEN_TYACK_BLOCKS_CSS = `${AIDEN_TYACK_BLOCK_ALIASES}
${SERVICES_CSS.replaceAll('[data-house-theme="services"]', A)
  .replace(/--sv-shadow-(sm|md|lg)\b/g, '--at-depth-$1')
  .replace(/--sv-(?!min\b|ratio\b|wm-len\b)/g, '--at-')}`

/** The band: one per stretch of page. Pine in Day, bone in Night; the ground and ink tokens flip inside it (theme.css `.band`). */
const BAND = `--at-canvas:var(--at-band);--at-surface:color-mix(in srgb,var(--at-band),white 8%);--at-raised:color-mix(in srgb,var(--at-band),white 12%);--at-text:var(--at-on-band);--at-text-muted:color-mix(in srgb,var(--at-on-band) 82%,var(--at-band));--at-text-subtle:color-mix(in srgb,var(--at-on-band) 70%,var(--at-band));--at-line:color-mix(in srgb,var(--at-on-band) 18%,var(--at-band));--at-stitch:color-mix(in srgb,var(--at-on-band) 45%,var(--at-band));--at-accent-text:var(--at-band-accent-text);background:var(--at-band) var(--at-grain-hide);color:var(--at-on-band)`
/** Text over a photo: always light, whatever the register (theme.css `.on-photo`). */
const ON_PHOTO = `--at-text:var(--at-photo-text);--at-text-muted:var(--at-photo-muted);--at-accent-text:var(--at-photo-accent)`

export const AIDEN_TYACK_CSS = `${AIDEN_TYACK_TOKENS_CSS}${AIDEN_TYACK_DIALS_CSS}${AIDEN_TYACK_ACCENT_CSS}
${AIDEN_TYACK_BLOCKS_CSS}
${A}{color-scheme:light;--color-canvas:var(--at-canvas);--color-surface:var(--at-surface);--color-surface-post:var(--at-surface);--color-surface-elevated:var(--at-raised);--color-surface-hover:var(--at-raised);--color-border:var(--at-line);--color-border-strong:var(--at-line-strong);--color-text:var(--at-text);--color-text-muted:var(--at-text-muted);--color-text-subtle:var(--at-text-subtle);--color-focus-ring:var(--at-focus);--color-success:var(--at-success);--color-warning:var(--at-warning);--color-danger:var(--at-danger);--color-info:var(--at-info);--color-ink:var(--at-band);--color-on-ink:var(--at-on-band);--color-on-ink-muted:color-mix(in srgb,var(--at-on-band) 82%,var(--at-band));--radius-control:var(--at-r-control);--radius-card:var(--at-r-card);--radius-cover:var(--at-r-panel);--radius-media:var(--at-r-media);--font-display:var(--at-font-display);--font-body:var(--at-font-body);--font-label:var(--at-font-body)}
${NIGHT}{color-scheme:dark}
${A}{position:relative;font-family:var(--at-font-body);font-size:17px;line-height:1.6;font-synthesis-weight:none;background:var(--at-canvas) var(--at-grain);color:var(--at-text)}
${A} .hs-root{background:transparent;color:var(--at-text)}
${A} ::selection{background:var(--at-accent);color:var(--at-on-accent)}
${A} a{color:var(--at-accent-text);transition:color var(--at-dur-fast) ${EASE}}
${A} a:hover{color:var(--at-accent-hover)}
${A} :focus-visible{outline:2px solid var(--at-focus);outline-offset:3px}
/* Headings: Grenze Gotisch 700 in Title Case, never all caps, never under 28px. The one key phrase (em) takes the accent text. */
${A} .hs-h1,${A} .hs-h2,${A} .sv-display,${A} h1,${A} h2{font-family:var(--at-font-display);font-weight:700;font-style:normal;font-stretch:100%;text-transform:none;letter-spacing:0;line-height:var(--at-lead-display);color:var(--at-text);text-wrap:balance}
${A} .hs-h1,${A} .sv-hero .sv-display{font-size:clamp(44px,7vw,96px)}
${A} .hs-h2,${A} .sv-sec .sv-display{font-size:clamp(34px,4.6vw,60px)}
${A} .sv-card .sv-display,${A} .sv-tile .sv-display,${A} .sv-row .sv-display,${A} h3{font-family:var(--at-font-display);font-weight:700;text-transform:none;letter-spacing:0;font-size:max(28px,1em);line-height:1.05}
${A} h4,${A} h5{font-family:var(--at-font-body);font-weight:600;text-transform:none}
${A} .hs-h1 em,${A} .hs-h2 em,${A} .sv-display em{font-family:inherit;font-style:normal;font-weight:inherit;font-size:1em;line-height:inherit;letter-spacing:inherit;text-transform:none;color:var(--at-accent-text)}
/* The voice: Cormorant Garamond italic for the quote or aside a section carries. */
${A} .sv-quote,${A} blockquote,${A} .sv-lede em{font-family:var(--at-font-voice);font-style:italic;font-weight:500}
${A} .sv-quote{font-size:clamp(22px,2.4vw,30px);line-height:1.35}
/* Labels and eyebrows: Archivo 600 uppercase with wide tracking, 11.5px at the least. */
${A} .hs-eyebrow,${A} .hs-label,${A} .hs-badge,${A} .sv-mono,${A} .sv-eyebrow{${LABEL};color:var(--at-accent-text)}
${A} .sv-eyebrow{display:inline-flex;align-items:center;gap:10px;padding:0;background:none;box-shadow:none}
${A} .sv-eyebrow::before{content:"";display:inline-block;width:28px;border-top:var(--at-frame) var(--at-stitch);background:none;height:0}
${A} .sv-lede,${A} .hs-lede{color:var(--at-text-muted);max-width:var(--at-measure)}
/* Prices and numbers: Archivo 700, tabular figures. */
${A} .sv-price,${A} .sv-step-num,${A} .sv-stepper-num,${A} .sv-trust-item b,${A} .sv-trust-item strong{font-family:var(--at-font-body);font-weight:700;font-variant-numeric:tabular-nums;color:var(--at-accent-text)}
/* Cards: the surface with grain, a hairline, the warm resting shadow and the stitch 7px inside. A hover lifts 2px. */
${A} .hs-card,${A} .sv-card,${A} .sv-panel,${A} .sv-tile,${A} .sv-qf-card{border:1px solid var(--at-line);border-radius:var(--at-r-card);background:var(--at-surface) var(--at-grain);box-shadow:var(--at-shadow-card);${stitch(7)}}
${A} .sv-panel{border-radius:var(--at-r-panel)}
${A} .sv-card--lit{border-color:var(--at-accent)}
${A} a.sv-card,${A} a.sv-tile{transition:transform var(--at-dur) ${EASE},box-shadow var(--at-dur) ${EASE}}
${A} a.sv-card:hover,${A} a.sv-tile:hover{transform:translateY(-2px);box-shadow:var(--at-shadow-lift)}
/* Rows: the divider between list rows is a stitch. */
${A} .sv-row,${A} .sv-list > * + *,${A} .sv-faq > * + *{border-top:var(--at-frame) var(--at-stitch)}
${A} .sv-row{border-left:0;border-right:0;border-bottom:0;background:transparent;box-shadow:none;outline:0}
/* Photos: square corners and the stitch 9px inside. */
${A} img.sv-photo,${A} .sv-media img,${A} .sv-photo{border-radius:var(--at-r-media)}
${A} .sv-photo,${A} .sv-media{${stitch(9)}}
/* Buttons. One main style per section: the accent fill with the hide grain and the stitch 4px inside. The rest are outlines. */
${A} .hs-btn,${A} .hs-btn-primary,${A} .hs-btn-dark,${A} .sv-btn{${LABEL};font-size:13px;min-height:48px;padding:0 24px;border-radius:var(--at-r-control);transition:background-color var(--at-dur-fast) ${EASE},color var(--at-dur-fast) ${EASE},transform var(--at-dur) ${EASE},box-shadow var(--at-dur) ${EASE}}
${A} .hs-btn-primary,${A} .hs-btn-dark,${A} .sv-btn--accent{background:var(--at-accent) var(--at-grain-hide);color:var(--at-on-accent);border:0;box-shadow:var(--at-shadow-card);outline:var(--at-frame) color-mix(in srgb,var(--at-on-accent) 55%,transparent);outline-offset:-4px}
${A} .hs-btn-primary:hover,${A} .hs-btn-dark:hover,${A} .sv-btn--accent:hover{background-color:var(--at-accent-hover);color:var(--at-on-accent);transform:translateY(-2px);box-shadow:var(--at-shadow-lift)}
${A} .sv-btn--accent::before,${A} .sv-btn--accent::after{display:none}
${A} .hs-btn-soft,${A} .sv-btn--secondary{background:transparent;color:var(--at-text);border:1.5px solid var(--at-line-strong);box-shadow:none;outline:0}
${A} .hs-btn-soft:hover,${A} .sv-btn--secondary:hover{background:var(--at-accent-bg);border-color:var(--at-accent);color:var(--at-text)}
${A} .sv-btn--lg{min-height:54px;padding:0 30px}
/* Sections: bone grounds in rhythm, grain on each. Ink and aurora are the band: one per stretch of page. */
${A} .sv-sec{background:var(--at-canvas) var(--at-grain);padding-block:var(--at-section-y)}
${A} .sv-sec--sky{background:var(--at-surface) var(--at-grain)}
${A} .sv-sec--depth{background:var(--at-sunken) var(--at-grain)}
${A} .sv-sec--ink,${A} .sv-sec--aurora,${A} .sv-band,${A} .sv-foot-band{${BAND}}
${A} .sv-orb,${A} .sv-dotgrid,${A} .sv-pinstripe{display:none}
${A} .sv-stars{color:var(--at-accent-text)}
/* Forms: a sunken well with a hairline, and the stitch 7px outside. */
${A} .sv-input,${A} .sv-field input,${A} .sv-field textarea,${A} .sv-field select{background:var(--at-raised);border:1px solid var(--at-line-strong);color:var(--at-text);border-radius:var(--at-r-control);outline:var(--at-frame) var(--at-stitch);outline-offset:5px}
${A} .sv-input:focus,${A} .sv-field input:focus,${A} .sv-field textarea:focus{outline-color:var(--at-focus)}
/* THE FOREST HERO (the design's default): the pine band with the redwood silhouette behind it at 40%, the words on the left. The
 * silhouette is the hero picture, so a Space that sets its own photo gets the photo hero over the same shade. */
${A} .sv-hero{${BAND}}
${A} .sv-hero--photo{min-height:min(88vh,820px)}
${A} .sv-hero-bg--photo{background-position:50% 100%;background-size:cover}
${A} .sv-hero-bg--photo[style*="redwood-forest-silhouette"]{opacity:.4;background-size:cover;mix-blend-mode:luminosity}
${A} .sv-hero-bg--photo::before{background:var(--at-overlay-scrim)}
${A} .sv-hero-bg--photo::after{background:var(--at-overlay-bottom)}
${A} .sv-hero-bg--photo[style*="redwood-forest-silhouette"]::before,${A} .sv-hero-bg--photo[style*="redwood-forest-silhouette"]::after{display:none}
${A} .sv-hero--photo .sv-hero-in{grid-template-columns:minmax(0,1fr);align-items:end}
${A} .sv-hero--photo .sv-hero-copy{max-width:min(100%,680px);${ON_PHOTO}}
${A} .sv-hero--photo .sv-display,${A} .sv-hero--photo .sv-hero-lead{color:var(--at-text)}
${A} .sv-hero--photo .sv-display em{color:var(--at-accent-text)}
/* THE PAGE (LIVE-2517). Every section runs edge to edge, as the handoff's do: the house page column and its gaps step aside, and each
 * role block keeps its words in the design's 1320px column with the gutter. */
${A}[data-house-site] .mw-page{padding-bottom:0}
${A} .mw-wrap.mw-other{max-width:none;padding:0}
${A} .mw-other>div{padding-block:0;margin:0}
${A} .mw-other>div>*{margin-block:0}
${A} [data-role] [data-part="inner"]{max-width:1320px;padding-inline:var(--at-gutter);gap:var(--at-gap)}
/* THE HEADER (handoff Header): the announce band, then one bar on the canvas with a hairline under it. The menu on the left, the
 * lockup in the middle, the button on the right; under 940px the lockup leads and the menu folds into the Menu button. */
${A} .at-top{position:sticky;top:0;z-index:50}
${A} .at-top .hs-header{position:relative;top:auto;padding:0;animation:none;opacity:1;transform:none}
${A} .at-bar{background:var(--at-band) var(--at-grain-hide);color:var(--at-on-band);padding:9px 16px;text-align:center}
${A} .at-bar-line{margin:0;${LABEL};font-size:11.5px;letter-spacing:.14em;color:inherit}
${A} .hs-header{padding:0}
${A} .hs-pill{max-width:none;margin:0;padding:10px var(--at-gutter);column-gap:16px;border-radius:0;background:color-mix(in srgb,var(--at-canvas) 92%,transparent) var(--at-grain);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);border:0;border-bottom:1px solid var(--at-line);box-shadow:none;animation:none}
${A} .hs-nav{-webkit-mask-image:none;mask-image:none}
${A} .hs-nav a,${A} .hs-nav-mega{${LABEL};padding:12px 0;border-radius:0;color:var(--at-text)}
${A} .hs-nav a:hover,${A} .hs-nav-mega:hover{background:none;text-decoration:underline;text-underline-offset:6px}
${A} .hs-nav-track{margin:0;padding:0;gap:28px}
/* The header button is a plain label, as the handoff's Contact link is. */
${A} .hs-header .hs-btn-dark,${A} .hs-header .hs-btn-dark:hover{min-height:44px;padding:0;background:none;border:0;box-shadow:none;outline:0;transform:none;color:var(--at-text);${LABEL}}
${A} .hs-header .hs-btn-dark:hover{text-decoration:underline;text-underline-offset:6px}
${A} .hs-header .hs-brand{padding-left:0}
@media (max-width:1099px){${A} .hs-pill{grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);grid-template-areas:". logo cta";row-gap:0}${A} .hs-header .hs-brand{justify-self:center}${A} .hs-nav{display:none}${A} .hs-header-actions{justify-self:end}${A} .hs-menu{display:block}${A} .hs-menu-button{background:none;border:0;box-shadow:none;color:var(--at-text);border-radius:var(--at-r-control)}}
@media (min-width:1100px){${A} .hs-menu{display:none}${A} .hs-pill{grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);grid-template-areas:"nav logo cta";padding-inline:max(var(--at-gutter),calc((100% - 1320px) / 2 + var(--at-gutter)))}${A} .hs-nav{justify-self:start}${A} .hs-nav{overflow:visible}${A} .hs-header-actions{justify-self:end}}
/* The lockup: the hammers mark (the handoff's SVG as a mask, so it takes the ink around it), the name and the tracked line. */
${A} .at-logo{display:inline-flex;align-items:center;gap:10px;color:var(--at-text)}
${A} .at-mark{display:block;flex:none;width:42px;height:42px;background:currentColor;-webkit-mask:url(/sites/aiden-tyack/logo/logo-mark.svg) center/contain no-repeat;mask:url(/sites/aiden-tyack/logo/logo-mark.svg) center/contain no-repeat}
${A} .at-mark--img{background:none;-webkit-mask:none;mask:none;object-fit:contain}
${A} .at-logo-text{display:flex;flex-direction:column;line-height:1}
${A} .at-logo-name{font-family:var(--at-font-display);font-weight:700;font-size:30px;line-height:1;color:var(--at-text);white-space:nowrap}
${A} .at-logo-tag{margin-top:4px;font-family:var(--at-font-body);font-weight:600;font-size:9.5px;letter-spacing:.34em;text-transform:uppercase;color:var(--at-accent-text)}
@media (max-width:759px){${A} .hs-header .at-mark{width:32px;height:32px}${A} .hs-header .at-logo-name{font-size:22px}${A} .hs-header .at-logo-tag{font-size:8px}}
${A} .hs-menu-panel,${A} .hs-mega-panel{background:var(--at-surface) var(--at-grain);border:1px solid var(--at-line);border-radius:var(--at-r-panel);box-shadow:var(--at-shadow-lift)}
/* THE FOOTER (handoff Footer): the pine band with grain, the mark over the name and the line, the link columns, a stitch, then the
 * credit as a label. */
${A} .at-footer-ground{${BAND};padding:64px 0 32px}
${A} .at-footer-ground .hs-footer-top{max-width:1320px;margin:0 auto;padding:0 var(--at-gutter);border:0;background:none;grid-template-columns:repeat(auto-fit,minmax(min(100%,160px),1fr));gap:40px 32px}
${A} .at-footer-ground .hs-footer-brand{gap:14px}
${A} .at-footer-ground .hs-footer-brand .hs-brand{color:var(--at-text)}
${A} .at-footer-ground .at-logo{flex-direction:column;align-items:flex-start;gap:14px}
${A} .at-footer-ground .at-mark{width:52px;height:52px}
${A} .at-footer-ground .at-logo-name{font-size:32px}
${A} .at-footer-ground .at-logo-tag{color:var(--at-band-accent-text)}
${A} .at-footer-ground .hs-footer-brand p{font-size:15px;color:var(--at-text-muted)}
${A} .at-footer-ground .hs-footer-col,${A} .at-footer-ground .hs-footer-links{display:flex;flex-direction:column;align-items:flex-start;gap:0}
${A} .at-footer-ground .hs-footer-col-title{${LABEL};color:var(--at-band-accent-text);margin-bottom:12px}
${A} .at-footer-ground .hs-footer-col a,${A} .at-footer-ground .hs-footer-links a{min-height:44px;line-height:44px;font-family:var(--at-font-body);font-size:15px;color:var(--at-text);text-decoration:none}
${A} .at-footer-ground .hs-footer-col a:hover,${A} .at-footer-ground .hs-footer-links a:hover{color:var(--at-band-accent-text)}
${A} .at-footer-ground .hs-footer{max-width:calc(1320px - 2 * var(--at-gutter));margin:40px auto 0;padding:18px 0 0;border-top:var(--at-frame) var(--at-stitch);width:calc(100% - 2 * var(--at-gutter));color:var(--at-text-muted);font-size:14px}
${A} .at-footer-ground .hs-footer a{color:var(--at-text-muted)}
${A} .at-footer-ground .hs-footer-line{${LABEL};color:var(--at-text-muted)}
/* The credit is the handoff's plain label (the Built on Frequency line beside it), not the Partner pill. */
${A} .at-footer-ground .hs-partner{display:none}
/* THE ROLE BLOCKS (lib/blocks/roles, the kit's sections), in the handoff's hand. Grain on every ground, the hide grain on bands, Title
 * Case blackletter in one ink, the stitch inside cards (7px), photos (9px) and buttons (4px), stitched dividers between rows, and a
 * warm lift on hover. Each role's versions are drawn as the handoff's ui_kits/site draws them (roles-1/2/3.jsx). */
${A} [data-role]{background:var(--at-canvas) var(--at-grain);color:var(--at-text);padding-block:var(--at-section-y)}
${A} [data-role][data-tone="surface"]{background:var(--at-sunken) var(--at-grain)}
${A} [data-role][data-tone="band"]{${BAND}}
${A} [data-role] [data-part="heading"]{gap:16px;max-width:none}
${A} [data-role] [data-part="eyebrow"]{margin:0;${LABEL};color:var(--at-accent-text);opacity:1}
${A} [data-role][data-tone="band"] [data-part="eyebrow"]{color:var(--at-band-accent-text)}
${A} [data-role] [data-part="title"]{margin:0;font-family:var(--at-font-display);font-weight:700;font-style:normal;text-transform:none;letter-spacing:0;line-height:var(--at-lead-display);font-size:clamp(36px,5.4vw,80px);color:var(--at-text);text-wrap:balance}
${A} [data-role] [data-part="title"] em{font-family:inherit;font-style:normal;font-weight:inherit;color:inherit}
${A} [data-role] [data-part="lead"]{font-size:17px;line-height:1.6;color:var(--at-text-muted);max-width:var(--at-measure);opacity:1}
${A} [data-role] [data-part="name"]{font-family:var(--at-font-display);font-weight:700;text-transform:none;letter-spacing:0;line-height:1;font-size:28px;color:var(--at-text)}
${A} [data-role] [data-part="body"]{font-size:16px;line-height:1.6;color:var(--at-text-muted);opacity:1}
${A} [data-role] [data-part="kind"],${A} [data-role] [data-part="label"]{${LABEL}}
${A} [data-role] [data-part="price"],${A} [data-role] [data-part="value"]{font-family:var(--at-font-body);font-weight:700;font-variant-numeric:tabular-nums;color:var(--at-text)}
${A} [data-role] [data-part="quote"]{font-family:var(--at-font-voice);font-style:italic;font-weight:400}
${A} [data-role] [data-part="item"]{transition:transform var(--at-dur) ${EASE},box-shadow var(--at-dur) ${EASE}}
/* Cards: the surface with grain, a hairline, the resting shadow and the stitch 7px inside. */
${A} [data-role] [data-card]{background:var(--at-surface) var(--at-grain);border:1px solid var(--at-line);border-radius:var(--at-r-card);box-shadow:var(--at-shadow-card);${stitch(7)}}
/* Photos: square corners, the lift shadow, saturation down a touch, and the stitch 9px inside in bone. */
${A} [data-role] [data-part="media"]{position:relative;border-radius:var(--at-r-media);clip-path:none;background:var(--at-sunken);box-shadow:var(--at-shadow-lift)}
${A} [data-role] [data-part="media"]:has(img)::after{content:"";position:absolute;inset:9px;z-index:1;border:var(--at-frame) color-mix(in srgb,var(--at-photo-text) 55%,transparent);border-radius:var(--at-r-media);pointer-events:none}
${A} [data-role] [data-part="media"] img{border-radius:var(--at-r-media);filter:saturate(.85);outline:0}
/* Buttons: the accent fill with the hide grain and the stitch 4px inside; the second is a text link. Outlines where the design asks. */
/* The role sheet is emitted after this skin (website-document.tsx), so a rule that must beat one of its own names the role twice. */
${A} [data-role][data-role] [data-part="cta"]{position:relative;min-height:52px;padding:0 26px;border:0;border-radius:var(--at-r-control);background:var(--at-accent) var(--at-grain-hide);color:var(--at-on-accent);${LABEL};font-size:13px;box-shadow:var(--at-shadow-card);outline:var(--at-frame) color-mix(in srgb,var(--at-on-accent) 55%,transparent);outline-offset:-4px}
${A} [data-role][data-role] [data-part="cta"]:hover{background-color:var(--at-accent-hover);border:0;transform:translateY(-2px);box-shadow:var(--at-shadow-lift)}
${A} [data-role][data-role] [data-part="cta"][data-kind="secondary"]{background:transparent;color:var(--at-text);box-shadow:none;outline:0;padding:0 8px}
${A} [data-role][data-role] [data-part="cta"][data-kind="secondary"]:hover{background:transparent;transform:none;text-decoration:underline;text-underline-offset:6px}
${A} [data-role][data-role] [data-part="actions"] [data-part="cta"][data-kind="secondary"]:only-child,${A} [data-role="cta"][data-role] [data-part="cta"]{background:transparent;color:var(--at-text);border:1px solid var(--at-line-strong);box-shadow:none;outline:0;padding:0 26px}
${A} [data-role][data-role] [data-part="actions"] [data-part="cta"][data-kind="secondary"]:only-child:hover{background:var(--at-accent-bg);transform:none;text-decoration:none}
/* HERO. Forest (split on the band): the redwood silhouette behind it at 40%, the words on the left, a product photo on the right. */
${A} [data-role="hero"]{overflow:hidden}
${A} [data-role="hero"][data-tone="band"]::before{content:"";position:absolute;inset:0;background:url(/sites/aiden-tyack/redwood-forest-silhouette.webp) 50% 40%/cover no-repeat;opacity:.4;pointer-events:none}
${A} [data-role="hero"] [data-part="inner"]{position:relative}
${A} [data-role="hero"][data-variant="split"] [data-part="inner"]{grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:clamp(32px,5vw,72px);align-items:center}
${A} [data-role="hero"][data-variant="split"][data-flip] [data-part="copy"]{order:2}
${A} [data-role="hero"] [data-part="copy"]{max-width:680px;gap:24px}
${A} [data-role="hero"] [data-part="title"]{font-size:clamp(48px,7.6vw,128px)}
${A} [data-role="hero"][data-tone="band"] [data-part="title"]{text-shadow:0 2px 0 rgba(8,10,5,.38),0 10px 28px rgba(8,10,5,.45)}
${A} [data-role="hero"] [data-part="lead"]{font-size:19px}
${A} [data-role="hero"][data-variant="split"] [data-part="media"]{width:100%;max-width:500px;justify-self:end;--rb-ratio:4/5}
${A} [data-role="hero"][data-variant="split"] [data-part="media"] img{aspect-ratio:4/5}
${A} [data-role="hero"][data-tone="band"][data-role] [data-part="cta"][data-kind="secondary"]{color:var(--at-text)}
${A} [data-role="hero"][data-variant="full"] [data-part="media"]{box-shadow:none}
${A} [data-role="hero"][data-variant="full"] [data-part="media"]::after,${A} [data-role="gallery"][data-variant="carousel"] [data-part="media"]::after{display:none}
${A} [data-role="hero"][data-variant="full"] [data-part="copy"]{${ON_PHOTO}}
/* SHOP (grid): the heading with View all beside it, then 4:5 photos with the name, the detail and the price under each. No card. */
${A} [data-role="shop"] [data-part="heading"]{grid-template-columns:minmax(0,1fr) auto;align-items:end;column-gap:20px}
${A} [data-role="shop"] [data-part="heading"]>*{grid-column:1}
${A} [data-role="shop"] [data-part="heading"]>[data-part="actions"]{grid-column:1;justify-self:start;margin-top:8px}
@container (min-width:40rem){${A} [data-role="shop"] [data-part="heading"]>[data-part="actions"]{grid-column:2;grid-row:1/span 3;align-self:end;margin:0}}
${A} [data-role="shop"][data-variant="grid"] [data-part="list"]{grid-template-columns:repeat(auto-fill,minmax(min(100%,240px),1fr));gap:32px 24px}
${A} [data-role="shop"] [data-part="item"],${A} [data-role="shop"] [data-part="item"][data-card]{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px 12px;align-items:baseline;overflow:visible;background:none;border:0;box-shadow:none;outline:0;padding:0}
${A} [data-role="shop"] [data-part="item"]:hover{transform:translateY(-3px)}
${A} [data-role="shop"] [data-part="item"]:hover [data-part="name"]{color:var(--at-accent-text)}
${A} [data-role="shop"] [data-part="item"] [data-part="media"]{grid-column:1/-1;--rb-ratio:4/5}
${A} [data-role="shop"] [data-part="item"] [data-part="media"] img{aspect-ratio:4/5}
${A} [data-role="shop"][data-variant] [data-part="text"]{padding:0;display:grid;gap:6px}
${A} [data-role="shop"] [data-part="name"]{font-size:24px;transition:color var(--at-dur) ${EASE}}
${A} [data-role="shop"] [data-part="badge"]{order:2;padding:0;background:none;border-radius:0;font-family:var(--at-font-body);font-weight:400;font-size:14px;letter-spacing:0;text-transform:none;color:var(--at-text-muted)}
${A} [data-role="shop"][data-variant] [data-part="price"]{padding:0;font-size:18px;color:var(--at-text)}
/* STATEMENT. Quote (pull): the sunken ground, the mark, the line in the italic voice, the name under it, centred. Stamp (band): huge. */
${A} [data-role="statement"][data-variant="pull"]{background:var(--at-sunken) var(--at-grain)}
${A} [data-role="statement"][data-variant="pull"] [data-part="copy"]{max-width:900px;margin-inline:auto;padding:0;border:0;gap:20px;justify-items:center;text-align:center}
${A} [data-role="statement"][data-variant="pull"] [data-part="copy"]::before{content:"";order:0;width:44px;height:44px;background:var(--at-text);-webkit-mask:url(/sites/aiden-tyack/logo/logo-mark.svg) center/contain no-repeat;mask:url(/sites/aiden-tyack/logo/logo-mark.svg) center/contain no-repeat}
${A} [data-role="statement"][data-variant="pull"] [data-part="title"]{order:1;font-family:var(--at-font-voice);font-style:italic;font-weight:400;font-size:clamp(28px,3.6vw,48px);line-height:1.3}
${A} [data-role="statement"][data-variant="pull"] [data-part="eyebrow"]{order:2}
${A} [data-role="statement"][data-variant="pull"] [data-part="lead"],${A} [data-role="statement"][data-variant="pull"] [data-part="actions"]{order:3}
${A} [data-role="statement"][data-variant="band"] [data-part="title"]{font-size:clamp(40px,6.4vw,104px)}
/* STEPS (grid, the numbered version): three plain columns, the number in tabular Archivo, a stitch under the row. No cards. */
${A} [data-role="steps"][data-variant] [data-part="list"]{grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:var(--at-gap)}
${A} [data-role="steps"][data-variant="grid"] [data-part="list"]{padding-bottom:48px;border-bottom:var(--at-frame) var(--at-stitch)}
${A} [data-role="steps"][data-variant="grid"] [data-part="item"]{padding:0;gap:12px;background:none;border:0;box-shadow:none;outline:0}
${A} [data-role="steps"] [data-part="index"]{font-family:var(--at-font-body);font-style:normal;font-weight:700;font-size:36px;line-height:1;font-variant-numeric:tabular-nums;color:var(--at-accent-soft)}
${A} [data-role="steps"][data-variant="timeline"] [data-part="index"]{font-size:15px;border-radius:50%;color:var(--at-on-accent);background:var(--at-accent)}
${A} [data-role="steps"][data-variant="timeline"] [data-part="list"]{grid-template-columns:none;border-inline-start:var(--at-frame) var(--at-stitch)}
${A} [data-role="steps"] [data-part="body"]{font-size:16px}
/* GALLERY. Band (carousel): photos edge to edge on the band, 4px apart, 4:5, no frame. Grid: square photos under the heading. */
${A} [data-role="gallery"][data-variant="carousel"]{padding:0;background:var(--at-band)}
${A} [data-role="gallery"][data-variant="carousel"] [data-part="inner"]{max-width:none;padding:0}
${A} [data-role="gallery"][data-variant="carousel"] [data-part="heading"]{padding:var(--at-section-y) var(--at-gutter) 0;max-width:1320px;margin-inline:auto;width:100%;${BAND}}
${A} [data-role="gallery"][data-variant="carousel"] [data-part="list"]{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:4px;overflow:visible;margin:0;padding:0;scroll-snap-type:none}
${A} [data-role="gallery"][data-variant="carousel"] [data-part="item"]{width:auto;flex:none;margin:0}
${A} [data-role="gallery"][data-variant="carousel"] [data-part="media"]{--rb-ratio:4/5;width:100%;height:auto;aspect-ratio:4/5;border-radius:0;box-shadow:none;background:none}
${A} [data-role="gallery"][data-variant="carousel"] [data-part="media"] img{width:100%;height:100%;aspect-ratio:4/5;border-radius:0;filter:saturate(.82)}
${A} [data-role="gallery"][data-variant="grid"] [data-part="list"]{grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr));gap:16px}
${A} [data-role="gallery"][data-variant="grid"] [data-part="media"]{--rb-ratio:1/1}
/* PROOF (wall, the quotes version): three cards with the quote in the voice and the name as a label under it. */
${A} [data-role="proof"][data-variant="wall"] [data-part="list"]{display:grid;columns:auto;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:var(--at-gap);align-items:start}
${A} [data-role="proof"][data-variant="wall"] [data-part="item"]{padding:28px;margin:0}
${A} [data-role="proof"] [data-part="quote"]{gap:18px}
${A} [data-role="proof"][data-role] [data-part="quote"] blockquote{font-family:var(--at-font-voice);font-style:italic;font-size:22px;line-height:1.3;color:var(--at-text)}
${A} [data-role="proof"] [data-part="person"]{font-style:normal}
${A} [data-role="proof"] [data-part="who"] b{${LABEL};font-style:normal;color:var(--at-accent-text)}
${A} [data-role="proof"][data-variant="quote"]{${BAND}}
${A} [data-role="proof"][data-variant="quote"] blockquote{font-size:clamp(28px,3.4vw,44px)}
/* FAQ (split, the stitched version): the heading beside the questions, a stitch under each, a plus that turns to a cross. */
${A} [data-role="faq"][data-variant="split"] [data-part="inner"]{grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));align-items:start}
${A} [data-role="faq"][data-variant="split"] [data-part="heading"]{position:static}
${A} [data-role="faq"] [data-part="list"]{border:0;gap:4px}
${A} [data-role="faq"] [data-part="item"]{border:0;border-bottom:var(--at-frame) var(--at-stitch)}
${A} [data-role="faq"] summary{min-height:64px;padding:12px 0;font-family:var(--at-font-display);font-weight:700;font-size:24px;line-height:1.1;letter-spacing:0;color:var(--at-text)}
${A} [data-role="faq"] summary::after{width:auto;height:auto;border:0;background:none;font-family:var(--at-font-body);font-weight:700;font-size:22px;color:var(--at-text)}
${A} [data-role="faq"] summary:hover::after{background:none}
${A} [data-role="faq"] [data-part="answer"]{padding:0 0 20px;font-size:16px;color:var(--at-text-muted)}
${A} [data-role="faq"][data-variant="grid"] [data-part="item"]{border:1px solid var(--at-line)}
/* CTA (band): the deep accent with the hide grain, the words on the left and one outline button on the right. */
${A} [data-role="cta"][data-variant="band"]{--at-text:var(--at-on-accent);--at-text-muted:var(--at-on-accent);--at-accent-text:var(--at-accent-soft);--at-line-strong:var(--at-accent-soft);--at-accent-bg:color-mix(in srgb,var(--at-on-accent) 12%,transparent);background:var(--at-accent-deep) var(--at-grain-hide);color:var(--at-on-accent);padding-block:clamp(56px,7vw,96px)}
${A} [data-role="cta"][data-variant="band"] [data-part="inner"]{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:32px;text-align:start}
${A} [data-role="cta"][data-variant="band"] [data-part="copy"]{justify-items:start;gap:12px;max-width:720px}
${A} [data-role="cta"][data-variant="band"] [data-part="eyebrow"]{color:var(--at-accent-soft)}
${A} [data-role="cta"][data-role] [data-part="cta"]:hover{background:var(--at-accent-bg);transform:none}
/* LETTER (card, the inline version): one stitched card in the middle, the heading and line, then the email box beside Sign up. */
${A} [data-role="letter"][data-variant="card"] [data-part="copy"]{max-width:820px;padding:36px;gap:18px;text-align:start;justify-items:stretch}
${A} [data-role="letter"][data-variant="card"] [data-part="text"],${A} [data-role="letter"][data-variant="card"] [data-part="side"]{justify-items:stretch;gap:18px}
${A} [data-role="letter"] [data-part="title"]{font-size:clamp(32px,4vw,52px)}
${A} [data-role="letter"][data-variant="band"] [data-part="title"]{font-size:clamp(36px,5.4vw,80px)}
${A} [data-role="letter"] [data-part="form"][data-form="letter"]{grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:16px}
${A} [data-role="letter"] [data-part="form"] [data-part="cta"]{width:100%}
/* CONTACT (split): the heading and the details on the left, the form in a stitched card on the right. */
${A} [data-role="contact"][data-variant="split"] [data-part="inner"]{grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));align-items:start}
${A} [data-role="contact"] [data-part="copy"]{gap:28px}
${A} [data-role="contact"] [data-part="list"]{border:0;gap:28px}
${A} [data-role="contact"] [data-part="item"]{border:0;padding:0;gap:6px}
${A} [data-role="contact"] [data-part="meta"]{${LABEL};color:var(--at-accent-text)}
${A} [data-role="contact"] [data-part="value"]{font-family:var(--at-font-body);font-weight:400;font-size:17px;color:var(--at-text)}
${A} [data-role="contact"] [data-part="side"][data-card]{padding:32px}
/* THE FORMS: labels in small caps, a raised well with a hairline, the stitch 7px outside it, the accent button. */
${A} [data-role] [data-part="field"]{gap:8px}
${A} [data-role] [data-part="field"] [data-part="label"]{${LABEL};font-size:11.5px;color:var(--at-text)}
${A} [data-role] [data-part="input"]{width:calc(100% - 14px);margin-inline:7px;min-height:52px;padding:0 16px;border:1px solid var(--at-line-strong);border-radius:var(--at-r-control);background:var(--at-raised);color:var(--at-text);font-family:var(--at-font-body);font-size:16px;box-shadow:inset 0 1px 2px rgba(0,0,0,.08);outline:var(--at-frame) var(--at-stitch);outline-offset:6px}
${A} [data-role] textarea[data-part="input"]{padding:14px 16px;min-height:120px}
${A} [data-role] [data-part="input"]:focus-visible{outline:var(--at-frame) var(--at-accent-text);outline-offset:6px}
${A} [data-role] [data-part="form"] [data-part="cta"]{cursor:pointer}
/* PEOPLE (founder, the maker): the sunken ground, the portrait on the left, the heading and the line in the voice on the right. */
@container (min-width:44rem){${A} [data-role="people"][data-variant="founder"] [data-part="inner"]{grid-template-columns:repeat(2,minmax(0,1fr));align-items:center}${A} [data-role="people"][data-variant="founder"] [data-part="list"]{grid-column:1;grid-row:1}${A} [data-role="people"][data-variant="founder"] [data-part="heading"]{grid-column:2;grid-row:1}}
${A} [data-role="people"][data-variant="founder"][data-variant] [data-part="item"]{grid-template-columns:minmax(0,1fr);background:none;border:0;box-shadow:none;outline:0;padding:0;display:grid;gap:14px}
${A} [data-role="people"][data-variant="founder"] [data-part="lead"]{font-family:var(--at-font-voice);font-style:italic;font-size:clamp(22px,2.4vw,30px);line-height:1.3;color:var(--at-accent-text)}
${A} [data-role="people"] [data-part="media"]{--rb-ratio:4/5;width:100%}
${A} [data-role="people"] [data-part="role"]{margin:0;${LABEL};color:var(--at-accent-text)}
/* LIBRARY (grid, the cards version): a 3:2 photo, the title and line under it. No card. */
${A} [data-role="library"][data-variant] [data-part="list"]{grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:var(--at-gap)}
${A} [data-role="library"][data-variant] [data-part="item"]{background:none;border:0;box-shadow:none;outline:0;padding:0;display:grid;gap:14px}
${A} [data-role="library"] [data-part="media"]{--rb-ratio:3/2}
${A} [data-role="library"] [data-part="text"]{padding:0;display:grid;gap:8px}
${A} [data-role="library"] [data-part="name"]{font-size:26px}
${A} [data-role="library"] [data-part="meta"]{font-size:15px;color:var(--at-text-muted)}
/* OFFERINGS (cards): a stitched card each, the name, the line, the price in tabular Archivo. */
${A} [data-role="offerings"][data-variant] [data-part="item"][data-card]{padding:28px;display:grid;gap:12px;align-content:start}
${A} [data-role="offerings"] [data-part="price"]{font-size:18px}
/* Stats and the rest: the shared card and row rules. */
${A} [data-role="stats"] [data-part="value"]{font-family:var(--at-font-display);font-size:clamp(48px,5vw,72px);line-height:1}
${roleItems(['list', 'rows', 'stack', 'timeline'], '+[data-part="item"]')}{border-top:var(--at-frame) var(--at-stitch)}
/* Motion: colour changes and lifts only, and everything stops under reduced motion. */
${A} .sv-ticker-track{animation:none}
@media (prefers-reduced-motion:reduce){${A} *{transition:none!important;animation:none!important}}
`
