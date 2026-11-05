import { CYBERWITCH_BLOCKS_CSS } from '@/components/sites/cyberwitch-blocks-css'
import { CYBERWITCH_ACCENT_CSS, CYBERWITCH_DIALS_CSS, CYBERWITCH_TOKENS_CSS } from '@/lib/theme/cyberwitch'

// THE CYBERWITCH SKIN (design: CyberWitch design system, tokens/base.css + effects.css, ui_kits/site Chrome.jsx + Sections.jsx). Scoped
// under [data-house-theme="cyberwitch"], so every house section keeps its markup and content; values come only from the token block
// (lib/theme/cyberwitch.ts), never raw. It layers after the house sheets (components/sites/site-chrome.tsx): the site's own colour names
// (--color-*) re-pointed at iron and bone, the three faces, then the page chrome. Riveted steel plates (.ng-plate) carry UI, wheatpaste
// posters carry anything sold or said, duct tape labels the sections. The owner's accent (--color-primary*) comes from
// cyberwitchAccentVars and is never set here; the neon (glow, spray, rules) follows it. Dark only: there is no Day register.
// Theme fence: this sheet only reaches the stand-alone render (ADR-1906).

const C = '[data-house-theme="cyberwitch"]'
const LABEL = 'font-family:var(--cw-font-caps);font-weight:600;font-size:12px;letter-spacing:var(--cw-ls-label);text-transform:uppercase'
const EASE = 'var(--cw-ease-out)'

export const CYBERWITCH_CSS = `${CYBERWITCH_TOKENS_CSS}${CYBERWITCH_DIALS_CSS}${CYBERWITCH_ACCENT_CSS}
${CYBERWITCH_BLOCKS_CSS}
/* The owner's accent drives the neon: the ramps the glows and rules read follow --color-primary, and the spray colour that fights it
 * is its complement where the browser can compute one (the Hex lime stays as the fallback). */
/* token-ok: CyberWitch skin literal (fallback accent, scrim, white-hot glow) */
${C}{--cw-flare-500:var(--color-primary,#FF00FF);--cw-flare-400:var(--color-primary-strong,#FF4DE6);--cw-flare-300:var(--color-primary-hover,#FF8CF0)}
/* token-ok: CyberWitch skin literal (fallback accent, scrim, white-hot glow) */
@supports (color:oklch(from red l c h)){${C}{--cw-clash-500:oklch(from var(--color-primary,#FF00FF) 0.92 0.24 calc(h + 150));--cw-clash-300:oklch(from var(--color-primary,#FF00FF) 0.9 0.14 calc(h + 150))}}
${C}{color-scheme:dark;--color-canvas:var(--cw-ink-900);--color-surface:var(--cw-ink-850);--color-surface-post:var(--cw-ink-850);--color-surface-elevated:var(--cw-ink-800);--color-surface-hover:var(--cw-ink-700);--color-border:var(--cw-border-default);--color-border-strong:var(--cw-border-strong);--color-text:var(--cw-text-primary);--color-text-muted:var(--cw-text-secondary);--color-text-subtle:var(--cw-text-muted);--color-focus-ring:var(--cw-flare-300);--color-success:var(--cw-success);--color-warning:var(--cw-warning);--color-danger:var(--cw-danger);--color-info:var(--cw-flare-300);--color-ink:var(--cw-ink-950);--color-on-ink:var(--cw-chrome-50);--color-on-ink-muted:var(--cw-chrome-200);--radius-control:var(--cw-corner-sm);--radius-card:var(--cw-corner);--radius-cover:var(--cw-corner-lg);--radius-media:var(--cw-corner);--font-display:var(--cw-font-gothic);--font-body:var(--cw-font-body);--font-label:var(--cw-font-caps)}
${C}{position:relative;font-family:var(--cw-font-body);font-size:var(--cw-fs-body);line-height:var(--cw-lh-body);font-synthesis-weight:none;background:var(--cw-tex-grime) 0 0/900px 900px fixed,var(--cw-surface-page);color:var(--color-text)}
/* The page's two fixed layers: ONE film grain and a wet-street vignette, never per section. */
/* token-ok: CyberWitch skin literal (fallback accent, scrim, white-hot glow) */
${C}::before{content:"";position:fixed;inset:0;z-index:998;pointer-events:none;background:radial-gradient(130% 100% at 50% 35%,transparent 55%,rgba(0,0,0,.45) 100%)}
${C}::after{content:"";position:fixed;inset:0;z-index:999;pointer-events:none;background:var(--cw-tex-grain);background-size:140px 140px;opacity:.11;mix-blend-mode:overlay}
${C} .hs-root{background:transparent;color:var(--color-text)}
${C} ::selection{background:var(--cw-clash);color:var(--cw-on-accent)}
${C} a{color:var(--cw-accent-text);transition:color var(--cw-dur-fast) ${EASE}}
${C} a:hover{color:var(--cw-accent-hover)}
${C} :focus-visible{outline:2px solid var(--cw-flare-300);outline-offset:3px}
/* Headlines: a blackletter statement with the one lit phrase sprayed over it in marker (three voices, data-type). */
${C} .hs-h1,${C} .hs-h2,${C} .hs-brand,${C} .sv-display{font-family:var(--cw-font-gothic);font-weight:700;font-stretch:100%;text-transform:none;letter-spacing:var(--cw-ls-display);line-height:var(--cw-lh-display);text-shadow:var(--cw-shadow-text);text-wrap:balance}
/* token-ok: CyberWitch skin literal (fallback accent, scrim, white-hot glow) */
${C} .hs-h1 em,${C} .hs-h2 em,${C} .sv-display em{font-family:var(--cw-font-scrawl);font-style:normal;font-weight:400;font-size:.8em;line-height:.9;text-transform:uppercase;letter-spacing:.01em;color:var(--cw-flare-400);text-shadow:0 0 1px #fff,var(--cw-glow-text);display:inline-block;transform:rotate(-4deg) translateY(.06em)}
${C}[data-type="quiet"] .hs-h1,${C}[data-type="quiet"] .hs-h2,${C}[data-type="quiet"] .sv-display{font-family:var(--cw-font-body);font-weight:500;font-style:italic;letter-spacing:-.02em;line-height:.98}
${C}[data-type="quiet"] .hs-h1 em,${C}[data-type="quiet"] .hs-h2 em,${C}[data-type="quiet"] .sv-display em{text-transform:none;font-size:.82em}
${C}[data-type="editorial"] .hs-h1,${C}[data-type="editorial"] .hs-h2,${C}[data-type="editorial"] .sv-display{font-family:var(--cw-font-scrawl);font-weight:400;text-transform:uppercase;letter-spacing:.01em;line-height:.95}
${C}[data-type="editorial"] .hs-h1 em,${C}[data-type="editorial"] .hs-h2 em,${C}[data-type="editorial"] .sv-display em{font-family:var(--cw-font-gothic);font-weight:700;text-transform:none;transform:none;font-size:1.04em;color:var(--cw-accent-text);text-shadow:var(--cw-glow-sm)}
/* Labels: Spectral tracked caps. Section labels are duct tape, a degree off. */
${C} .hs-eyebrow,${C} .hs-label,${C} .hs-badge,${C} .sv-mono{${LABEL}}
/* token-ok: tape grain stripes, the skin's own texture */
${C} .sv-eyebrow{display:inline-flex;align-items:center;gap:10px;padding:6px 12px 5px;background:repeating-linear-gradient(97deg,transparent 0 22px,rgba(0,0,0,.06) 22px 23px,transparent 23px 51px),linear-gradient(180deg,#F3EFE6,#E2DDD2);color:var(--cw-ink-900);transform:rotate(-1.5deg);box-shadow:0 2px 0 rgba(0,0,0,.35);clip-path:polygon(0 6%,2% 0,98% 4%,100% 0,99% 100%,1% 94%)}
${C} .sv-eyebrow b{color:var(--cw-ink-700)}
${C} .sv-eyebrow::before{display:none}
/* Cards are riveted steel plates: a hairline, a lit top edge, grime in the metal, a long contact shadow. */
${C} .hs-card,${C} .sv-card{position:relative;isolation:isolate;border:0;border-radius:0;background:linear-gradient(180deg,color-mix(in oklab,var(--cw-chrome-50) 4%,transparent),transparent 40%),var(--cw-tex-grime) 30% 20%/700px,var(--cw-surface-card);box-shadow:inset 0 0 0 1px var(--cw-border-default),var(--cw-shadow-plate)}
${C} .hs-card::after,${C} .sv-card::after{content:"";position:absolute;left:12%;right:12%;top:0;height:1px;z-index:2;pointer-events:none;background:linear-gradient(90deg,transparent,color-mix(in oklab,var(--cw-accent-text) 70%,transparent),transparent);box-shadow:0 0 10px color-mix(in oklab,var(--cw-accent) 40%,transparent);opacity:.55;transition:opacity var(--cw-dur-base)}
${C} .hs-card:hover::after,${C} .sv-card:hover::after{opacity:1}
${C} a.sv-card:hover{border-color:transparent;box-shadow:inset 0 0 0 1px var(--cw-accent),var(--cw-shadow-plate),var(--cw-glow-sm)}
${C}[data-site-corners="soft"] .sv-card{border-radius:var(--cw-corner-sm)}
/* Buttons: tracked caps, filled accent with an ink label, a lit edge on hover. */
${C} .hs-btn,${C} .hs-btn-primary,${C} .hs-btn-dark,${C} .sv-btn{${LABEL};min-height:44px;padding:0 24px;border-radius:var(--cw-corner-sm)}
${C} .hs-btn-primary,${C} .hs-btn-dark,${C} .sv-btn--accent{background:var(--color-primary);color:var(--color-text-on-primary);border:0;box-shadow:var(--cw-glow-sm)}
${C} .hs-btn-primary:hover,${C} .hs-btn-dark:hover,${C} .sv-btn--accent:hover{background:var(--color-primary-hover);color:var(--color-text-on-primary);box-shadow:var(--cw-glow-lg)}
${C} .hs-btn-soft,${C} .sv-btn--secondary{background:transparent;color:var(--color-text);border:1px solid var(--cw-border-strong)}
${C} .hs-btn-soft:hover,${C} .sv-btn--secondary:hover{background:var(--cw-accent-tint);border-color:var(--cw-accent);color:var(--color-text)}
/* The design's sticker button (components/core/Button.jsx): the accent is a hand-cut quad with a marker label, a degree off true, that
 * straightens on hover; the second button is a gallery placard, a double hairline frame with tracked serif caps. */
${C} .hs-btn-primary,${C} .hs-btn-dark,${C} .sv-btn--accent{border-radius:0;clip-path:polygon(1.5% 9%,98.5% 0,100% 88%,2.5% 100%);font-family:var(--cw-font-scrawl);font-weight:400;font-size:17px;letter-spacing:.02em;text-transform:uppercase;transform:rotate(-1.2deg);transition:transform var(--cw-dur-base) ${EASE},background var(--cw-dur-fast)}
${C} .sv-btn--accent.sv-btn--lg{font-size:20px;height:60px;padding:0 32px}
${C} .sv-btn--accent::before,${C} .sv-btn--accent::after{display:none}
${C} .hs-btn-primary:hover,${C} .hs-btn-dark:hover,${C} .sv-btn--accent:hover{transform:none}
${C} .hs-btn-soft,${C} .sv-btn--secondary{border:0;border-radius:0;background:transparent;box-shadow:inset 0 0 0 1px var(--cw-border-strong),inset 0 0 0 4px var(--cw-surface-page),inset 0 0 0 5px var(--cw-border-default);font-size:14px;letter-spacing:.14em}
${C} .hs-btn-soft:hover,${C} .sv-btn--secondary:hover{border:0;color:var(--cw-accent-text);box-shadow:inset 0 0 0 1px var(--cw-accent),inset 0 0 0 4px var(--cw-surface-page),inset 0 0 0 5px var(--cw-accent-line)}
/* The photo hero (Sections.jsx Hero, look photo, the theme's default): the neon-wall picture full bleed, an iron scrim from the left so the
 * words read and the figure on the right stays lit, the words held to the left half. */
${C} .sv-hero--photo{min-height:min(92vh,880px)}
${C} .sv-hero-bg--photo{background-position:70% 40%}
${C} .sv-hero-bg--photo::before{background:linear-gradient(90deg,color-mix(in oklab,var(--cw-ink-950) 90%,transparent) 0%,color-mix(in oklab,var(--cw-ink-950) 80%,transparent) 38%,color-mix(in oklab,var(--cw-ink-950) 25%,transparent) 58%,transparent 72%),linear-gradient(0deg,var(--cw-ink-900) 0%,transparent 30%)}
${C} .sv-hero-bg--photo::after{display:none}
${C} .sv-hero--photo .sv-hero-in{grid-template-columns:minmax(0,1fr);align-items:end}
${C} .sv-hero--photo .sv-hero-copy{max-width:min(100%,640px)}
@media (min-width:900px){${C} .sv-hero--photo .sv-hero-copy{max-width:min(56%,640px)}}
@media (max-width:899px){${C} .sv-hero-bg--photo{background-position:84% 40%}}
${C} .sv-hero--photo .sv-hero-copy .sv-display{font-size:clamp(44px,5.6vw,88px)}
${C} .sv-hero .sv-eyebrow{color:var(--cw-ink-900)}
/* The wordmark in the bar (Logo, descriptor off): the name in bone blackletter, lit by the shadow, never the accent. */
${C} .hs-brand{color:var(--cw-chrome-50);font-size:clamp(24px,2.4vw,32px)}
/* The header: a steel bar with a neon hairline under it. */
${C} .hs-header{position:sticky;top:0;z-index:40}
${C} .hs-pill{background:color-mix(in oklab,var(--cw-ink-900) 88%,transparent);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);border-bottom:1px solid var(--cw-border-subtle);box-shadow:0 1px 0 color-mix(in oklab,var(--cw-flare-500) 28%,transparent)}
${C} .hs-logo{flex:none;display:block;height:clamp(28px,6vw,36px);width:auto;max-width:160px;object-fit:contain;border-radius:var(--cw-corner-sm)}
/* A hero is a photo under an iron wash, light type in all cases. */
${C} .hs-hero{--color-ink:var(--cw-ink-950);--color-on-ink:var(--cw-chrome-50);--color-on-ink-muted:var(--cw-chrome-200)}
${C} .hs-nav a,${C} .hs-nav-mega{${LABEL};color:var(--cw-text-secondary)}
${C} .hs-nav a:hover,${C} .hs-nav a[aria-current="page"]{color:var(--cw-text-primary);text-shadow:var(--cw-glow-sm)}
${C} .hs-menu-panel,${C} .hs-mega-panel{background:var(--cw-ink-800);border:1px solid var(--cw-border-default);border-radius:var(--cw-corner-sm);box-shadow:var(--cw-shadow-plate)}
/* The footer: chain-link over sunk iron. */
${C} .hs-footer-top{background:var(--cw-tex-chain),var(--cw-surface-sunken);border-top:1px solid var(--cw-border-subtle)}
${C} .hs-footer-col-title{${LABEL};color:var(--cw-text-muted)}
/* Photos: grayscale by default, the neon lives on top (the Images dial: mono, glow, grain, clean). */
${C} img.sv-photo,${C} .sv-media img{filter:grayscale(1) contrast(1.2) brightness(.9)}
${C}[data-image="clean"] .sv-media img,${C}[data-image="clean"] img.sv-photo{filter:none}
/* Motion dial: flicker and drift are additive; calm and off stop them, and so does prefers-reduced-motion. */
@keyframes cw-flicker{0%,100%{opacity:1}3%{opacity:.4}5%{opacity:1}61%{opacity:1}62%{opacity:.65}64%{opacity:1}}
@keyframes cw-drift{0%{transform:translate(0,0)}50%{transform:translate(-2%,1.5%)}100%{transform:translate(0,0)}}
${C} .hs-h1 em,${C} .hs-brand{animation:cw-flicker 8s linear infinite}
${C} .sv-orb{animation:cw-drift 26s ease-in-out infinite}
${C}[data-motion="calm"] .hs-h1 em,${C}[data-motion="calm"] .hs-brand{animation:none}
${C}[data-motion="calm"] .sv-orb{animation-duration:60s}
${C}[data-motion="off"] *{animation:none!important;transition:none!important}
@media (prefers-reduced-motion:reduce){${C} *{transition:none!important;animation:none!important}}
`
