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
/* The wordmark in the bar: the name in Grenze Gotisch, Title Case. */
${A} .hs-brand,${A} .sv-wordmark{font-family:var(--at-font-display);font-weight:700;text-transform:none;letter-spacing:0;color:var(--at-text)}
${A} .hs-brand{font-size:clamp(28px,2.6vw,34px)}
/* The header: full width on the canvas with grain, a stitch under it. */
${A} .hs-header{position:sticky;top:0;z-index:40}
${A} .hs-pill,${A} .sv-header{background:var(--at-canvas) var(--at-grain);border:0;border-bottom:var(--at-frame) var(--at-stitch);border-radius:0;box-shadow:none;-webkit-backdrop-filter:none;backdrop-filter:none}
${A} .hs-logo{flex:none;display:block;height:clamp(30px,6vw,42px);width:auto;max-width:180px;object-fit:contain}
${A} .hs-nav a,${A} .hs-nav-mega,${A} .sv-nav a{${LABEL};color:var(--at-text-muted)}
${A} .hs-nav a:hover,${A} .hs-nav a[aria-current="page"],${A} .sv-nav a:hover,${A} .sv-nav a[aria-current="page"]{color:var(--at-text)}
${A} .hs-nav a[aria-current="page"],${A} .sv-nav a[aria-current="page"]{text-decoration:underline dashed var(--at-accent);text-underline-offset:6px;text-decoration-thickness:1.5px}
${A} .hs-menu-panel,${A} .hs-mega-panel{background:var(--at-surface) var(--at-grain);border:1px solid var(--at-line);border-radius:var(--at-r-panel);box-shadow:var(--at-shadow-lift)}
/* The footer: the band. */
${A} .hs-footer-top,${A} .sv-footer{${BAND}}
${A} .hs-footer-col-title{${LABEL};color:var(--at-text-muted)}
/* THE ROLE BLOCKS (lib/blocks/roles, the kit's sections). The shared sheet (components/sites/role-blocks-css.ts) lays them out from the
 * core contract; this dresses them in the design's own hand: grain on every ground, the hide grain on bands, Title Case blackletter,
 * the stitch inside cards (7px), photos (9px) and buttons (4px), stitched dividers between list rows, and a warm lift on hover. */
${A} [data-role]{background:var(--at-canvas) var(--at-grain)}
${A} [data-role][data-tone="surface"]{background:var(--at-surface) var(--at-grain)}
${A} [data-role][data-tone="band"]{${BAND}}
${A} [data-role] [data-part="title"]{font-family:var(--at-font-display);font-weight:700;text-transform:none;letter-spacing:0}
${A} [data-role] [data-part="title"] em{font-family:var(--at-font-display);font-style:normal;font-weight:700;color:var(--at-accent-text)}
${A} [data-role][data-tone="band"] [data-part="title"] em{color:var(--at-band-accent-text)}
${A} [data-role] [data-part="eyebrow"],${A} [data-role] [data-part="kind"],${A} [data-role] [data-part="badge"],${A} [data-role] [data-part="label"]{${LABEL}}
${A} [data-role] [data-part="price"],${A} [data-role] [data-part="value"]{font-family:var(--at-font-body);font-weight:700;font-variant-numeric:tabular-nums}
${A} [data-role="stats"] [data-part="value"]{font-family:var(--at-font-display);font-size:clamp(48px,5vw,72px);line-height:1}
${A} [data-role] [data-part="quote"]{font-family:var(--at-font-voice);font-style:italic;font-weight:400}
${A} [data-role] [data-part="cta"]{${LABEL};border-radius:var(--at-r-control);${stitch(4)};outline-color:color-mix(in srgb,currentColor 55%,transparent)}
${A} [data-role] [data-part="item"]{border-radius:var(--at-r-card);transition:transform var(--at-dur-fast) ${EASE},box-shadow var(--at-dur-fast) ${EASE}}
${roleItems(['cards', 'grid', 'wall', 'tiers', 'spotlight', 'card'])}{background:var(--at-surface) var(--at-grain);box-shadow:var(--at-shadow-card);${stitch(7)}}
${roleItems(['cards', 'grid', 'wall'], ':hover')}{transform:translateY(-2px);box-shadow:var(--at-shadow-lift)}
${roleItems(['list', 'rows', 'stack', 'timeline'], '+[data-part="item"]')}{border-top:var(--at-frame) var(--at-stitch)}
${A} [data-role] [data-part="media"] img,${A} [data-role] [data-part="photo"] img{border-radius:var(--at-r-card);${stitch(9)}}
/* The forest hero: the band, with the redwood silhouette behind the words at 40% and no stitch (it is shade, not a photo). */
${A} [data-role="hero"]:has(img[src*="redwood-forest-silhouette"]){${BAND}}
${A} [data-role="hero"] img[src*="redwood-forest-silhouette"]{opacity:.4;outline:0;filter:none}
${A} [data-role="hero"][data-variant="full"] [data-part="copy"]{${ON_PHOTO}}
/* Motion: colour changes and lifts only, and everything stops under reduced motion. */
${A} .sv-ticker-track{animation:none}
@media (prefers-reduced-motion:reduce){${A} *{transition:none!important;animation:none!important}}
`
