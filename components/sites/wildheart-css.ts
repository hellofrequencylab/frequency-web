import { WILDHEART_TOKENS_CSS } from '@/lib/theme/wildheart'

// THE WILDHEART WEBSITE SKIN (lib/theme/wildheart.ts). Layered AFTER HOUSE_CSS and FREQUENCY_PAGE_CSS on a
// website whose Space wears the Wildheart theme, and scoped under [data-house-theme="wildheart"], so every
// house section and site page section keeps its markup and content and only its look changes. Reads
// `--wh-*` and DAWN tokens only: EVERY VALUE lives in the one token block (WILDHEART_TOKENS_CSS) and the
// theme-contract entry, so a token round (tokens-v3) is a values-only change that never touches this sheet.
//
// The rules, from the design system: parchment grounds with grain and washes; petal corners (14 / 24 / 40,
// one tucked bottom-right corner) on buttons, cards and inputs; pills for tags; arches for photos; circles
// only for people, moons and seals; hairlines and one soft shadow, the violet aura for hover, focus and
// "now"; IM Fell English display in sentence case, italic for emphasis, never bold; EB Garamond body;
// Hanken Grotesk labels in tracked caps; every symbol in the one violet ink through the ink-bleed filter;
// breath-paced motion with no bounce and nothing under reduced motion.
//
// Tokens-v3 (the pass-1 component states and the petal rule): every control has rest, hover, focus, pressed
// and disabled. Focus is one rule everywhere, `--wh-ring-focus` (a 2px halo in the surface colour, then a 2px
// violet ring), never an outline. Hover adds the aura, or for a link card the lift shadow and a 2px rise.
// Pressed is flat (the pressed violet, the lavender, the aged ground) and never scales. Disabled is aged with
// muted text and no shadow. An invalid field borrows the madder danger token. The petal radius follows the
// element's HEIGHT, never its name: under 44px sm (buttons, the default input, rows, menu links), 44 to 120px
// md (text areas, cards, panels of a few lines), over 120px lg (hero cards, the start card, bands, sheets).
// Headline colour is `--wh-witch` (nightshade in light, moon-white in Nightshade), so the dark mode is one
// token block and this sheet never changes.

const W = '[data-house-theme="wildheart"]'
// The page sections' sheet (FREQUENCY_PAGE_CSS) is scoped `[data-house-site]:not([data-house-theme="menswork"])`, two
// attributes deep; the rules that re-dress those sections carry the site root too, so they outrank it without
// `!important`.
const M = '[data-house-site][data-house-theme="wildheart"]'

const LABEL = 'font-family:var(--wh-ui);font-weight:500;font-size:12px;letter-spacing:var(--wh-tracking-label);text-transform:uppercase;line-height:16px'
const DISPLAY = 'font-family:var(--wh-display);font-weight:400;text-transform:none;letter-spacing:var(--wh-tracking-display);font-style:normal'
const UI = 'font-family:var(--wh-ui);font-weight:500;font-size:15px;line-height:20px;letter-spacing:0;text-transform:none'
const CARD = 'background:var(--wh-wash-violet),var(--wh-grain),var(--wh-gradient-vellum);border:1px solid var(--wh-hairline);box-shadow:var(--wh-shadow-soft)'
const EASE = 'var(--wh-dur-base) var(--wh-ease)'

export const WILDHEART_CSS = `${WILDHEART_TOKENS_CSS}
${W}{--hs-serif:var(--wh-display);--hs-sans:var(--wh-body);font-family:var(--wh-body);font-size:19px;line-height:1.65;color:var(--color-text);background:var(--wh-page)}
html:has(${W}),body:has(${W}){background:var(--wh-parchment)}
${W} ::selection{background:var(--wh-lavender);color:var(--wh-witch)}
${W} :focus-visible{outline:none;box-shadow:var(--wh-ring-focus)}
${W} main [class*="shadow"]{box-shadow:var(--wh-shadow-soft)}
${W} em,${W} i{font-style:italic;color:var(--color-primary-strong)}
${W} strong,${W} b{font-weight:500}

${W} .hs-serif,${W} .hs-h1,${W} .hs-h2,${W} .hs-brand{${DISPLAY};color:var(--wh-witch)}
${W} .hs-h1{font-size:clamp(3.4rem,8vw,6.75rem);line-height:1;text-shadow:none}
${W} .hs-h2{font-size:clamp(2.375rem,5vw,3.375rem);line-height:1.04}
${W} .hs-accent{font-style:italic;font-weight:400;color:var(--color-primary-strong)}
${W} .hs-eyebrow{${LABEL};gap:10px;color:var(--color-text-muted)}
${W} .hs-eyebrow::before{content:"";flex:none;width:6px;height:6px;border-radius:50%;background:var(--wh-symbol-ink)}
${W} .hs-lead{font-size:1.3rem;line-height:1.6;color:var(--color-text-muted);max-width:64ch}
${W} .hs-muted{color:var(--color-text-muted)}
${W} .hs-center{align-items:flex-start;text-align:left}
${W} .hs-section{max-width:1200px;padding-bottom:clamp(64px,8vw,96px)}
${W} .hs-section-first{padding-top:clamp(64px,8vw,96px)}
${W} .hs-wide{max-width:1200px;padding-bottom:clamp(64px,8vw,96px)}
${W} .hs-split{gap:clamp(32px,6vw,96px)}
${W} .hs-stack{gap:24px}

${W} .hs-btn{position:relative;border-radius:var(--wh-petal-sm);${UI};border:var(--wh-border-w) solid transparent;box-shadow:none;transform:none;transition:background ${EASE},color ${EASE},box-shadow ${EASE},border-color ${EASE}}
${W} .hs-btn-primary{height:var(--wh-control-lg);padding:0 26px;background:var(--wh-gradient-violet);color:var(--color-text-on-primary)}
${W} .hs-btn-primary:hover{background:var(--wh-gradient-violet);color:var(--color-text-on-primary);box-shadow:var(--wh-aura)}
${W} .hs-btn-primary:active{background:var(--wh-gradient-violet-pressed);box-shadow:none;transform:none}
${W} :is(.hs-btn-glass,.hs-btn-light,.hs-btn-soft){height:var(--wh-control-lg);padding:0 24px;background:var(--wh-gradient-lavender);border-color:transparent;color:var(--color-primary-strong);-webkit-backdrop-filter:none;backdrop-filter:none;box-shadow:none}
${W} :is(.hs-btn-glass,.hs-btn-light,.hs-btn-soft):hover{background:var(--wh-gradient-lavender);color:var(--color-primary-strong);box-shadow:var(--wh-aura)}
${W} :is(.hs-btn-glass,.hs-btn-light,.hs-btn-soft):active{background:var(--wh-lavender);box-shadow:none;transform:none}
${W} .hs-btn-dark{height:var(--wh-control-md);padding:0 clamp(14px,3vw,20px);font-size:clamp(13px,3.5vw,15px);background:var(--wh-gradient-violet);color:var(--color-text-on-primary)}
${W} .hs-btn-dark:hover{background:var(--wh-gradient-violet);color:var(--color-text-on-primary);box-shadow:var(--wh-aura)}
${W} .hs-btn-dark:active{background:var(--wh-gradient-violet-pressed);box-shadow:none;transform:none}
${W} .hs-btn:focus-visible{outline:none;box-shadow:var(--wh-ring-focus)}
${W} :is(.hs-btn-primary,.hs-btn-dark):focus-visible{box-shadow:var(--wh-ring-focus),var(--wh-aura)}
${W} .hs-btn:is(:disabled,[aria-disabled="true"]){background:var(--wh-aged);color:var(--wh-muted);border-color:var(--wh-hairline);box-shadow:none;cursor:not-allowed;pointer-events:none}
${W} .hs-btn svg{transition:transform ${EASE}}
${W} .hs-btn:hover svg{transform:translateX(3px)}
${W} .hs-dot{width:8px;height:8px;border-radius:50%;background:var(--wh-season);animation:wh-breathe var(--wh-breath) var(--wh-ease) infinite}
@keyframes wh-breathe{0%,100%{opacity:.55}50%{opacity:1}}

${W} .hs-header{padding:0;background:color-mix(in srgb,var(--wh-parchment) 92%,transparent);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);border-bottom:1px solid var(--wh-hairline)}
${W} .hs-pill{display:flex;justify-content:space-between;gap:16px;overflow:visible;max-width:1200px;min-height:72px;padding:0 clamp(16px,3vw,48px);border-radius:0;background:transparent;-webkit-backdrop-filter:none;backdrop-filter:none;box-shadow:none;animation:none}
${W} .hs-brand{display:inline-flex;padding-left:0;align-items:center;gap:10px;font-size:clamp(22px,5vw,28px);line-height:1;letter-spacing:.02em;color:var(--wh-witch)}
${W} .hs-logo{height:clamp(32px,6vw,46px);width:auto;filter:none}
${W} .hs-brand-name{font-family:var(--wh-display)}
${W} .hs-nav{display:none;align-self:stretch;overflow:visible;-webkit-mask-image:none;mask-image:none}
${W} .hs-nav-track{height:100%;align-items:stretch;gap:24px;width:auto;margin:0;padding:0}
@media (min-width:940px){${W} .hs-nav{display:flex}}
${W} .hs-nav a{${LABEL};display:flex;align-items:center;padding:0;border-radius:0;border-bottom:1.5px solid transparent;color:var(--color-text-muted);transition:color ${EASE},border-color ${EASE}}
${W} .hs-nav a:hover,${W} .hs-nav a[aria-current="page"]{background:transparent;color:var(--wh-witch);border-image:var(--wh-gradient-violet) 1;border-bottom-color:var(--color-primary)}
${W} .hs-member{${LABEL};font-size:11px;padding:8px 14px;border-radius:var(--wh-pill);border:1px solid var(--wh-hairline);background:var(--wh-gradient-vellum);color:var(--color-text-muted);transition:color ${EASE},box-shadow ${EASE}}
${W} .hs-member:hover{color:var(--color-primary-strong);border-color:var(--wh-border-strong);box-shadow:var(--wh-aura)}
${W} .hs-member:active{background:var(--wh-aged);box-shadow:none}
${W} .hs-logo-avatar{border-radius:50%;box-shadow:0 0 0 1.5px var(--wh-symbol-line-soft)}
${W} .hs-logo-image{border-radius:0;box-shadow:none}
${W} .hs-header-actions{gap:10px}
${W} .hs-nav-mega{${LABEL};padding:0;border-radius:0;border-bottom:1.5px solid transparent;color:var(--color-text-muted);transition:color ${EASE},border-color ${EASE}}
${W} .hs-nav-mega:hover,${W} .hs-nav-mega[aria-expanded="true"]{background:transparent;color:var(--wh-witch);border-bottom-color:var(--color-primary)}
${W} .hs-mega{padding:0}
${W} .hs-mega-panel{max-width:none;padding:20px clamp(16px,3vw,48px);border-radius:0 0 var(--wh-petal-md) var(--wh-petal-md);${CARD};-webkit-backdrop-filter:none;backdrop-filter:none}
${W} .hs-mega-links a{border-radius:var(--wh-petal-sm);padding:12px 10px}
${W} .hs-mega-links a:hover{background:var(--wh-mist);color:var(--color-primary-strong)}
${W} .hs-mega-label{${DISPLAY};font-size:22px;color:var(--wh-witch)}
${W} .hs-mega-desc{font-size:15px;color:var(--color-text-muted)}
${W} .hs-mega-feature{border-radius:var(--wh-arch)}
${W} .hs-mega-feature-shade{background:var(--wh-veil)}
${W} .hs-mega-feature-title{${DISPLAY};font-size:24px;color:var(--wh-witch)}
${W} .hs-mega-feature-desc{${LABEL};font-size:11px;color:var(--color-text-muted)}
${W} .hs-menu-button{width:44px;height:44px;border-radius:var(--wh-pill);background:var(--wh-gradient-vellum);border:1px solid var(--wh-hairline);color:var(--wh-witch)}
${W} .hs-menu-panel{top:72px;left:0;right:0;max-width:none;padding:8px clamp(16px,3vw,24px) 16px;border-radius:0 0 var(--wh-petal-md) var(--wh-petal-md);${CARD};-webkit-backdrop-filter:none;backdrop-filter:none}
${W} .hs-menu-panel a{${DISPLAY};font-size:26px;padding:14px 4px;border-radius:0;border-bottom:1px solid var(--wh-hairline);color:var(--wh-witch)}
${W} .hs-menu-panel a:last-child{border-bottom:0}
${W} .hs-menu-panel a:hover{color:var(--color-primary-strong)}
${W} .hs-menu{gap:0}

${W} .hs-hero{margin-top:0;min-height:0;flex-direction:column;align-items:stretch;background:transparent;color:var(--color-text)}
${W} .hs-hero-photo{position:relative;inset:auto;order:2;width:calc(100% - 2 * clamp(20px,4vw,48px));max-width:1200px;margin:0 auto;height:clamp(280px,42vw,540px);border-radius:var(--wh-arch);overflow:hidden;box-shadow:var(--wh-shadow-soft);filter:none}
${W} .hs-hero-photo::after{content:"";position:absolute;inset:0;background:var(--wh-grain);pointer-events:none}
${W} .hs-hero-wash,${W} .hs-hero-side{display:none}
${W} .hs-hero-grid{order:1;max-width:1200px;padding:clamp(48px,7vw,96px) clamp(20px,4vw,48px) 48px}
${W} .hs-hero-copy{gap:24px;max-width:52rem}
${W} .hs-hero .hs-h1{font-size:clamp(4rem,9vw,6.75rem);color:var(--wh-witch)}
${W} .hs-hero-pill{${LABEL};gap:10px;padding:8px 16px;border-radius:var(--wh-pill);background:var(--wh-gradient-vellum);border:1px solid var(--wh-hairline);-webkit-backdrop-filter:none;backdrop-filter:none;color:var(--color-text-muted)}
${W} .hs-hero-pill:hover{background:var(--wh-gradient-vellum);color:var(--color-primary-strong);border-color:var(--wh-border-strong);box-shadow:var(--wh-aura)}
${W} .hs-hero-pill:active{background:var(--wh-aged);box-shadow:none}
${W} .hs-hero-lede{max-width:36em;font-size:clamp(1.2rem,1.6vw,1.3rem);line-height:1.6;color:var(--color-text-muted)}
${W} .hs-hero-actions{gap:12px}
${W} .hs-start{padding:28px;border-radius:var(--wh-petal-lg);${CARD};-webkit-backdrop-filter:none;backdrop-filter:none}
${W} .hs-start-who img{border-radius:50%;box-shadow:0 0 0 1.5px var(--wh-symbol-line-soft)}
${W} .hs-start .hs-serif{font-size:1.75rem!important;line-height:1.1}
${W} .hs-start-row{border-radius:var(--wh-petal-sm);background:var(--wh-gradient-lavender);color:var(--color-primary-strong);font-family:var(--wh-ui);transition:box-shadow ${EASE}}
${W} .hs-start-row:hover{background:var(--wh-gradient-lavender);color:var(--color-primary-strong);box-shadow:var(--wh-aura)}
${W} .hs-start-row:active{background:var(--wh-lavender)}

${W} .hs-sign{padding:20px 24px;border-radius:var(--wh-petal-md);${CARD};font-size:1.05rem;line-height:1.5}
${W} .hs-sign::before{display:none}
${W} .hs-pull{margin-top:20px;padding-left:20px;border-left:1.5px solid var(--wh-symbol-line);font-family:var(--wh-display);font-style:italic;font-weight:400;font-size:1.5rem;line-height:1.35;color:var(--wh-witch)}

${W} .hs-panel{border-radius:var(--wh-petal-lg);${CARD};padding:clamp(40px,6vw,88px) clamp(24px,5vw,72px)}
${W} .hs-panel .hs-lead{text-align:left!important;margin:-24px 0 48px!important;max-width:64ch!important}
${W} .hs-panel:has(.hs-steps){background:transparent;border:0;box-shadow:none;padding:0}
${W} .hs-steps{grid-template-columns:repeat(auto-fit,minmax(min(100%,160px),1fr));gap:24px}
${W} .hs-step{position:relative;padding:24px;border-radius:var(--wh-petal-md);${CARD}}
${W} .hs-step-n{${DISPLAY};font-style:italic;font-size:1.5rem;color:var(--wh-symbol-ink)}
${W} .hs-step h3{margin:8px 0 0;${DISPLAY};font-size:1.5rem;line-height:1.1;color:var(--wh-witch)}
${W} .hs-step p{margin-top:10px;font-size:1rem;line-height:1.55;color:var(--color-text-muted)}

${W} .hs-photo{border-radius:var(--wh-arch);box-shadow:var(--wh-shadow-soft);background:var(--wh-aged)}
${W} .hs-photo img{filter:sepia(.08) saturate(.95)}
${W} .hs-photo::after{content:"";position:absolute;inset:0;background:var(--wh-grain);pointer-events:none}
${W} .hs-quote{padding-left:20px;border-left:1.5px solid var(--wh-symbol-line);font-family:var(--wh-display);font-style:italic;font-weight:400;font-size:1.6rem;line-height:1.3;color:var(--wh-witch)}
${W} .hs-facts{display:flex;flex-wrap:wrap;gap:12px;padding-top:20px}
${W} .hs-facts>div{flex:1 1 120px;min-height:88px;justify-content:space-between;padding:16px 20px;border-radius:var(--wh-petal-md);${CARD}}
${W} .hs-fact-v{${DISPLAY};font-style:italic;font-size:clamp(1.8rem,2.6vw,2.25rem);line-height:1;color:var(--wh-symbol-ink)}
${W} .hs-fact-l{${LABEL};font-size:11px;line-height:1.4;color:var(--color-text-muted)}
${W} .hs-photo-tall{border-radius:var(--wh-arch)}
${W} .hs-photo-col .hs-pull{padding:0 0 0 20px}
${W} .hs-stats{gap:16px}
${W} .hs-stats-grid{gap:16px}
${W} .hs-stat{padding:20px 24px;border-radius:var(--wh-petal-md);${CARD}}
${W} .hs-stat-v{${DISPLAY};font-style:italic;font-size:clamp(2.2rem,4vw,3.5rem);line-height:1;letter-spacing:0;color:var(--wh-symbol-ink)}
${W} .hs-stat-l{${LABEL};font-size:11px;line-height:1.5;color:var(--color-text-muted)}
${W} .hs-hero-form .hs-hero-pill{${LABEL};padding:8px 16px}
${W} .hs-hero-form .hs-h1{font-size:clamp(3.2rem,8vw,6rem)}
${W} .hs-hero-card{filter:none;border-radius:var(--wh-petal-lg)}
${W} .hs-hero-form .hs-hero-grid{padding-top:clamp(64px,8vw,96px)}

${W} .hs-cards{gap:clamp(16px,2vw,24px)}
${W} .hs-card{position:relative;gap:14px;padding:clamp(24px,3vw,36px);border-radius:var(--wh-petal-md);${CARD};transition:box-shadow ${EASE},border-color ${EASE},transform ${EASE}}
${W} .hs-cards .hs-card:hover{box-shadow:var(--wh-shadow-lift);transform:translateY(calc(var(--wh-hover-rise) * -1))}
${W} .hs-cards .hs-card:active{box-shadow:var(--wh-shadow-soft);transform:none}
${W} .hs-cards .hs-card:focus-within{box-shadow:var(--wh-ring-focus),var(--wh-shadow-soft)}
${W} .hs-card h3{${DISPLAY};font-size:clamp(1.6rem,2.4vw,2.1rem);line-height:1.1;color:var(--wh-witch)}
${W} .hs-card p{font-size:1.05rem;line-height:1.6;color:var(--color-text-muted)}
${W} .hs-card>div:first-child>span:first-child{${LABEL};font-size:11px!important;color:var(--color-text-muted)!important}
${W} .hs-card .hs-serif{${DISPLAY};font-style:italic;font-size:1.6rem!important;color:var(--wh-symbol-ink)}
${W} .hs-card label{${LABEL};font-size:11px;color:var(--color-text-muted)}
${W} .hs-card :is(input,textarea,select){min-height:var(--wh-control-md);border-radius:var(--wh-petal-sm);border:var(--wh-border-w) solid var(--wh-border-strong);background:var(--wh-gradient-vellum);color:var(--color-text);font-family:var(--wh-ui);transition:border-color ${EASE},box-shadow ${EASE},background ${EASE}}
${W} .hs-card textarea{border-radius:var(--wh-petal-md)}
${W} .hs-card :is(input,textarea,select)::placeholder{color:var(--wh-muted)}
${W} .hs-card :is(input,textarea,select):hover{border-color:var(--wh-ink)}
${W} .hs-card :is(input,textarea,select):focus{border-color:var(--wh-focus-ring);box-shadow:0 0 0 1px var(--wh-focus-ring),var(--wh-aura);background:var(--wh-wash-violet),var(--wh-vellum);outline:none}
${W} .hs-card :is(input,textarea,select)[aria-invalid="true"]{border-color:var(--wh-danger);box-shadow:0 0 0 1px var(--wh-danger)}
${W} .hs-card :is(input,textarea,select):disabled{background:var(--wh-aged);color:var(--wh-muted);border-color:var(--wh-hairline);box-shadow:none;cursor:not-allowed}
${W} .hs-card input[type="checkbox"]{border-radius:4px;accent-color:var(--color-primary)}
${W} .hs-card [role="alert"]{font-family:var(--wh-ui);padding:10px 14px;border-radius:var(--wh-petal-sm);background:var(--wh-danger-soft);color:var(--wh-danger)}
${W} .hs-card .hs-btn{margin-top:4px}

${W} .hs-tier{padding:20px 24px;border-radius:var(--wh-petal-md);${CARD};transition:box-shadow ${EASE},transform ${EASE}}
${W} .hs-tier:hover{box-shadow:var(--wh-shadow-lift);transform:translateY(calc(var(--wh-hover-rise) * -1))}
${W} .hs-tier:active{box-shadow:var(--wh-shadow-soft);transform:none}
${W} .hs-tier:focus-visible{outline:none;box-shadow:var(--wh-ring-focus),var(--wh-shadow-soft)}
${W} .hs-tier .hs-serif{font-size:1.6rem!important;line-height:1.1}
${W} .hs-tier svg{transition:transform ${EASE}}
${W} .hs-tier:hover svg{transform:translateX(3px)}
${W} .hs-chip{${LABEL};display:inline-block;font-size:11px;padding:4px 12px;border:var(--wh-border-w) solid transparent;border-radius:var(--wh-pill);background:var(--wh-gradient-lavender);color:var(--color-primary-strong);transition:border-color ${EASE},box-shadow ${EASE}}
${W} :is(button,a).hs-chip{cursor:pointer}
${W} :is(button,a).hs-chip:hover{border-color:var(--wh-border-strong)}
${W} :is(button,a).hs-chip:active{background:var(--wh-aged);color:var(--wh-secondary)}
${W} .hs-chip[aria-pressed="true"]{background:var(--wh-gradient-violet);color:var(--wh-text-on-fill)}
${W} .hs-chip:is(:disabled,[aria-disabled="true"]){background:var(--wh-aged);color:var(--wh-muted);border-color:var(--wh-hairline);cursor:not-allowed}
${W} p.hs-serif{font-family:var(--wh-display)!important;font-style:italic!important;font-weight:400;font-size:1.4rem!important;padding-left:20px;border-left:1.5px solid var(--wh-symbol-line);color:var(--wh-witch)}

${W} .hs-faq{border-radius:var(--wh-petal-md);${CARD};transition:box-shadow ${EASE}}
${W} .hs-faq[open]{box-shadow:var(--wh-aura);border-color:var(--wh-symbol-line-soft)}
${W} .hs-faq summary{padding:18px 22px;font-family:var(--wh-display);font-size:1.3rem;font-weight:400;color:var(--wh-witch)}
${W} .hs-faq summary::after{width:32px;height:32px;border-radius:50%;background:var(--wh-gradient-lavender);border:0;font-family:var(--wh-ui);font-size:1rem;color:var(--color-primary-strong)}
${W} .hs-faq-a{padding:0 64px 22px 22px;font-size:1.05rem;line-height:1.6;color:var(--color-text-muted)}

${W} .hs-band{border-radius:var(--wh-petal-lg);background:var(--wh-smoke),var(--wh-wash-madder),var(--wh-grain),var(--wh-gradient-dusk);border:1px solid var(--wh-hairline);box-shadow:var(--wh-shadow-soft);color:var(--color-text)}
${W} .hs-band-photo{border-radius:var(--wh-arch);overflow:hidden;filter:sepia(.1)}
${W} .hs-band-wash{background:var(--wh-veil)}
${W} .hs-band-grid{padding:clamp(48px,7vw,104px) clamp(24px,5vw,80px)}
${W} .hs-band h2{${DISPLAY};font-size:clamp(2.8rem,6vw,4.75rem);line-height:1.05;color:var(--wh-witch)}
${W} .hs-band-body{font-size:1.2rem;line-height:1.6;color:var(--color-text-muted)}
${W} .hs-band .hs-eyebrow{color:var(--color-primary-strong)!important}
${W} .hs-contact{padding:clamp(24px,3vw,32px);border-radius:var(--wh-petal-lg);${CARD};-webkit-backdrop-filter:none;backdrop-filter:none}
${W} .hs-contact .hs-serif{font-size:1.6rem!important}
${W} .hs-contact a,${W} .hs-contact span{font-size:1.05rem;color:var(--color-text)}
${W} .hs-contact a:hover{color:var(--color-primary-strong)}
${W} .hs-contact .hs-contact-muted{${LABEL};font-size:11px;line-height:1.6;color:var(--color-text-muted)}
${W} .hs-contact .hs-socials a{${LABEL};font-size:11px;padding:9px 14px;border-radius:var(--wh-pill);background:var(--wh-gradient-vellum);border:1px solid var(--wh-hairline)}
${W} .hs-contact .hs-socials a:hover{box-shadow:var(--wh-aura);border-color:var(--wh-border-strong);color:var(--color-primary-strong)}
${W} .hs-contact .hs-socials a:active{background:var(--wh-aged);box-shadow:none}

${W} .hs-plain{max-width:1200px}

${W} .hs-season{max-width:none;margin:0;border-bottom:1px solid var(--wh-hairline);padding-left:max(clamp(16px,4vw,48px),calc((100% - 1200px) / 2 + clamp(16px,4vw,48px)));padding-right:max(clamp(16px,4vw,48px),calc((100% - 1200px) / 2 + clamp(16px,4vw,48px)));min-height:44px;padding-top:8px;padding-bottom:8px;display:flex;align-items:center;justify-content:space-between;gap:8px 32px;flex-wrap:wrap;background:color-mix(in srgb,var(--wh-parchment) 92%,transparent)}
${W} .hs-season-now{margin:0}
${W} .hs-season-track{display:none}
${W} .hs-season-next{margin:0;${LABEL};font-size:11px;color:var(--color-text-muted)}
${W} .hs-season-next span{color:var(--wh-symbol-ink)}
@media (max-width:719px){${W} .hs-season-next,${W} .wh-nowline-house-part{display:none}${W} .wh-nowline-house-part>*{display:none}${W} .hs-header .hs-btn-dark{display:none}${W} .hs-brand{font-size:22px}${W} .hs-pill{min-height:64px}${W} .hs-logo{height:38px}${W} .hs-menu-button{width:auto;padding:0 18px;${UI};color:var(--wh-symbol-ink);border-color:var(--wh-symbol-line-soft)}${W} .hs-menu-button svg{display:none}${W} .hs-menu-button::after{content:"Menu"}${W} .hs-menu-button[aria-expanded="true"]::after{content:"Close"}}

${W} .wh-nowline{margin:0;display:inline-flex;flex-wrap:wrap;gap:8px;align-items:center;${LABEL};font-size:11px;color:var(--color-text-muted)}
${W} .wh-nowline>span{display:inline-flex;gap:6px;align-items:center;white-space:nowrap}
${W} .wh-nowline-season{color:var(--wh-season-ink)}
${W} .wh-nowline-moon{color:var(--wh-symbol-ink)}
${W} .wh-nowline-dot{width:3px;height:3px;border-radius:50%;background:var(--wh-symbol-line)}

${W} .wh-glyph{font-family:var(--wh-symbol);font-weight:300;line-height:1;color:var(--wh-symbol-ink);font-variant-emoji:text;text-shadow:.5px .6px 0 var(--wh-symbol-ghost);display:inline-flex;align-items:center;justify-content:center;filter:url(#wh-ink-fine)}
${W} .wh-glyph-halo{position:relative;border-radius:50%;background:var(--wh-wash-moon),var(--wh-grain),var(--wh-gradient-lavender);box-shadow:0 0 0 1.5px var(--wh-symbol-ink),0 0 0 4.5px var(--wh-vellum),0 0 0 5.5px var(--wh-symbol-line-soft)}
${W} .wh-glyph-halo::before{content:"";position:absolute;inset:4px;border-radius:50%;border:1.5px dotted var(--wh-symbol-ink)}
${W} .wh-glyph-watermark{position:absolute;right:4%;bottom:0;opacity:var(--wh-watermark);filter:none;pointer-events:none;text-shadow:none}
${W} .wh-moon{flex:none;border-radius:50%;overflow:visible}
${W} .wh-moon-dark{fill:var(--wh-lavender)}
${W} .wh-moon-lit{fill:var(--wh-vellum)}
${W} .wh-moon-ring{fill:none;stroke:var(--wh-symbol-ink);stroke-width:var(--wh-symbol-stroke)}
${W} .wh-seed{width:12px;height:12px;border-radius:50%;background:var(--wh-grain),var(--wh-gradient-season);box-shadow:0 0 0 1.5px var(--wh-symbol-line-soft);flex:none}

${W} .wh-block{width:100%;max-width:1200px;margin:0 auto;padding:clamp(40px,6vw,80px) clamp(20px,4vw,48px);box-sizing:border-box}
${W} .wh-block-head{display:flex;flex-direction:column;gap:12px;margin-bottom:32px;max-width:52rem}
${W} .wh-block-head h2{${DISPLAY};font-size:clamp(2.375rem,5vw,3.375rem);line-height:1.04;margin:0;color:var(--wh-witch);text-wrap:balance}
${W} .wh-block-head p{margin:0;font-size:1.2rem;line-height:1.6;color:var(--color-text-muted);max-width:64ch}
${W} .wh-label{${LABEL};font-size:11px;color:var(--color-text-muted)}

${W} .wh-journey{display:flex;gap:20px;margin:0;padding:8px 4px 24px;list-style:none;overflow-x:auto;scroll-snap-type:x mandatory;scroll-padding:0 24px;-webkit-overflow-scrolling:touch;scrollbar-width:thin;scrollbar-color:var(--wh-symbol-line-soft) transparent}
${W} .wh-journey>li{flex:0 0 min(84vw,340px);scroll-snap-align:start;display:flex;flex-direction:column;gap:14px;padding:24px;border-radius:var(--wh-petal-md);${CARD};transition:box-shadow ${EASE},border-color ${EASE}}
${W} .wh-journey>li[aria-current="date"]{border:2px solid var(--wh-season);box-shadow:var(--wh-aura)}
${W} .wh-journey-sign{display:flex;align-items:center;gap:14px}
${W} .wh-journey-sign .wh-glyph-halo{width:52px;height:52px;font-size:24px}
${W} .wh-journey-house{${DISPLAY};font-style:italic;font-size:1.1rem;color:var(--wh-symbol-ink)}
${W} .wh-journey h3{margin:0;${DISPLAY};font-size:1.9rem;line-height:1.05;color:var(--wh-witch)}
${W} .wh-journey-range{${LABEL};font-size:11px;color:var(--wh-season-ink)}
${W} .wh-journey ol{margin:4px 0 0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px}
${W} .wh-journey-empty{margin:0;font-style:italic;color:var(--color-text-muted)}
${W} .wh-journey-hint{margin:8px 0 0;font-family:var(--wh-body);font-style:italic;font-size:15px;color:var(--color-text-muted)}

${W} .wh-row{display:grid;grid-template-columns:58px 22px minmax(0,1fr);gap:10px;align-items:center;padding:7px 10px;border-radius:var(--wh-petal-sm);border:1px solid var(--wh-hairline);background:var(--wh-gradient-vellum);color:var(--color-text);text-decoration:none;transition:box-shadow ${EASE}}
${W} a.wh-row:hover{box-shadow:var(--wh-aura);border-color:var(--wh-border-strong)}
${W} a.wh-row:active{background:var(--wh-aged);box-shadow:none}
${W} .wh-row[aria-current="date"]{border-color:var(--wh-symbol-line);background:var(--wh-wash-violet),var(--wh-gradient-vellum);box-shadow:var(--wh-aura)}
${W} .wh-row-date{${LABEL};font-size:11px;color:var(--color-text-muted)}
${W} .wh-row-mark{display:flex;justify-content:center;font-size:15px}
${W} .wh-row-text{display:flex;flex-direction:column;min-width:0}
${W} .wh-row-title{font-family:var(--wh-body);font-size:15px;line-height:1.25}
${W} .wh-row-note{font-family:var(--wh-ui);font-size:12px;color:var(--color-text-muted)}

${W} .wh-skymap{display:grid;grid-template-columns:minmax(0,1fr);gap:32px;align-items:start}
@media (min-width:900px){${W} .wh-skymap{grid-template-columns:minmax(280px,440px) minmax(0,1fr)}}
${W} .wh-wheel{position:relative;width:100%;max-width:440px;margin:0 auto;aspect-ratio:1;border-radius:50%;background:var(--wh-wash-moon),var(--wh-stars),var(--wh-grain),var(--wh-gradient-vellum);background-size:auto,var(--wh-stars-size),auto,auto;box-shadow:0 0 0 1.5px var(--wh-symbol-ink),0 0 0 6px var(--wh-vellum),0 0 0 7px var(--wh-symbol-line-soft),var(--wh-shadow-soft)}
${W} .wh-wheel svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
${W} .wh-wheel-ring{fill:none;stroke:var(--wh-symbol-line-soft);stroke-width:.25}
${W} .wh-wheel-tick{stroke:var(--wh-symbol-line-soft);stroke-width:.2}
${W} .wh-wheel-month{stroke:var(--wh-symbol-line);stroke-width:.3}
${W} .wh-wheel-sign{stroke:var(--wh-symbol-ink);stroke-width:.35}
${W} .wh-wheel-season{fill:none;stroke-width:1.6;stroke-linecap:round;opacity:.6}
${W} .wh-wheel-season[data-now]{stroke-width:2.6;opacity:1}
${W} .wh-wheel-season[data-season="winter"]{stroke:var(--wh-season-winter)}
${W} .wh-wheel-season[data-season="spring"]{stroke:var(--wh-season-spring)}
${W} .wh-wheel-season[data-season="summer"]{stroke:var(--wh-season-summer)}
${W} .wh-wheel-season[data-season="fall"]{stroke:var(--wh-season-fall)}
${W} .wh-wheel-label{font-family:var(--wh-ui);font-weight:500;font-size:2.4px;letter-spacing:.14em;text-transform:uppercase;fill:var(--color-text-muted);text-anchor:middle;dominant-baseline:middle}
${W} .wh-wheel-glyph{font-family:var(--wh-symbol);font-weight:300;font-size:4.2px;fill:var(--wh-symbol-ink);text-anchor:middle;dominant-baseline:central}
${W} .wh-wheel-house{font-family:var(--wh-display);font-style:italic;font-size:2.2px;fill:var(--color-text-muted);text-anchor:middle;dominant-baseline:middle}
${W} .wh-wheel-dot{fill:var(--wh-vellum);stroke:var(--wh-symbol-line);stroke-width:.35}
${W} .wh-wheel-dot[data-kind="festival"]{fill:var(--wh-lavender);stroke:var(--wh-symbol-ink)}
${W} .wh-wheel-dot[data-kind="moon"]{fill:var(--wh-vellum)}
${W} .wh-wheel-dot[data-kind="gathering"],${W} .wh-wheel-dot[data-kind="event"]{fill:var(--wh-season)}
${W} .wh-wheel-needle{stroke:var(--wh-symbol-ink);stroke-width:.4;stroke-linecap:round}
${W} .wh-wheel-needle-cap{fill:var(--wh-violet);stroke:var(--wh-vellum);stroke-width:.6}
${W} .wh-wheel-moon{position:absolute;inset:auto;left:50%;top:50%;width:36%;height:36%;transform:translate(-50%,-50%)}
${W} .wh-skymap-now{display:flex;flex-direction:column;gap:10px}
${W} .wh-skymap-now h3{margin:0;${DISPLAY};font-size:2.2rem;line-height:1.05;color:var(--wh-witch)}
${W} .wh-skymap-months{margin:0;padding:0;list-style:none;display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,240px),1fr));gap:16px}
${W} .wh-skymap-months>li{display:flex;flex-direction:column;gap:8px;padding:16px;border-radius:var(--wh-petal-md);${CARD}}
${W} .wh-skymap-months h4{margin:0;${DISPLAY};font-size:1.4rem;color:var(--wh-witch);display:flex;justify-content:space-between;align-items:baseline;gap:8px}
${W} .wh-skymap-months ol{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px}
${W} .wh-legend{display:flex;flex-wrap:wrap;gap:8px 16px;margin:0;padding:0;list-style:none;${LABEL};font-size:11px;color:var(--color-text-muted)}
${W} .wh-legend li{display:inline-flex;align-items:center;gap:6px}

${M} .mw-page{--mw-s:var(--wh-season-ink);--mw-accent:var(--color-primary);padding-bottom:clamp(64px,8vw,96px)}
${M} .mw-wrap{max-width:1200px;padding-left:clamp(20px,4vw,48px);padding-right:clamp(20px,4vw,48px)}
${M} .mw-sec{padding-top:clamp(56px,7vw,96px)}
${M} .mw-other{padding-top:clamp(56px,7vw,96px)}
${M} .mw-page .mw-display{${DISPLAY};letter-spacing:var(--wh-tracking-display);color:var(--wh-witch);text-wrap:balance}
${M} .mw-xl{font-size:clamp(3.5rem,7.4vw,6.75rem);line-height:.98}
${M} .mw-l{font-size:clamp(2.9rem,5.6vw,5rem);line-height:1}
${M} .mw-m{font-size:clamp(2.4rem,4vw,3.5rem);line-height:1.04}
${M} .mw-s{font-size:clamp(1.8rem,2.6vw,2.25rem);line-height:1.1}
${M} .mw-xs{font-size:1.5rem;line-height:1.15}
${M} .mw-accent{font-style:italic;font-weight:400;color:var(--color-primary-strong)}
${M} .mw-page :is(.mw-kicker,.mw-label){${LABEL};font-size:11px}
${M} .mw-kicker{margin:0 0 14px;color:var(--wh-symbol-ink)}
${M} .mw-kicker::before{display:none}
${M} .mw-kicker-season{color:var(--wh-season-ink)}
${M} .mw-label{color:var(--color-text-subtle)}
${M} .mw-label-strong{color:var(--color-text)}
${M} .mw-lead{margin:18px 0 0;max-width:54ch;font-size:1.3rem;line-height:1.6;color:var(--color-text-muted)}
${M} .mw-body{margin:12px 0 0;font-size:1.15rem;line-height:1.65;color:var(--color-text-muted)}
${M} .mw-small{font-size:1.05rem;line-height:1.5;color:var(--color-text-muted)}
${M} .mw-actions{gap:12px;margin-top:28px}
${M} .mw-textlink{${LABEL};font-size:12px;color:var(--wh-symbol-ink);gap:6px}
${M} .mw-textlink:hover{color:var(--wh-witch)}
${M} .mw-freqtag{${LABEL};font-size:11px;color:var(--color-text-subtle)}
${M} .mw-freqtag::before{width:6px;height:6px;background:var(--wh-symbol-ink)}
${M} .mw-icon{color:var(--wh-symbol-ink)}
${M} .mw-photo{border-radius:var(--wh-arch);background:var(--wh-gradient-dusk);box-shadow:0 0 0 1px var(--wh-hairline),var(--wh-shadow-soft)}
${M} .mw-photo img{filter:saturate(.86) contrast(.94) brightness(1.02) sepia(.08)}
${M} .mw-photo::after{content:"";position:absolute;inset:0;background:var(--wh-wash-blush),var(--wh-grain);mix-blend-mode:multiply;opacity:.9;pointer-events:none}
${M} .mw-chamfer{border-radius:var(--wh-arch)}
${M} .mw-frame{${CARD};border-radius:var(--wh-petal-md)}
${M} .mw-grid{gap:14px}
${M} .mw-grid>*{${CARD};border-radius:var(--wh-petal-md);padding:22px;gap:12px;transition:box-shadow ${EASE},transform ${EASE}}
${M} .mw-grid>* h3{margin:0}
${M} .mw-band{margin-top:0;height:0}
${M} .mw-sec-head{margin-bottom:28px}
${M} .mw-sec-head .mw-kicker{margin-bottom:10px}
${M} .mw-sec-head .mw-s{font-size:clamp(2.4rem,4vw,3.5rem);line-height:1.04}

${M} .mw-hero{padding-top:clamp(40px,5vw,56px);position:relative}
${M} .mw-hero-inner{gap:clamp(32px,5vw,56px)}
${M} .mw-hero-split .mw-hero-inner{grid-template-columns:minmax(0,7fr) minmax(0,5fr)}
@media (max-width:860px){${M} .mw-hero-split .mw-hero-inner{grid-template-columns:minmax(0,1fr)}}
${M} .mw-hero-split .mw-photo{aspect-ratio:auto;height:clamp(320px,38vw,540px);max-height:none}
${M} .mw-hero-copy{max-width:none;display:flex;flex-direction:column;gap:24px}
${M} .mw-hero-copy .mw-kicker{margin:0;color:var(--color-text-subtle)}
${M} .mw-hero-copy .mw-kicker::before{content:"☽︎";display:inline;font-family:var(--wh-symbol);font-weight:300;font-size:14px;color:var(--wh-symbol-ink)}
${M} .mw-hero-copy .mw-lead{margin:0;max-width:52ch}
${M} .mw-hero-copy .mw-actions{margin-top:0}
${M} .mw-hero-copy .mw-display{font-size:clamp(3.5rem,7.4vw,6.75rem);line-height:.98}
${M} .mw-hero-stack .mw-hero-copy .mw-display{font-size:clamp(3.5rem,7.4vw,6.75rem)}
${M} .mw-hero-photo{width:calc(100% - 2 * clamp(20px,4vw,48px));max-width:1200px;margin:40px auto 0;height:clamp(300px,40vw,540px)}
${M} .mw-hero::after{content:"✶︎";position:absolute;left:46%;top:2%;font-family:var(--wh-symbol);font-size:12px;color:var(--wh-symbol-ink);opacity:.3;pointer-events:none}
${M} .mw-hero-split::after{content:none;display:none}
${M} .mw-hero-split .mw-hero-inner::after{content:"";position:absolute;right:-40px;top:-60px;font-family:var(--wh-symbol);font-weight:300;font-size:300px;line-height:1;color:var(--wh-symbol-ink);opacity:var(--wh-watermark);pointer-events:none;text-shadow:none}
${M} .mw-hero-split .mw-hero-inner{position:relative}
[data-house-site][data-house-theme="wildheart"][data-sign="aries"] .mw-hero-split .mw-hero-inner::after{content:"♈︎"}
[data-house-site][data-house-theme="wildheart"][data-sign="taurus"] .mw-hero-split .mw-hero-inner::after{content:"♉︎"}
[data-house-site][data-house-theme="wildheart"][data-sign="gemini"] .mw-hero-split .mw-hero-inner::after{content:"♊︎"}
[data-house-site][data-house-theme="wildheart"][data-sign="cancer"] .mw-hero-split .mw-hero-inner::after{content:"♋︎"}
[data-house-site][data-house-theme="wildheart"][data-sign="leo"] .mw-hero-split .mw-hero-inner::after{content:"♌︎"}
[data-house-site][data-house-theme="wildheart"][data-sign="virgo"] .mw-hero-split .mw-hero-inner::after{content:"♍︎"}
[data-house-site][data-house-theme="wildheart"][data-sign="libra"] .mw-hero-split .mw-hero-inner::after{content:"♎︎"}
[data-house-site][data-house-theme="wildheart"][data-sign="scorpio"] .mw-hero-split .mw-hero-inner::after{content:"♏︎"}
[data-house-site][data-house-theme="wildheart"][data-sign="sagittarius"] .mw-hero-split .mw-hero-inner::after{content:"♐︎"}
[data-house-site][data-house-theme="wildheart"][data-sign="capricorn"] .mw-hero-split .mw-hero-inner::after{content:"♑︎"}
[data-house-site][data-house-theme="wildheart"][data-sign="aquarius"] .mw-hero-split .mw-hero-inner::after{content:"♒︎"}
[data-house-site][data-house-theme="wildheart"][data-sign="pisces"] .mw-hero-split .mw-hero-inner::after{content:"♓︎"}


${M} .mw-head{gap:clamp(24px,5vw,64px)}
${M} .mw-head-card{${CARD};border-radius:var(--wh-petal-lg);padding:clamp(28px,4vw,40px)}
${M} .mw-facts{gap:14px}
${M} .mw-facts>div{gap:8px;padding:20px 22px;min-height:112px;justify-content:space-between}
${M} .mw-fact-v{${DISPLAY};font-style:italic;font-size:clamp(1.9rem,3vw,2.5rem);line-height:1;color:var(--wh-symbol-ink)}
${M} .mw-faqs{gap:10px;max-width:880px}

${M} .mw-beats{grid-template-columns:repeat(auto-fit,minmax(min(100%,120px),1fr));gap:10px}
${M} .mw-beat{min-height:0;justify-content:flex-start;gap:6px;padding:14px 12px;border-radius:var(--wh-petal-sm);background:var(--wh-wash-violet),var(--wh-gradient-vellum);border:1px solid var(--wh-hairline);box-shadow:none;transition:box-shadow ${EASE},border-color ${EASE}}
${M} .mw-beat:hover{background:var(--wh-wash-violet),var(--wh-gradient-vellum);box-shadow:var(--wh-aura)}
${M} .mw-beat:focus-visible{outline:none;box-shadow:var(--wh-ring-focus)}
${M} .mw-beat[aria-pressed="true"]{background:var(--wh-wash-violet),var(--wh-gradient-vellum);border:2px solid var(--wh-season);box-shadow:var(--wh-aura);color:var(--color-text)}
${M} .mw-beat-l{${DISPLAY};font-style:italic;font-size:30px;line-height:1;color:var(--wh-symbol-ink)}
${M} .mw-beat[aria-pressed="true"] .mw-beat-l{color:var(--wh-symbol-ink)}
${M} .mw-beat-w{${LABEL};font-size:11px;color:var(--color-text)}
${M} .mw-beat-panel{margin-top:16px;padding:22px 26px;border-radius:var(--wh-petal-md);gap:8px 24px}
${M} .mw-beat-name{${DISPLAY};font-size:1.8rem;line-height:1.1;color:var(--wh-witch)}
${M} .mw-beat-body{font-size:1.15rem;line-height:1.6;color:var(--color-text-muted)}

${M} .mw-path{gap:16px;position:relative;padding-top:8px}
${M} .mw-path::before{content:"";position:absolute;left:24px;right:24px;top:31px;height:1.5px;background:linear-gradient(90deg,var(--wh-symbol-line),var(--wh-symbol-line-soft))}
${M} .mw-path li{gap:12px}
${M} .mw-path-n{position:relative;width:48px;height:48px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:var(--wh-parchment);${DISPLAY};font-style:italic;font-size:1.4rem;line-height:1;color:var(--wh-symbol-ink);box-shadow:0 0 0 1.5px var(--wh-symbol-line-soft)}
${M} .mw-path h3{margin:0}
${M} .mw-tag-chev{${LABEL};font-size:11px;padding:4px 12px;border-radius:var(--wh-pill);background:var(--wh-gradient-lavender);color:var(--color-primary-strong)}
${M} .mw-path-grid{gap:14px}

${M} .mw-parts{counter-reset:wh-part}
${M} .mw-parts>li{counter-increment:wh-part;gap:12px}
${M} .mw-parts-top .mw-label{font-size:0}
${M} .mw-parts-top .mw-label::before{content:counter(wh-part,upper-roman);${DISPLAY};font-style:italic;font-size:22px;letter-spacing:0;text-transform:none;color:var(--wh-symbol-ink)}
${M} .mw-parts-top::after{content:"✦︎";font-family:var(--wh-symbol);font-weight:300;font-size:18px;color:var(--wh-symbol-ink)}
${M} .mw-parts h3{font-size:1.5rem;line-height:1.1}
${M} .mw-parts .mw-small{font-size:1rem}

${M} .mw-lists{gap:16px;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr))}
${M} .mw-lists>div{${CARD};border-radius:var(--wh-petal-lg);padding:28px;display:flex;flex-direction:column;gap:14px}
${M} .mw-lists>div:first-child{background:var(--wh-wash-violet),var(--wh-grain),var(--wh-gradient-vellum)}
${M} .mw-label-strong.mw-label{margin:0;color:var(--wh-symbol-ink)}
${M} .mw-chevlist{gap:10px}
${M} .mw-chevlist li{padding-left:28px;font-size:1.05rem;line-height:1.45;color:var(--color-text-muted)}
${M} .mw-chevlist li::before{content:"✦︎";width:auto;height:auto;background:none;left:0;top:.1em;font-family:var(--wh-symbol);font-weight:300;font-size:14px;color:var(--wh-symbol-ink)}
${M} .mw-chevlist-quiet li::before{color:var(--wh-symbol-ink)}
${M} .mw-lists>div:first-child .mw-chevlist li{${DISPLAY};font-style:italic;font-size:1.4rem;line-height:1.25;color:var(--wh-witch);padding-left:0}
${M} .mw-lists>div:first-child .mw-chevlist li::before{display:none}
${M} .mw-checklist .mw-chevlist{gap:12px 32px}

${M} .mw-photos{gap:14px}
${M} .mw-photos .mw-photo{height:clamp(240px,26vw,320px)}
${M} .mw-quote blockquote{${DISPLAY};font-style:italic;font-size:1.5rem;line-height:1.35;color:var(--wh-witch)}

${M} .mw-story{grid-template-columns:minmax(0,5fr) minmax(0,7fr);gap:clamp(32px,5vw,56px)}
${M} .mw-story-right{grid-template-columns:minmax(0,7fr) minmax(0,5fr)}
${M} .mw-story-photo{aspect-ratio:auto;height:clamp(320px,36vw,520px);max-height:none;border-radius:var(--wh-petal-lg)}
${M} .mw-story-copy{gap:0}
${M} .mw-story-copy .mw-chevlist{margin-top:20px}
${M} .mw-story-copy .mw-textlink{margin-top:20px}

${M} .mw-closing{position:relative;overflow:hidden;gap:24px 48px;max-width:calc(1200px - 2 * clamp(20px,4vw,48px));margin-top:clamp(56px,7vw,96px);padding:clamp(32px,5vw,48px) clamp(24px,4vw,48px);border-radius:var(--wh-petal-lg);background:var(--wh-wash-madder),var(--wh-smoke),var(--wh-wash-violet),var(--wh-grain),var(--wh-gradient-dusk);border:1px solid var(--wh-hairline);color:var(--color-text);box-shadow:var(--wh-shadow-soft)}
${M} .mw-closing::before{content:"";position:absolute;left:clamp(24px,4vw,48px);right:clamp(24px,4vw,48px);top:14px;height:1.5px;background:linear-gradient(90deg,transparent,var(--wh-symbol-line-soft),transparent)}
${M} .mw-closing::after{content:"✦︎";position:absolute;left:50%;top:6px;transform:translateX(-50%);font-family:var(--wh-symbol);font-weight:300;font-size:14px;color:var(--wh-symbol-ink)}
${M} .mw-closing .mw-display{color:var(--wh-witch);font-size:clamp(2rem,3.4vw,2.75rem)}
${M} .mw-closing .mw-kicker{color:var(--wh-symbol-ink)}
${M} .mw-closing .mw-lead,${M} .mw-closing .mw-body{color:var(--color-text-muted);max-width:52ch}
${M} .mw-strip{padding:16px 22px;border-radius:var(--wh-petal-md);${CARD}}
${W} a.mw-strip:hover{box-shadow:var(--wh-aura)}
${M} .mw-strip-chev{width:6px;height:6px;background:var(--wh-symbol-ink)}
${M} .mw-note{padding:18px 20px;border-radius:var(--wh-petal-md);border:1px solid var(--wh-hairline);background:var(--wh-gradient-vellum);font-size:1.05rem;color:var(--color-text-muted)}
${M} .mw-note strong{font-weight:500;color:var(--color-text)}
${M} .mw-badge{${LABEL};font-size:11px;padding:4px 12px;border-radius:var(--wh-pill);background:var(--wh-gradient-lavender);color:var(--color-primary-strong)}
${M} .mw-badge-full{background:var(--wh-gradient-madder);color:var(--wh-text-on-fill)}
${M} .mw-badge-forming{background:var(--wh-gradient-season);color:var(--wh-text-on-season)}
${M} .mw-text-head .mw-display{max-width:none}
${M} .mw-text .mw-lead{max-width:64ch;font-size:1.19rem}

${M} .mw-dates{gap:8px}
${M} .mw-date-row{grid-template-columns:14px minmax(150px,210px) minmax(0,1fr) auto;padding:12px 16px;border-radius:var(--wh-petal-sm);border:1px solid var(--wh-hairline);background:var(--wh-gradient-vellum);box-shadow:none;transition:box-shadow ${EASE}}
${M} .mw-date-row:hover{box-shadow:var(--wh-aura)}
${M} .mw-date-mark{width:14px;height:14px;background:var(--wh-grain),var(--wh-gradient-lavender);box-shadow:0 0 0 1.5px var(--wh-symbol-line-soft)}
${M} .mw-date-mark[data-phase]{background:linear-gradient(90deg,var(--wh-lavender) var(--wh-lit-from,0%),var(--wh-vellum) var(--wh-lit-from,0%),var(--wh-vellum) var(--wh-lit-to,0%),var(--wh-lavender) var(--wh-lit-to,0%));box-shadow:0 0 0 var(--wh-symbol-stroke) var(--wh-symbol-ink)}
${M} :is(.mw-date-mark,.mw-weeks li)[data-phase="1"]{--wh-lit-from:75%;--wh-lit-to:100%}${M} :is(.mw-date-mark,.mw-weeks li)[data-phase="2"]{--wh-lit-from:50%;--wh-lit-to:100%}${M} :is(.mw-date-mark,.mw-weeks li)[data-phase="3"]{--wh-lit-from:25%;--wh-lit-to:100%}${M} :is(.mw-date-mark,.mw-weeks li)[data-phase="4"]{--wh-lit-from:0%;--wh-lit-to:100%}${M} :is(.mw-date-mark,.mw-weeks li)[data-phase="5"]{--wh-lit-from:0%;--wh-lit-to:75%}${M} :is(.mw-date-mark,.mw-weeks li)[data-phase="6"]{--wh-lit-from:0%;--wh-lit-to:50%}${M} :is(.mw-date-mark,.mw-weeks li)[data-phase="7"]{--wh-lit-from:0%;--wh-lit-to:25%}
${M} .mw-date-mark[data-kind="circle"]{box-shadow:0 0 0 var(--wh-symbol-stroke) var(--wh-season-ink)}
${M} .mw-date-mark[data-kind="retreat"]{box-shadow:0 0 0 var(--wh-symbol-stroke) var(--wh-madder)}
${M} .mw-date-text strong{font-weight:500;color:var(--wh-witch);font-size:1.1rem}
${M} .mw-date-text .mw-small{font-size:.95rem}

${M} .mw-finder{gap:16px}
${M} .mw-tag{${LABEL};font-size:11px;padding:8px 14px;border-radius:var(--wh-pill);border:1px solid var(--wh-hairline);background:var(--wh-gradient-vellum);color:var(--color-text-muted)}
${M} .mw-tag[aria-pressed="true"]{background:var(--wh-gradient-lavender);border-color:transparent;color:var(--color-primary-strong)}
${M} .mw-tag:focus-visible{outline:none;box-shadow:var(--wh-ring-focus)}
${M} .mw-rows{gap:8px}
${M} .mw-circle-row{padding:16px 20px;border-radius:var(--wh-petal-md);border:1px solid var(--wh-hairline);background:var(--wh-grain),var(--wh-gradient-vellum);box-shadow:none;transition:box-shadow ${EASE},border-color ${EASE}}
${M} .mw-circle-row[aria-pressed="true"]{background:var(--wh-wash-violet),var(--wh-grain),var(--wh-gradient-vellum);border:2px solid var(--wh-season);box-shadow:var(--wh-aura)}
${M} .mw-circle-row:focus-visible{outline:none;box-shadow:var(--wh-ring-focus)}
${M} .mw-circle-row-name{${DISPLAY};font-size:1.6rem;line-height:1.1;color:var(--wh-witch)}
${M} .mw-circle-card{border-radius:var(--wh-petal-lg)}
${M} .mw-circle-photo{height:220px;filter:saturate(.86) sepia(.08)}
${M} .mw-circle-body{padding:24px;gap:14px}
${M} .mw-circle-meta strong{font-weight:500;color:var(--wh-witch)}
${M} .mw-avatar{box-shadow:0 0 0 1.5px var(--wh-symbol-line-soft)}
${M} .mw-progress-count{${LABEL};font-size:11px;color:var(--color-text-muted)}
${M} .mw-progress-bar{display:flex;gap:4px}
${M} .mw-progress-bar span{width:10px;height:10px;border-radius:50%;background:var(--wh-lavender);box-shadow:inset 0 0 0 1.5px var(--wh-symbol-ink)}
${M} .mw-progress-bar span[data-state="done"]{background:var(--wh-vellum)}
${M} .mw-progress-bar span[data-state="next"]{background:linear-gradient(90deg,var(--wh-lavender) 50%,var(--wh-vellum) 50%)}

${M} .mw-journeys{gap:clamp(40px,5vw,64px)}
${M} .mw-journey{grid-template-columns:minmax(0,1fr);gap:20px}
${M} .mw-journey-head{gap:10px}
${M} .mw-journey-head .mw-kicker{margin:0}
${M} .mw-journey-head .mw-body{margin:0;max-width:60ch}
${M} .mw-journey-head .mw-textlink{margin-top:4px}
${M} .mw-weeks{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,220px),1fr));gap:12px}
${M} .mw-weeks li{position:relative;display:flex;flex-direction:column;align-items:flex-start;text-align:left;gap:8px;padding:18px 18px 18px;border-radius:var(--wh-petal-md);border:1px solid var(--wh-hairline);background:var(--wh-grain),var(--wh-gradient-vellum);box-shadow:none;transition:box-shadow ${EASE}}
${M} .mw-weeks li:hover{box-shadow:var(--wh-aura)}
${M} .mw-weeks li[data-phase]::after{content:"";position:absolute;right:18px;top:18px;width:18px;height:18px;border-radius:50%;background:linear-gradient(90deg,var(--wh-lavender) var(--wh-lit-from,0%),var(--wh-vellum) var(--wh-lit-from,0%),var(--wh-vellum) var(--wh-lit-to,0%),var(--wh-lavender) var(--wh-lit-to,0%));box-shadow:0 0 0 var(--wh-symbol-stroke) var(--wh-symbol-ink)}
${M} .mw-weeks strong{${DISPLAY};font-size:1.5rem;line-height:1.1;color:var(--wh-witch)}
${M} .mw-week-tag{${LABEL};font-size:11px;padding:0;background:none;color:var(--color-text-subtle);order:0}
${M} .mw-weeks li .mw-label{order:0;margin-top:-6px}
${M} .mw-weeks .mw-weeks-more{display:flex;flex-direction:row;flex-wrap:wrap;gap:8px;grid-column:1/-1;background:transparent;border:0;padding:4px 0 0}

${M} .mw-year{grid-template-columns:minmax(0,1fr);gap:0}
${M} .mw-wheel-aside{display:none}
${M} .mw-year-seasons{gap:clamp(48px,6vw,72px)}
${M} .mw-season{gap:12px}
${M} .mw-season-name{color:var(--wh-witch)}
${M} .mw-season .mw-display.mw-xs{${DISPLAY};font-style:italic;color:var(--wh-season-ink)}
${M} .mw-season[data-season-mark="winter"]{--wh-season:var(--wh-season-winter);--wh-season-ink:var(--wh-season-winter-ink);--wh-gradient-season:var(--wh-gradient-winter)}
${M} .mw-season[data-season-mark="spring"]{--wh-season:var(--wh-season-spring);--wh-season-ink:var(--wh-season-spring-ink);--wh-gradient-season:var(--wh-gradient-spring)}
${M} .mw-season[data-season-mark="summer"]{--wh-season:var(--wh-season-summer);--wh-season-ink:var(--wh-season-summer-ink);--wh-gradient-season:var(--wh-gradient-summer)}
${M} .mw-season[data-season-mark="fall"]{--wh-season:var(--wh-season-fall);--wh-season-ink:var(--wh-season-fall-ink);--wh-gradient-season:var(--wh-gradient-fall)}
${M} .mw-season-photo{height:280px;border-radius:var(--wh-arch)}
${M} .mw-modules{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,240px),1fr));gap:12px;margin-top:10px}
${M} .mw-modules li{position:relative;overflow:hidden;display:flex;flex-direction:column;gap:8px;padding:22px 18px 18px;border-radius:var(--wh-petal-md);border:1px solid var(--wh-hairline);background:var(--wh-grain),var(--wh-gradient-vellum);box-shadow:none}
${M} .mw-modules li::before{content:"";position:absolute;left:0;right:0;top:0;height:3px;background:var(--wh-gradient-season)}
${M} .mw-glyph{position:absolute;right:16px;top:16px;font-family:var(--wh-symbol);font-weight:300;font-size:20px;color:var(--wh-symbol-ink);font-variant-emoji:text}
${M} .mw-module-text{gap:4px;padding-right:28px}
${M} .mw-module-text strong{${DISPLAY};font-size:1.4rem;line-height:1.1;color:var(--wh-witch)}
${M} .mw-module-text .mw-label{color:var(--wh-season-ink);order:-1}
${M} .mw-module-dates{gap:4px;padding-top:6px;border-top:1px solid var(--wh-hairline);margin-top:auto}
${M} .mw-module-dates>span{grid-template-columns:56px minmax(0,1fr);gap:8px}
${M} .mw-module-dates .mw-small{font-size:.9rem;font-family:var(--wh-ui)}
${M} .mw-keydates{margin-top:16px}

${M} .wh-title{${DISPLAY};margin:0;font-size:clamp(2.4rem,4vw,3.5rem);line-height:1.04;color:var(--wh-witch);text-wrap:balance}
${M} .wh-title-l{font-size:clamp(2.9rem,5.6vw,5rem);line-height:1}
${M} .wh-title-madder .mw-accent{color:var(--wh-madder)}
${M} .wh-lead{margin:0;font-size:1.3rem;line-height:1.6;color:var(--color-text-muted);max-width:52ch}
${M} .wh-body{margin:0;font-size:1.19rem;line-height:1.65;color:var(--color-text-muted)}
${M} .wh-note{margin:0;padding:18px 20px;border-radius:var(--wh-petal-md);border:1px solid var(--wh-hairline);background:var(--wh-gradient-vellum);font-size:1.05rem;color:var(--color-text-muted)}
${M} .wh-label-ink{color:var(--wh-symbol-ink)}
${M} .wh-label-moon{display:inline-flex;align-items:center;gap:10px}
${M} .wh-actions{display:flex;flex-wrap:wrap;gap:12px;align-items:center}
${M} .wh-textlink{${LABEL};font-size:12px;color:var(--wh-symbol-ink);white-space:nowrap}
${M} .wh-textlink::after{content:" →"}
${M} .wh-textlink:hover{color:var(--wh-witch)}
${M} .wh-block-head-row{flex-direction:row;flex-wrap:wrap;justify-content:space-between;align-items:flex-end;gap:16px 24px;max-width:none}
${M} .wh-block-head-row>div{display:flex;flex-direction:column;gap:10px}
${M} .wh-block-title{margin:-16px 0 28px}
${M} .wh-card{position:relative;display:flex;flex-direction:column;gap:12px;padding:24px;border-radius:var(--wh-petal-lg);border:1px solid var(--wh-hairline);background:var(--wh-grain),var(--wh-gradient-vellum);box-shadow:var(--wh-shadow-soft);overflow:hidden}
${M} .wh-card h3{margin:0;${DISPLAY};font-size:clamp(1.8rem,2.6vw,2.25rem);line-height:1.1;color:var(--wh-witch)}
${M} .wh-card p{margin:0;font-size:1.05rem;line-height:1.5;color:var(--color-text-muted)}
${M} .wh-card-row{display:flex;align-items:center;gap:10px}
${M} .wh-tag{${LABEL};font-size:11px;display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:var(--wh-pill);border:1px solid var(--wh-hairline);background:var(--wh-gradient-vellum);color:var(--color-text-muted);line-height:1.2}
${M} .wh-tag-season{background:var(--wh-gradient-season);border-color:transparent;color:var(--wh-text-on-season)}
${M} .wh-btn-sm{height:var(--wh-control-sm);padding:0 16px;font-size:13px;align-self:flex-start;margin-top:auto;background:var(--wh-gradient-vellum);border-color:var(--wh-border-strong);color:var(--wh-symbol-ink)}

${M} .wh-ornament{display:flex;align-items:center;gap:12px;width:100%;color:var(--wh-symbol-ink);filter:url(#wh-ink-fine)}
${M} .wh-ornament-line{flex:1;display:flex;align-items:center;gap:6px}
${M} .wh-ornament-line::before{content:"";flex:1;height:1.5px;background:linear-gradient(90deg,transparent,var(--wh-symbol-ink))}
${M} .wh-ornament-line::after{content:"";width:14px;height:1.5px;background:var(--wh-symbol-ink);box-shadow:-10px 0 0 -0.5px transparent}
${M} .wh-ornament-line-r{flex-direction:row-reverse}
${M} .wh-ornament-line-r::before{background:linear-gradient(270deg,transparent,var(--wh-symbol-ink))}
${M} .wh-ornament-mid{display:flex;align-items:center;gap:8px}
${M} .wh-ornament .wh-glyph{filter:none}
${M} .wh-bridge{display:flex;flex-direction:column;align-items:center;gap:14px}
${M} .wh-bridge-line{width:1.5px;height:72px;background:linear-gradient(180deg,transparent,var(--wh-symbol-line))}
${M} .wh-bridge-label{${LABEL};font-size:11px;color:var(--wh-symbol-ink)}
${M} .wh-block-ornament{padding-top:0;padding-bottom:0}
${M} .wh-block-bridge{padding-top:16px;padding-bottom:0}

${M} .wh-seal-wrap{display:inline-flex;flex-direction:column;align-items:center;gap:10px}
${M} .wh-seal{position:relative;display:inline-flex;border-radius:50%;background:var(--wh-wash-moon),var(--wh-grain),var(--wh-gradient-lavender);box-shadow:0 0 0 1.5px var(--wh-symbol-ink),0 0 0 4.5px var(--wh-vellum),0 0 0 5.5px var(--wh-symbol-line-soft);filter:url(#wh-ink-fine)}
${M} .wh-seal::before{content:"";position:absolute;inset:5px;border-radius:50%;border:1.5px dotted var(--wh-symbol-ink)}
${M} .wh-seal::after{content:"";position:absolute;inset:10px;border-radius:50%;border:1px solid var(--wh-symbol-line-soft)}
${M} .wh-seal-dot{position:absolute;width:5px;height:5px;border-radius:50%;background:var(--wh-vellum);box-shadow:0 0 0 1.5px var(--wh-symbol-ink)}
${M} .wh-seal-dot-n{top:-2.5px;left:calc(50% - 2.5px)}${M} .wh-seal-dot-s{bottom:-2.5px;left:calc(50% - 2.5px)}${M} .wh-seal-dot-w{left:-2.5px;top:calc(50% - 2.5px)}${M} .wh-seal-dot-e{right:-2.5px;top:calc(50% - 2.5px)}
${M} .wh-seal-glyph{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:var(--wh-symbol);font-weight:300;line-height:1;color:var(--wh-symbol-ink);font-variant-emoji:text;text-shadow:.5px .6px 0 var(--wh-symbol-ghost)}
${M} .wh-seal-label{${LABEL};font-size:11px;color:var(--color-text-subtle)}
${M} .wh-moonphases{display:inline-flex;align-items:center;gap:4px}
${M} .wh-moonphases-label{${LABEL};font-size:11px;color:var(--color-text-subtle);margin-left:8px}
${M} .wh-block-moonstrip{padding-top:0;padding-bottom:0}

${M} .wh-frame{position:relative;margin:0;width:100%;overflow:hidden;border-radius:var(--wh-arch);background:var(--wh-gradient-dusk);box-shadow:0 0 0 1px var(--wh-hairline),var(--wh-shadow-soft)}
${M} .wh-frame[data-shape="petal"]{border-radius:var(--wh-petal-lg)}
${M} .wh-frame[data-shape="circle"]{border-radius:50%;aspect-ratio:1}
${M} .wh-frame[data-shape="rect"]{border-radius:var(--wh-petal-sm)}
${M} .wh-frame img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:saturate(.86) contrast(.94) brightness(1.02) sepia(.08)}
${M} .wh-frame[data-grade="none"] img{filter:none}
${M} .wh-frame-grade{position:absolute;inset:0;background:var(--wh-wash-blush),var(--wh-grain);mix-blend-mode:multiply;opacity:.9;box-shadow:inset 0 0 40px var(--wh-a-ink-12)}
${M} .wh-frame[data-grade="dusk"] .wh-frame-grade{background:linear-gradient(170deg,var(--wh-a-wash-violet),var(--wh-a-violet-12)),var(--wh-grain)}
${M} .wh-frame-caption{position:absolute;left:18px;right:18px;bottom:16px;${LABEL};font-size:11px;color:var(--wh-vellum);text-shadow:0 1px 3px var(--wh-a-ink-12)}
${M} .wh-frame-credit{position:absolute;right:12px;top:10px;${LABEL};font-size:10px;letter-spacing:.08em;color:var(--wh-vellum);opacity:.85}
${M} .wh-block-photo{position:relative}
${M} .wh-block-photo .wh-glyph-watermark{right:-20px;top:-40px;bottom:auto}

${M} .wh-path{list-style:none;margin:0;padding:8px 0 0;display:grid;grid-template-columns:repeat(var(--wh-path-n,6),minmax(0,1fr));gap:16px;position:relative}
${M} .wh-path::before{content:"";position:absolute;left:24px;right:24px;top:31px;height:1.5px;background:linear-gradient(90deg,var(--wh-symbol-line),var(--wh-symbol-line-soft))}
@media (max-width:900px){${M} .wh-path{grid-template-columns:repeat(3,minmax(0,1fr))}${M} .wh-path::before{display:none}}
@media (max-width:520px){${M} .wh-path{grid-template-columns:repeat(2,minmax(0,1fr))}}
${M} .wh-path li{position:relative;display:flex;flex-direction:column;gap:10px}
${M} .wh-path-moon{width:48px;height:48px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:var(--wh-parchment)}
${M} .wh-path h3{margin:0;${DISPLAY};font-size:1.5rem;line-height:1.1;color:var(--wh-witch)}
${M} .wh-path p{margin:0;font-size:1rem;line-height:1.4;color:var(--color-text-muted)}

${M} .wh-seals{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:14px}
${M} .wh-seals[data-cols="4"]{grid-template-columns:repeat(4,minmax(0,1fr))}${M} .wh-seals[data-cols="3"]{grid-template-columns:repeat(3,minmax(0,1fr))}${M} .wh-seals[data-cols="2"]{grid-template-columns:repeat(2,minmax(0,1fr))}
@media (max-width:900px){${M} .wh-seals[data-cols]{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:520px){${M} .wh-seals[data-cols]{grid-template-columns:minmax(0,1fr)}}
${M} .wh-seals li{display:flex;flex-direction:column;align-items:flex-start;gap:12px;padding:22px;border-radius:var(--wh-petal-md);border:1px solid var(--wh-hairline);background:var(--wh-grain),var(--wh-gradient-vellum)}
${M} .wh-seals h3{margin:0;${DISPLAY};font-size:1.5rem;line-height:1.1;color:var(--wh-witch)}
${M} .wh-seals p{margin:0;font-size:1.05rem;line-height:1.45;color:var(--color-text-muted)}

${M} .wh-season-grid{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,4fr) minmax(0,4fr);gap:16px}
@media (max-width:960px){${M} .wh-season-grid{grid-template-columns:minmax(0,1fr)}}
${M} .wh-card-now{padding:0;border:2px solid var(--wh-season);background:var(--wh-wash-violet),var(--wh-grain),var(--wh-gradient-vellum);box-shadow:var(--wh-aura)}
${M} .wh-card-now>*:not(.wh-card-photo){margin-left:24px;margin-right:24px}
${M} .wh-card-now>.wh-card-row{margin-top:24px}
${M} .wh-card-now>:last-child{margin-bottom:24px}
${M} .wh-card-photo{height:220px;border-radius:0!important;box-shadow:none;flex:none}
${M} .wh-card .wh-row-date{white-space:nowrap}
${M} .wh-card-date{${DISPLAY};font-size:clamp(2.4rem,4vw,3.5rem);line-height:1.04;color:var(--wh-witch)}
${M} .wh-beats-list{list-style:none;margin:auto 0 0;padding:0;display:flex;flex-direction:column;gap:8px}
${M} .wh-beats-list li{display:grid;grid-template-columns:22px 1fr;gap:8px;align-items:baseline}
${M} .wh-beat-letter{${DISPLAY};font-style:italic;font-size:18px;color:var(--wh-symbol-ink)}
${M} .wh-card-sky{background:var(--wh-stars),var(--wh-wash-moon),var(--wh-grain),var(--wh-gradient-dusk);background-size:var(--wh-stars-size),auto,auto,auto}
${M} .wh-card-glyph{display:flex;justify-content:center;margin-top:auto;opacity:.5}
${M} .wh-rows{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
${M} .wh-card .wh-row{grid-template-columns:auto 22px minmax(0,1fr)}

${M} .wh-block-retreat{max-width:none;padding-left:0;padding-right:0}
${M} .mw-other:has(.wh-block-retreat){max-width:1200px;padding-left:0;padding-right:0}
${M} .wh-retreat{position:relative;overflow:hidden;border-radius:var(--wh-petal-lg);padding:clamp(48px,6vw,72px) clamp(20px,4vw,48px);background:var(--wh-smoke),var(--wh-wash-madder),var(--wh-wash-moon),var(--wh-grain),var(--wh-gradient-dusk);border-top:1px solid var(--wh-hairline);border-bottom:1px solid var(--wh-hairline)}
${M} .wh-retreat-watermark{position:absolute;right:-60px;bottom:-140px;pointer-events:none}
${M} .wh-retreat-watermark .wh-glyph-watermark{right:0;bottom:0}
${M} .wh-retreat>.wh-retreat-photo,${M} .wh-retreat>.wh-retreat-copy{position:relative}
${M} .wh-retreat{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,6fr);gap:clamp(32px,5vw,64px);align-items:center}
@media (max-width:900px){${M} .wh-retreat{grid-template-columns:minmax(0,1fr)}}
${M} .wh-retreat-photo .wh-frame{height:clamp(320px,40vw,560px)}
${M} .wh-retreat-seal{position:absolute;left:-22px;bottom:40px}
${M} .wh-retreat-copy{display:flex;flex-direction:column;gap:22px;max-width:620px}
${M} .wh-days{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
@media (max-width:620px){${M} .wh-days{grid-template-columns:minmax(0,1fr)}}
${M} .wh-days li{display:flex;flex-direction:column;gap:6px;padding:16px;border-radius:var(--wh-petal-md);border:1px solid var(--wh-hairline);background:var(--wh-grain),var(--wh-gradient-vellum)}
${M} .wh-days li[data-accent]{background:var(--wh-wash-madder),var(--wh-grain),var(--wh-gradient-vellum);border-color:var(--wh-symbol-line-soft)}
${M} .wh-days li[data-accent] .wh-label{color:var(--wh-madder)}
${M} .wh-days h3{margin:0;${DISPLAY};font-size:1.4rem;line-height:1.1;color:var(--wh-witch)}
${M} .wh-days p{margin:0;font-family:var(--wh-ui);font-size:14px;line-height:1.4;color:var(--color-text-muted)}

${M} .wh-mark-split{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,7fr);gap:clamp(32px,5vw,56px);align-items:start}
@media (max-width:860px){${M} .wh-mark-split{grid-template-columns:minmax(0,1fr)}}
${M} .wh-mark-card{position:sticky;top:160px;display:flex;justify-content:center;align-items:center;min-height:320px;padding:32px;border-radius:var(--wh-petal-lg);background:var(--wh-wash-violet),var(--wh-grain),var(--wh-gradient-vellum);border:1px solid var(--wh-hairline)}
${M} .wh-mark-logo{width:min(100%,360px);height:auto;filter:url(#wh-ink-fine)}
${M} .wh-mark-name{${DISPLAY};font-size:clamp(2.4rem,4vw,3.5rem);color:var(--wh-witch)}
${M} .wh-mark-copy{display:flex;flex-direction:column;gap:22px}
${M} .wh-mark-copy .wh-lead{max-width:none}

${W} .hs-footer-top{width:100%;box-sizing:border-box;max-width:1200px;margin:clamp(48px,6vw,80px) auto 0;padding:clamp(40px,5vw,56px) clamp(20px,4vw,48px) 24px;display:grid;grid-template-columns:minmax(0,2fr) minmax(0,3fr);gap:32px clamp(32px,6vw,96px);border-top:1px solid var(--wh-hairline)}
@media (max-width:760px){${W} .hs-footer-top{grid-template-columns:minmax(0,1fr)}}
${W} .hs-footer-brand{display:flex;flex-direction:column;align-items:flex-start;gap:16px}
${W} .hs-footer-logo{height:auto;width:150px;max-width:40vw;filter:url(#wh-ink-fine)}
${W} .hs-footer-brand .hs-brand{display:flex;flex-direction:column;align-items:flex-start;gap:16px;font-size:clamp(22px,3vw,28px)}
${W} .hs-footer-ornament{width:100%;max-width:1200px;margin:0 auto;padding:8px clamp(20px,4vw,48px) 16px}
${W} .hs-footer-brand p{margin:0;max-width:42ch;font-size:1.05rem;line-height:1.6;color:var(--color-text-muted)}
${W} .hs-footer-links{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px 24px;align-content:start}
${W} .hs-footer-links a{${LABEL};font-size:11px;color:var(--color-text-muted)}
${W} .hs-footer-links a:hover{color:var(--color-primary-strong)}
${W} .hs-footer{max-width:1200px;padding:24px clamp(20px,4vw,48px) 40px;border-top:1px solid var(--wh-hairline);${LABEL};font-size:11px;color:var(--color-text-muted)}
${W} .hs-footer a{color:var(--color-text-muted);font-weight:500}
${W} .hs-footer a:hover{color:var(--color-primary-strong)}
${W} .hs-nav .hs-nav-admin{display:flex;align-items:stretch;gap:10px}
${W} .hs-nav-admin-tag{${LABEL};padding:0;display:flex;align-items:center;color:var(--color-signal-strong)}
${W} .hs-nav .hs-nav-admin a{color:var(--color-signal-strong)}
${W} .hs-nav-admin-sep{display:flex;align-items:center;color:var(--color-signal-strong);opacity:.6}
${W} .hs-nav .hs-nav-admin a:hover,${W} .hs-nav .hs-nav-admin a[aria-current="page"]{color:var(--color-signal);border-bottom-color:var(--color-signal)}
${W} .hs-menu-panel a.hs-nav-admin{color:var(--color-signal-strong)}

${W} .hs-admin{width:100%;box-sizing:border-box;max-width:1200px;margin:0 auto 24px;padding:0 clamp(20px,4vw,48px)}
${W} .hs-admin-in{padding:14px clamp(16px,3vw,24px);display:flex;flex-wrap:wrap;align-items:center;gap:12px 24px;border-radius:var(--wh-petal-md);background:var(--wh-gradient-nightshade);color:var(--color-on-ink)}
${W} .hs-admin-tag{${LABEL};font-size:11px;padding:5px 12px;border-radius:var(--wh-pill);background:var(--wh-vellum);color:var(--wh-witch)}
${W} .hs-admin-nav{display:flex;flex-wrap:wrap;gap:12px 24px}
${W} .hs-admin-nav a{${LABEL};font-size:12px;border-bottom:1.5px solid transparent;color:var(--color-on-ink);text-decoration:none;transition:border-color ${EASE}}
${W} .hs-admin-nav a:hover,${W} .hs-admin-nav a[aria-current="page"]{border-bottom-color:var(--color-on-ink)}
@media (prefers-reduced-motion:reduce){${W} *{transition:none!important;animation:none!important}}
`
