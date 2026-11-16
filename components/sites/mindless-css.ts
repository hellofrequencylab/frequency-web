import { SERVICES_CSS } from '@/components/sites/services-css'
import { MINDLESS_SITE_CSS } from '@/components/sites/mindless-site-css'
import { MINDLESS_ACCENT_CSS, MINDLESS_DIALS_CSS, MINDLESS_TOKENS_CSS } from '@/lib/theme/mindless'

// THE MINDLESS SKIN (design: the Mindless design system, components/bundle.css + ui_kits/website app.css). Scoped under
// [data-house-theme="mindless"], so every house section keeps its markup and content; values come only from the token block
// (lib/theme/mindless.ts), never raw. It layers after the house sheets (components/sites/site-chrome.tsx): the site's own colour names
// (--color-*) re-pointed at warm ink and bone, the two faces, then the page chrome. The look, in the design's words: 60 warm ink grounds,
// 30 bone type and one muted violet band, 10 the accent (logo, primary action, one key phrase per headline), and under 3 an offset paint
// on one to three small details. One card style: a raised surface and a 1px hairline. Extrusion only at display sizes. Primary buttons are
// paint stickers: an accent fill, an ink outline and an offset ink shadow. The owner's accent (--color-primary*) comes from
// mindlessAccentVars and is never set here. Night first; Day (data-th="day") is bone paper with ink type, and yellow is never text on it:
// the accent phrase sits on a yellow highlighter. Motion is fixed off. Theme fence: this sheet only reaches the stand-alone render (ADR-1906).

const M = '[data-house-theme="mindless"]'
const DAY = '[data-house-theme="mindless"][data-th="day"]'
const LABEL = 'font-family:var(--ml-font-body);font-weight:800;font-size:12px;letter-spacing:var(--ml-ls-label);text-transform:uppercase'
const EASE = 'var(--ml-ease-out)'

// THE MINDLESS BLOCK SHEET. Mindless's kits compose the Services block family (components/page-editor/blocks/services.tsx, classes
// `.sv-*`) until Mindless cuts its own, exactly as New World and CyberWitch do (components/sites/cyberwitch-blocks-css.ts). This derives
// the sheet from that one source: the scope moves to [data-house-theme="mindless"], `--sv-*` tokens become `--ml-*`, and the two values a
// block sets inline on itself (--sv-min, --sv-ratio) keep their names, as does the wordmark length (--sv-wm-len). Every name the Services
// sheet reads is answered below in MINDLESS_BLOCK_ALIASES from the design's own roles. Scoped like the skin, so it can only dress the
// stand-alone site render (ADR-1906).


/** The `--ml-*` names the borrowed block sheet reads, answered in ink, bone and the one paint accent. Every value is a design token. */
export const MINDLESS_BLOCK_ALIASES = `
${M}{
--ml-ink-950:var(--ml-pit);
--ml-ink-900:var(--ml-ground);
--ml-ink-850:var(--ml-raised);
--ml-ink-800:var(--ml-raised-2);
--ml-ink-700:var(--ml-violet-raised);
--ml-chrome-50:var(--ml-head);
--ml-chrome-200:var(--ml-secondary);
--ml-flare-300:var(--ml-accent-hover);
--ml-flare-400:var(--ml-accent-text);
--ml-flare-500:var(--ml-accent);
--ml-flare-600:var(--ml-accent-soft);
--ml-surface-page:var(--ml-ground);
--ml-surface-sunken:var(--ml-band-pit);
--ml-surface-card:var(--ml-raised);
--ml-surface-raised:var(--ml-raised-2);
--ml-surface-light:var(--ml-raised);
--ml-surface-light-sunken:var(--ml-band-pit);
--ml-text-primary:var(--ml-head);
--ml-text-secondary:var(--ml-body);
--ml-text-muted:var(--ml-muted);
--ml-text-accent:var(--ml-accent-text);
--ml-text-on-light:var(--ml-head);
--ml-text-on-light-muted:var(--ml-secondary);
--ml-border-hairline:1px;
--ml-border-subtle:var(--ml-line);
--ml-border-light:var(--ml-line);
--ml-border-default:var(--ml-line-strong);
--ml-border-strong:color-mix(in oklab,var(--ml-head) 40%,transparent);
--ml-salt-300:var(--ml-raised-2);
--ml-salt-700:var(--ml-secondary);
--ml-swell-300:var(--ml-noise-2-text);
--ml-swell-500:var(--ml-noise-2);
--ml-halo-300:var(--ml-noise-1-text);
--ml-halo-500:var(--ml-noise-1);
--ml-action-primary:var(--ml-accent);
--ml-action-primary-text:var(--ml-on-accent);
--ml-focus-ring:var(--ml-accent-hover);
--ml-success-500:var(--ml-success);
--ml-warning-500:var(--ml-warning);
--ml-danger-500:var(--ml-danger);
--ml-font-mono:var(--ml-font-body);
--ml-font-accent:var(--ml-font-display);
--ml-fs-body-l:var(--ml-fs-lede);
--ml-fw-regular:400;
--ml-fw-medium:500;
--ml-fw-bold:700;
--ml-fw-heavy:800;
--ml-ls-display:0;
--ml-ls-button:.08em;
--ml-ls-mono:var(--ml-ls-label);
--ml-stretch-display:100%;
--ml-radius-sm:var(--ml-corner-sm);
--ml-radius-md:var(--ml-corner);
--ml-radius-lg:var(--ml-corner-lg);
--ml-radius-xl:var(--ml-corner-lg);
--ml-sheen:none;
--ml-depth-sm:var(--ml-shadow-card);
--ml-depth-md:var(--ml-shadow-card);
--ml-depth-lg:var(--ml-shadow-panel);
--ml-shadow-glow:none;
--ml-glow-sunset:var(--ml-band-pit);
--ml-glow-sky:var(--ml-ground);
--ml-spread-tr:none;
--ml-spread-tl:none;
--ml-spread-br:none;
--ml-overlay-bottom:linear-gradient(180deg,transparent 40%,color-mix(in oklab,var(--ml-pit) 92%,transparent) 100%);
--ml-overlay-scrim:linear-gradient(90deg,color-mix(in oklab,var(--ml-pit) 78%,transparent) 0%,color-mix(in oklab,var(--ml-pit) 40%,transparent) 45%,transparent 75%);
--ml-grad-lit:linear-gradient(90deg,var(--ml-accent),var(--ml-accent));
}`

export const MINDLESS_BLOCKS_CSS = `${MINDLESS_BLOCK_ALIASES}
${SERVICES_CSS.replaceAll('[data-house-theme="services"]', M)
  .replace(/--sv-shadow-(sm|md|lg)\b/g, '--ml-depth-$1')
  .replace(/--sv-(?!min\b|ratio\b|wm-len\b)/g, '--ml-')}`

export const MINDLESS_CSS = `${MINDLESS_TOKENS_CSS}${MINDLESS_DIALS_CSS}${MINDLESS_ACCENT_CSS}
${MINDLESS_BLOCKS_CSS}
/* The owner's accent drives the paint: the accent ramp follows --color-primary (Yellow when none). On Day the accent text step is ink. */
/* token-ok: Mindless skin literal (fallback accent) */
${M}{--ml-accent:var(--color-primary,#ECBC19);--ml-accent-hover:var(--color-primary-hover,#F3CB3C);--ml-accent-text:var(--color-primary-strong,#ECBC19);--ml-on-accent:var(--color-text-on-primary,#231B1D)}
${DAY}{--ml-accent-text:var(--ml-ink)}
${M}{color-scheme:dark;--color-canvas:var(--ml-ground);--color-surface:var(--ml-raised);--color-surface-post:var(--ml-raised);--color-surface-elevated:var(--ml-raised-2);--color-surface-hover:var(--ml-raised-2);--color-border:var(--ml-line-strong);--color-border-strong:color-mix(in oklab,var(--ml-head) 40%,transparent);--color-text:var(--ml-head);--color-text-muted:var(--ml-body);--color-text-subtle:var(--ml-muted);--color-focus-ring:var(--ml-accent-hover);--color-success:var(--ml-success);--color-warning:var(--ml-warning);--color-danger:var(--ml-danger);--color-info:var(--ml-noise-2-text);--color-ink:var(--ml-band-pit);--color-on-ink:var(--ml-head);--color-on-ink-muted:var(--ml-body);--radius-control:var(--ml-radius-pill);--radius-card:var(--ml-corner);--radius-cover:var(--ml-corner-lg);--radius-media:var(--ml-corner);--font-display:var(--ml-font-display);--font-body:var(--ml-font-body);--font-label:var(--ml-font-body)}
${DAY}{color-scheme:light;--color-ink:var(--ml-ink);--color-on-ink:var(--ml-paper);--color-on-ink-muted:var(--ml-paper-muted)}
${M}{position:relative;font-family:var(--ml-font-body);font-size:var(--ml-fs-body);line-height:var(--ml-lh-body);font-synthesis-weight:none;background:var(--ml-ground);color:var(--ml-body)}
/* One barely-there film of grain over the page, never per section, never on buttons. */
${M}::after{content:"";position:fixed;inset:0;z-index:999;pointer-events:none;background:var(--ml-tex-grain);background-size:180px 180px;opacity:.05;mix-blend-mode:overlay}
${DAY}::after{display:none}
${M} .hs-root{background:transparent;color:var(--ml-body)}
${M} ::selection{background:var(--ml-accent);color:var(--ml-on-accent)}
${M} a{color:var(--ml-accent-text);transition:color var(--ml-dur-fast) ${EASE}}
${M} a:hover{color:var(--ml-accent-hover)}
${DAY} a:hover{color:var(--ml-ink);text-decoration-color:var(--ml-accent)}
${M} :focus-visible{outline:3px solid var(--ml-accent);outline-offset:3px}
${DAY} :focus-visible{outline-color:var(--ml-ink)}
/* Headlines: the drip display in bone with an ink extrusion; the one key phrase (em) in the accent. Three voices (data-type: caps is the drip, quiet is Archivo in sentence case, editorial is the Archivo stamp). */
${M} .hs-h1,${M} .hs-h2,${M} .sv-display{font-family:var(--ml-font-display);font-weight:400;font-stretch:100%;font-style:normal;text-transform:uppercase;letter-spacing:0;line-height:var(--ml-lh-display);color:var(--ml-head);text-shadow:var(--ml-depth-ink);text-wrap:balance}
${M} .hs-h1,${M} .sv-hero .sv-display{text-shadow:var(--ml-depth-ink-xl)}
${M} .hs-h1 em,${M} .hs-h2 em,${M} .sv-display em{font-family:inherit;font-style:normal;font-weight:inherit;font-size:1em;line-height:inherit;letter-spacing:inherit;text-transform:inherit;color:var(--ml-accent-text)}
${DAY} .hs-h1 em,${DAY} .hs-h2 em,${DAY} .sv-display em{color:var(--ml-ink);background:linear-gradient(transparent 56%,var(--ml-accent) 56%,var(--ml-accent) 94%,transparent 94%);padding:0 .06em;-webkit-box-decoration-break:clone;box-decoration-break:clone}
${DAY} .hs-h1,${DAY} .hs-h2,${DAY} .sv-display{text-shadow:none}
${M}[data-type="quiet"] .hs-h1,${M}[data-type="quiet"] .hs-h2,${M}[data-type="quiet"] .sv-display{font-family:var(--ml-font-body);font-weight:800;text-transform:none;letter-spacing:-.02em;line-height:1.02;text-shadow:none}
${M}[data-type="editorial"] .hs-h1,${M}[data-type="editorial"] .hs-h2,${M}[data-type="editorial"] .sv-display{font-family:var(--ml-font-body);font-weight:800;text-transform:uppercase;letter-spacing:.02em;line-height:1;text-shadow:none}
/* Small titles sit flat: extrusion only at display sizes. */
${M} .sv-card .sv-display,${M} .sv-tile .sv-display,${M} .sv-row .sv-display,${M} h3,${M} h4{text-shadow:none}
/* Labels: Archivo 800 tracked caps. The section label is a small raised tag with its number in the offset paint. */
${M} .hs-eyebrow,${M} .hs-label,${M} .hs-badge,${M} .sv-mono{${LABEL}}
${M} .sv-eyebrow{display:inline-flex;align-items:center;gap:8px;padding:6px 12px;border-radius:var(--ml-radius-pill);background:var(--ml-raised-2);box-shadow:inset 0 0 0 1px var(--ml-line);color:var(--ml-head);${LABEL};font-size:11px}
${M} .sv-eyebrow b{color:var(--ml-noise-1-text)}
${M} .sv-eyebrow::before{display:none}
${M} .sv-lede,${M} .hs-lede{color:var(--ml-body)}
/* One card style: a raised surface and a 1px hairline. No speck, no glow, no lit edge. */
${M} .hs-card,${M} .sv-card,${M} .sv-panel,${M} .sv-tile,${M} .sv-qf-card{border:0;border-radius:var(--ml-corner);background:var(--ml-raised);box-shadow:inset 0 0 0 1px var(--ml-line)}
${M} .sv-card--lit{box-shadow:inset 0 0 0 2px var(--ml-accent)}
${M} a.sv-card:hover{box-shadow:inset 0 0 0 1px var(--ml-line-strong);transform:translateY(-2px)}
/* Buttons. Primary: a paint sticker (accent fill, ink outline, offset ink shadow), pressed on click. Secondary: a bone outline with a small
 * offset shadow in the section's offset paint. Never grain on a button. */
${M} .hs-btn,${M} .hs-btn-primary,${M} .hs-btn-dark,${M} .sv-btn{${LABEL};font-size:14px;min-height:48px;padding:0 24px;border-radius:var(--ml-radius-pill);transition:transform var(--ml-dur-fast) ${EASE},box-shadow var(--ml-dur-fast) ${EASE}}
${M}[data-site-corners="subtle"] .sv-btn,${M}[data-site-corners="square"] .sv-btn,${M}[data-site-corners="subtle"] .hs-btn-primary,${M}[data-site-corners="square"] .hs-btn-primary{border-radius:var(--ml-corner-sm)}
${M} .hs-btn-primary,${M} .hs-btn-dark,${M} .sv-btn--accent{background:var(--ml-accent);color:var(--ml-on-accent);border:var(--ml-outline);box-shadow:var(--ml-shadow-sticker)}
${M} .hs-btn-primary:hover,${M} .hs-btn-dark:hover,${M} .sv-btn--accent:hover{background:var(--ml-accent-hover);color:var(--ml-on-accent);transform:translate(-1px,-1px);box-shadow:var(--ml-shadow-sticker-lift)}
${M} .hs-btn-primary:active,${M} .sv-btn--accent:active{transform:translate(2px,3px);box-shadow:none}
${M} .sv-btn--accent::before,${M} .sv-btn--accent::after{display:none}
${M} .hs-btn-soft,${M} .sv-btn--secondary{background:transparent;color:var(--ml-head);border:2px solid color-mix(in oklab,var(--ml-head) 55%,transparent);box-shadow:2px 3px 0 0 var(--ml-noise-1)}
${M} .hs-btn-soft:hover,${M} .sv-btn--secondary:hover{background:var(--ml-accent-tint);border-color:var(--ml-head);color:var(--ml-head)}
${M} .sv-btn--lg{min-height:56px;padding:0 30px;font-size:15px}
/* Sections: warm ink grounds in rhythm. Depth is the ground, sky is the raised ground, ink is the pit, aurora is the one violet band. */
${M} .sv-sec{background:var(--ml-ground);padding-block:var(--ml-section-y)}
${M} .sv-sec--sky{background:var(--ml-raised)}
${M} .sv-sec--ink{background:var(--ml-band-pit)}
${M} .sv-sec--aurora{background:var(--ml-violet)}
${M} .sv-sec--aurora .sv-card,${M} .sv-sec--aurora .sv-tile{background:var(--ml-violet-raised)}
${M} .sv-orb,${M} .sv-dotgrid,${M} .sv-pinstripe{display:none}
${M} .sv-band{background:var(--ml-band-pit);border-top:1px solid var(--ml-line);border-bottom:1px solid var(--ml-line)}
/* Numbers and stats: the first in a set is the accent, the rest bone. */
${M} .sv-step-num,${M} .sv-stepper-num{font-family:var(--ml-font-display);font-weight:400;color:var(--ml-head)}
${M} .sv-step:first-child .sv-step-num,${M} .sv-stepper > :first-child .sv-stepper-num{color:var(--ml-accent-text)}
${M} .sv-stars{color:var(--ml-noise-1-text)}
${M} .sv-price{color:var(--ml-accent-text);font-weight:800}
/* The photo hero (the design's approved hero): the paint photo full bleed, an ink fade from the left so the words read, the figures on the
 * right left lit. The words sit on the left. */
${M} .sv-hero--photo{min-height:min(92vh,860px)}
${M} .sv-hero-bg--photo{background-position:62% 42%}
${M} .sv-hero-bg--photo::before{background:linear-gradient(90deg,color-mix(in oklab,var(--ml-pit) 82%,transparent) 0%,color-mix(in oklab,var(--ml-pit) 55%,transparent) 36%,transparent 64%),linear-gradient(0deg,color-mix(in oklab,var(--ml-ground) 85%,transparent) 0%,transparent 26%)}
${M} .sv-hero-bg--photo::after{display:none}
${M} .sv-hero--photo .sv-hero-in{grid-template-columns:minmax(0,1fr);align-items:end}
${M} .sv-hero--photo .sv-hero-copy{max-width:min(100%,640px)}
@media (min-width:900px){${M} .sv-hero--photo .sv-hero-copy{max-width:min(56%,660px)}}
@media (max-width:899px){${M} .sv-hero-bg--photo{background-position:70% 40%}${M} .sv-hero-bg--photo::before{background:linear-gradient(0deg,color-mix(in oklab,var(--ml-pit) 88%,transparent) 0%,color-mix(in oklab,var(--ml-pit) 50%,transparent) 55%,transparent 85%)}}
${M} .sv-hero--photo .sv-display{font-size:clamp(52px,7vw,112px);color:var(--ml-head)}
${M} .sv-hero--photo .sv-display em{color:var(--ml-accent)}
${M} .sv-hero--photo .sv-hero-lead{color:var(--ml-head)}
${DAY} .sv-hero--photo .sv-display,${DAY} .sv-hero--photo .sv-hero-lead{color:var(--ml-light-head)}
${DAY} .sv-hero--photo .sv-display em{color:var(--ml-ink);background:linear-gradient(transparent 56%,var(--ml-accent) 56%,var(--ml-accent) 94%,transparent 94%)}
/* Photos: the paint and mono treatments are baked into the files; the Images dial's clean look drops the grain overlay only. */
${M} img.sv-photo,${M} .sv-media img{filter:none}
/* The wordmark in the bar: the name in the drip display in the accent, an ink extrusion behind it. */
${M} .hs-brand,${M} .sv-wordmark{font-family:var(--ml-font-display);font-weight:400;text-transform:uppercase;color:var(--ml-accent);text-shadow:var(--ml-depth-ink);letter-spacing:0}
${M} .hs-brand{font-size:clamp(26px,2.6vw,34px)}
${DAY} .hs-brand,${DAY} .sv-wordmark{color:var(--ml-ink);text-shadow:2px 2px 0 var(--ml-accent)}
/* The header: full width, the ground with a hairline under it. */
${M} .hs-header{position:sticky;top:0;z-index:40}
${M} .hs-pill,${M} .sv-header{background:color-mix(in oklab,var(--ml-ground) 92%,transparent);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);border-bottom:1px solid var(--ml-line);box-shadow:none}
${M} .hs-logo{flex:none;display:block;height:clamp(30px,6vw,40px);width:auto;max-width:180px;object-fit:contain}
${M} .hs-hero{--color-ink:var(--ml-pit);--color-on-ink:var(--ml-head);--color-on-ink-muted:var(--ml-body)}
${M} .hs-nav a,${M} .hs-nav-mega,${M} .sv-nav a{${LABEL};color:var(--ml-body)}
${M} .hs-nav a:hover,${M} .hs-nav a[aria-current="page"],${M} .sv-nav a:hover,${M} .sv-nav a[aria-current="page"]{color:var(--ml-head)}
${M} .hs-nav a[aria-current="page"],${M} .sv-nav a[aria-current="page"]{box-shadow:inset 0 -3px 0 var(--ml-accent)}
${M} .hs-menu-panel,${M} .hs-mega-panel{background:var(--ml-raised);border:1px solid var(--ml-line);border-radius:var(--ml-corner);box-shadow:var(--ml-shadow-panel)}
/* The footer: full width on the pit, a hairline above. */
${M} .hs-footer-top,${M} .sv-footer{background:var(--ml-band-pit);border-top:1px solid var(--ml-line)}
${M} .hs-footer-col-title{${LABEL};color:var(--ml-muted)}
/* Forms: raised wells with a hairline; focus in the accent. */
${M} .sv-input,${M} .sv-field input,${M} .sv-field textarea,${M} .sv-field select{background:var(--ml-raised-2);border:1px solid var(--ml-line-strong);color:var(--ml-head);border-radius:var(--ml-corner-sm)}
/* Motion is fixed off; prefers-reduced-motion is honoured regardless. */
${M} .sv-ticker-track{animation:none}
@media (prefers-reduced-motion:reduce){${M} *{transition:none!important;animation:none!important}}
${MINDLESS_SITE_CSS}
`
