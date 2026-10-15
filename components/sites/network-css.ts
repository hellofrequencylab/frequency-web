import { NETWORK_ISLAND_TOKENS_CSS, NETWORK_TOKENS_CSS } from '@/lib/theme/network'

// THE NETWORK WEBSITE SKIN (lib/theme/network.ts). Layered AFTER HOUSE_CSS and FREQUENCY_PAGE_CSS on a website
// whose Space wears the Network theme, and scoped under [data-house-theme="network"], so every house section
// and site page section keeps its markup and content and only its look changes. Reads `--nw-*` and DAWN
// tokens only: every value lives in the token block (NETWORK_TOKENS_CSS), so a scheme is a values-only swap.
//
// The rules, from The Group's design system: about 90% of the page is paper, fill and ink, with real photos
// carrying the warmth; one solid hero color for the main button, the date and one band; neutral depth only
// (a fill, hairlines, an off-white card with a soft top highlight, warm low-alpha shadows, a fine film
// grain); Bricolage Grotesque 700 headlines with tight tracking and one Instrument Serif italic word;
// Outfit body at 18px with 500 for labels and buttons; sentence-case labels led by one accent dot; pill
// buttons and fields, 28px cards, 32px photo panels and a leaf crop on the hero photo; the dark bands
// (closing, footer) in the scheme's ink. Floors: 15px text, AA contrast, 44px targets, reduced motion.

const N = '[data-house-theme="network"]'
// The page sections' sheet (FREQUENCY_PAGE_CSS) is scoped two attributes deep; the section rules carry the
// site root too, so they outrank it without `!important`.
const M = '[data-house-site][data-house-theme="network"]'

const DISPLAY = 'font-family:var(--nw-display);font-weight:700;letter-spacing:var(--nw-tracking-display);font-optical-sizing:auto;text-transform:none;font-style:normal;color:var(--nw-ink)'
const VOICE = 'font-family:var(--nw-voice);font-style:italic;font-weight:400;letter-spacing:-.005em'
const LABEL = 'font-family:var(--nw-body);font-weight:500;font-size:16px;line-height:1.35;letter-spacing:0;text-transform:none'
const DOT = 'content:"";flex:none;width:8px;height:8px;border-radius:50%;background:var(--color-primary)'
const CARD = 'background:var(--nw-surface);border-radius:var(--nw-r-card);box-shadow:0 0 0 1px color-mix(in srgb,var(--nw-ink) 6%,transparent),var(--nw-lift-sm)'
const EASE = 'var(--nw-dur-fast) var(--nw-ease)'

export const NETWORK_CSS = `${NETWORK_TOKENS_CSS}
${N}{--hs-serif:var(--nw-display);--hs-sans:var(--nw-body);position:relative;isolation:isolate;font-family:var(--nw-body);font-size:18px;line-height:1.6;color:var(--nw-ink);background:var(--nw-paper);transition:background-color .4s ease,color .4s ease;-webkit-font-smoothing:antialiased}
html:has(${N}),body:has(${N}){background:var(--nw-paper)}
${N} ::selection{background:var(--color-primary);color:var(--color-text-on-primary)}
${N} :focus-visible{outline:none;box-shadow:var(--nw-ring-focus)}
${N} a:focus-visible,${N} button:focus-visible,${N} input:focus-visible{outline:2px solid var(--color-primary-strong);outline-offset:3px;box-shadow:none}
${N} strong,${N} b{font-weight:600}
${N} p{text-wrap:pretty}

${N} .hs-serif,${N} .hs-h1,${N} .hs-h2{${DISPLAY}}
${N} .hs-h1{font-size:clamp(3rem,1.6rem + 5.2vw,6.25rem);line-height:.98}
${N} .hs-h2{font-size:clamp(2.2rem,1.5rem + 2.4vw,3.5rem);line-height:1.06}
${N} .hs-accent,${N} .hs-h1 em,${N} .hs-h2 em{${VOICE};color:inherit}
${N} .hs-eyebrow{${LABEL};display:inline-flex;align-items:center;gap:10px;color:var(--nw-muted)}
${N} .hs-eyebrow::before{${DOT}}
${N} .hs-lead{font-size:clamp(1.15rem,1.05rem + .35vw,1.3rem);line-height:1.6;color:var(--nw-muted)}
${N} .hs-muted{color:var(--nw-muted)}

${N} .hs-btn{min-height:52px;border-radius:var(--nw-r-pill);font-family:var(--nw-body);font-weight:500;font-size:17px;letter-spacing:0;box-shadow:inset 0 1px 0 var(--nw-c-chalk-22),0 1px 2px var(--nw-c-umber-12);transition:transform ${EASE},background-color ${EASE},box-shadow ${EASE}}
${N} .hs-btn:hover{transform:translateY(-1px)}
${N} .hs-btn:active{transform:translateY(0) scale(.98)}
${N} .hs-btn svg{transition:transform ${EASE}}
${N} .hs-btn:hover svg{transform:translateX(3px)}
${N} .hs-btn-primary{padding:0 26px;background:var(--color-primary);color:var(--color-text-on-primary)}
${N} .hs-btn-primary:hover{background:var(--color-primary);color:var(--color-text-on-primary)}
${N} .hs-btn-soft,${N} .hs-btn-ghost,${N} .hs-btn-light{padding:0 24px;background:transparent;color:var(--nw-ink);box-shadow:inset 0 0 0 1px var(--nw-line-strong)}
${N} .hs-btn-soft:hover,${N} .hs-btn-ghost:hover,${N} .hs-btn-light:hover{background:var(--nw-surface);color:var(--nw-ink)}
${N} .hs-btn-dark{min-height:44px;padding:0 20px;font-size:16px;background:var(--color-primary);color:var(--color-text-on-primary)}
${N} .hs-btn-dark:hover{background:var(--color-primary-hover);color:var(--color-text-on-primary)}
@media (prefers-reduced-motion:reduce){${N} .hs-btn,${N} .hs-btn svg{transition:none}${N} .hs-btn:hover,${N} .hs-btn:active,${N} .hs-btn:hover svg{transform:none}}

${N} .hs-header{position:sticky;top:0;z-index:50;padding:0;background:color-mix(in srgb,var(--nw-paper) 94%,transparent);-webkit-backdrop-filter:saturate(1.4) blur(14px);backdrop-filter:saturate(1.4) blur(14px);border-bottom:1px solid color-mix(in srgb,var(--nw-ink) 8%,transparent);transition:none}
${N} .hs-header[data-hidden]{opacity:1;transform:none;pointer-events:auto}
${N} .hs-pill{max-width:1240px;margin:0 auto;min-height:96px;padding:0 var(--nw-gutter);border-radius:0;background:transparent;box-shadow:none;animation:none;column-gap:18px}
${N} .hs-brand{display:inline-flex;align-items:center;gap:14px;padding-left:0;${DISPLAY};font-size:34px;font-weight:800;letter-spacing:-.035em;line-height:1}
${N} .hs-brand-name{font-family:var(--nw-display);font-weight:800}
${N} .hs-logo-avatar,${N} .hs-logo{width:72px;height:72px;border-radius:0;object-fit:contain;background:transparent;box-shadow:none;filter:drop-shadow(0 4px 10px var(--nw-c-shade-18))}
${N} .hs-nav{-webkit-mask-image:none;mask-image:none}
${N} .hs-nav-track{gap:2px;margin:0 0 0 16px;padding:0}
${N} .hs-nav a,${N} .hs-nav-mega{position:relative;height:44px;padding:0 14px;border-radius:999px;font-family:var(--nw-body);font-weight:500;font-size:16px;letter-spacing:0;text-transform:none;color:var(--nw-muted);background:none}
${N} .hs-nav a:hover,${N} .hs-nav-mega:hover{color:var(--nw-ink);background:color-mix(in srgb,var(--nw-ink) 5%,transparent)}
${N} .hs-nav a[aria-current="page"]{color:var(--nw-ink)}
${N} .hs-nav a[aria-current="page"]::after{content:"";position:absolute;left:14px;right:14px;bottom:6px;height:2px;border-radius:2px;background:var(--color-primary)}
${N} .hs-header-actions{gap:10px}
${N} .hs-header .hs-btn-dark{min-height:46px;padding:0 22px;font-size:16px}
${N} .hs-menu-button{min-width:44px;min-height:44px;border-radius:var(--nw-r-pill);background:var(--nw-surface);color:var(--nw-ink);box-shadow:0 0 0 1px var(--nw-line)}
${N} .hs-menu-panel{border-radius:var(--nw-r-card);${CARD}}
${N} .hs-menu-panel a{font-family:var(--nw-body);font-weight:500;font-size:18px;color:var(--nw-ink)}
/* The admin link is not part of the menu: a dark chip at the end of the nav, a pencil and "Website builder",
   so the owner never reads it as a page of the site (owner ask 2026-10-14). */
${N} .hs-nav .hs-nav-admin{display:flex;align-items:center;gap:8px;margin-left:14px;padding:4px 4px 4px 14px;border-radius:var(--nw-r-pill);background:var(--nw-ink);align-self:center}
${N} .hs-nav-admin-tag{font-family:var(--nw-body);font-weight:500;font-size:12px;letter-spacing:.04em;text-transform:uppercase;padding:0;color:var(--nw-on-ink-muted);display:flex;align-items:center}
${N} .hs-nav-admin-colon,${N} .hs-nav-admin-sep{display:none}
${N} .hs-nav .hs-nav-admin a{display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 14px;border-radius:var(--nw-r-pill);background:color-mix(in srgb,var(--nw-on-ink) 14%,transparent);color:var(--nw-on-ink);font-weight:600;font-size:14px}
${N} .hs-nav .hs-nav-admin a::before{content:"";width:14px;height:14px;flex:none;background:currentColor;-webkit-mask:var(--nw-pencil) center/contain no-repeat;mask:var(--nw-pencil) center/contain no-repeat}
${N} .hs-nav .hs-nav-admin a::after{display:none}
${N} .hs-nav .hs-nav-admin a:hover,${N} .hs-nav .hs-nav-admin a[aria-current="page"]{background:color-mix(in srgb,var(--nw-on-ink) 26%,transparent);color:var(--nw-on-ink)}
${N} .hs-menu-panel a.hs-nav-admin{margin-top:8px;padding:12px 16px;border-radius:var(--nw-r-pill);background:var(--nw-ink);color:var(--nw-on-ink);font-weight:600}
${N} .hs-member{border-radius:var(--nw-r-pill);font-family:var(--nw-body);font-weight:500}
@media (max-width:939px){${N} .hs-nav{display:none}${N} .hs-pill{min-height:80px}${N} .hs-menu-panel{top:88px}}
@media (max-width:560px){${N} .hs-brand{font-size:24px;gap:10px}${N} .hs-logo-avatar,${N} .hs-logo{width:48px;height:48px}${N} .hs-header .hs-btn-dark{display:none}}

${N} .hs-footer-top{position:relative;max-width:none;margin:0;padding:clamp(80px,9vw,128px) max(var(--nw-gutter),calc((100% - 1240px) / 2 + var(--nw-gutter))) 40px;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr));gap:32px;border-top:0;background:var(--nw-ink);color:var(--nw-on-ink)}
${N} .hs-footer-top::before{content:"";position:absolute;left:0;right:0;top:-1px;height:clamp(36px,5vw,72px);background:var(--nw-paper);-webkit-mask:var(--nw-wave-fill) center/100% 100% no-repeat;mask:var(--nw-wave-fill) center/100% 100% no-repeat;pointer-events:none}
${N} .hs-footer-top .hs-brand{${DISPLAY};color:var(--nw-on-ink);font-size:30px;font-weight:800;letter-spacing:-.04em}
${N} .hs-footer-brand{gap:14px}
${N} .hs-footer-brand p{margin:0;color:var(--nw-on-ink-muted);font-size:16px;line-height:1.9}
${N} .hs-footer-col{display:flex;flex-direction:column;align-items:flex-start}
${N} .hs-footer-col-title{margin:0 0 12px;font-family:var(--nw-body);font-weight:500;font-size:15px;letter-spacing:0;text-transform:none;color:var(--nw-on-ink-subtle)}
${N} .hs-footer-col a{display:block;font-size:16px;line-height:1.9;color:var(--nw-on-ink-muted);text-decoration:none}
${N} .hs-footer-col a:hover{color:var(--nw-on-ink)}
${N} .hs-footer{max-width:none;margin:0;padding:20px max(var(--nw-gutter),calc((100% - 1240px) / 2 + var(--nw-gutter))) 28px;background:var(--nw-ink);border-top:1px solid var(--nw-ink-border);font-size:14px;color:var(--nw-on-ink-subtle)}
${N} .hs-footer a{color:var(--nw-on-ink-subtle);font-weight:400}
${N} .hs-footer-line,${N} .hs-footer-note{color:var(--nw-on-ink-subtle)}

${M} .mw-wrap{max-width:1240px}
${M} .mw-sec{padding-top:clamp(72px,9vw,128px)}
${M} .mw-display{${DISPLAY}}
${M} .mw-xl{font-size:clamp(2.8rem,1.4rem + 3.4vw,5rem);line-height:1}
${M} .mw-l{font-size:clamp(2.6rem,1.8rem + 3.4vw,4.4rem);line-height:1}
${M} .mw-m{font-size:clamp(2.2rem,1.5rem + 2.4vw,3.5rem);line-height:1.06}
${M} .mw-s{font-size:clamp(1.5rem,1.3rem + .8vw,1.875rem);line-height:1.12}
${M} .mw-xs{font-size:1.5rem;line-height:1.2}
${M} .mw-accent{${VOICE};color:inherit}
${M} .mw-hero .mw-accent{color:var(--color-primary-strong)}
${M} .mw-kicker{${LABEL};color:var(--nw-muted);margin:0 0 18px}
${M} .mw-kicker::before{${DOT}}
${M} .mw-lead{font-size:clamp(1.15rem,1.05rem + .35vw,1.3rem);line-height:1.6;color:var(--nw-muted);max-width:36em}
${M} .mw-body{font-size:1.125rem;line-height:1.65;color:var(--nw-muted)}
${M} .mw-small{font-size:1rem;line-height:1.55;color:var(--nw-muted)}
${M} .mw-label{${LABEL};font-size:15px;color:var(--nw-subtle)}
${M} .mw-label-strong{color:var(--nw-ink)}
${M} .mw-textlink,${M} .mw-freqtag{font-weight:500;font-size:16px;color:var(--color-primary-strong)}
${M} .mw-textlink:hover{color:var(--nw-ink)}
${M} .mw-icon{color:var(--color-primary-strong)}
${M} .mw-actions{gap:10px}

${M} .mw-photo{border-radius:var(--nw-r-cover);background:var(--nw-fill);box-shadow:none}
${M} .mw-photo img{filter:saturate(1.05) contrast(1.03)}
${M} .mw-chamfer{border-radius:var(--nw-r-cover)}
${M} .mw-hero{padding-top:clamp(24px,3vw,40px)}
${M} .mw-hero-inner{gap:clamp(28px,4vw,56px);align-items:stretch}
${M} .mw-hero-copy{display:flex;flex-direction:column;justify-content:center;gap:0;padding:clamp(20px,3vw,40px) 0}
${M} .mw-hero-copy .mw-actions{margin-top:28px}
${M} .mw-hero-split .mw-photo{aspect-ratio:auto;min-height:clamp(440px,40vw,560px);max-height:none;border-radius:var(--nw-r-leaf)}
${M} .mw-hero-split .mw-photo img{position:absolute;inset:0;object-position:50% 40%}
${M} .mw-hero-photo{border-radius:var(--nw-r-cover)}
${M} .mw-hero-note{margin-top:18px}
@media (max-width:900px){${M} .mw-hero-split .mw-photo{min-height:380px;border-radius:var(--nw-r-cover) 140px var(--nw-r-cover) var(--nw-r-cover)}}

${M} .mw-grid>*,${M} .mw-frame{${CARD}}
${M} .mw-head-card{background:var(--nw-fill);box-shadow:none;border-radius:40px}
${M} .mw-facts>div{background:var(--nw-fill);box-shadow:none;border-radius:var(--nw-r-card);padding:28px 30px;gap:8px}
${M} .mw-facts{grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:12px}
${M} .mw-facts>div{display:flex;flex-direction:column-reverse;justify-content:flex-end}
${M} .mw-fact-v{${DISPLAY};font-size:clamp(2.6rem,1.8rem + 2.4vw,3.6rem);line-height:1;letter-spacing:-.03em}
${M} .mw-facts .mw-label{font-size:16px;color:var(--nw-muted)}

${M} .mw-path-n{font-family:var(--nw-display);font-style:normal;font-weight:700;font-size:16px;line-height:1;width:36px;height:36px;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;background:var(--color-primary);color:var(--color-text-on-primary)}
${M} .mw-path-grid{grid-template-columns:repeat(4,minmax(0,1fr))}
@media (max-width:1000px){${M} .mw-path-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (max-width:560px){${M} .mw-path-grid{grid-template-columns:minmax(0,1fr)}}
${M} .mw-tag-chev,${M} .mw-week-tag,${M} .mw-badge{font-size:14px;font-weight:500;background:var(--color-primary-bg);color:var(--color-primary-strong)}
${M} .mw-badge-forming{background:var(--color-primary);color:var(--color-text-on-primary)}
${M} .mw-chevlist li{font-size:1.05rem;color:var(--nw-muted)}

${M} .mw-story{gap:clamp(32px,5vw,80px)}
${M} .mw-story-photo{aspect-ratio:4/3;border-radius:var(--nw-r-cover)}
${M} .mw-quote blockquote{font-family:var(--nw-voice);font-style:italic;font-size:clamp(1.6rem,1.2rem + 1.4vw,2.4rem);line-height:1.25;color:var(--nw-ink)}

${M} .mw-closing{border-radius:40px;background:var(--nw-ink);color:var(--nw-on-ink)}
${M} .mw-closing .mw-display{color:var(--nw-on-ink)}
${M} .mw-closing .mw-kicker{color:var(--nw-on-ink-muted)}
${M} .mw-closing .mw-lead,${M} .mw-closing .mw-body{color:var(--nw-on-ink-muted)}
${M} .mw-closing .hs-btn-soft{color:var(--nw-on-ink);box-shadow:inset 0 0 0 1px var(--nw-ink-border)}
${M} .mw-closing .hs-btn-soft:hover{background:var(--nw-ink-raised)}
${M} .mw-closing[data-background="accent-wash"],${M} .mw-closing[data-background="accent"]{background:var(--color-primary);color:var(--color-text-on-primary)}
${M} .mw-closing[data-background="accent-wash"] .mw-display,${M} .mw-closing[data-background="accent-wash"] .mw-lead,${M} .mw-closing[data-background="accent-wash"] .mw-kicker,${M} .mw-closing[data-background="accent"] .mw-display,${M} .mw-closing[data-background="accent"] .mw-lead,${M} .mw-closing[data-background="accent"] .mw-kicker{color:var(--color-text-on-primary)}
${M} .mw-closing[data-background="accent-wash"] .mw-kicker::before,${M} .mw-closing[data-background="accent"] .mw-kicker::before{background:var(--color-text-on-primary)}
${M} .mw-closing[data-background="accent-wash"] .hs-btn-primary,${M} .mw-closing[data-background="accent"] .hs-btn-primary{background:var(--nw-ink);color:var(--nw-on-ink)}
${M} .mw-closing[data-background="accent-wash"] .hs-btn-soft,${M} .mw-closing[data-background="accent"] .hs-btn-soft{color:var(--color-text-on-primary);box-shadow:inset 0 0 0 1.5px currentColor}
${M} .mw-strip,${M} .mw-note{border-radius:var(--nw-r-card);background:var(--nw-surface);box-shadow:var(--nw-lift-sm)}
${M} .mw-strip-chev{background:var(--color-primary)}

${M} .mw-date-row{border-radius:22px;background:var(--nw-surface);box-shadow:0 0 0 1px color-mix(in srgb,var(--nw-ink) 6%,transparent),var(--nw-lift-sm);padding:18px 22px}
${M} .mw-date-mark{width:12px;height:12px;background:var(--color-primary)}
${M} .mw-date-text strong{font-weight:500;font-size:1.15rem;color:var(--nw-ink)}
${M} .mw-date-row .mw-label-strong{display:inline-flex;align-self:center;padding:6px 12px;border-radius:14px;background:var(--nw-sand);box-shadow:inset 0 0 0 1px var(--nw-sand-line);color:var(--color-primary-strong);font-weight:600}

${M} .mw-circle-tile{${CARD};padding:24px}
${M} .mw-circle-row{border-radius:22px}
${M} .mw-circle-row-name{${DISPLAY};font-size:1.4rem}
${M} .mw-tag{min-height:44px;padding:0 18px;display:inline-flex;align-items:center;border-radius:var(--nw-r-pill);font-size:16px;background:var(--nw-surface);box-shadow:inset 0 0 0 1px var(--nw-line);color:var(--nw-muted)}
${M} .mw-tag[aria-pressed="true"]{background:var(--color-primary-bg);color:var(--color-primary-strong);box-shadow:inset 0 0 0 1.5px var(--color-primary)}
${M} .mw-progress-bar span[data-state="done"]{background:var(--color-primary)}

${M} .mw-band{height:28px;margin-top:clamp(48px,6vw,80px);background:var(--nw-line-strong);opacity:.7;-webkit-mask:var(--nw-wave) center/100% 100% no-repeat;mask:var(--nw-wave) center/100% 100% no-repeat}
${M} .mw-weeks li,${M} .mw-journey .mw-weeks li{border-radius:22px;background:var(--nw-surface)}

${M} [data-mw-own]{display:block}
${M} [data-mw-own]>div{padding:0;margin:0}
${N} .nw-block{position:relative;padding:var(--nw-sec-y) 0;overflow-x:clip}
${N} .nw-wrap{width:100%;max-width:1240px;margin:0 auto;padding:0 var(--nw-gutter);box-sizing:border-box}
${N} .nw-band-sand{background:var(--nw-sand)}
${N} .nw-band-ink{background:var(--nw-ink);color:var(--nw-on-ink)}
${N} .nw-band::before,${N} .nw-band::after{content:"";position:absolute;left:0;right:0;height:clamp(36px,5vw,72px);background:var(--nw-paper);pointer-events:none;z-index:1;-webkit-mask:var(--nw-wave-fill) center/100% 100% no-repeat;mask:var(--nw-wave-fill) center/100% 100% no-repeat}
${N} .nw-band::before{top:-1px}
${N} .nw-band::after{bottom:-1px;transform:scale(-1,-1)}
${N} .nw-band>.nw-wrap{position:relative;z-index:2}

${N} .nw-eyebrow{display:inline-flex;align-items:center;gap:10px;font-family:var(--nw-body);font-size:16px;font-weight:500;line-height:1.6;color:var(--nw-muted)}
${N} .nw-eyebrow i{flex:none;width:8px;height:8px;border-radius:50%;background:var(--nw-pop)}
${N} .nw-band-ink .nw-eyebrow{color:var(--nw-on-ink)}
${N} .nw-title{${DISPLAY};margin:14px 0 0;font-size:clamp(2.2rem,1.5rem + 2.4vw,3.5rem);line-height:1.04;text-wrap:balance}
${N} .nw-title .mw-accent,${N} .nw-founder-q .mw-accent{${VOICE};color:inherit;padding-right:.04em}
${N} h1.nw-title{font-size:clamp(2.8rem,1.4rem + 3.4vw,5rem);line-height:1;letter-spacing:-.045em}
${N} h1.nw-title .mw-accent{color:var(--color-primary-strong)}
${N} h3.nw-title{font-size:clamp(1.9rem,1.4rem + 1.4vw,2.6rem);line-height:1.08}
${N} .nw-band-ink .nw-title{color:var(--nw-on-ink)}
${N} .nw-lead{margin:18px 0 0;max-width:60ch;font-size:clamp(1.15rem,1.05rem + .35vw,1.3rem);line-height:1.6;color:var(--nw-muted);text-wrap:pretty}
${N} .nw-band-ink .nw-lead{color:var(--nw-on-ink-muted)}
${N} .nw-body{margin:16px 0 0;font-size:18px;line-height:1.65;color:var(--nw-muted)}
${N} .nw-small{margin:14px 0 0;font-size:16px;line-height:1.6;color:var(--nw-muted)}
${N} .nw-head{margin-bottom:clamp(40px,5vw,64px)}
${N} .nw-head-row{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:24px}
${N} .nw-head>div{max-width:820px}
${N} .nw-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:28px}
${N} .nw-actions:empty{display:none}
${N} .nw-arr{width:18px;height:18px;transition:transform ${EASE}}
${N} a:hover>.nw-arr{transform:translateX(3px)}
${N} .nw-i{width:20px;height:20px;flex:none}
${N} .nw-btn-ink,${N} .nw-btn-light{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 18px;border-radius:var(--nw-r-pill);font-family:var(--nw-body);font-weight:500;font-size:16px;text-decoration:none;transition:transform ${EASE}}
${N} .hs-btn.nw-btn-ink,${N} .hs-btn.nw-btn-light{min-height:44px;padding:0 18px;font-size:15px;box-shadow:none}
${N} .nw-btn-ink:hover,${N} .nw-btn-light:hover{transform:translateY(-1px)}
${N} .nw-band-ink .hs-btn-soft{color:var(--nw-on-ink);background:transparent;box-shadow:inset 0 0 0 1.5px color-mix(in srgb,var(--nw-on-ink) 45%,transparent)}
${N} .nw-band-ink .hs-btn-soft:hover{background:color-mix(in srgb,var(--nw-on-ink) 8%,transparent);color:var(--nw-on-ink)}
${N} .nw-graded{position:relative;isolation:isolate;overflow:hidden}
${N} .nw-graded img{filter:saturate(1.05) contrast(1.03)}
${N} .nw-graded::before{content:"";position:absolute;inset:0;z-index:1;background:linear-gradient(180deg,var(--nw-c-glow-10),var(--nw-c-earth-10));mix-blend-mode:soft-light;pointer-events:none;border-radius:inherit}
${N} .nw-card{position:relative;background:var(--nw-surface);border-radius:var(--nw-r-card);box-shadow:var(--nw-lift-sm)}
${N} .nw-empty{padding:40px;text-align:center;border-radius:24px;background:var(--nw-surface);box-shadow:0 0 0 1px var(--nw-line);color:var(--nw-muted)}

${N} .nw-block-hero{padding:clamp(12px,2vw,24px) 0 clamp(64px,8vw,120px)}
${N} .nw-hero{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);gap:clamp(28px,4vw,64px);align-items:stretch;min-height:min(calc(100svh - 96px - clamp(24px,4vw,48px)),860px)}
${N} .nw-hero-copy{display:flex;flex-direction:column;justify-content:center;gap:clamp(18px,2.2vw,28px);padding:clamp(12px,2vw,24px) 0}
${N} .nw-hero-copy .nw-title{margin:0}
${N} .nw-hero-copy .nw-lead{margin:0;max-width:30em}
${N} .nw-hero-copy .nw-actions{margin:0}
${N} .nw-hero-copy .hs-btn-soft{padding:0 26px;background:var(--nw-surface);box-shadow:inset 0 0 0 1.5px var(--nw-line-strong)}
${N} .nw-proof{display:flex;align-items:center;gap:14px;padding-top:clamp(8px,1.5vw,16px);border-top:1px solid var(--nw-line)}
${N} .nw-proof b{display:block;font-weight:600;font-size:16px;color:var(--nw-ink)}
${N} .nw-proof small{display:block;font-size:15px;color:var(--nw-muted)}
${N} .nw-faces{display:flex;flex:none}
${N} .nw-faces>*{width:40px;height:40px;border-radius:50%;margin-left:-10px;box-shadow:0 0 0 3px var(--nw-paper);object-fit:cover;object-position:50% 15%}
${N} .nw-faces>*:first-child{margin-left:0}
${N} .nw-faces>span{display:flex;align-items:center;justify-content:center;background:var(--nw-pop);color:var(--nw-on-ink);font-weight:700;font-size:14px}
${N} .nw-hero-photo{position:relative;min-height:clamp(440px,40vw,560px);border-radius:36px;box-shadow:0 30px 60px -36px var(--nw-c-shade-50)}
${N} .nw-hero[data-crop="leaf"] .nw-hero-photo{border-radius:var(--nw-r-leaf)}
${N} .nw-hero[data-crop="arch"] .nw-hero-photo{border-radius:320px 320px 36px 36px}
${N} .nw-hero-photo img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:50% 40%}
${N} .nw-ev{position:absolute;z-index:2;left:clamp(14px,2vw,20px);right:clamp(14px,2vw,20px);bottom:clamp(14px,2vw,20px);display:flex;align-items:center;gap:16px;padding:16px 16px 16px 18px;border-radius:26px;background:color-mix(in srgb,var(--nw-surface) 92%,transparent);-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px);box-shadow:var(--nw-lift-md)}
${N} .nw-ev-text{flex:1;min-width:0}
${N} .nw-ev-text b{display:block;font-size:19px;font-weight:500;color:var(--nw-ink)}
${N} .nw-ev-text small{display:block;font-size:15px;color:var(--nw-muted)}
${N} .nw-ev-btn{min-height:44px;padding:0 18px;font-size:15px}
${N} .nw-ev .nw-date{background:var(--color-primary-bg);box-shadow:none;color:var(--color-primary-strong)}
${N} .nw-ev .nw-date b{color:var(--color-primary-strong);font-weight:500;font-family:var(--nw-body)}
${N} .nw-ev .nw-date small{font-weight:600}
${N} .nw-date{flex:none;width:60px;height:60px;border-radius:18px;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1;background:var(--nw-sand);box-shadow:inset 0 0 0 1px var(--nw-sand-line);position:relative;overflow:hidden}
${N} .nw-date small{font-size:12px;font-weight:700;letter-spacing:.06em;color:var(--color-primary-strong)}
${N} .nw-date b{font-family:var(--nw-display);font-size:24px;font-weight:700;letter-spacing:-.03em;color:var(--nw-ink)}
@media (max-width:900px){${N} .nw-hero{grid-template-columns:minmax(0,1fr);min-height:0}${N} .nw-hero-photo{min-height:440px}${N} .nw-hero[data-crop="leaf"] .nw-hero-photo{border-radius:36px 140px 36px 36px}}

${N} .nw-block-stats{padding:clamp(32px,4vw,56px) 0}
${N} .nw-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:12px;margin:0}
${N} .nw-stat{position:relative;overflow:hidden;isolation:isolate;padding:28px 30px;border-radius:28px;background:var(--nw-surface);display:flex;flex-direction:column}
${N} .nw-stat[data-tone="0"]{--c:var(--color-primary);--ct:var(--color-primary-strong)}
${N} .nw-stat[data-tone="1"]{--c:var(--nw-pop2);--ct:color-mix(in srgb,var(--nw-pop2) 85%,var(--nw-c-soot))}
${N} .nw-stat[data-tone="2"]{--c:var(--nw-pop3);--ct:color-mix(in srgb,var(--nw-pop3) 80%,var(--nw-c-soot))}
${N} .nw-blip{position:absolute;z-index:-1;border-radius:50%;background:color-mix(in srgb,var(--c) 22%,transparent)}
${N} .nw-blip-1{width:150px;height:150px;right:-40px;top:-50px}
${N} .nw-blip-2{width:46px;height:46px;right:96px;bottom:18px;background:color-mix(in srgb,var(--c) 40%,transparent)}
${N} .nw-blip-3{width:14px;height:14px;right:70px;top:36px;background:var(--c)}
${N} .nw-stat-i{width:44px;height:44px;border-radius:14px;display:flex;align-items:center;justify-content:center;margin-bottom:18px;background:var(--nw-surface);color:var(--color-primary-strong);box-shadow:var(--nw-lift-sm)}
${N} .nw-stat dd{margin:0;${DISPLAY};color:var(--ct);font-size:clamp(2.6rem,1.8rem + 2.4vw,3.6rem);line-height:1;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
${N} .nw-stat dt{margin-top:8px;font-size:18px;color:var(--nw-muted)}

${N} .nw-split{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:clamp(32px,5vw,80px);align-items:center}
${N} .nw-split-right>.nw-photo{order:2}
${N} .nw-split-copy .nw-title{margin-top:18px}
${N} .nw-split-copy .nw-lead{margin-top:22px}
${N} .nw-photo{position:relative;margin:0;border-radius:32px;overflow:hidden;aspect-ratio:4/3}
${N} .nw-block-founder .nw-photo{border-radius:32px;box-shadow:0 30px 60px -36px var(--nw-c-shade-50)}
${N} [data-mw-own]:has(.nw-block-founder):has(+[data-mw-own] .nw-block-team) .nw-block-founder{padding-bottom:0}
${N} [data-mw-own]:has(.nw-block-founder)+[data-mw-own] .nw-block-team{padding-top:clamp(56px,7vw,96px)}
${N} .nw-block-team .nw-title{font-size:clamp(1.9rem,1.2rem + 1.6vw,2.56rem);line-height:1.15}
${N} .nw-block-team .nw-split{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:clamp(24px,4vw,56px)}
@media (max-width:900px){${N} .nw-block-team .nw-split{grid-template-columns:minmax(0,1fr)}}
${N} .nw-block-team .nw-photo{aspect-ratio:4/5;max-height:620px;border-radius:36px;box-shadow:0 30px 60px -36px var(--nw-c-shade-50)}
${N} .nw-photo img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
${N} .nw-photo-tall{aspect-ratio:4/5}
${N} .nw-facts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:28px}
${N} .nw-fact{position:relative;padding:18px 20px;border-radius:22px;background:var(--nw-fill)}
${N} .nw-fact small{display:flex;align-items:center;gap:6px;margin-bottom:4px;font-size:15px;color:var(--nw-muted)}
${N} .nw-fact small .nw-i{width:16px;height:16px;color:var(--color-primary-strong)}
${N} .nw-fact b{display:block;font-weight:500;font-size:18px;color:var(--nw-ink)}
${N} .nw-fact span{display:block;font-size:15px;color:var(--nw-muted)}
${N} .nw-pull{margin:28px 0 0;padding-left:20px;border-left:3px solid var(--color-primary)}
${N} .nw-pull p{margin:0;font-family:var(--nw-voice);font-style:italic;font-size:clamp(1.4rem,1.1rem + 1vw,1.9rem);line-height:1.25;color:var(--nw-ink)}
${N} .nw-pull cite{display:block;margin-top:10px;font-style:normal;font-size:15px;color:var(--nw-muted)}
@media (max-width:560px){${N} .nw-facts{grid-template-columns:minmax(0,1fr)}}

${N} .nw-accent-band{position:relative;isolation:isolate;display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);overflow:hidden;border-radius:40px;background:var(--color-primary);color:var(--color-text-on-primary)}
${N} .nw-accent-solo{grid-template-columns:minmax(0,1fr)}
${N} .nw-accent-band::after{content:"";position:absolute;inset:0;z-index:-1;background-image:var(--nw-grain);opacity:.35;mix-blend-mode:soft-light;pointer-events:none}
${N} .nw-accent-copy{display:flex;flex-direction:column;gap:18px;padding:clamp(32px,5vw,64px)}
${N} .nw-accent-copy .nw-title{margin:0}
${N} .nw-accent-copy .nw-title,${N} .nw-accent-copy .nw-title .mw-accent,${N} .nw-accent-copy p,${N} .nw-eyebrow-on{color:var(--color-text-on-primary)}
${N} .nw-eyebrow-on i{background:var(--color-text-on-primary)}
${N} .nw-accent-copy>p{margin:0;font-size:18px;line-height:1.6;opacity:.92}
${N} .nw-accent-copy .nw-actions{margin-top:4px}
${N} .nw-accent-copy .nw-btn-ink{background:var(--color-text-on-primary);color:var(--color-primary)}
${N} .nw-accent-copy .nw-btn-light{background:transparent;color:var(--color-text-on-primary);box-shadow:inset 0 0 0 1.5px var(--color-text-on-primary)}
${N} .nw-accent-photo{position:relative;min-height:320px}
${N} .nw-accent-photo img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
${N} .nw-cd{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}
${N} .nw-cd div{padding:10px 4px;border-radius:14px;text-align:center;background:color-mix(in srgb,var(--color-text-on-primary) 14%,transparent)}
${N} .nw-cd b{display:block;font-family:var(--nw-display);font-weight:700;font-size:26px;line-height:1}
${N} .nw-cd span{font-size:12px;opacity:.85}
@media (max-width:900px){${N} .nw-accent-band{grid-template-columns:minmax(0,1fr)}}

${N} .nw-events{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:20px;align-items:start}
${N} .nw-events-list{min-width:0}
${N} .nw-chiprow{display:flex;gap:8px;margin:0 0 18px;padding:0 0 2px;list-style:none;overflow-x:auto;scrollbar-width:none}
${N} .nw-chiprow li{flex:0 0 auto;display:inline-flex;align-items:center;gap:8px;height:40px;padding:0 16px;border-radius:999px;background:var(--nw-surface);box-shadow:inset 0 0 0 1px var(--nw-line);font-size:15px;color:var(--nw-muted)}
${N} .nw-chiprow li[data-all]{background:color-mix(in srgb,var(--color-primary) 14%,var(--nw-surface));box-shadow:inset 0 0 0 1.5px var(--color-primary);color:var(--nw-ink);font-weight:500}
${N} .nw-chiprow li i{width:9px;height:9px;border-radius:50%;background:var(--c)}
${N} .nw-chiprow small{padding:1px 7px;border-radius:999px;background:var(--nw-fill);font-size:12px;font-weight:600;color:var(--nw-muted)}
${N} .nw-chiprow li:has(button){padding:0}
${N} .nw-chiprow button{display:inline-flex;align-items:center;gap:8px;height:100%;padding:0 16px;border:0;border-radius:inherit;background:transparent;color:inherit;font:inherit;cursor:pointer}
${N} .nw-chiprow button:focus-visible,${N} .nw-month button:focus-visible,${N} .nw-count button:focus-visible{outline:2px solid var(--color-primary);outline-offset:3px}
${N} .nw-count{margin:-6px 4px 12px;font-size:14px;color:var(--nw-muted)}
${N} .nw-count button{margin-left:12px;border:0;background:transparent;color:var(--color-primary-strong);font:inherit;text-decoration:underline;cursor:pointer}
${N} .nw-day ol{display:flex;flex-direction:column;gap:8px;margin:0;padding:0;list-style:none}
${N} .nw-day-h{margin:14px 4px 6px;font-family:var(--nw-body);font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--color-primary-strong)}
${N} .nw-day:first-of-type .nw-day-h{margin-top:0}
${N} .nw-erow{display:grid;grid-template-columns:52px minmax(0,1fr) auto;gap:14px;align-items:center;padding:14px 16px;border-radius:20px;border-left:4px solid var(--c);background:var(--nw-surface);box-shadow:0 0 0 1px var(--nw-line)}
${N} .nw-erow .nw-date{width:52px;height:52px;border-radius:14px}
${N} .nw-erow .nw-date b{font-size:22px}
${N} .nw-erow-text b{display:block;margin-bottom:4px;font-weight:600;font-size:18px;line-height:1.2;color:var(--nw-ink)}
${N} .nw-erow-text small{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:14px;color:var(--nw-muted)}
${N} .nw-erow-text small span{display:inline-flex;align-items:center;gap:6px}
${N} .nw-erow-text small .nw-i{width:15px;height:15px;color:var(--color-primary-strong)}
${N} .nw-tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
${N} .nw-tag{display:inline-flex;align-items:center;gap:6px;padding:3px 9px;border-radius:999px;background:var(--nw-fill);font-size:12.5px;font-weight:600;color:var(--nw-ink)}
${N} .nw-tag-ch i{width:8px;height:8px;border-radius:50%;background:var(--c)}
${N} .nw-tag-quiet{background:var(--nw-sand);box-shadow:inset 0 0 0 1px var(--nw-sand-line)}
${N} .nw-erow-btn{min-height:44px;padding:0 16px;font-size:15px}
${N} .nw-more{display:flex;align-items:center;justify-content:space-between;width:100%;margin-top:12px;min-height:48px;padding:0 20px;border-radius:999px;background:var(--nw-surface);box-shadow:inset 0 0 0 1px var(--nw-line-strong);font-weight:500;color:var(--nw-ink);text-decoration:none;box-sizing:border-box}
${N} .nw-more small{font-size:15px;color:var(--nw-muted)}
${N} .nw-events-side{position:sticky;top:112px;display:flex;flex-direction:column;gap:14px}
${N} .nw-upnext{position:relative;overflow:hidden;isolation:isolate;padding:22px;border-radius:28px;background:var(--nw-ink);color:var(--nw-on-ink)}
${N} .nw-upnext::after{content:"";position:absolute;inset:0;z-index:-1;background-image:var(--nw-grain);opacity:.3;mix-blend-mode:soft-light;pointer-events:none}
${N} .nw-upnext-k{display:flex;align-items:center;gap:8px;font-size:14px;color:var(--nw-on-ink-muted)}
${N} .nw-upnext-k::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--nw-pop);animation:nw-pulse 2s infinite}
@keyframes nw-pulse{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--nw-pop) 60%,transparent)}100%{box-shadow:0 0 0 10px transparent}}
${N} .nw-upnext>b{display:block;margin:10px 0 4px;${DISPLAY};color:var(--nw-on-ink);font-size:26px;line-height:1.1}
${N} .nw-upnext>small{display:block;font-size:15px;color:var(--nw-on-ink-muted)}
${N} .nw-upnext .nw-cd{margin:16px 0}
${N} .nw-upnext .nw-cd div{background:var(--nw-c-chalk-08)}
${N} .nw-upnext .nw-cd span{color:var(--nw-on-ink-muted);opacity:1}
${N} .nw-upnext .hs-btn{width:100%;min-height:48px}
${N} .nw-month{padding:18px;border-radius:24px;background:var(--nw-sand);box-shadow:inset 0 0 0 1px var(--nw-sand-line)}
${N} .nw-month-name{display:block;margin-bottom:10px;${DISPLAY};font-size:20px;letter-spacing:-.02em;text-align:center}
${N} .nw-month-controls{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px}
${N} .nw-month-controls .nw-month-name{margin-bottom:0}
${N} .nw-month-controls button{display:grid;place-items:center;min-width:36px;min-height:36px;border:0;border-radius:12px;background:transparent;color:var(--nw-ink);cursor:pointer}
${N} button.nw-month-day{border:0;background:transparent;font-family:inherit;cursor:pointer}
${N} button.nw-month-day:disabled{cursor:default;opacity:.4}
${N} button.nw-month-day[aria-pressed="true"]{box-shadow:inset 0 0 0 2px var(--color-primary)}
${N} .nw-month-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:2px}
${N} .nw-month-dow{padding:4px 0;text-align:center;font-size:12px;font-weight:700;letter-spacing:.06em;color:var(--nw-muted)}
${N} .nw-month-day{position:relative;aspect-ratio:1;display:flex;align-items:center;justify-content:center;border-radius:12px;font-size:14.5px;font-weight:500;color:var(--nw-ink)}
${N} .nw-month-day[data-out]{color:var(--nw-subtle);opacity:.6}
${N} .nw-month-day[data-today]{background:var(--nw-ink);color:var(--nw-on-ink)}
${N} .nw-month-day[data-has]::after{content:"";position:absolute;bottom:5px;left:50%;width:5px;height:5px;margin-left:-2.5px;border-radius:50%;background:var(--color-primary)}
${N} .nw-month-day[data-today][data-has]::after{background:var(--nw-pop)}
${N} .nw-month-list{display:flex;flex-direction:column;gap:8px;margin-top:12px;padding-top:12px;border-top:1px solid var(--nw-sand-line)}
${N} .nw-month-list h4{margin:0 0 2px;font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--color-primary-strong)}
${N} .nw-month-list a{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:14px;border-left:4px solid var(--c);background:var(--nw-surface);box-shadow:0 0 0 1px var(--nw-line);color:var(--nw-ink);text-decoration:none}
${N} .nw-month-list a span{flex:1;min-width:0}
${N} .nw-month-list b{display:block;font-weight:600;font-size:15px;line-height:1.25}
${N} .nw-month-list small{font-size:13.5px;color:var(--nw-muted)}
@media (max-width:1020px){${N} .nw-events{grid-template-columns:minmax(0,1fr)}${N} .nw-events-side{position:static;order:-1;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr))}}
@media (max-width:640px){${N} .nw-erow{grid-template-columns:52px minmax(0,1fr)}${N} .nw-erow-btn{grid-column:1/-1;justify-self:stretch}}

${N} .nw-steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr));gap:14px;margin:0;padding:0;list-style:none}
${N} .nw-steps>li{display:flex;flex-direction:column;align-items:flex-start;padding:26px}
${N} .nw-step-n{display:flex;align-items:center;justify-content:center;width:44px;height:44px;margin-bottom:18px;border-radius:50%;background:var(--color-primary);color:var(--color-text-on-primary);font-family:var(--nw-display);font-weight:700;font-size:20px}
${N} .nw-steps h3{margin:0 0 8px;${DISPLAY};font-size:21px;line-height:1.15;letter-spacing:-.02em}
${N} .nw-steps p{margin:0;font-size:16px;line-height:1.55;color:var(--nw-muted)}
${N} .nw-step-btn{margin-top:18px;min-height:44px;padding:0 18px;font-size:15px}

${N} .nw-chips{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px;margin:0;padding:0;list-style:none}
${N} .nw-chip>a,${N} .nw-chip>div{display:flex;flex-direction:column;gap:4px;height:100%;min-height:168px;padding:18px 18px 16px;border-radius:24px;box-sizing:border-box;background:var(--nw-c-chalk-07);box-shadow:inset 0 0 0 1px var(--nw-c-chalk-12);color:var(--nw-on-ink);text-decoration:none;transition:transform ${EASE},background ${EASE}}
${N} .nw-chip>a:hover{transform:translateY(-2px);background:var(--nw-c-chalk-12)}
${N} .nw-chip-i{width:40px;height:40px;display:flex;align-items:center;justify-content:center;margin-bottom:14px;border-radius:14px;background:color-mix(in srgb,var(--c) 60%,transparent);color:var(--nw-on-ink)}
${N} .nw-chip b{font-weight:500;font-size:18px;color:var(--nw-on-ink)}
${N} .nw-chip span:not(.nw-chip-i){font-size:14px;line-height:1.35;color:var(--nw-on-ink-muted)}
${N} .nw-chip small{margin-top:auto;padding-top:8px;font-size:13px;font-weight:500;color:var(--nw-on-ink-muted)}
${N} .nw-chip[data-on]>a,${N} .nw-chip[data-on]>div{background:var(--nw-pop);box-shadow:none}
${N} .nw-chip[data-on] .nw-chip-i{background:var(--nw-c-chalk-22)}
${N} .nw-chip[data-on] b,${N} .nw-chip[data-on] span:not(.nw-chip-i),${N} .nw-chip[data-on] small{color:var(--nw-on-ink)}
@media (max-width:1100px){${N} .nw-chips{grid-template-columns:repeat(3,minmax(0,1fr))}}@media (max-width:600px){${N} .nw-chips{grid-template-columns:repeat(2,minmax(0,1fr))}}
${N} .nw-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:20px;margin:40px 0 0;padding:0;list-style:none}
${N} .nw-card-photo{overflow:hidden;border-radius:30px;display:flex;flex-direction:column}
${N} .nw-card-photo>a{display:flex;flex-direction:column;height:100%;color:inherit;text-decoration:none}
${N} .nw-card-im{display:block;aspect-ratio:4/3}
${N} .nw-card-im img{width:100%;height:100%;object-fit:cover;transition:transform var(--nw-dur-slow) var(--nw-ease)}
${N} .nw-card-photo:hover .nw-card-im img{transform:scale(1.035)}
${N} .nw-card-b{display:flex;flex-direction:column;gap:8px;padding:22px 24px 26px}
${N} .nw-card-k{display:inline-flex;align-items:center;gap:6px;font-size:15px;font-weight:500;color:var(--nw-muted)}
${N} .nw-card-k .nw-i{width:16px;height:16px;color:var(--color-primary-strong)}
${N} .nw-card-b h3{margin:0;${DISPLAY};font-size:clamp(1.4rem,1.25rem + .5vw,1.75rem);line-height:1.15}
${N} .nw-card-b p{margin:0;font-size:17px;line-height:1.55;color:var(--nw-muted)}
${N} .nw-notes{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:14px;margin:clamp(24px,3vw,36px) 0 0;padding:0;list-style:none}
${N} .nw-note{display:flex;flex-direction:column;gap:10px;padding:28px;border-radius:28px;background:var(--nw-sand);box-shadow:inset 0 0 0 1px var(--nw-sand-line)}
${N} .nw-band-ink .nw-note{background:var(--nw-c-chalk-06);box-shadow:inset 0 0 0 1px var(--nw-c-chalk-14)}
${N} .nw-note-i{width:48px;height:48px;display:flex;align-items:center;justify-content:center;margin-bottom:6px;border-radius:16px;background:var(--nw-pop);color:var(--nw-on-ink)}
${N} .nw-note h3{margin:0;${DISPLAY};font-size:clamp(1.4rem,1.25rem + .5vw,1.75rem)}
${N} .nw-band-ink .nw-note h3{color:var(--nw-on-ink)}
${N} .nw-note p{margin:0;font-size:17px;line-height:1.55;color:var(--nw-muted)}
${N} .nw-band-ink .nw-note p{color:var(--nw-c-chalk-82)}

${N} .nw-circles{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr));gap:18px;margin:0;padding:0;list-style:none}
${N} .nw-circle{display:flex;flex-direction:column;align-items:flex-start;gap:8px;overflow:hidden;padding:26px 24px 22px;border-radius:28px;box-shadow:0 0 0 1px var(--nw-sand-line),0 18px 36px -30px var(--nw-c-shade-40);transition:transform .25s cubic-bezier(.2,.8,.2,1),box-shadow .25s}
${N} .nw-circle::before{content:"";position:absolute;right:-60px;top:-60px;width:180px;height:180px;border-radius:50%;background:color-mix(in srgb,var(--c) 14%,transparent);transition:transform .4s}
${N} .nw-circle::after{content:"";position:absolute;left:0;top:0;bottom:0;width:6px;background:var(--c)}
${N} .nw-circle:hover{transform:translateY(-4px)}
${N} .nw-circle:hover::before{transform:scale(1.25)}
${N} .nw-circle>*{position:relative}
${N} .nw-circle-i{width:56px;height:56px;display:flex;align-items:center;justify-content:center;margin-bottom:6px;border-radius:18px;background:color-mix(in srgb,var(--c) 16%,var(--nw-surface));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--c) 30%,transparent);color:var(--nw-ink)}
${N} .nw-circle-i .nw-i{width:26px;height:26px}
${N} .nw-circle h3{margin:0;${DISPLAY};font-size:21px;line-height:1.15;letter-spacing:-.02em}
${N} .nw-circle p{margin:0 0 6px;font-size:16px;line-height:1.5;color:var(--nw-muted)}
${N} .nw-circle small{font-size:14.5px;color:var(--nw-ink)}
${N} .nw-next{display:inline-flex;align-items:center;gap:6px;margin-top:auto;padding-top:12px;font-size:15px;font-weight:600;color:var(--color-primary-strong);text-decoration:none}
${N} .nw-next .nw-arr{width:16px;height:16px}

${N} .nw-founder{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:clamp(32px,5vw,80px);align-items:center}
${N} .nw-founder-q{margin:18px 0 0;${DISPLAY};font-size:clamp(1.6rem,1.2rem + 1.4vw,2.4rem);line-height:1.3;letter-spacing:-.015em}
${N} .nw-hosts{display:flex;flex-wrap:wrap;gap:20px 28px;margin:32px 0 0;padding:0;list-style:none}
${N} .nw-hosts li{display:flex;align-items:center;gap:14px}
${N} .nw-hosts img{width:56px;height:56px;border-radius:50%;object-fit:cover;object-position:50% 15%}
${N} .nw-hosts b{display:block;font-weight:500;color:var(--nw-ink)}
${N} .nw-hosts small{display:block;font-size:15px;color:var(--nw-muted)}
@media (max-width:900px){${N} .nw-founder{grid-template-columns:minmax(0,1fr)}}
${N} .nw-block-team .nw-photo{aspect-ratio:4/5;max-height:620px}
${N} .nw-pillars{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));margin:28px 0 0;padding:0;list-style:none;border-radius:28px;overflow:hidden;box-shadow:0 0 0 1px var(--nw-line)}
${N} .nw-pillars li{padding:26px;background:var(--nw-surface);border-left:1px solid var(--nw-line)}
${N} .nw-pillars li:first-child{border-left:0}
${N} .nw-pillars h3{margin:0 0 8px;${DISPLAY};font-size:24px}
${N} .nw-pillars p{margin:0;font-size:16px;line-height:1.55;color:var(--nw-muted)}
@media (max-width:860px){${N} .nw-pillars{grid-template-columns:minmax(0,1fr)}${N} .nw-pillars li{border-left:0;border-top:1px solid var(--nw-line)}${N} .nw-pillars li:first-child{border-top:0}}
${N} .nw-quote{max-width:900px;margin:clamp(48px,6vw,80px) auto 0;text-align:center}
${N} .nw-quote blockquote{margin:0;font-family:var(--nw-voice);font-style:italic;font-size:clamp(1.8rem,1.2rem + 2vw,3rem);line-height:1.2;color:var(--nw-ink)}
${N} .nw-quote figcaption{margin-top:16px;color:var(--nw-muted)}

${N} .nw-mem{position:relative;padding:clamp(40px,6vw,80px) clamp(24px,5vw,64px);border-radius:40px;background:var(--nw-sand);box-shadow:inset 0 0 0 1px var(--nw-sand-line)}
${N} .nw-mem .nw-head{margin-bottom:40px}
${N} .nw-tiers{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.18fr) minmax(0,1fr);gap:16px;align-items:center;margin:0;padding:0;list-style:none}
${N} .nw-tier{position:relative;display:flex;flex-direction:column;gap:10px;height:100%;padding:30px;box-sizing:border-box;border-radius:30px;background:var(--nw-surface);box-shadow:0 0 0 1px var(--nw-sand-line),0 24px 40px -32px var(--nw-c-shade-35)}
${N} .nw-tier:last-child{background:color-mix(in srgb,var(--nw-pop3) 9%,var(--nw-surface));box-shadow:0 0 0 1px color-mix(in srgb,var(--nw-pop3) 30%,transparent),0 24px 40px -32px var(--nw-c-shade-35)}
${N} .nw-tier[data-featured]{z-index:1;height:calc(100% + 40px);padding:40px 36px;background:linear-gradient(160deg,color-mix(in srgb,var(--color-primary) 22%,var(--nw-ink)),var(--nw-ink) 60%);color:var(--nw-on-ink);box-shadow:0 30px 60px -30px var(--nw-c-shade-60)}
${N} .nw-tier-i{width:44px;height:44px;display:flex;align-items:center;justify-content:center;border-radius:14px;background:var(--nw-fill);color:var(--color-primary-strong)}
${N} .nw-tier:last-child .nw-tier-i{background:color-mix(in srgb,var(--nw-pop3) 20%,var(--nw-surface));color:var(--nw-ink)}
${N} .nw-tier[data-featured] .nw-tier-i{background:var(--color-primary);color:var(--color-text-on-primary)}
${N} .nw-tier h3{margin:0;font-family:var(--nw-body);font-size:20px;font-weight:600;color:inherit}
${N} .nw-price{margin:0;${DISPLAY};color:inherit;font-size:44px;line-height:1;letter-spacing:-.03em}
${N} .nw-tier[data-featured] .nw-price{font-size:56px}
${N} .nw-price small{font-family:var(--nw-body);font-size:17px;font-weight:400;letter-spacing:0;color:var(--nw-muted)}
${N} .nw-tier-tag{margin:0;font-size:17px;color:var(--nw-muted)}
${N} .nw-tier[data-featured] .nw-tier-tag,${N} .nw-tier[data-featured] .nw-price small,${N} .nw-tier[data-featured] .nw-checks{color:var(--nw-c-chalk-88)}
${N} .nw-checks{display:flex;flex-direction:column;gap:8px;margin:8px 0 18px;padding:0;list-style:none;font-size:16px;color:var(--nw-muted)}
${N} .nw-checks li{display:flex;gap:10px}
${N} .nw-checks .nw-i{width:16px;height:16px;margin-top:4px;color:var(--color-primary-strong)}
${N} .nw-tier[data-featured] .nw-checks .nw-i{color:var(--color-primary)}
${N} .nw-tier-btn{margin-top:auto;align-self:stretch;justify-content:center}
${N} .nw-badge{align-self:flex-start;padding:5px 12px;border-radius:999px;background:var(--color-primary-bg);color:var(--color-primary-strong);font-size:14px;font-weight:500}

${N} .nw-footnote{text-align:center;margin-top:56px}
@media (max-width:900px){${N} .nw-tiers{grid-template-columns:minmax(0,1fr);align-items:stretch}${N} .nw-tier[data-featured]{height:auto}}

${N} .nw-offers{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:14px;margin:0;padding:0;list-style:none}
${N} .nw-offer{display:flex;flex-direction:column;gap:10px;padding:28px;border-radius:28px;background:var(--nw-surface);box-shadow:var(--nw-lift-sm),0 0 0 1px color-mix(in srgb,var(--nw-ink) 6%,transparent)}
${N} .nw-offer h3{margin:0;${DISPLAY};font-size:clamp(1.4rem,1.25rem + .5vw,1.75rem)}
${N} .nw-offer p{margin:0;font-size:16px;line-height:1.55;color:var(--nw-muted)}
${N} .nw-offer .nw-price{font-size:44px;line-height:1;color:inherit}
${N} .nw-offer .nw-price small{font-size:16px}
${N} .nw-offer[data-featured]{background:var(--nw-ink);color:var(--nw-on-ink)}
${N} .nw-offer[data-featured] h3{color:var(--nw-on-ink)}
${N} .nw-offer[data-featured] p,${N} .nw-offer[data-featured] .nw-price small{color:var(--nw-on-ink-muted)}
${N} .nw-offer-btn{margin-top:auto;align-self:flex-start;min-height:44px;padding:0 18px;font-size:15px}

${N} .nw-pods{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:20px;margin:0;padding:0;list-style:none}
${N} .nw-pod>a{display:block;overflow:hidden;border-radius:26px;background:var(--nw-c-chalk-06);box-shadow:inset 0 0 0 1px var(--nw-c-chalk-10);color:var(--nw-on-ink);text-decoration:none}
${N} .nw-pod-im{position:relative;display:block;aspect-ratio:16/9;background:var(--nw-fill)}
${N} .nw-pod-im img{width:100%;height:100%;object-fit:cover}
${N} .nw-play{position:absolute;left:16px;bottom:16px;width:48px;height:48px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:var(--nw-surface);box-shadow:var(--nw-lift-sm)}
${N} .nw-play::after{content:"";margin-left:3px;border-left:13px solid var(--nw-ink);border-top:8px solid transparent;border-bottom:8px solid transparent}
${N} .nw-pod b{display:block;padding:16px 18px;font-weight:500}

${N} .nw-posts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:0;padding:0;list-style:none}
${N} .nw-post{overflow:hidden;border-radius:24px;aspect-ratio:1;box-shadow:none}
${N} .nw-post>a{display:flex;flex-direction:column;justify-content:flex-end;height:100%;color:inherit;text-decoration:none}
${N} .nw-post-im{position:absolute;inset:0}
${N} .nw-post-im img{width:100%;height:100%;object-fit:cover}
${N} .nw-post-mark{position:absolute;left:18px;top:18px;width:40px;height:40px;display:flex;align-items:center;justify-content:center;border-radius:12px;background:var(--nw-sand);color:var(--color-primary-strong)}
${N} .nw-post p{position:relative;margin:0;padding:18px;font-size:15px;line-height:1.45;color:var(--nw-ink)}
${N} .nw-post-im+p{color:var(--nw-c-chalk);background:linear-gradient(to top,var(--nw-c-soot-78),transparent);padding-top:40px}
@media (max-width:900px){${N} .nw-posts{grid-template-columns:repeat(2,minmax(0,1fr))}}

${N} .nw-merch{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin:0;padding:0;list-style:none}
${N} .nw-product{display:flex;flex-direction:column;overflow:hidden;border-radius:26px}
${N} .nw-product-im{display:block;aspect-ratio:1;overflow:hidden;background:var(--nw-sand)}
${N} .nw-product-im img{width:100%;height:100%;object-fit:cover}
${N} .nw-product-b{display:flex;flex-direction:column;align-items:flex-start;gap:4px;padding:16px 18px 18px}
${N} .nw-product-b b{font-weight:600;font-size:16px;line-height:1.3;color:var(--nw-ink)}
${N} .nw-product-b small{font-size:14px;color:var(--nw-muted)}
${N} .nw-product-price{display:block;${DISPLAY};font-size:22px;letter-spacing:0}
${N} .nw-product-btn{margin-top:10px;min-height:44px;padding:0 18px;font-size:15px}
@media (max-width:900px){${N} .nw-merch{grid-template-columns:repeat(2,minmax(0,1fr))}}

${N} .nw-coffee{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:20px;align-items:stretch}
${N} .nw-coffee-card{display:flex;flex-direction:column;gap:16px;padding:clamp(28px,4vw,48px);border-radius:36px;background:var(--nw-sand);box-shadow:inset 0 0 0 1px var(--nw-sand-line)}
${N} .nw-coffee-card .nw-photo{aspect-ratio:16/10;border-radius:24px;box-shadow:none}
${N} .nw-coffee-card .nw-photo img{object-position:50% 30%}
${N} .nw-coffee-card .nw-title{margin:0}
${N} .nw-coffee-card .nw-body{margin:0}
${N} .nw-coffee-card .nw-actions{margin-top:4px}
${N} .nw-hand{margin:0;font-family:var(--nw-hand);font-weight:700;font-size:34px;line-height:1;color:var(--color-primary-strong)}
${N} .nw-reach{display:flex;flex-direction:column;gap:12px;padding:clamp(28px,4vw,48px);border-radius:36px}
${N} .nw-reach .nw-title{margin:0}
${N} .nw-reach .nw-body{margin:0}
${N} .nw-routes{display:flex;flex-direction:column;gap:10px;margin:8px 0 0;padding:0;list-style:none}
${N} .nw-routes a{display:flex;align-items:center;gap:14px;min-height:56px;padding:0 18px;border-radius:18px;background:var(--nw-paper);box-shadow:inset 0 0 0 1px var(--nw-line);font-size:17px;color:var(--nw-ink);text-decoration:none;transition:box-shadow ${EASE}}
${N} .nw-routes a:hover{box-shadow:inset 0 0 0 2px var(--color-primary)}
${N} .nw-route-i{width:36px;height:36px;display:flex;align-items:center;justify-content:center;border-radius:12px;background:var(--color-primary-bg);color:var(--color-primary-strong)}
${N} .nw-route-i .nw-i{width:18px;height:18px}
${N} .nw-reach .nw-actions{margin-top:auto;padding-top:8px}
@media (max-width:900px){${N} .nw-coffee{grid-template-columns:minmax(0,1fr)}}
@media (prefers-reduced-motion:reduce){${N} .nw-upnext-k::before{animation:none}${N} .nw-circle,${N} .nw-circle::before,${N} .nw-card-im img,${N} .nw-chip>a,${N} .nw-arr{transition:none}}
`

/** The Network SECTIONS for a site on another theme (NETWORK_ISLAND_TOKENS_CSS): the section rules above,
 *  re-scoped from the Network site root to a section's own `data-nw-island` root, with the island tokens.
 *  The site page and the editor canvas add it only when a page carries a Network section and the site does
 *  not wear Network, so no other page pays for it. */
const ISLAND = '[data-nw-island]:not([data-house-theme="network"] *)'
export const NETWORK_BLOCK_CSS = `${NETWORK_ISLAND_TOKENS_CSS}
${NETWORK_CSS.split('\n')
  .filter((line) => /\.nw-|data-mw-own|@keyframes nw-/.test(line))
  .map((line) => line.replaceAll(M, ISLAND).replaceAll(N, ISLAND)
    // The island IS the section root, which carries .nw-block, .nw-block-<name> and the band classes itself.
    .replaceAll(`${ISLAND} .nw-block`, `${ISLAND}.nw-block`).replaceAll(`${ISLAND} .nw-band`, `${ISLAND}.nw-band`)
    // The full-bleed wrapper the site page puts around a Network section sits outside the island; only Network
    // sections plan as that kind (lib/sites/menswork-page.ts), so its rules need no theme scope.
    .replaceAll(`${ISLAND} [data-mw-own]`, '[data-mw-own]'))
  .join('\n')}`

/** Does a page document carry a Network section anywhere (nested slots included)? */
export function docHasNetworkBlocks(doc: unknown): boolean {
  return /"type":"Network[A-Z]/.test(JSON.stringify(doc ?? null))
}
