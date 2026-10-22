import { TEMPLE_TOKENS_CSS } from '@/lib/theme/temple'

// THE TEMPLE WEBSITE SKIN (lib/theme/temple.ts, from the Royal Temple design system). Layered AFTER HOUSE_CSS
// and FREQUENCY_PAGE_CSS on a website whose Space wears the Temple theme, and scoped under
// [data-house-theme="temple"], so every house section and site page section keeps its markup and content and
// only its look changes. Reads `--tp-*` and DAWN tokens only: every color, size, shadow and motion value lives
// in the token block (TEMPLE_TOKENS_CSS), so nothing here is a raw value.
//
// The rules, from the design system: a plaster ground with a fine sand texture and a warm sun wash; umber ink,
// never black; one clay hero color on the main button, the date stamp and the active mark; the ARCH on photos,
// stamps, steps, tiers and the sign-in sheet; Branch for numerals and the big line, Marcellus for titles, Jost
// 300 for body, Cormorant italic for quotes; small caps labels set wide; warm low-contrast shadows; grit and
// sand textures so a wash never reads as flat CSS; one watermark motif per band; the night band (aegean into
// umber) and the ink footer carry the light text. Everything drifts on one ease and stops under reduced motion.

const N = '[data-house-theme="temple"]'
// The page sections' sheet (FREQUENCY_PAGE_CSS) is scoped two attributes deep; the section rules carry the
// site root too, so they outrank it without `!important`.
const M = '[data-house-site][data-house-theme="temple"]'

const DISPLAY = 'font-family:var(--tp-display);font-weight:var(--tp-weight-regular);letter-spacing:var(--tp-tracking-display);text-transform:none;font-style:normal;color:var(--tp-umber-900)'
const TITLE = 'font-family:var(--tp-serif);font-weight:var(--tp-weight-regular);letter-spacing:var(--tp-tracking-display);line-height:var(--tp-leading-display);color:var(--tp-umber-900)'
const EYEBROW = 'font-family:var(--tp-sans);font-size:var(--tp-size-2xs);font-weight:var(--tp-weight-medium);letter-spacing:var(--tp-tracking-eyebrow);text-transform:uppercase;line-height:1.4'
const LABEL = 'font-family:var(--tp-sans);font-size:var(--tp-size-2xs);font-weight:var(--tp-weight-medium);letter-spacing:var(--tp-tracking-label);text-transform:uppercase'
const CARD = 'background:var(--tp-card);border:var(--tp-b-hair) solid var(--tp-line);border-radius:var(--tp-r-lg);box-shadow:var(--tp-d2)'
const FIELD = 'font-family:var(--tp-sans);font-size:var(--tp-size-base);font-weight:var(--tp-weight-light);color:var(--tp-umber-900);background-color:var(--tp-plaster-50);background-image:var(--tp-sand);background-size:200px;background-blend-mode:multiply;border:var(--tp-b-hair) solid var(--tp-line);border-radius:var(--tp-r-sm);padding:15px 17px;box-shadow:var(--tp-inset);transition:var(--tp-transition)'
const EASE = 'var(--tp-dur-base) var(--tp-ease)'
const GRIT = 'content:"";position:absolute;inset:0;background-image:var(--tp-grit);background-size:300px;opacity:var(--tp-o-grit);mix-blend-mode:overlay;pointer-events:none'
const MOTIF = 'content:"";position:absolute;background-repeat:no-repeat;background-size:contain;pointer-events:none;mix-blend-mode:screen;filter:brightness(0) invert(1);opacity:var(--tp-o-motif)'

export const TEMPLE_CSS = `${TEMPLE_TOKENS_CSS}
${M}{--hs-serif:var(--tp-serif);--hs-sans:var(--tp-sans);position:relative;isolation:isolate;font-family:var(--tp-sans);font-size:var(--tp-size-base);font-weight:var(--tp-weight-light);line-height:var(--tp-leading-body);color:var(--tp-umber-800);background-color:var(--tp-plaster-100);background-image:var(--tp-page-glow);background-repeat:no-repeat;text-wrap:pretty}
${M}::before{content:"";position:absolute;inset:0;z-index:-1;background-image:var(--tp-sand);background-size:200px;opacity:var(--tp-o-sand);mix-blend-mode:multiply;pointer-events:none}
html:has(${N}),body:has(${N}){background:var(--tp-plaster-100)}
${N} ::selection{background:var(--tp-saffron-200);color:var(--tp-umber-900)}
${N} :focus-visible{outline:none;box-shadow:var(--tp-ring)}
${N} a:focus-visible,${N} button:focus-visible,${N} summary:focus-visible{outline:none;box-shadow:var(--tp-ring)}
${N} strong,${N} b{font-weight:var(--tp-weight-medium)}
${N} hr{border:0;border-top:var(--tp-b-hair) solid var(--tp-line)}

${N} .hs-serif,${N} .hs-h2,${N} .hs-brand{${TITLE}}
${N} .hs-h1{${DISPLAY};font-size:var(--tp-size-6xl);line-height:.98;text-shadow:none;text-wrap:balance}
${N} .hs-h2{font-size:var(--tp-size-2xl);line-height:var(--tp-leading-display)}
${N} .hs-accent,${N} .hs-h1 em,${N} .hs-h2 em{font-family:var(--tp-quote);font-style:italic;font-weight:var(--tp-weight-light);color:var(--tp-clay-600)}
${N} .hs-eyebrow{${EYEBROW};display:inline-flex;gap:10px;color:var(--tp-clay-600)}
${N} .hs-lead{font-size:var(--tp-size-md);line-height:var(--tp-leading-body);color:var(--tp-umber-600);max-width:var(--tp-measure-body)}
${N} .hs-muted{color:var(--tp-umber-600)}
${N} .hs-center{gap:var(--tp-s3);margin-bottom:var(--tp-s10)}
${N} .hs-section,${N} .hs-wide{padding-bottom:var(--tp-section-y)}
${N} .hs-section-first{padding-top:var(--tp-section-y)}
${N} .hs-dot{background:var(--tp-clay-500)}

${N} .hs-btn{position:relative;overflow:hidden;gap:10px;min-height:44px;border:var(--tp-b-hair) solid transparent;border-radius:var(--tp-r-md);font-family:var(--tp-sans);font-weight:var(--tp-weight-medium);font-size:var(--tp-size-sm);letter-spacing:.02em;line-height:1;transition:var(--tp-transition)}
${N} .hs-btn-primary{padding:16px 30px;font-size:16px;background:var(--tp-clay-500);color:var(--tp-on-clay);box-shadow:var(--tp-btn-clay)}
${N} .hs-btn-primary:hover{background:var(--tp-clay-600);color:var(--tp-on-clay);box-shadow:var(--tp-btn-clay-hover);transform:translateY(-1px)}
${N} .hs-btn-primary:active{background:var(--tp-clay-700);transform:scale(var(--tp-press));box-shadow:var(--tp-inset-deep)}
${N} .hs-btn-primary::before,${N} .hs-btn-dark::before{${GRIT};mix-blend-mode:soft-light;opacity:.14}
${N} .hs-btn-glass,${N} .hs-btn-light{padding:16px 28px;font-size:16px;background:var(--tp-field);border-color:var(--tp-rule);color:var(--tp-umber-900);box-shadow:var(--tp-elev-xs);-webkit-backdrop-filter:none;backdrop-filter:none}
${N} .hs-btn-glass:hover,${N} .hs-btn-light:hover{background:var(--tp-card);border-color:var(--tp-umber-700);color:var(--tp-umber-900);box-shadow:var(--tp-d2);transform:translateY(-1px)}
${N} .hs-btn-soft{padding:14px 24px;background:var(--tp-plaster-200);color:var(--tp-umber-800);box-shadow:var(--tp-elev-xs)}
${N} .hs-btn-soft:hover{background:var(--tp-plaster-300);color:var(--tp-umber-800)}
${N} .hs-btn-dark{padding:11px 20px;background:var(--tp-umber-900);color:var(--tp-on-ink);box-shadow:var(--tp-btn-ink)}
${N} .hs-btn-dark:hover{background:var(--tp-umber-800);color:var(--tp-on-ink);transform:translateY(-1px)}
${N} .hs-btn:active{transform:scale(var(--tp-press))}
${N} .hs-btn svg{transition:transform ${EASE}}
${N} .hs-btn:hover svg{transform:translateX(3px)}
${N} a:not([class]){color:var(--tp-clay-600);border-bottom:var(--tp-b-hair) solid var(--tp-link-line)}
${N} a:not([class]):hover{color:var(--tp-clay-700);border-bottom-color:var(--tp-clay-600)}

/* The header: transparent at rest and glass once the page moves, the brand left, the links centred in small caps, the member area right. */
${N} .hs-header{position:sticky;top:0;z-index:40;padding:0;background-color:var(--tp-glass);background-image:var(--tp-sand);background-size:200px;background-blend-mode:multiply;-webkit-backdrop-filter:var(--tp-blur);backdrop-filter:var(--tp-blur);box-shadow:0 var(--tp-b-hair) 0 var(--tp-line),var(--tp-d2);transition:background-color ${EASE},box-shadow ${EASE}}
@supports (animation-timeline:scroll()){${N} .hs-header{background-color:transparent;box-shadow:none;-webkit-backdrop-filter:none;backdrop-filter:none;animation:tp-stick linear both;animation-timeline:scroll(root);animation-range:0 48px}}
@keyframes tp-stick{to{background-color:var(--tp-glass);-webkit-backdrop-filter:var(--tp-blur);backdrop-filter:var(--tp-blur);box-shadow:0 var(--tp-b-hair) 0 var(--tp-line),var(--tp-d2)}}
${N} .hs-header[data-hidden]{opacity:1;transform:none;pointer-events:auto}
${N} .hs-pill{max-width:none;margin:0;padding:var(--tp-s3) var(--tp-gutter);border-radius:0;background:transparent;box-shadow:none;animation:none;overflow:visible;-webkit-backdrop-filter:none;backdrop-filter:none;column-gap:var(--tp-s4)}
@media (min-width:940px){${N} .hs-pill{grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);border-radius:0}${N} .hs-header-actions{justify-self:end}${N} .hs-pill .hs-brand{justify-self:start}}
${N} .hs-brand{padding-left:0;font-family:var(--tp-display);font-size:var(--tp-size-lg);letter-spacing:var(--tp-tracking-display);color:var(--tp-umber-900)}
${N} .hs-brand-name{font-family:var(--tp-display)}
${N} .hs-logo-image{height:auto;width:74px;max-width:none;border-radius:0;object-fit:contain;filter:brightness(0) saturate(0) opacity(.86);transition:width ${EASE}}
${N} .hs-logo-avatar{box-shadow:var(--tp-d1)}
${N} .hs-nav{-webkit-mask-image:none;mask-image:none}
${N} .hs-nav-track{gap:clamp(16px,2.4vw,32px);padding:0;margin:0 auto;font-weight:var(--tp-weight-light)}
${N} .hs-nav a,${N} .hs-nav-mega{position:relative;padding:6px 0;border-radius:0;background:none;font-family:var(--tp-sans);font-size:var(--tp-size-xs);font-weight:var(--tp-weight-regular);letter-spacing:var(--tp-tracking-label);text-transform:uppercase;color:var(--tp-umber-700);transition:var(--tp-transition)}
${N} .hs-nav a:hover,${N} .hs-nav-mega:hover,${N} .hs-nav-mega[aria-expanded="true"]{background:none;color:var(--tp-clay-600)}
${N} .hs-nav a::after,${N} .hs-nav-mega::after{content:"";position:absolute;left:0;right:0;bottom:0;height:var(--tp-b-hair);background:var(--tp-clay-500);transform:scaleX(0);transform-origin:left;transition:transform ${EASE}}
${N} .hs-nav a[aria-current="page"]{color:var(--tp-umber-900)}
${N} .hs-nav a:hover::after,${N} .hs-nav a[aria-current="page"]::after,${N} .hs-nav-mega[aria-expanded="true"]::after{transform:scaleX(1)}
${N} .hs-header-actions{gap:var(--tp-s4)}
${N} .hs-header .hs-btn-dark,${N} .hs-header .hs-btn-primary{min-height:44px;padding:11px 20px;font-size:14px;border-radius:var(--tp-r-pill)}
${N} .hs-menu-button{background:var(--tp-card);color:var(--tp-umber-900);border:var(--tp-b-hair) solid var(--tp-line);box-shadow:var(--tp-d1)}
${N} .hs-menu-panel,${N} .hs-mega-panel{border-radius:var(--tp-r-lg);background:var(--tp-card);-webkit-backdrop-filter:none;backdrop-filter:none;box-shadow:var(--tp-d3);border:var(--tp-b-hair) solid var(--tp-line)}
${N} .hs-menu-panel a,${N} .hs-mega-links a{border-radius:var(--tp-r-md);font-family:var(--tp-sans);font-weight:var(--tp-weight-regular);color:var(--tp-umber-800)}
${N} .hs-mega-links a:hover{background:var(--tp-veil);color:var(--tp-umber-900)}
${N} .hs-mega-label,${N} .hs-mega-feature-title{font-family:var(--tp-serif)}
${N} .hs-mega-feature{border-radius:var(--tp-r-md)}
${N} .hs-nav .hs-nav-admin{display:flex;align-items:center;gap:var(--tp-s2);margin-left:var(--tp-s4);padding:var(--tp-s1) var(--tp-s1) var(--tp-s1) var(--tp-s3);border-radius:var(--tp-r-pill);background:var(--tp-umber-900)}
${N} .hs-nav-admin-tag{${LABEL};padding:0;color:var(--tp-plaster-300)}
${N} .hs-nav-admin a{color:var(--tp-on-ink);padding:var(--tp-s2) var(--tp-s3);text-transform:none;letter-spacing:.02em}
${N} .hs-nav-admin a::after{content:none}
${N} .hs-nav-admin-colon,${N} .hs-nav-admin-sep{display:none}
/* The member area: a pill with the tier's initial in a clay disc, the way the design's signed-in pill reads. */
${N} .hs-member{padding:var(--tp-s2) var(--tp-s4);border-radius:var(--tp-r-pill);background:var(--tp-clay-100);color:var(--tp-clay-700);font-family:var(--tp-sans);font-size:var(--tp-size-xs);font-weight:var(--tp-weight-medium);letter-spacing:.02em}
${N} .hs-member:hover{background:var(--tp-plaster-200);color:var(--tp-umber-900)}
${N} .hs-member-pill{display:inline-flex;align-items:center;gap:var(--tp-s3);padding:5px 12px 5px var(--tp-s4);background:var(--tp-card);border:var(--tp-b-hair) solid var(--tp-line);box-shadow:var(--tp-d1);color:var(--tp-umber-900)}
${N} .hs-member-pill:hover{background:var(--tp-card);box-shadow:var(--tp-d2)}
${N} .hs-member-text{display:flex;flex-direction:column;line-height:1.2;text-align:right}
${N} .hs-member-label{${LABEL};font-size:var(--tp-size-2xs);letter-spacing:var(--tp-tracking-label);color:var(--tp-muted)}
${N} .hs-member-line{font-size:var(--tp-size-xs);font-weight:var(--tp-weight-medium);color:var(--tp-clay-600)}
${N} .hs-member-avatar{display:flex;align-items:center;justify-content:center;flex:none;width:34px;height:34px;border-radius:var(--tp-r-circle);background:var(--tp-wash-clay);color:var(--tp-on-clay);font-family:var(--tp-serif);font-size:var(--tp-size-sm)}
@media (max-width:939px){${N} .hs-pill{padding:var(--tp-s2) var(--tp-gutter)}${N} .hs-logo-image{width:58px}${N} .hs-member-text{display:none}${N} .hs-nav-track{justify-content:center}}

/* The hero: the design's light split. The cover is the arch on the right, the "start here" card is the ticket across its foot. */
${N} .hs-hero{margin-top:0;min-height:0;display:block;overflow:hidden;background-image:var(--tp-wash-sun),var(--tp-wash-dawn);background-color:transparent;color:var(--tp-umber-800)}
${N} .hs-hero-photo{position:absolute;inset:auto;top:50%;right:var(--tp-gutter);width:min(44%,560px);height:auto;aspect-ratio:4 / 4.6;transform:translateY(-52%);border-radius:var(--tp-r-arch);box-shadow:var(--tp-d3)}
${N} .hs-hero-wash,${N} .hs-hero-side{display:none}
${N} .hs-hero-grid{max-width:var(--tp-container);padding:var(--tp-s16) var(--tp-gutter) var(--tp-s20);grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:var(--tp-s16);align-items:center;min-height:min(78svh,760px)}
${N} .hs-hero-actions .hs-btn svg{display:none}
${N} .hs-hero-copy{gap:var(--tp-s6);max-width:none}
${N} .hs-hero .hs-h1{font-size:var(--tp-size-6xl);color:var(--tp-umber-900)}
${N} .hs-hero-lede{max-width:32ch;font-size:var(--tp-size-md);color:var(--tp-umber-600)}
${N} .hs-hero-pill{background:var(--tp-card);color:var(--tp-umber-800);border:var(--tp-b-hair) solid var(--tp-line);box-shadow:var(--tp-d1);-webkit-backdrop-filter:none;backdrop-filter:none;font-family:var(--tp-sans);font-size:var(--tp-size-xs);letter-spacing:var(--tp-tracking-label);text-transform:uppercase}
${N} .hs-hero-pill:hover{background:var(--tp-card);color:var(--tp-clay-600)}
${N} .hs-hero-form{min-height:0}
${N} .hs-hero-form .hs-hero-pill{font-size:var(--tp-size-2xs)}
${N} .hs-hero-card{filter:none;box-shadow:var(--tp-d3);border-radius:var(--tp-r-lg)}
${N} .hs-start{grid-column:2;align-self:end;justify-self:start;max-width:340px;padding:var(--tp-s4) var(--tp-s6) var(--tp-s4) var(--tp-s4);border-radius:var(--tp-r-lg);background:var(--tp-card);border:var(--tp-b-hair) solid var(--tp-line);box-shadow:var(--tp-d3);-webkit-backdrop-filter:none;backdrop-filter:none;gap:var(--tp-s3);transition:transform ${EASE}}
${N} .hs-start:hover{transform:translateY(-3px)}
${N} .hs-start-who img{border-radius:var(--tp-r-arch);width:52px;height:60px}
${N} .hs-start-row{border-radius:var(--tp-r-md);background:var(--tp-umber-900);color:var(--tp-on-ink);font-weight:var(--tp-weight-medium)}
${N} .hs-start-row:hover{background:var(--tp-umber-800);color:var(--tp-on-ink)}
@media (max-width:959px){
${N} .hs-hero{display:flex;flex-direction:column}
${N} .hs-hero-grid{order:1;grid-template-columns:minmax(0,1fr);min-height:0;gap:var(--tp-s8);padding-bottom:var(--tp-s8)}
${N} .hs-hero-photo{order:2;position:relative;top:auto;right:auto;transform:none;width:min(88%,440px);margin:0 auto var(--tp-s12)}
${N} .hs-start{grid-column:1}
}

${N} .hs-sign{background:var(--tp-card);border:var(--tp-b-hair) solid var(--tp-line);border-radius:var(--tp-r-lg);box-shadow:var(--tp-d1);font-size:var(--tp-size-md)}
${N} .hs-sign::before{background:var(--tp-clay-500)}
${N} .hs-pull,${N} .hs-quote{font-family:var(--tp-quote);font-style:italic;font-weight:var(--tp-weight-light);font-size:var(--tp-size-xl);line-height:var(--tp-leading-snug);color:var(--tp-umber-800)}
${N} .hs-pull{color:var(--tp-clay-600)}

/* The sunk band: the design's plaster-200 band with its inset top and bottom shade, and a stucco wash. */
${N} .hs-panel{position:relative;border-radius:0;background:var(--tp-plaster-200);box-shadow:var(--tp-sunk-edge)}
${N} .hs-panel::before{content:"";position:absolute;inset:0;background-image:var(--tp-stucco);background-size:cover;opacity:var(--tp-o-stucco);mix-blend-mode:multiply;pointer-events:none;border-radius:inherit}
${N} .hs-panel>*{position:relative}
/* Steps: the design's pillar, an arch-topped tile with the numeral in Branch. */
${N} .hs-steps{gap:var(--tp-s8) var(--tp-s10)}
${N} .hs-step-n{display:flex;align-items:flex-end;justify-content:center;width:52px;height:60px;padding-bottom:var(--tp-s3);margin-bottom:var(--tp-s2);border:var(--tp-b-hair) solid var(--tp-line);border-radius:var(--tp-r-arch);background:var(--tp-plaster-50);box-shadow:var(--tp-d1);font-family:var(--tp-display);font-style:normal;font-size:var(--tp-size-lg);line-height:1;color:var(--tp-clay-600);transition:box-shadow ${EASE},transform ${EASE}}
${N} .hs-step:hover .hs-step-n{box-shadow:var(--tp-d2);transform:translateY(-2px)}
${N} .hs-step h3{margin:var(--tp-s2) 0 0;font-family:var(--tp-serif);font-weight:var(--tp-weight-regular);font-size:var(--tp-size-lg);letter-spacing:var(--tp-tracking-display)}
${N} .hs-step p{color:var(--tp-umber-600);font-size:var(--tp-size-sm)}

/* Photos are arches with the inner frame; the tall crop is the steeper dome. */
${N} .hs-photo{position:relative;aspect-ratio:4 / 4.6;border-radius:var(--tp-r-arch);box-shadow:var(--tp-d3)}
${N} .hs-photo::after{content:"";position:absolute;inset:8px;border:var(--tp-b-line) solid var(--tp-frame-on-photo);border-radius:inherit;pointer-events:none}
${N} .hs-photo img{transition:transform var(--tp-dur-slow) var(--tp-ease)}
${N} .hs-photo:hover img{transform:scale(1.02)}
${N} .hs-photo-col{gap:var(--tp-s6)}
${N} .hs-photo-col .hs-pull{padding:0 var(--tp-s2);font-size:var(--tp-size-xl)}
${N} .hs-photo-tall{aspect-ratio:2 / 3;border-radius:var(--tp-r-arch-tall)}
${N} .hs-facts{gap:var(--tp-s6);padding-top:var(--tp-s5);border-top:var(--tp-b-hair) solid var(--tp-rule)}
${N} .hs-fact-v,${N} .hs-stat-v{font-family:var(--tp-display);font-weight:var(--tp-weight-regular);font-size:var(--tp-size-2xl);line-height:1;letter-spacing:var(--tp-tracking-display);color:var(--tp-umber-900)}
${N} .hs-fact-l,${N} .hs-stat-l{${LABEL};font-size:var(--tp-size-2xs);line-height:1.5;color:var(--tp-muted)}
${N} .hs-stat{border-top:var(--tp-b-hair) solid var(--tp-rule)}
${N} .hs-stat-v{font-size:var(--tp-size-3xl);color:var(--tp-clay-600)}

/* Cards (the offerings, the sessions): the design's card with its hairline, warm lift and sand grain. */
${N} .hs-cards{gap:var(--tp-s8)}
${N} .hs-card{position:relative;overflow:hidden;padding:var(--tp-s8);gap:var(--tp-s3);${CARD};transition:transform ${EASE},box-shadow ${EASE}}
${N} .hs-card::after{content:"";position:absolute;inset:0;background-image:var(--tp-sand);background-size:200px;opacity:.05;mix-blend-mode:multiply;pointer-events:none;border-radius:inherit}
${N} .hs-card:hover{transform:translateY(var(--tp-lift));box-shadow:var(--tp-d3)}
${N} .hs-card h3{font-family:var(--tp-serif);font-size:var(--tp-size-xl);letter-spacing:var(--tp-tracking-display);line-height:var(--tp-leading-display)}
${N} .hs-card p{font-size:var(--tp-size-sm);color:var(--tp-umber-600)}
/* A rung (the membership tier): the design's arch-soft card, the lead rung lifted. */
${N} .hs-tier{position:relative;padding:var(--tp-s6) var(--tp-s8);border-radius:var(--tp-r-lg);background:var(--tp-card);border:var(--tp-b-hair) solid var(--tp-line);box-shadow:var(--tp-d2);color:var(--tp-umber-800);transition:transform ${EASE},box-shadow ${EASE}}
${N} .hs-tier:hover{transform:translateY(var(--tp-lift));box-shadow:var(--tp-d3);color:var(--tp-umber-900)}
${N} .hs-tier .hs-serif{font-size:var(--tp-size-lg)}
${N} .hs-chip{padding:5px 10px 4px;border-radius:var(--tp-r-xs);background:var(--tp-clay-100);color:var(--tp-clay-700);${LABEL}}

/* The night band: the community section as the design's membership band, rungs as arch-soft cards on the night wash. */
${N} .hs-section[data-hs="community"]{max-width:none;padding-top:var(--tp-section-y);background:var(--tp-wash-night);color:var(--tp-on-ink);padding-inline:max(var(--tp-gutter),calc((100% - 1160px) / 2 + var(--tp-s6)));position:relative;isolation:isolate;overflow:hidden}
${N} .hs-section[data-hs="community"]::before{content:"";position:absolute;inset:0;background-image:var(--tp-grit);background-size:220px;opacity:calc(var(--tp-o-grit) * .85);mix-blend-mode:soft-light;pointer-events:none;z-index:-1}
${N} .hs-section[data-hs="community"] .hs-split{grid-template-columns:minmax(0,1fr);gap:var(--tp-s12)}
${N} .hs-section[data-hs="community"] :is(h2,.hs-serif,.hs-lead){color:var(--tp-plaster-50)}
${N} .hs-section[data-hs="community"] .hs-lead{color:var(--tp-plaster-200)}
${N} .hs-section[data-hs="community"] .hs-eyebrow{color:var(--tp-saffron-400)!important}
${N} .hs-section[data-hs="community"] .hs-btn{background:transparent;color:var(--tp-plaster-50);border-color:var(--tp-line-on-ink)}
${N} .hs-section[data-hs="community"] .hs-split>:last-child{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--tp-s6);align-items:stretch}
${N} .hs-section[data-hs="community"] .hs-split>:last-child>:not(a){grid-column:1 / -1}
${N} .hs-section[data-hs="community"] .hs-split>:last-child>p{font-family:var(--tp-quote);font-weight:var(--tp-weight-light);color:var(--tp-plaster-200)}
${N} .hs-section[data-hs="community"] .hs-split>:last-child>span{color:var(--tp-plaster-300)!important}
${N} .hs-section[data-hs="community"] .hs-tier{flex-direction:column;align-items:flex-start;padding:var(--tp-s8);border-radius:var(--tp-r-arch-soft);background:var(--tp-veil-ink);border-color:var(--tp-line-on-ink);box-shadow:none;color:var(--tp-plaster-200)}
${N} .hs-section[data-hs="community"] .hs-tier>svg{display:none}
${N} .hs-section[data-hs="community"] .hs-tier>span{width:100%}
${N} .hs-section[data-hs="community"] .hs-tier>span>span:first-child{flex-direction:column;align-items:flex-start!important;gap:var(--tp-s3)!important}
${N} .hs-section[data-hs="community"] .hs-tier .hs-muted{color:var(--tp-plaster-300)}
${N} .hs-section[data-hs="community"] .hs-tier .hs-serif{color:var(--tp-plaster-50);font-size:var(--tp-size-xl)}
${N} .hs-section[data-hs="community"] .hs-tier .hs-chip{order:2;padding:0;background:transparent;color:var(--tp-plaster-50);font-family:var(--tp-display);font-size:var(--tp-size-3xl);letter-spacing:var(--tp-tracking-display);text-transform:none;line-height:1}
${N} .hs-section[data-hs="community"] .hs-tier:nth-of-type(2){background:var(--tp-plaster-50);border-color:var(--tp-line);box-shadow:var(--tp-d3);color:var(--tp-umber-800)}
${N} .hs-section[data-hs="community"] .hs-tier:nth-of-type(2) .hs-serif,${N} .hs-section[data-hs="community"] .hs-tier:nth-of-type(2) .hs-chip{color:var(--tp-umber-900)}
${N} .hs-section[data-hs="community"] .hs-tier:nth-of-type(2) .hs-muted{color:var(--tp-umber-600)}
@media (max-width:960px){${N} .hs-section[data-hs="community"] .hs-split>:last-child{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}}
@media (max-width:600px){${N} .hs-section[data-hs="community"] .hs-split>:last-child{grid-template-columns:minmax(0,1fr)}}

/* Questions: the design's hairline accordion, Marcellus questions and a clay plus. */
${N} .hs-faq{border-radius:0;background:transparent;border-bottom:var(--tp-b-hair) solid var(--tp-line);box-shadow:none}
${N} .hs-faq[open]{background:transparent;box-shadow:none}
${N} .hs-faq summary{padding:var(--tp-s6) 0;font-family:var(--tp-serif);font-size:var(--tp-size-lg);font-weight:var(--tp-weight-regular);letter-spacing:var(--tp-tracking-display);color:var(--tp-umber-900)}
${N} .hs-faq summary::after{width:auto;height:auto;background:none;border-radius:0;color:var(--tp-clay-500);font-family:var(--tp-sans);font-size:var(--tp-size-xl);font-weight:var(--tp-weight-light)}
${N} .hs-faq-a{padding:0 var(--tp-s16) var(--tp-s6) 0;font-size:var(--tp-size-base);color:var(--tp-umber-600)}

/* The closing band is the design's night band: aegean into umber, grit, one palm watermark. */
${N} .hs-band{border-radius:0;background:var(--tp-wash-night);color:var(--tp-on-ink)}
${N} .hs-band::before{${GRIT};mix-blend-mode:soft-light;z-index:0}
${N} .hs-band::after{${MOTIF};top:-8%;right:-6%;width:42%;height:116%;background-image:var(--tp-palm-fan);background-position:top right}
${N} .hs-band-photo{opacity:.18;mix-blend-mode:luminosity}
${N} .hs-band-wash{background:var(--tp-veil-full);opacity:.5}
${N} .hs-band-grid{z-index:1}
${N} .hs-band h2{${DISPLAY};color:var(--tp-on-ink);font-size:var(--tp-size-4xl);line-height:var(--tp-leading-tight)}
${N} .hs-band-body{font-size:var(--tp-size-md);color:var(--tp-plaster-300)}
${N} .hs-band .hs-eyebrow{color:var(--tp-saffron-400)}
${N} .hs-band .hs-btn-primary{background:var(--tp-clay-500)}
${N} .hs-contact{border-radius:var(--tp-r-lg);background:color-mix(in srgb,var(--tp-plaster-100) 7%,transparent);border:var(--tp-b-hair) solid var(--tp-line-on-ink);-webkit-backdrop-filter:none;backdrop-filter:none}
${N} .hs-contact a,${N} .hs-contact span{font-size:var(--tp-size-sm);color:var(--tp-on-ink)}
${N} .hs-contact .hs-contact-muted{color:var(--tp-plaster-300)}
${N} .hs-contact .hs-socials a{border-radius:var(--tp-r-pill);background:color-mix(in srgb,var(--tp-plaster-100) 10%,transparent);font-weight:var(--tp-weight-regular)}

/* Fields: the design's input, plaster with sand, a hairline, the inset shade and the gilded ring on focus. */
${N} input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="submit"]):not([type="button"]),${N} textarea,${N} select{${FIELD}}
${N} input::placeholder,${N} textarea::placeholder{color:var(--tp-umber-400)}
${N} input:not([type="checkbox"]):not([type="radio"]):hover,${N} textarea:hover,${N} select:hover{border-color:var(--tp-rule)}
${N} input:not([type="checkbox"]):not([type="radio"]):focus,${N} textarea:focus,${N} select:focus{outline:none;border-color:var(--tp-clay-400);box-shadow:var(--tp-ring)}
${N} label{font-family:var(--tp-sans)}
${N} input[type="checkbox"],${N} input[type="radio"]{accent-color:var(--tp-clay-500)}

/* The footer: ink with a rays watermark, the brand and its seal, columns headed in saffron small caps. */
${N} .tp-footer-ground{position:relative;isolation:isolate;overflow:hidden;margin-top:var(--tp-s16);background:var(--tp-umber-900);color:var(--tp-plaster-300)}
${N} .tp-footer-ground::before{${MOTIF};inset:auto auto 0 50%;transform:translateX(-50%);width:56%;height:46%;background-image:var(--tp-rays);background-position:bottom center;z-index:-1}
${N} .tp-footer-ground::after{${GRIT};mix-blend-mode:soft-light;z-index:-1}
${N} .hs-footer-top{max-width:var(--tp-container);margin:0 auto;padding:var(--tp-s16) var(--tp-gutter) var(--tp-s10);border-top:0;gap:var(--tp-s10);grid-template-columns:minmax(0,1.4fr) repeat(auto-fit,minmax(min(100%,160px),1fr))}
${N} .hs-footer-brand{gap:var(--tp-s4)}
${N} .hs-footer-brand .hs-brand{font-family:var(--tp-display);font-size:var(--tp-size-xl);color:var(--tp-on-ink)}
${N} .hs-footer-brand p{font-size:var(--tp-size-sm);color:var(--tp-plaster-300);max-width:30ch}
${N} .tp-footer-seal{width:128px;height:auto;max-width:none;filter:brightness(0) invert(1) sepia(.28) saturate(1.1) hue-rotate(-8deg)}
${N} .hs-footer-col{display:flex;flex-direction:column;align-items:flex-start;gap:var(--tp-s2)}
${N} .hs-footer-col-title{margin:0 0 var(--tp-s3);${EYEBROW};font-size:var(--tp-size-2xs);color:var(--tp-saffron-400)}
${N} .hs-footer-col a,${N} .hs-footer-links a{font-family:var(--tp-sans);font-size:var(--tp-size-sm);font-weight:var(--tp-weight-light);color:var(--tp-plaster-300);transition:var(--tp-transition)}
${N} .hs-footer-col a:hover,${N} .hs-footer-links a:hover{color:var(--tp-saffron-400)}
${N} .hs-footer-links{gap:var(--tp-s3) var(--tp-s8)}
${N} .hs-footer{max-width:var(--tp-container);padding:var(--tp-s6) var(--tp-gutter) var(--tp-s10);border-top:var(--tp-b-hair) solid var(--tp-line-on-ink);font-size:var(--tp-size-xs);letter-spacing:.02em;color:var(--tp-plaster-300)}
${N} .hs-footer a{color:var(--tp-plaster-300);font-weight:var(--tp-weight-regular)}
${N} .hs-footer a:hover{color:var(--tp-saffron-400)}
${N} .hs-footer-line,${N} .hs-footer-note{color:var(--tp-umber-400)}
${N} .hs-footer a.hs-partner{border-color:var(--tp-line-on-ink);background:transparent;color:var(--tp-plaster-300)}
${N} .hs-footer a.hs-partner b{color:var(--tp-on-ink)}
${N} .hs-footer a.hs-partner svg{color:var(--tp-saffron-400)}
${N} .hs-footer a.hs-partner:hover{border-color:var(--tp-saffron-400);color:var(--tp-on-ink)}
${N} .hs-admin{max-width:var(--tp-container);padding:0 var(--tp-gutter);margin-bottom:var(--tp-s4)}
${N} .hs-admin-in{border-radius:var(--tp-r-md);background:color-mix(in srgb,var(--tp-plaster-100) 8%,transparent)}
${N} .hs-admin-tag,${N} .hs-admin-nav a{color:var(--tp-saffron-400)}
@media (max-width:959px){${N} .hs-footer-top{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}${N} .hs-footer-brand{grid-column:1 / -1}}
@media (max-width:600px){${N} .hs-footer-top{grid-template-columns:minmax(0,1fr)}}

/* The page sections (FREQUENCY_PAGE_CSS), dressed in the same shapes and faces. */
${M} .mw-display{${TITLE}}
${M} .mw-xl{${DISPLAY};font-size:var(--tp-size-6xl);line-height:.98}
${M} .mw-l{font-size:var(--tp-size-4xl);line-height:var(--tp-leading-tight)}
${M} .mw-m{font-size:var(--tp-size-2xl);line-height:var(--tp-leading-display)}
${M} .mw-s{font-size:var(--tp-size-xl);line-height:var(--tp-leading-display)}
${M} .mw-xs{font-size:var(--tp-size-lg)}
${M} .mw-accent{font-family:var(--tp-quote);font-style:italic;font-weight:var(--tp-weight-light);color:var(--tp-clay-600)}
${M} .mw-kicker{${EYEBROW};color:var(--tp-clay-600)}
${M} .mw-kicker::before{content:none}
${M} .mw-lead{font-size:var(--tp-size-md);color:var(--tp-umber-600)}
${M} .mw-body,${M} .mw-small{color:var(--tp-umber-600)}
${M} .mw-label{${LABEL};color:var(--tp-muted)}
${M} .mw-sec{padding-top:var(--tp-section-y)}
${M} .mw-photo{border-radius:var(--tp-r-arch);box-shadow:var(--tp-d3)}
${M} .mw-photo::after{content:"";position:absolute;inset:8px;border:var(--tp-b-line) solid var(--tp-frame-on-photo);border-radius:inherit;pointer-events:none}
${M} .mw-chamfer{border-radius:var(--tp-r-arch-soft)}
${M} .mw-frame,${M} .mw-grid>*,${M} .mw-circle-tile{${CARD}}
${M} .mw-grid>*,${M} .mw-circle-tile{padding:var(--tp-s8)}
${M} .mw-head-card{border-radius:var(--tp-r-lg);background:var(--tp-plaster-200);box-shadow:var(--tp-sunk-edge);border:0}
${M} .mw-note,${M} .mw-strip{border-radius:var(--tp-r-lg);background:var(--tp-card);border:var(--tp-b-hair) solid var(--tp-line);box-shadow:var(--tp-d1)}
${M} .mw-beat,${M} .mw-date-row,${M} .mw-weeks li,${M} .mw-modules li,${M} .mw-circle-row{border-radius:var(--tp-r-lg);background:var(--tp-card);border:var(--tp-b-hair) solid var(--tp-line);box-shadow:var(--tp-d1);transition:background-color ${EASE},box-shadow ${EASE}}
${M} .mw-date-row:hover,${M} .mw-circle-row:hover,${M} .mw-beat:hover{background:var(--tp-card);box-shadow:var(--tp-d2)}
${M} .mw-badge,${M} .mw-tag-chev,${M} .mw-week-tag{border-radius:var(--tp-r-xs);background:var(--tp-clay-100);color:var(--tp-clay-700);${LABEL}}
${M} .mw-tag{border-radius:var(--tp-r-pill);border:var(--tp-b-hair) solid var(--tp-line);background:var(--tp-plaster-50);font-family:var(--tp-sans);font-size:var(--tp-size-sm);font-weight:var(--tp-weight-light);color:var(--tp-umber-800);transition:var(--tp-transition)}
${M} .mw-tag:hover{background:var(--tp-veil);border-color:var(--tp-rule)}
${M} .mw-date-mark,${M} .mw-strip-chev,${M} .mw-wheel-chev{background:var(--tp-clay-500)}
${M} .mw-progress-bar span{background:var(--tp-plaster-300)}
${M} .mw-closing{border-radius:0;background:var(--tp-wash-night);color:var(--tp-on-ink)}
${M} .mw-fact-v{font-family:var(--tp-display);font-weight:var(--tp-weight-regular)}
${M} .mw-quote{font-family:var(--tp-quote);font-style:italic;font-weight:var(--tp-weight-light)}

/* THE DESIGN'S TEXTURE, PATTERN, MOTIF AND SHAPE UTILITIES (tokens/textures.css) as tp-* classes, each at its approved opacity. */
${N} :is(.tp-sand,.tp-grit,.tp-grain,.tp-stucco,.tp-contour,.tp-linen,.tp-terrazzo,.tp-lattice,.tp-archrow,.tp-star,.tp-scallop,.tp-wave){position:relative;isolation:isolate}
${N} :is(.tp-sand,.tp-grit,.tp-grain,.tp-stucco,.tp-contour,.tp-linen,.tp-terrazzo,.tp-lattice,.tp-archrow,.tp-star,.tp-scallop,.tp-wave)::before{content:"";position:absolute;inset:0;pointer-events:none;z-index:-1}
${N} .tp-grain::before{background-image:var(--tp-tex-plaster);background-size:240px;opacity:var(--tp-o-grain);mix-blend-mode:multiply}
${N} .tp-sand::before{background-image:var(--tp-sand);background-size:200px;opacity:var(--tp-o-sand);mix-blend-mode:multiply}
${N} .tp-grit::before{background-image:var(--tp-grit);background-size:300px;opacity:var(--tp-o-grit);mix-blend-mode:overlay}
${N} .tp-grit--ink::before{mix-blend-mode:soft-light;opacity:calc(var(--tp-o-grit) * .85);background-size:220px}
${N} .tp-stucco::before{background-image:var(--tp-stucco);background-size:cover;opacity:var(--tp-o-stucco);mix-blend-mode:multiply}
${N} .tp-contour::before{background-image:var(--tp-tex-contour);background-size:320px;opacity:var(--tp-o-line)}
${N} .tp-linen::before{background-image:var(--tp-tex-linen);background-size:24px;opacity:var(--tp-o-tile)}
${N} .tp-terrazzo::before{background-image:var(--tp-tex-terrazzo);background-size:180px;opacity:.5}
${N} .tp-lattice::before{background-image:var(--tp-pat-arch);background-size:120px 160px;opacity:var(--tp-o-line)}
${N} .tp-archrow::before{background-image:var(--tp-pat-arch-row);background-size:72px 96px;opacity:var(--tp-o-tile)}
${N} .tp-star::before{background-image:var(--tp-pat-star);background-size:80px;opacity:var(--tp-o-tile)}
${N} .tp-scallop::before{background-image:var(--tp-pat-scallop);background-size:96px 48px;background-repeat:repeat-x;background-position:top center;opacity:var(--tp-o-line)}
${N} .tp-wave::before{background-image:var(--tp-pat-wave);background-size:120px 36px;opacity:var(--tp-o-line)}
${N} .tp-edge-top::before{inset:0 0 auto 0;height:var(--tp-s24)}
${N} .tp-edge-bottom::before{inset:auto 0 0 0;height:var(--tp-s24)}
${N} .tp-motif{position:relative;overflow:hidden;isolation:isolate}
${N} .tp-motif::after{content:"";position:absolute;top:-8%;right:-6%;width:42%;height:116%;background-image:var(--tp-motif-palm);background-repeat:no-repeat;background-position:top right;background-size:contain;opacity:var(--tp-o-motif);mix-blend-mode:multiply;pointer-events:none;z-index:-1}
${N} .tp-motif--left::after{right:auto;left:-6%;background-position:top left;transform:scaleX(-1)}
${N} .tp-motif--fan::after{background-image:var(--tp-palm-fan);width:48%;top:auto;bottom:-24%;height:120%;background-position:bottom right}
${N} .tp-motif--olive::after{background-image:var(--tp-motif-olive)}
${N} .tp-motif--fig::after{background-image:var(--tp-motif-fig);width:34%}
${N} .tp-motif--agave::after{background-image:var(--tp-motif-agave);width:46%;top:auto;bottom:-16%;height:78%;background-position:bottom right}
${N} .tp-motif--laurel::after{background-image:var(--tp-motif-laurel);width:58%;right:50%;transform:translateX(50%);top:-10%;height:60%;background-position:top center}
${N} .tp-motif--rays::after{top:auto;bottom:-26%;right:50%;transform:translateX(50%);width:56%;height:46%;background-position:bottom center;background-image:var(--tp-rays)}
${N} .tp-motif--sun::after{top:-14%;right:50%;transform:translateX(50%);width:76%;height:62%;background-position:top center;background-image:var(--tp-motif-sun-arc)}
${N} .tp-motif--on-ink::after{mix-blend-mode:screen;filter:brightness(0) invert(1)}
${N} .tp-motif--bold::after{width:60%;top:-16%;height:132%;opacity:calc(var(--tp-o-motif) * 1.25)}
${N} .tp-blob{position:relative;overflow:hidden;isolation:isolate}
${N} .tp-blob::before{content:"";position:absolute;top:-22%;left:-12%;width:58%;height:140%;background-image:var(--tp-blob);background-repeat:no-repeat;background-size:contain;pointer-events:none;z-index:-1}
${N} .tp-blob--leaf::before{background-image:var(--tp-blob-leaf);left:auto;right:-14%}
${N} .tp-blob--pebble::before{background-image:var(--tp-blob-pebble);top:auto;bottom:-28%;left:-16%;width:64%;height:120%;background-position:bottom left}
${N} .tp-blob--arch::before{background-image:var(--tp-blob-arch);left:auto;right:-8%;top:-10%;width:40%;height:130%;background-position:top right}
/* The ten line icons draw in the text colour: the SVG is a mask over currentColor. */
${N} .tp-icon{display:inline-block;width:var(--tp-s6);height:var(--tp-s6);background:currentColor;-webkit-mask:var(--tp-icon) center/contain no-repeat;mask:var(--tp-icon) center/contain no-repeat;flex:none}
${N} .tp-icon--arch-door{--tp-icon:var(--tp-icon-arch-door)}
${N} .tp-icon--candle{--tp-icon:var(--tp-icon-candle)}
${N} .tp-icon--incense{--tp-icon:var(--tp-icon-incense)}
${N} .tp-icon--long-table{--tp-icon:var(--tp-icon-long-table)}
${N} .tp-icon--moon-phase{--tp-icon:var(--tp-icon-moon-phase)}
${N} .tp-icon--olive-branch{--tp-icon:var(--tp-icon-olive-branch)}
${N} .tp-icon--palm{--tp-icon:var(--tp-icon-palm)}
${N} .tp-icon--stone-stack{--tp-icon:var(--tp-icon-stone-stack)}
${N} .tp-icon--sun-crescent{--tp-icon:var(--tp-icon-sun-crescent)}
${N} .tp-icon--water-ripple{--tp-icon:var(--tp-icon-water-ripple)}

@media (prefers-reduced-motion:reduce){${N} .hs-btn,${N} .hs-btn svg,${N} .hs-card,${N} .hs-tier,${N} .hs-start,${N} .hs-step-n,${N} .hs-photo img,${N} .hs-logo-image{transition:none}${N} .hs-btn:hover,${N} .hs-btn:active,${N} .hs-btn:hover svg,${N} .hs-card:hover,${N} .hs-tier:hover,${N} .hs-start:hover{transform:none}${N} .hs-header{animation:none}}
`
