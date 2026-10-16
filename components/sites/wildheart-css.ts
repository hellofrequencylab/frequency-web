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

${W} .wh-fixed{position:fixed;top:0;left:0;right:0;z-index:50;background:color-mix(in srgb,var(--wh-parchment) 97%,transparent);border-bottom:1px solid var(--wh-hairline)}
${W} .wh-fixed-spacer{height:var(--wh-header-total);flex:none}
${W} .hs-header{position:static;top:auto;padding:0;background:transparent;-webkit-backdrop-filter:none;backdrop-filter:none;border-bottom:0;transition:none}
${W} .hs-header[data-hidden]{opacity:1;transform:none;pointer-events:auto}
${W} .hs-pill{display:flex;justify-content:flex-start;gap:20px;overflow:visible;max-width:1200px;min-height:var(--wh-header-h);padding:0 var(--wh-col-pad);border-radius:0;background:transparent;-webkit-backdrop-filter:none;backdrop-filter:none;box-shadow:none;animation:none}
${W} .hs-brand{display:inline-flex;padding-left:0;align-items:center;gap:10px;font-size:clamp(22px,5vw,28px);line-height:1;letter-spacing:.02em;color:var(--wh-witch);flex:none}
${W} .hs-logo{height:clamp(32px,6vw,46px);width:auto;filter:none}
${W} .hs-brand-name{font-family:var(--wh-display)}
${W} .wh-logo{display:block;flex:none;overflow:visible}
${W} .wh-logo-word{font-family:var(--wh-display);font-weight:400;letter-spacing:var(--wh-tracking-wordmark,.02em)}
${W} .wh-logo-header{height:46px}
${W} .hs-nav{display:none;align-self:stretch;flex:1;min-width:0;overflow:visible;-webkit-mask-image:none;mask-image:none}
${W} .hs-nav-track{height:100%;align-items:stretch;gap:20px;width:100%;margin:0;padding:0;overflow:visible}
@media (min-width:720px){${W} .hs-nav{display:flex}}
${W} .hs-nav a{${LABEL};display:flex;align-items:center;position:relative;height:var(--wh-header-h);padding:0;border-radius:0;border-bottom:0;white-space:nowrap;color:var(--wh-secondary);transition:color ${EASE}}
${W} .hs-nav a::after{content:"";position:absolute;left:0;right:0;bottom:0;height:1.5px;background:var(--wh-gradient-violet);opacity:0;transition:opacity ${EASE}}
${W} .hs-nav a:hover,${W} .hs-nav a[aria-current="page"]{background:transparent;color:var(--wh-witch);border-image:none}
${W} .hs-nav a[aria-current="page"]::after{opacity:1}
${W} .hs-header .hs-btn-dark{display:none}
${W} .hs-member{${LABEL};font-size:11px;padding:8px 14px;border-radius:var(--wh-pill);border:1px solid var(--wh-hairline);background:var(--wh-gradient-vellum);color:var(--color-text-muted);transition:color ${EASE},box-shadow ${EASE}}
${W} .hs-member:hover{color:var(--color-primary-strong);border-color:var(--wh-border-strong);box-shadow:var(--wh-aura)}
${W} .hs-member:active{background:var(--wh-aged);box-shadow:none}
${W} .hs-member-pill{display:flex;align-items:center;gap:10px;padding:6px 6px 6px 14px;text-transform:none;letter-spacing:0}
${W} .hs-member-text{display:flex;flex-direction:column;align-items:flex-end;gap:2px}
${W} .hs-member-label{${LABEL};font-size:11px;color:var(--color-text)}
${W} .hs-member-line{font-family:var(--wh-ui);font-weight:500;font-size:11px;letter-spacing:.08em;color:var(--color-text-subtle)}
${W} .hs-member-avatar{width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:var(--wh-gradient-blush);box-shadow:0 0 0 1.5px var(--wh-symbol-line-soft);font-family:var(--wh-display);font-size:16px;color:var(--wh-witch)}
@media (max-width:1179px){${W} .hs-member-text{display:none}${W} .hs-member-pill{padding:6px}}
${W} .hs-logo-avatar{border-radius:50%;box-shadow:0 0 0 1.5px var(--wh-symbol-line-soft)}
${W} .hs-logo-image{border-radius:0;box-shadow:none}
${W} .hs-header-actions{gap:10px;margin-left:auto;flex:none}
${W} .hs-nav .hs-nav-admin{display:flex;align-items:center;gap:6px;margin-left:auto;align-self:center;padding:2px 3px 2px 9px;border-radius:var(--wh-pill);background:var(--wh-gradient-nightshade);box-shadow:var(--wh-shadow-soft)}
${W} .hs-nav-admin-tag{${LABEL};font-size:11px;padding:0;display:flex;align-items:center;color:var(--wh-lavender)}
${W} .hs-nav-admin-colon{display:none}
${W} .hs-nav-admin-sep{display:none}
${W} .hs-nav .hs-nav-admin a{height:auto;padding:4px 10px;border-radius:var(--wh-pill);background:var(--wh-a-vellum-12);color:var(--wh-vellum);font-family:var(--wh-ui);font-weight:500;font-size:12px;letter-spacing:0;text-transform:none;line-height:1.2}
${W} .hs-nav .hs-nav-admin a::after{display:none}
${W} .hs-nav .hs-nav-admin a:hover,${W} .hs-nav .hs-nav-admin a[aria-current="page"]{color:var(--wh-vellum);background:var(--wh-a-lavender-75);border-bottom-color:transparent}
${W} .hs-menu-panel a.hs-nav-admin{color:var(--wh-symbol-ink)}

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

${W} .hs-plain{max-width:var(--wh-col)}

${W} .hs-season{max-width:none;margin:0;border-top:1px solid var(--wh-hairline);border-bottom:0;padding:0;overflow:hidden;max-height:60px;opacity:1;background:transparent;transition:max-height var(--wh-dur-slow) var(--wh-ease),opacity ${EASE}}
${W} .hs-season-in{margin:0 auto;max-width:1200px;padding:10px var(--wh-col-pad);display:flex;justify-content:space-between;align-items:center;gap:20px;flex-wrap:nowrap}
${W} .hs-season-now{margin:0;min-width:0;overflow:hidden;white-space:nowrap}
${W} .hs-season-track{display:none}
${W} .hs-season-next{margin:0;${LABEL};font-size:11px;color:var(--color-text-subtle);white-space:nowrap;flex:none}
${W} .hs-season-next span{color:var(--color-text);margin-right:8px}
@supports (animation-timeline:scroll()){${W} .hs-season{animation:wh-fold linear both;animation-timeline:scroll(root);animation-range:40px 41px}}
@keyframes wh-fold{to{max-height:0;opacity:0}}
@media (max-width:719px){${W} .hs-season-next,${W} .wh-nowline-house-part{display:none}${W} .wh-nowline-house-part>*{display:none}${W} .wh-fixed-spacer{height:64px}${W} .hs-season{display:none}${W} .hs-pill{min-height:64px;padding:10px 18px;gap:12px}${W} .hs-brand{font-size:22px}${W} .hs-logo{height:38px}${W} .wh-logo-header{height:38px;width:auto}${W} .hs-menu-button{width:auto;height:44px;padding:0 18px;${UI};color:var(--wh-symbol-ink);border-color:var(--wh-symbol-line-soft)}${W} .hs-menu-button svg{display:none}${W} .hs-menu-button .hs-menu-label{position:static;width:auto;height:auto;overflow:visible;clip:auto;white-space:nowrap}${W} .hs-menu-panel{top:64px}${W} .hs-member-pill{display:none}}

${W} .wh-nowline{margin:0;display:inline-flex;flex-wrap:wrap;gap:8px;align-items:center;${LABEL};font-size:11px;color:var(--color-text-muted)}
${W} .wh-nowline>span{display:inline-flex;gap:6px;align-items:center;white-space:nowrap}
${W} .wh-nowline-season{color:var(--wh-season-ink)}
${W} .wh-nowline-moon{display:inline-flex;gap:6px;align-items:center;white-space:nowrap;color:var(--wh-symbol-ink)}
${W} .wh-nowline-dot{width:3px;height:3px;border-radius:50%;background:var(--wh-symbol-line)}

${W} .wh-glyph{font-family:var(--wh-symbol);font-weight:300;line-height:1;color:var(--wh-symbol-ink);font-variant-emoji:text;text-shadow:.5px .6px 0 var(--wh-symbol-ghost);display:inline-flex;align-items:center;justify-content:center;filter:url(#wh-ink-fine)}
${W} .wh-glyph-halo{position:relative;border-radius:50%;background:var(--wh-wash-moon),var(--wh-grain),var(--wh-gradient-lavender);box-shadow:0 0 0 1.5px var(--wh-symbol-ink),0 0 0 4.5px var(--wh-vellum),0 0 0 5.5px var(--wh-symbol-line-soft)}
${W} .wh-glyph-halo::before{content:"";position:absolute;inset:4px;border-radius:50%;border:1.5px dotted var(--wh-symbol-ink)}
${W} .wh-glyph-watermark{position:absolute;right:4%;bottom:0;opacity:var(--wh-watermark);filter:none;pointer-events:none;text-shadow:none}
${W} .wh-moon{display:inline-block;vertical-align:middle;flex:none;border-radius:50%;overflow:visible}
${W} .wh-moon-dark{fill:var(--wh-lavender)}
${W} .wh-moon-lit{fill:var(--wh-vellum)}
${W} .wh-moon-ring{fill:none;stroke:var(--wh-symbol-ink);stroke-width:var(--wh-symbol-stroke)}
${W} .wh-seed{width:12px;height:12px;border-radius:50%;background:var(--wh-grain),var(--wh-gradient-season);box-shadow:0 0 0 1.5px var(--wh-symbol-line-soft);flex:none}

${W} .wh-block{width:100%;max-width:var(--wh-col);margin:0 auto;padding:clamp(40px,6vw,80px) clamp(20px,4vw,var(--wh-col-pad));box-sizing:border-box}
${W} .wh-block-head{display:flex;flex-direction:column;gap:10px;margin-bottom:28px;max-width:52rem}
${W} .wh-block-head-centred{max-width:720px;margin-left:auto;margin-right:auto;text-align:center;align-items:center;gap:10px;margin-bottom:8px}
${W} .wh-block-head h2{${DISPLAY};font-size:clamp(2.375rem,5vw,3.5rem);line-height:1.04;margin:0;color:var(--wh-witch);text-wrap:balance}
${W} .wh-block-head p{margin:0;font-size:21px;line-height:1.6;color:var(--color-text-muted);max-width:64ch}
${W} .wh-label{${LABEL};font-size:11px;color:var(--color-text-subtle)}
${W} .wh-label-season{color:var(--wh-season-ink)}
${W} .wh-journey-empty{margin:0;font-style:italic;color:var(--color-text-muted)}

${W} .wh-row{display:grid;grid-template-columns:58px 22px minmax(0,1fr);gap:10px;align-items:center;width:100%;box-sizing:border-box;text-align:left;padding:7px 10px;border-radius:var(--wh-petal-sm);border:1px solid var(--wh-hairline);background:var(--wh-gradient-vellum);color:var(--color-text);text-decoration:none;font:inherit;cursor:default;transition:box-shadow ${EASE}}
${W} :is(a,button).wh-row{cursor:pointer}
${W} :is(a,button).wh-row:hover{box-shadow:var(--wh-aura);border-color:var(--wh-border-strong)}
${W} :is(a,button).wh-row:active{background:var(--wh-aged);box-shadow:none}
${W} .wh-row[aria-current="date"]{border-color:var(--wh-symbol-line);background:var(--wh-wash-violet),var(--wh-gradient-vellum);box-shadow:var(--wh-aura)}
${W} .wh-row-date{${LABEL};font-size:11px;color:var(--color-text-subtle)}
${W} .wh-row-mark{display:flex;justify-content:center}
${W} .wh-row-text{display:flex;flex-direction:column;min-width:0}
${W} .wh-row-title{font-family:var(--wh-body);font-size:15px;line-height:1.2}
${W} .wh-row-note{font-family:var(--wh-ui);font-size:12px;color:var(--color-text-subtle)}
@media (max-width:420px){${W} .wh-row{grid-template-columns:22px minmax(0,1fr);grid-template-areas:"date date" "mark text";row-gap:4px}${W} .wh-row-date{grid-area:date}${W} .wh-row-mark{grid-area:mark}${W} .wh-row-text{grid-area:text}}

${W} .wh-constellation-line{stroke:var(--wh-symbol-line)}
${W} .wh-constellation-dot{fill:var(--wh-symbol-ink)}
${W} .wh-constellation-spark{fill:var(--wh-vellum)}
${W} .wh-constellation-core{stop-color:var(--wh-vellum)}
${W} .wh-constellation-halo{stop-color:var(--wh-lavender)}
${W} .wh-constellation-fade{stop-color:var(--wh-violet-text);stop-opacity:0}
${W} .wh-chip{${LABEL};display:inline-flex;align-items:center;font-family:var(--wh-ui);font-size:12px;letter-spacing:0;text-transform:none;line-height:1.2;padding:5px 11px;border-radius:var(--wh-pill);border:1px solid var(--wh-hairline);background:transparent;color:var(--color-text-subtle);cursor:pointer;transition:background ${EASE},color ${EASE},border-color ${EASE}}
${W} .wh-chip[aria-pressed="true"]{border-color:transparent;background:var(--wh-gradient-lavender);color:var(--wh-violet-text)}
${W} .wh-chip:focus-visible{outline:none;box-shadow:var(--wh-ring-focus)}

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

${M} .mw-hero-split .mw-hero-inner::after{content:"";position:absolute;right:-40px;top:-60px;font-family:var(--wh-symbol);font-weight:300;font-size:300px;line-height:1;color:var(--wh-symbol-ink);opacity:var(--wh-watermark);pointer-events:none;text-shadow:none}
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
${M} .mw-parts-top .mw-label{font-size:0}
${M} .mw-parts-top .mw-label::before{content:counter(wh-part,upper-roman);${DISPLAY};font-style:italic;font-size:22px;letter-spacing:0;text-transform:none;color:var(--wh-symbol-ink)}

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

${M} .mw-story-right{grid-template-columns:minmax(0,7fr) minmax(0,5fr)}

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
${M} .mw-weeks li:hover{box-shadow:var(--wh-aura)}
${M} .mw-weeks li[data-phase]::after{content:"";position:absolute;right:18px;top:18px;width:18px;height:18px;border-radius:50%;background:linear-gradient(90deg,var(--wh-lavender) var(--wh-lit-from,0%),var(--wh-vellum) var(--wh-lit-from,0%),var(--wh-vellum) var(--wh-lit-to,0%),var(--wh-lavender) var(--wh-lit-to,0%));box-shadow:0 0 0 var(--wh-symbol-stroke) var(--wh-symbol-ink)}
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
${M} .wh-card-row{display:flex;align-items:center;gap:10px}
${M} .wh-tag{${LABEL};font-size:11px;display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:var(--wh-pill);border:1px solid var(--wh-hairline);background:var(--wh-gradient-vellum);color:var(--color-text-muted);line-height:1.2}
${M} .wh-tag-season{background:var(--wh-gradient-season);border-color:transparent;color:var(--wh-text-on-season)}

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

${M} .wh-season-grid{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,4fr) minmax(0,4fr);gap:16px}
@media (max-width:960px){${M} .wh-season-grid{grid-template-columns:minmax(0,1fr)}}
${M} .wh-card-now>*:not(.wh-card-photo){margin-left:24px;margin-right:24px}
${M} .wh-card-now>.wh-card-row{margin-top:24px}
${M} .wh-card-now>:last-child{margin-bottom:24px}
${M} .wh-card-photo{height:220px;border-radius:0!important;box-shadow:none;flex:none}
${M} .wh-card .wh-row-date{white-space:nowrap}
${M} .wh-beats-list{list-style:none;margin:auto 0 0;padding:0;display:flex;flex-direction:column;gap:8px}
${M} .wh-beats-list li{display:grid;grid-template-columns:22px 1fr;gap:8px;align-items:baseline}
${M} .wh-beat-letter{${DISPLAY};font-style:italic;font-size:18px;color:var(--wh-symbol-ink)}
${M} .wh-card-sky{background:var(--wh-stars),var(--wh-wash-moon),var(--wh-grain),var(--wh-gradient-dusk);background-size:var(--wh-stars-size),auto,auto,auto}
${M} .wh-card-glyph{display:flex;justify-content:center;margin-top:auto;opacity:.5}
${M} .wh-rows{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
${M} .wh-card .wh-row{grid-template-columns:auto 22px minmax(0,1fr)}

${M} .wh-retreat-watermark{position:absolute;right:-60px;bottom:-140px;pointer-events:none}
${M} .wh-retreat-watermark .wh-glyph-watermark{right:0;bottom:0}
${M} .wh-retreat>.wh-retreat-photo,${M} .wh-retreat>.wh-retreat-copy{position:relative}
${M} .wh-retreat-seal{position:absolute;left:-22px;bottom:40px}
@media (max-width:620px){${M} .wh-days{grid-template-columns:minmax(0,1fr)}}
${M} .wh-days li[data-accent]{background:var(--wh-wash-madder),var(--wh-grain),var(--wh-gradient-vellum);border-color:var(--wh-symbol-line-soft)}
${M} .wh-days li[data-accent] .wh-label{color:var(--wh-madder)}
${M} .wh-days p{margin:0;font-family:var(--wh-ui);font-size:14px;line-height:1.4;color:var(--color-text-muted)}

${M} .wh-mark-split{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,7fr);gap:clamp(32px,5vw,56px);align-items:start}
@media (max-width:860px){${M} .wh-mark-split{grid-template-columns:minmax(0,1fr)}}
${M} .wh-mark-name{${DISPLAY};font-size:clamp(2.4rem,4vw,3.5rem);color:var(--wh-witch)}
${M} .wh-mark-copy{display:flex;flex-direction:column;gap:22px}
${M} .wh-mark-copy .wh-lead{max-width:none}

${W} .hs-footer-top{width:100%;box-sizing:border-box;max-width:1200px;margin:96px auto 0;padding:56px var(--wh-col-pad) 32px;display:grid;grid-template-columns:minmax(0,2fr) minmax(0,3fr);gap:40px;border-top:0}
${W} .hs-footer-top[data-columns]{grid-template-columns:minmax(0,2fr) repeat(3,minmax(0,1fr))}
${W}.hs-root{overflow-x:clip}
body:has(${W}){overflow-x:hidden}
${W} .hs-admin{display:none}
${W} .hs-root>.hs-footer-top,${W} .hs-root>.hs-footer-ornament,${W} .hs-root>.hs-footer,${W} .hs-root>.hs-admin{background:transparent}
${W} .wh-footer-ground{border-top:1px solid var(--wh-hairline);background:var(--wh-wash-moon),var(--wh-grain),var(--wh-gradient-vellum)}
@media (max-width:760px){${W} .hs-footer-top,${W} .hs-footer-top[data-columns]{grid-template-columns:minmax(0,1fr);justify-items:center;text-align:center;padding:32px 20px 0;margin-top:56px;gap:24px}${W} .hs-footer-top .hs-footer-col{display:none}}
${W} .hs-footer-brand{display:flex;flex-direction:column;align-items:flex-start;gap:16px}
${W} .hs-footer-logo{height:170px;width:auto}
${W} .hs-footer-brand .hs-brand{display:flex;flex-direction:column;align-items:flex-start;gap:16px;font-size:clamp(22px,3vw,28px)}
${W} .hs-footer-ornament{width:100%;max-width:1200px;margin:0 auto;padding:16px var(--wh-col-pad) 24px}
${W} .hs-footer-brand p{margin:0;max-width:38ch;font-size:17px;line-height:1.6;color:var(--color-text-muted)}
${W} .hs-footer-links{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px 24px;align-content:start}
${W} .hs-footer-links a{${LABEL};font-size:11px;color:var(--color-text-muted)}
${W} .hs-footer-links a:hover{color:var(--color-primary-strong)}
${W} .hs-footer-col{display:flex;flex-direction:column;gap:12px}
${W} .hs-footer-col-title{${LABEL};font-size:11px;color:var(--color-text-subtle)}
${W} .hs-footer-col a{font-family:var(--wh-body);font-size:19px;line-height:1.3;color:var(--color-text-muted);text-decoration:none}
${W} .hs-footer-col a:hover{color:var(--color-primary-strong)}
${W} .hs-footer{max-width:1200px;padding:0 var(--wh-col-pad) 32px;border-top:0;${LABEL};font-size:11px;color:var(--color-text-subtle);display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}
${W} .hs-footer a{color:var(--color-text-subtle);font-weight:500}
${W} .hs-footer a:hover{color:var(--color-primary-strong)}
${W} .hs-footer a.hs-partner{${LABEL};font-size:10px;gap:8px;padding:7px 14px 7px 11px;border:1px solid var(--wh-hairline);background:transparent;color:var(--color-text-subtle)}
${W} .hs-footer a.hs-partner b{font-weight:600;color:var(--color-text-muted)}
@media (max-width:760px){${W} .hs-footer a.hs-partner{margin:0 auto}}
${W} .hs-footer-line{text-align:right}
${W} .hs-footer-note{display:none}
@media (max-width:760px){${W} .hs-footer{flex-direction:column;align-items:center;text-align:center;gap:14px;padding:16px 20px 40px}${W} .hs-footer-line{text-align:center}${W} .hs-footer-note{display:block;${UI};font-size:14px;letter-spacing:0;text-transform:none;color:var(--color-text-subtle)}${W} .hs-footer-brand{align-items:center}${W} .hs-footer-brand p{display:none}${W} .hs-footer-logo{height:150px}${W} .hs-footer-ornament{display:none}${W} .hs-footer>span:first-child{order:2}}
${W} .hs-nav-admin-tag{${LABEL}}

${W} .hs-admin{width:100%;box-sizing:border-box;max-width:1200px;margin:0 auto 24px;padding:0 var(--wh-col-pad)}
${W} .hs-admin-in{padding:14px clamp(16px,3vw,24px);display:flex;flex-wrap:wrap;align-items:center;gap:12px 24px;border-radius:var(--wh-petal-md);background:var(--wh-gradient-nightshade);color:var(--color-on-ink)}
${W} .hs-admin-tag{${LABEL};font-size:11px;padding:5px 12px;border-radius:var(--wh-pill);background:var(--wh-vellum);color:var(--wh-witch)}
${W} .hs-admin-nav{display:flex;flex-wrap:wrap;gap:12px 24px}
${W} .hs-admin-nav a{${LABEL};font-size:12px;border-bottom:1.5px solid transparent;color:var(--color-on-ink);text-decoration:none;transition:border-color ${EASE}}
${W} .hs-admin-nav a:hover,${W} .hs-admin-nav a[aria-current="page"]{border-bottom-color:var(--color-on-ink)}


${M} .mw-page{padding-bottom:96px}
${M} .mw-wrap{max-width:var(--wh-col);padding-left:var(--wh-col-pad);padding-right:var(--wh-col-pad)}
${M} .mw-sec{padding-top:96px}
${M} .mw-other{padding-top:96px}
${M} .mw-page:has(.wh-moonstrip-head) :is(.mw-sec,.mw-other){padding-top:72px}
${M} .mw-page:has(.wh-sm-centered,.mw-circle-grid,.wh-mark-split) :is(.mw-sec,.mw-other){padding-top:56px}
${M} .mw-other .wh-block{max-width:none;padding-left:0;padding-right:0}
${M} .mw-other>div{padding-top:0;padding-bottom:0}
${M} .mw-other>div>*{margin-top:0;margin-bottom:0}
${M} .mw-hero{padding-top:56px;overflow-x:clip}
${M} .mw-hero-inner{gap:56px}
${M} .mw-hero-photo{width:calc(100% - 2 * var(--wh-col-pad));max-width:var(--wh-col);margin:40px auto 0;height:clamp(300px,40vw,540px)}
${M} .mw-hero-split .mw-hero-inner{position:relative;grid-template-columns:minmax(0,7fr) minmax(0,5fr);align-items:center}
${M} .mw-page:has(.wh-moonstrip-head) .mw-hero-split .mw-hero-inner,${M} .mw-page:has(.mw-circle-grid) .mw-hero-split .mw-hero-inner{align-items:end;gap:48px}
${M} .mw-page:has(.wh-moonstrip-head) .mw-hero-split .mw-photo{height:320px}
${M} .mw-page:has(.mw-circle-grid) .mw-hero-split .mw-photo{height:300px;border-radius:var(--wh-petal-lg)}
${M} .mw-page:has(.mw-circle-grid) .mw-hero-split .mw-photo img{object-position:center 30%}
${M} .mw-hero-split .mw-photo{height:540px;max-height:none;aspect-ratio:auto}
${M} .mw-hero-copy{max-width:none;display:flex;flex-direction:column;gap:24px}
${M} .mw-hero-copy .mw-kicker{margin:0;color:var(--color-text-subtle)}
${M} .mw-hero-copy .mw-display{font-size:clamp(64px,7.4vw,108px);line-height:.98}
${M} .mw-hero-copy .mw-lead{margin:0;max-width:52ch;font-size:21px;line-height:1.6;text-wrap:pretty}
${M} .mw-hero-copy .mw-actions{margin-top:0}
${M} .mw-hero-copy .hs-btn svg{display:none}
${M} .mw-hero-note{${LABEL};font-size:11px;margin:0;color:var(--color-text-subtle)}
${M} .mw-hero::after{content:"✶︎";position:absolute;left:46%;top:2%;font-family:var(--wh-symbol);font-size:10px;color:var(--wh-symbol-ink);opacity:.3;pointer-events:none}
${M} .mw-hero-split .mw-hero-inner::before{content:"✶︎";position:absolute;left:-3%;top:8%;font-family:var(--wh-symbol);font-size:14px;color:var(--wh-symbol-ink);opacity:.35;pointer-events:none}
${M} .mw-page:has(.mw-circle-grid) .mw-hero-split .mw-hero-inner::after,${M} .mw-page:has(.wh-moonstrip-head) .mw-hero-split .mw-hero-inner::after{content:none}
${M} .mw-hero-copy .mw-kicker::before{content:"☽︎";display:inline;font-family:var(--wh-symbol);font-weight:300;font-size:14px;margin-right:4px;color:var(--wh-symbol-ink)}
${M} .mw-page:has(.wh-moonstrip-head) .mw-hero-copy .mw-kicker::before,${M} .mw-page:has(.mw-circle-grid) .mw-hero-copy .mw-kicker::before,${M} .mw-page:has(.wh-sm-centered) .mw-hero-copy .mw-kicker::before{content:none}
${M} .mw-page:has(.wh-moonstrip-head) .mw-hero-copy .mw-kicker,${M} .mw-page:has(.mw-circle-grid) .mw-hero-copy .mw-kicker,${M} .mw-page:has(.wh-sm-centered) .mw-hero-copy .mw-kicker{color:var(--wh-symbol-ink)}
${M} .mw-page:has(.wh-moonstrip-head) .mw-hero-copy .mw-display,${M} .mw-page:has(.mw-circle-grid) .mw-hero-copy .mw-display,${M} .mw-page:has(.wh-sm-centered) .mw-hero-copy .mw-display,${M} .mw-hero-text .mw-hero-copy .mw-display{font-size:clamp(52px,5.6vw,80px);line-height:1}
${M} .mw-hero-text .mw-hero-copy{gap:14px}
${M} .mw-hero-text .mw-hero-copy .mw-kicker{color:var(--wh-symbol-ink)}
${M} .mw-hero-text .mw-hero-copy .mw-lead{max-width:58ch}
${M} .mw-hero-text .mw-hero-copy .mw-kicker::before{content:none}
${M} .mw-hero-copy .mw-kicker[data-glyph]::before{content:attr(data-glyph)}

${M} .mw-other:has(.wh-block-bridge){padding-top:56px}
${M} .wh-block-bridge{padding:0;margin:0 0 -56px}
${M} .mw-other:has(.wh-block-journey){padding-top:40px}
${M} .wh-block-journey .wh-block-head p{font-size:21px}

${W} .wh-yj{position:relative}
${W} .wh-yj-stage{position:sticky;display:grid;grid-template-rows:minmax(0,1fr) auto;gap:18px;padding:28px 0 22px;outline:none;overflow:hidden}
${W} .wh-yj-stage:focus-visible{box-shadow:none;outline:none}
${W} .wh-yj-glow{position:absolute;left:0;top:0;width:520px;height:520px;border-radius:50%;background:radial-gradient(closest-side,var(--wh-a-violet-13),var(--wh-a-madder-05) 55%,transparent);pointer-events:none;will-change:transform}
${W} .wh-yj-grid{position:relative;display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);gap:48px;align-items:center;min-height:0}
${W} .wh-yj-panels{position:relative;height:100%;min-height:300px}
${W} .wh-yj-panel{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;align-items:flex-end;text-align:right;gap:12px;will-change:opacity,transform}
${W} .wh-yj-panel-head{display:flex;align-items:center;gap:12px;flex-direction:row-reverse}
${W} .wh-yj-mark{width:46px;height:46px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:var(--wh-wash-moon),var(--wh-gradient-lavender);box-shadow:0 0 0 1.5px var(--wh-symbol-ink)}
${W} .wh-yj-mark-glyph{font-family:var(--wh-symbol);font-weight:300;font-size:20px;line-height:1;color:var(--wh-symbol-ink);font-variant-emoji:text}
${W} .wh-yj-title{margin:0;${DISPLAY};font-size:clamp(30px,3vw,44px);line-height:1.04;color:var(--wh-witch);text-wrap:balance}
${W} .wh-yj-note{color:var(--color-text-muted)}
${W} .wh-yj-teach{margin:0;font-family:var(--wh-body);font-size:18px;line-height:1.55;color:var(--color-text-muted);max-width:36ch;text-wrap:pretty}
${W} .wh-yj-passing{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:6px;margin-top:2px}
${W} .wh-yj-pill{display:flex;gap:8px;align-items:baseline;padding:4px 11px;border-radius:var(--wh-pill);border:1px solid var(--wh-hairline);background:var(--wh-gradient-vellum)}
${W} .wh-yj-pill-title{font-family:var(--wh-ui);font-size:13px;color:var(--color-text-muted)}
${W} .wh-yj-actions{display:flex;gap:12px;align-items:center;flex-wrap:wrap;justify-content:flex-end;margin-top:4px}
${W} .wh-btn-md{height:var(--wh-control-md);padding:0 20px;font-size:15px}
${W} .wh-yj-persp{perspective:1400px}
${W} .wh-yj-face{position:relative;touch-action:none;cursor:grab;user-select:none}
${W} .wh-yj-tilt{position:absolute;inset:0;will-change:transform}
${W} .wh-yj-disc{position:absolute;inset:0;border-radius:50%;overflow:hidden;background:var(--wh-wash-moon),var(--wh-gradient-vellum);box-shadow:0 0 0 1.5px var(--wh-symbol-ink),0 0 0 6px var(--wh-vellum),0 0 0 7px var(--wh-symbol-line-soft),0 30px 60px -20px var(--wh-a-night-28)}
${W} .wh-yj-stars{position:absolute;inset:-10%;background:var(--wh-stars);background-size:var(--wh-stars-size);opacity:.9;will-change:transform}
${W} .wh-yj-rotor{position:absolute;inset:0;will-change:transform}
${W} .wh-yj-rings{position:absolute;inset:0;overflow:visible}
${W} .wh-yj-hit{fill:transparent;transition:fill var(--wh-dur-fast)}
${W} .wh-yj-pick{cursor:pointer}
${W} .wh-yj-pick:hover .wh-yj-hit{fill:var(--wh-a-violet-12)}
${W} .wh-yj-active{fill:var(--wh-a-lavender-75);stroke:var(--wh-symbol-ink);stroke-width:.3}
${W} .wh-yj-ring{fill:none;stroke:var(--wh-symbol-line-soft);stroke-width:.25}
${W} .wh-yj-ring-dotted{fill:none;stroke:var(--wh-symbol-line);stroke-width:.3;stroke-dasharray:.4 .6}
${W} .wh-yj-tick{stroke:var(--wh-symbol-line-soft);stroke-width:.2}
${W} .wh-yj-month{stroke:var(--wh-symbol-line);stroke-width:.3}
${W} .wh-yj-month-label{font-family:var(--wh-ui);font-size:2.05px;letter-spacing:.35px;font-weight:600;fill:var(--color-text-subtle);text-anchor:middle;dominant-baseline:middle}
${W} .wh-yj-sign-line{stroke:var(--wh-symbol-ink);stroke-width:.35}
${W} .wh-yj-glyph{font-family:var(--wh-symbol);font-weight:300;font-size:4px;fill:var(--wh-symbol-ink);text-anchor:middle;dominant-baseline:middle}
${W} .wh-yj-glyph[data-on]{font-size:4.6px}
${W} .wh-yj-house{font-family:var(--wh-display);font-style:italic;font-size:1.9px;fill:var(--color-text-subtle);text-anchor:middle;dominant-baseline:middle}
${W} .wh-yj-season{fill:none;stroke:var(--wh-season);stroke-width:1.5;stroke-linecap:round;opacity:.5;transition:opacity var(--wh-dur-slow),stroke-width var(--wh-dur-slow)}
${W} .wh-yj-season[data-now]{stroke-width:2.6;opacity:1}
${W} .wh-yj-dot{fill:var(--wh-symbol-ink);opacity:.75}
${W} .wh-yj-dot[data-kind="moon"]{fill:var(--wh-vellum);stroke:var(--wh-symbol-ink);stroke-width:.2;opacity:1}
${W} .wh-yj-dot[data-kind="retreat"]{fill:var(--wh-madder)}
${W} .wh-yj-fest{fill:var(--wh-vellum);stroke:var(--wh-symbol-line);stroke-width:.3}
${W} .wh-yj-fest-star{font-family:var(--wh-symbol);font-size:1.9px;fill:var(--wh-symbol-ink);text-anchor:middle;dominant-baseline:middle}
${W} .wh-yj-moon{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);pointer-events:none}
${W} .wh-yj-needle{position:absolute;left:50%;top:-18px;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;pointer-events:none}
${W} .wh-yj-needle-cap{width:12px;height:12px;border-radius:50%;background:var(--wh-gradient-violet);box-shadow:0 0 0 3px var(--wh-vellum),0 0 0 4.5px var(--wh-symbol-ink),var(--wh-aura)}
${W} .wh-yj-needle-line{width:1.5px;background:linear-gradient(180deg,var(--wh-symbol-ink),transparent)}
${W} .wh-yj-tips{position:absolute;inset:0;pointer-events:none;transition:opacity var(--wh-dur-base)}
${W} .wh-yj-tip{position:absolute;transform:translate(-50%,-50%);padding:3px 9px;border-radius:var(--wh-pill);background:var(--wh-nightshade);color:var(--wh-vellum);${LABEL};font-size:10px;white-space:nowrap;box-shadow:0 0 0 2px var(--wh-vellum)}
${W} .wh-yj-hint{position:absolute;left:50%;bottom:-16px;transform:translateX(-50%);padding:7px 14px;border-radius:var(--wh-pill);background:var(--wh-gradient-nightshade);color:var(--wh-vellum);${UI};font-size:13px;white-space:nowrap}
${W} .wh-yj-readout{display:flex;flex-direction:column;gap:26px;justify-content:center}
${W} .wh-yj-read{display:flex;flex-direction:column;gap:4px;align-items:flex-start}
${W} .wh-yj-read-value{${DISPLAY};font-size:22px;line-height:1.1;color:var(--wh-witch);white-space:nowrap}
${W} .wh-yj-skip{all:unset;cursor:pointer;${LABEL};font-size:11px;color:var(--color-text-subtle)}
${W} .wh-yj-skip:hover{color:var(--wh-witch)}
${W} .wh-yj-next{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:8px;align-self:flex-start;padding:9px 16px;border-radius:var(--wh-pill);background:var(--wh-gradient-violet);color:var(--wh-vellum);${UI};font-size:13px;box-shadow:var(--wh-aura);transition:box-shadow ${EASE}}
${W} .wh-yj-next:hover{box-shadow:var(--wh-shadow-lift)}
${W} .wh-yj-next:focus-visible{box-shadow:var(--wh-ring-focus)}
${W} .wh-yj-rail{position:relative;height:28px;margin:0 10px}
${W} .wh-yj-rail-track,${W} .wh-yj-rail-fill{position:absolute;left:0;right:0;top:13px;height:1.5px}
${W} .wh-yj-rail-track{background:var(--wh-symbol-line-soft)}
${W} .wh-yj-rail-fill{background:var(--wh-gradient-violet);transform-origin:left;transform:translateZ(0) scaleX(0)}
${W} .wh-yj-rail-stop{all:unset;cursor:pointer;position:absolute;top:14px;transform:translate(-50%,-50%);width:24px;height:24px;display:flex;align-items:center;justify-content:center}
${W} .wh-yj-rail-stop span{width:7px;height:7px;border-radius:50%;background:var(--wh-vellum);box-shadow:0 0 0 1.5px var(--wh-symbol-line);transition:all var(--wh-dur-fast) var(--wh-ease)}
${W} .wh-yj-rail-stop[data-past] span{background:var(--wh-symbol-ink)}
${W} .wh-yj-rail-stop[data-on] span{width:12px;height:12px;background:var(--wh-gradient-violet);box-shadow:0 0 0 3px var(--wh-vellum),0 0 0 4.5px var(--wh-symbol-ink)}
${W} .wh-yj-rail-stop:focus-visible{box-shadow:none}
${W} .wh-yj-rail-stop:focus-visible span{box-shadow:var(--wh-ring-focus)}
${W} .wh-yj-noscript{display:block;${LABEL};color:var(--color-text-subtle)}
@media (max-width:719px){${W} .wh-yj{height:auto!important}${W} .wh-yj-stage{position:static;height:auto!important;grid-template-rows:auto}${W} .wh-yj-grid{grid-template-columns:minmax(0,1fr);gap:24px}${W} .wh-yj-panels{display:flex;flex-direction:column;gap:32px;height:auto}${W} .wh-yj-panel{position:static;opacity:1!important;visibility:visible!important;transform:none!important;pointer-events:auto!important;align-items:flex-start;text-align:left}${W} .wh-yj-panel-head,${W} .wh-yj-passing,${W} .wh-yj-actions{flex-direction:row;justify-content:flex-start}${W} .wh-yj-persp,${W} .wh-yj-readout,${W} .wh-yj-rail,${W} .wh-yj-glow{display:none}}

${M} .mw-parts-sec .mw-parts{gap:14px}
${M} .mw-parts>li{counter-increment:wh-part;padding:22px;gap:12px;border-radius:var(--wh-petal-md);border:1px solid var(--wh-hairline);background:var(--wh-wash-violet),var(--wh-grain),var(--wh-gradient-vellum);box-shadow:var(--wh-shadow-soft)}
${M} .mw-parts-top{display:flex;justify-content:space-between;align-items:center}
${M} .mw-parts-top::after{content:none}
${M} .mw-parts .mw-icon{width:24px;height:24px;stroke-width:1.4;color:var(--wh-symbol-ink);filter:url(#wh-ink-fine)}
${M} .mw-parts h3{${DISPLAY};font-size:24px;line-height:1.1;color:var(--wh-witch)}
${M} .mw-parts .mw-small{font-size:16px;line-height:1.5;color:var(--color-text-muted)}

${M} .wh-block-head-row{margin-bottom:28px}
${M} .wh-path{gap:16px;padding-top:0}
${M} .wh-path::before{top:23px}
${M} .wh-path li{gap:12px}
${M} .wh-path-link{display:flex;flex-direction:column;gap:12px;color:inherit;text-decoration:none}
${M} .wh-path h3{font-size:24px}
${M} .wh-path p{font-size:16px;line-height:1.4}

${M} .wh-block-season .wh-block-head-row{align-items:flex-end}
${M} .wh-block-season .wh-block-head-row>div{gap:10px}
${M} .wh-card{position:relative;display:flex;flex-direction:column;gap:12px;padding:24px;border-radius:var(--wh-petal-lg);border:1px solid var(--wh-hairline);background:var(--wh-grain),var(--wh-gradient-vellum);box-shadow:var(--wh-shadow-soft);overflow:hidden}
${M} .wh-card-now{padding:0;border:2px solid var(--wh-season);background:var(--wh-wash-violet),var(--wh-grain),var(--wh-gradient-vellum);box-shadow:var(--wh-aura)}
${M} .wh-card h3{margin:0;${DISPLAY};font-size:36px;line-height:1.1;color:var(--wh-witch)}
${M} .wh-card p{margin:0;font-size:19px;line-height:1.5;color:var(--color-text-muted)}
${M} .wh-card-next{gap:14px}
${M} .wh-card-next p{font-size:17px;line-height:1.6}
${M} .wh-card-date{${DISPLAY};font-size:56px;line-height:1.04;color:var(--wh-witch)}
${M} .wh-beats-list{gap:8px;margin-top:auto}
${M} .wh-beats-list .wh-label{color:var(--color-text-muted)}
${M} .hs-btn-secondary{height:var(--wh-control-md);padding:0 20px;background:transparent;border-color:var(--wh-hairline);color:var(--color-text)}
${M} .hs-btn-secondary:hover{background:var(--wh-wash-violet),var(--wh-vellum);border-color:var(--wh-border-strong);color:var(--color-text);box-shadow:none}
${M} .hs-btn-secondary:active{background:var(--wh-aged)}
${M} .hs-btn-ghost{height:var(--wh-control-lg);padding:0 24px;background:transparent;border-color:transparent;color:var(--wh-violet-text)}
${M} .hs-btn-ghost:hover{background:var(--wh-mist);color:var(--wh-violet-text);box-shadow:none}
${M} .wh-btn-sm{height:34px;padding:0 14px;font-size:13px;background:transparent;border-color:var(--wh-hairline);color:var(--color-text);align-self:flex-start;margin-top:4px}
${M} .wh-btn-sm:hover{border-color:var(--wh-border-strong);background:var(--wh-wash-violet),var(--wh-vellum);box-shadow:none;color:var(--color-text)}
${M} .wh-card-sky .wh-rows{gap:8px}
${M} .wh-card-glyph{opacity:.9;margin-top:auto}

${M} .mw-story{grid-template-columns:minmax(0,5fr) minmax(0,7fr);gap:56px;align-items:center;position:relative}
${M} .mw-story:not(.mw-story-right)::before{content:"☽︎";position:absolute;right:4%;top:-40px;font-family:var(--wh-symbol);font-size:180px;line-height:1;color:var(--wh-symbol-ink);opacity:.06;pointer-events:none}
${M} .mw-story-photo{height:520px;border-radius:var(--wh-petal-lg)}
${M} .mw-story-photo img{object-position:center 30%}
${M} .mw-story-copy{gap:0}
${M} .mw-story-copy .mw-kicker{margin-bottom:20px;color:var(--wh-symbol-ink)}
${M} .mw-story-copy .mw-display{font-size:clamp(2.4rem,4vw,3.5rem);line-height:1.04}
${M} .mw-story-copy .mw-lead{margin-top:20px;font-size:21px;max-width:52ch}
${M} .mw-beats-inline{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin-top:20px}
${M} .mw-beats-inline .mw-beat{all:unset;box-sizing:border-box;display:flex;flex-direction:column;gap:6px;padding:14px 12px;border-radius:var(--wh-petal-sm);background:var(--wh-wash-violet),var(--wh-gradient-vellum);border:1px solid var(--wh-hairline);min-height:0;cursor:default}
${M} .mw-beats-inline .mw-beat-l{${DISPLAY};font-style:italic;font-size:30px;line-height:1;color:var(--wh-symbol-ink)}
${M} .mw-beats-inline .mw-beat-w{${LABEL};font-size:11px;color:var(--color-text)}
${M} .mw-beat-d{font-family:var(--wh-ui);font-size:13px;line-height:1.35;color:var(--color-text-subtle)}
${M} .mw-beat[aria-pressed] .mw-beat-d{display:none}
@media (max-width:860px){${M} .mw-story,${M} .mw-story-right{grid-template-columns:minmax(0,1fr)}${M} .mw-beats-inline{grid-template-columns:repeat(2,minmax(0,1fr))}}

${M} .wh-block-seals .wh-block-title{font-size:clamp(2.375rem,5vw,3.5rem)}
${M} .wh-seals li{display:flex;flex-direction:column;align-items:flex-start;gap:12px;padding:22px;border-radius:var(--wh-petal-md);border:1px solid var(--wh-hairline);background:var(--wh-grain),var(--wh-gradient-vellum)}
${M} .wh-seals h3{margin:0;${DISPLAY};font-size:24px;line-height:1.1;color:var(--wh-witch)}
${M} .wh-seals p{margin:0;font-size:16px;line-height:1.45;color:var(--color-text-muted)}

${M} .mw-other:has(.wh-block-retreat){max-width:none;padding-left:0;padding-right:0}
${M} .wh-block-retreat{max-width:none;padding:0}
${M} .wh-retreat{display:block;border-radius:0;margin:0;padding:96px max(var(--wh-col-pad),calc(50vw - 560px));background:var(--wh-smoke),radial-gradient(60% 70% at 78% 40%,var(--wh-a-madder-16),transparent 70%),var(--wh-wash-moon),var(--wh-grain),var(--wh-gradient-dusk)}
${M} .wh-retreat-in{position:relative;display:grid;grid-template-columns:minmax(0,5fr) minmax(0,6fr);gap:64px;align-items:center}
@media (max-width:900px){${M} .wh-retreat-in{grid-template-columns:minmax(0,1fr)}}
${M} .wh-retreat-photo .wh-frame{height:560px}
${M} .wh-retreat-photo .wh-frame img{object-position:center 38%}
${M} .wh-retreat-copy{display:flex;flex-direction:column;gap:22px;max-width:620px}
${M} .wh-retreat-copy .wh-title-l{font-size:clamp(52px,6vw,80px);line-height:1}
${M} .wh-retreat-copy .wh-lead{font-size:21px;max-width:46ch}
${M} .wh-days{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
@media (max-width:620px){${M} .wh-days{grid-template-columns:minmax(0,1fr)}}
${M} .wh-days li{display:flex;flex-direction:column;gap:6px;padding:16px;border-radius:var(--wh-petal-md);border:1px solid var(--wh-hairline);background:var(--wh-grain),var(--wh-gradient-vellum)}
${M} .wh-days h3{margin:0;${DISPLAY};font-size:22px;line-height:1.1;color:var(--wh-witch)}
${M} .wh-retreat-copy .wh-actions .hs-btn{height:var(--wh-control-lg)}

${M} .mw-closing{position:relative;overflow:visible;max-width:var(--wh-col);margin-top:0;padding:96px var(--wh-col-pad) 0;border-radius:0;background:transparent;border:0;box-shadow:none;grid-template-columns:minmax(0,1fr) auto;gap:24px;align-items:center}
${M} .mw-closing::before,${M} .mw-closing::after{content:none}
${M} .mw-closing>div:first-child{display:flex;flex-direction:column;gap:12px}
${M} .mw-closing .mw-kicker{margin:0;color:var(--color-text-subtle)}
${M} .mw-closing .mw-display{font-size:clamp(2.375rem,5vw,3.5rem);line-height:1.04}
${M} .mw-closing .mw-body{margin:0;color:var(--color-text-muted)}
${M} .mw-closing .mw-display{color:var(--wh-witch)}
${M} .mw-closing .mw-actions{margin:0;gap:12px}
${M} .mw-closing .mw-actions .hs-btn-soft{background:transparent;color:var(--wh-violet-text)}
${M} .mw-closing .mw-actions .hs-btn-soft:hover{background:var(--wh-mist);box-shadow:none}
${M} .mw-closing .hs-btn svg{display:none}
${M} .mw-closing[data-background="accent-wash"]{max-width:calc(var(--wh-col) - 2 * var(--wh-col-pad));margin:56px auto 0;padding:32px;border-radius:var(--wh-petal-lg);background:var(--wh-wash-violet),var(--wh-grain),var(--wh-gradient-lavender)}
${M} .mw-closing[data-background="accent-wash"]>div:first-child{gap:10px}
${M} .mw-closing[data-background="accent-wash"] .mw-kicker{color:var(--wh-symbol-ink)}
${M} .mw-closing[data-background="accent-wash"] .mw-display{font-size:36px;line-height:1.1}
${M} .mw-closing[data-background="accent-wash"] .mw-body{font-size:19px}
${M} .mw-closing[data-background="accent-wash"] .hs-btn{height:var(--wh-control-md);padding:0 20px;font-size:15px}
${M} .mw-closing[data-background="accent-wash"] .hs-btn-soft{background:transparent;border-color:var(--wh-hairline);color:var(--color-text)}

${M} .wh-block-moonstrip{padding:0}
${M} .wh-moonstrip-head{margin:0;align-items:flex-end}
${M} .wh-title-s{font-size:36px;line-height:1.1}
${M} .mw-other:has(.wh-moonstrip-head)+.mw-sec{padding-top:20px}
${M} .mw-sec:has(.mw-journeys) .mw-sec-head{display:none}
${M} .mw-journey-head{display:contents}
${M} .mw-journey-head .mw-kicker,${M} .mw-journey-head .mw-display,${M} .mw-journey-head .mw-body{display:none}
${M} .mw-journey-head .mw-textlink{order:2;margin-top:8px}
${M} .mw-journey{display:flex;flex-direction:column}
${M} .mw-weeks{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
@media (max-width:900px){${M} .mw-weeks{grid-template-columns:repeat(2,minmax(0,1fr))}}
${M} .mw-weeks li{position:relative;display:flex;flex-direction:column;align-items:flex-start;text-align:left;gap:8px;padding:18px;border-radius:var(--wh-petal-md);border:1px solid var(--wh-hairline);background:var(--wh-grain),var(--wh-gradient-vellum);box-shadow:none;transition:box-shadow var(--wh-dur-base) var(--wh-ease)}
${M} .mw-weeks li[data-phase]::after{right:18px;top:18px}
${M} .mw-week-tag{${LABEL};font-size:11px;color:var(--color-text-subtle);order:0;padding-right:0}
${M} .mw-week-tag::after{content:" · "}
${M} .mw-weeks li .mw-label{order:0;margin:0;display:inline;color:var(--color-text-subtle)}
${M} .mw-weeks li .mw-week-tag,${M} .mw-weeks li .mw-label{display:inline}
${M} .mw-weeks li{display:block}
${M} .mw-weeks strong{display:block;${DISPLAY};font-size:24px;line-height:1.1;margin-top:8px;color:var(--wh-witch)}
${M} .mw-week-focus{font-size:15px;line-height:1.4;color:var(--color-text-muted)}
${M} .mw-lists{display:grid;gap:16px;grid-template-columns:repeat(2,minmax(0,1fr))}
@media (max-width:760px){${M} .mw-lists{grid-template-columns:minmax(0,1fr)}}
${M} .mw-lists>div{${CARD};border-radius:var(--wh-petal-lg);padding:28px;display:flex;flex-direction:column;gap:14px}
${M} .mw-lists>div:first-child{gap:14px}
${M} .mw-lists>div:first-child .mw-chevlist{gap:8px}
${M} .mw-lists>div:first-child .mw-chevlist li{font-size:22px;line-height:1.3}
${M} .mw-lists>div:first-child .mw-chevlist li:first-child{font-style:normal;font-size:26px;line-height:1.15;margin-bottom:6px}
${M} .mw-lists>div:not(:first-child){background:var(--wh-grain),var(--wh-gradient-vellum)}
${M} .mw-lists>div:not(:first-child) .mw-chevlist{gap:12px}
${M} .mw-lists>div:not(:first-child) .mw-chevlist li{font-size:16px;line-height:1.4;padding-left:28px}
${M} .mw-lists>div:not(:first-child) .mw-chevlist li::before{font-size:16px}

${W} .wh-sm{display:flex;flex-direction:column;align-items:center;gap:22px;width:100%}
${W} .wh-sm-grid{display:grid;grid-template-columns:minmax(220px,1fr) auto minmax(260px,1fr);grid-template-areas:"info wheel events";gap:40px;align-items:center;width:100%}
${W} .wh-sm[data-stack] .wh-sm-grid{grid-template-columns:minmax(0,1fr) minmax(0,1fr);grid-template-areas:"wheel wheel" "info events";gap:28px 32px;align-items:start}
${W} .wh-sm-info{grid-area:info;display:flex;flex-direction:column;gap:12px;align-items:flex-end;text-align:right}
${W} .wh-sm[data-stack] .wh-sm-info{align-items:flex-start;text-align:left}
${W} .wh-sm-line{display:inline-flex;gap:8px;align-items:center}
${W} .wh-sm-module{${DISPLAY};font-size:40px;line-height:1.02;color:var(--wh-witch);text-wrap:balance}
${W} .wh-sm-theme{font-family:var(--wh-body);font-size:17px;line-height:1.4;color:var(--color-text-muted);max-width:26ch}
${W} .wh-sm-moonline{margin-top:6px}
${W} .wh-sm-constellation{opacity:.9}
${W} .wh-sm-wheel{grid-area:wheel;display:flex;flex-direction:column;align-items:center;gap:16px}
${W} .wh-sm-controls{display:flex;gap:14px;align-items:center;flex-wrap:wrap;justify-content:center}
${W} .wh-sm-prompt{all:unset;cursor:pointer;${LABEL};font-size:11px;color:var(--color-text-subtle);padding:6px 2px;border-bottom:1.5px solid transparent;transition:color ${EASE}}
${W} .wh-sm-prompt[aria-pressed="true"]{color:var(--wh-violet-text);border-bottom-color:var(--wh-symbol-ink)}
${W} .wh-sm-prompt:hover{color:var(--wh-witch)}
${W} .wh-sm-prompt:focus-visible{box-shadow:var(--wh-ring-focus)}
${W} .wh-sm-sep{width:4px;height:4px;border-radius:50%;background:var(--wh-symbol-line-soft)}
${W} .wh-sm-tap{font-family:var(--wh-body);font-style:italic;font-size:15px;color:var(--color-text-subtle)}
${W} .wh-sm-events{grid-area:events;display:flex;flex-direction:column;gap:10px;min-width:0}
${W} .wh-sm-scopes{display:flex;gap:10px;flex-wrap:wrap}
${W} .wh-sm-list{display:flex;flex-direction:column;gap:6px;max-height:300px;overflow-y:auto;padding-right:4px}
${W} .wh-sm-empty{font-size:15px;color:var(--color-text-subtle);padding:8px 0}
${W} .wh-sm-season{display:flex;flex-direction:column;gap:6px}
${W} .wh-sm-season+.wh-sm-season{margin-top:10px}
${W} .wh-sm-season-head{display:flex;flex-direction:column;gap:2px;padding:6px 10px 4px;border-bottom:1px solid var(--wh-symbol-line-soft)}
${W} .wh-sm-season-modules{font-family:var(--wh-body);font-style:italic;font-size:14px;line-height:1.3;color:var(--color-text-subtle)}
${W} .wh-sm-chips{display:flex;gap:6px;flex-wrap:wrap}
${W} .wh-sm-track{width:100%;max-width:860px}
${W} .wh-sm-compact{gap:18px}
${W} .wh-sm-big{display:flex;gap:10px;width:100%}
${W} .wh-sm-big-btn{flex:1;height:48px;border-radius:var(--wh-pill);border:1px solid var(--wh-symbol-line-soft);background:var(--wh-gradient-vellum);color:var(--wh-symbol-ink);${UI};cursor:pointer}
${W} .wh-sm-big-primary{border:0;background:var(--wh-gradient-violet);color:var(--wh-vellum)}
${W} .wh-sm-now{display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center}
${W} .wh-sm-compact .wh-sm-module{font-size:34px;line-height:1.05}
${W} .wh-sm-compact .wh-sm-theme{font-size:18px;max-width:none}
${W} .wh-sm-soon{display:flex;flex-direction:column;gap:8px;width:100%}
${W} .wh-block-skymap-compact .wh-block-head h2{font-size:34px}

${W} .wh-zw{position:relative;flex:none;filter:url(#wh-ink-fine)}
${W} .wh-zw-ground{position:absolute;inset:0;border-radius:50%;background:var(--wh-wash-moon),var(--wh-stars),var(--wh-grain),var(--wh-gradient-vellum);background-size:auto,var(--wh-stars-size),auto,auto;box-shadow:0 0 0 1.5px var(--wh-symbol-ink),0 0 0 4.5px var(--wh-vellum),0 0 0 5.5px var(--wh-symbol-line-soft),var(--wh-shadow-soft)}
${W} .wh-zw-clip{position:absolute;inset:0;border-radius:50%;overflow:hidden}
${W} .wh-zw-turn{position:absolute;inset:0;transition:transform var(--wh-dur-slow) var(--wh-ease)}
${W} .wh-zw-turn>div{position:absolute;inset:0;border-radius:50%;pointer-events:none}
${W} .wh-zw-seasons{background:conic-gradient(var(--wh-season-winter) 0 90deg,var(--wh-season-spring) 90deg 180deg,var(--wh-season-summer) 180deg 270deg,var(--wh-season-fall) 270deg 360deg);opacity:.35;-webkit-mask:radial-gradient(circle,transparent 43%,var(--wh-ink) 43%,var(--wh-ink) 45.6%,transparent 45.6%);mask:radial-gradient(circle,transparent 43%,var(--wh-ink) 43%,var(--wh-ink) 45.6%,transparent 45.6%)}
${W} .wh-zw-season-now{background:conic-gradient(from var(--wh-zw-from,0deg),var(--wh-season) 0 90deg,transparent 90deg);-webkit-mask:radial-gradient(circle,transparent 43%,var(--wh-ink) 43%,var(--wh-ink) 45.6%,transparent 45.6%);mask:radial-gradient(circle,transparent 43%,var(--wh-ink) 43%,var(--wh-ink) 45.6%,transparent 45.6%)}
${W} .wh-zw-ticks{background:repeating-conic-gradient(var(--wh-symbol-line) 0 .35deg,transparent .35deg 3deg);-webkit-mask:radial-gradient(circle,transparent 47.2%,var(--wh-ink) 47.2%,var(--wh-ink) 50%,transparent 50%);mask:radial-gradient(circle,transparent 47.2%,var(--wh-ink) 47.2%,var(--wh-ink) 50%,transparent 50%)}
${W} .wh-zw-ticks-major{background:repeating-conic-gradient(var(--wh-symbol-ink) 0 .5deg,transparent .5deg 15deg);opacity:.8;-webkit-mask:radial-gradient(circle,transparent 45.6%,var(--wh-ink) 45.6%,var(--wh-ink) 50%,transparent 50%);mask:radial-gradient(circle,transparent 45.6%,var(--wh-ink) 45.6%,var(--wh-ink) 50%,transparent 50%)}
${W} .wh-zw-ring{border:1px solid var(--wh-symbol-line-soft)}
${W} .wh-zw-ring-dotted{border:1.5px dotted var(--wh-symbol-ink)}
${W} .wh-zw-spokes{background:repeating-conic-gradient(var(--wh-symbol-line-soft) 0 .35deg,transparent .35deg 30deg);-webkit-mask:radial-gradient(circle,transparent 14%,var(--wh-ink) 14%,var(--wh-ink) 43%,transparent 43%);mask:radial-gradient(circle,transparent 14%,var(--wh-ink) 14%,var(--wh-ink) 43%,transparent 43%)}
${W} .wh-zw-house{position:absolute;display:flex;align-items:center;justify-content:center;font-family:var(--wh-display);font-style:italic;color:var(--wh-symbol-ink);opacity:.6;pointer-events:none;transition:transform var(--wh-dur-slow) var(--wh-ease)}
${W} .wh-zw-house[data-on]{opacity:1}
${W} .wh-zw-sign{position:absolute;padding:0;border:0;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;font-family:var(--wh-symbol);font-weight:300;line-height:1;color:var(--wh-symbol-ink);font-variant-emoji:text;text-shadow:.5px .6px 0 var(--wh-symbol-ghost);background:transparent;box-shadow:none;transition:transform var(--wh-dur-slow) var(--wh-ease),background ${EASE},box-shadow ${EASE}}
${W} .wh-zw-sign[data-hover]{background:var(--wh-mist);box-shadow:0 0 0 1.5px var(--wh-symbol-line-soft)}
${W} .wh-zw-sign[data-on]{background:var(--wh-wash-moon),var(--wh-gradient-lavender);box-shadow:0 0 0 1.5px var(--wh-symbol-ink),0 0 0 3.5px var(--wh-vellum),0 0 0 4.5px var(--wh-symbol-line-soft),var(--wh-aura)}
${W} .wh-zw-sign:focus-visible{box-shadow:var(--wh-ring-focus)}
${W} .wh-zw-moon{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);pointer-events:none}
${W} .wh-zw-needle{position:absolute;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:2px;pointer-events:none}
${W} .wh-zw-needle-cap{width:9px;height:9px;border-radius:50%;background:var(--wh-gradient-violet);box-shadow:0 0 0 2px var(--wh-vellum),0 0 0 2.8px var(--wh-symbol-line),var(--wh-aura)}
${W} .wh-zw-needle-line{width:1px;background:linear-gradient(180deg,var(--wh-symbol-ink),transparent)}

${W} .wh-track{position:relative;padding-top:4px}
${W} .wh-track-rail{position:absolute;left:0;right:0;top:13px;height:6px;border-radius:var(--wh-pill);opacity:.85;box-shadow:inset 0 0 0 1px var(--wh-a-violet-12)}
${W} .wh-track-star{position:absolute;top:-5px;transform:translateX(-50%);font-family:var(--wh-symbol);font-size:10px;color:var(--wh-symbol-ink);pointer-events:none}
${W} .wh-track-moon{position:absolute;top:7px;width:3px;height:3px;margin-left:-2px;border-radius:50%;background:var(--wh-symbol-ink);opacity:.75;pointer-events:none}
${W} .wh-track-moon[data-new]{background:transparent;border:1px solid var(--wh-symbol-ink);box-sizing:border-box}
${W} .wh-track-range{-webkit-appearance:none;appearance:none;width:100%;height:24px;background:transparent;margin:0;position:relative;z-index:2;display:block}
${W} .wh-track-range::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border-radius:50%;background:var(--wh-gradient-violet);box-shadow:0 0 0 3px var(--wh-vellum),0 0 0 4.5px var(--wh-symbol-line),0 6px 18px -4px var(--wh-a-violet-35);cursor:grab}
${W} .wh-track-range::-moz-range-thumb{width:18px;height:18px;border:none;border-radius:50%;background:var(--wh-violet);box-shadow:0 0 0 3px var(--wh-vellum),0 0 0 4.5px var(--wh-symbol-line)}
${W} .wh-track-range:focus-visible{box-shadow:none}
${W} .wh-track-months{position:relative;height:14px;margin-top:2px}
${W} .wh-track-months span{position:absolute;white-space:nowrap}

${M} .wh-block-modules .wh-block-title{margin:0 0 20px;font-size:36px}
${M} .wh-modules{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
@media (max-width:960px){${M} .wh-modules{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:520px){${M} .wh-modules{grid-template-columns:minmax(0,1fr)}}
${M} .wh-modules li{position:relative;overflow:hidden;display:flex;flex-direction:column;gap:8px;padding:18px;border-radius:var(--wh-petal-md);border:1px solid var(--wh-hairline);background:var(--wh-grain),var(--wh-gradient-vellum)}
${M} .wh-modules li::before{content:"";position:absolute;left:0;right:0;top:0;height:3px;background:var(--wh-gradient-season)}
${M} .wh-module-top{display:flex;justify-content:space-between;align-items:center}
${M} .wh-modules h3{margin:0;${DISPLAY};font-size:22px;line-height:1.1;color:var(--wh-witch)}
${M} .wh-modules p{margin:0;font-size:15px;line-height:1.4;color:var(--color-text-muted)}

${M} .mw-circle-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
@media (max-width:760px){${M} .mw-circle-grid{grid-template-columns:minmax(0,1fr)}}
${M} .mw-circle-tile{padding:24px;gap:12px;border-radius:var(--wh-petal-lg);border:1px solid var(--wh-hairline);background:var(--wh-grain),var(--wh-gradient-vellum);box-shadow:var(--wh-shadow-soft)}
${M} .mw-circle-tile .mw-s{font-size:36px;line-height:1.1}
${M} .mw-circle-tile .mw-small{font-size:17px;line-height:1.5}
${M} .mw-circle-tile-head{display:flex;justify-content:space-between;align-items:center;gap:12px}
${M} .mw-circle-tile-meta{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-top:4px}
${M} .mw-circle-tile-meta .mw-label{color:var(--color-text-muted)}
${M} .mw-circle-tile .mw-badge{${LABEL};font-size:11px;padding:6px 12px}
${M} .mw-circle-tile .mw-badge-open{background:var(--wh-gradient-violet);color:var(--wh-text-on-fill)}
${M} .mw-circle-tile .mw-badge-full{background:transparent;border:1px solid var(--wh-border-strong);color:var(--color-text)}
${M} .mw-circle-tile .mw-badge-forming{background:var(--wh-gradient-madder);color:var(--wh-text-on-fill)}
${M} .mw-seats{display:flex;gap:5px}
${M} .mw-seats span{width:10px;height:10px;border-radius:50%;background:var(--wh-lavender);box-shadow:inset 0 0 0 1.5px var(--wh-symbol-ink)}
${M} .mw-seats span[data-state="done"]{background:var(--wh-vellum)}
${M} .mw-circle-tile .mw-textlink{margin-top:2px}

${M} .mw-page:has(.wh-retreat-hero) .mw-hero-split .mw-hero-inner{grid-template-columns:minmax(0,6fr) minmax(0,5fr);gap:48px}
${M} .wh-mark-card{position:sticky;top:160px;display:flex;justify-content:center;align-items:center;padding:32px;border-radius:var(--wh-petal-lg);background:var(--wh-wash-violet),var(--wh-grain),var(--wh-gradient-vellum);border:1px solid var(--wh-hairline)}
${M} .wh-mark-logo{width:auto;height:360px;filter:none}
${M} .wh-mark-copy .wh-title-l{font-size:clamp(52px,5.6vw,80px);line-height:1}
${M} .wh-mark-copy .wh-lead{font-size:21px}
${M} .wh-mark-copy .wh-body{font-size:19px}
${M} .wh-note{font-size:16px}

${M} .wh-fn{display:flex;flex-direction:column;gap:14px;padding:22px;border-radius:var(--wh-petal-lg);background:var(--wh-wash-violet),var(--wh-grain),var(--wh-gradient-lavender)}
${M} .wh-fn-title{${DISPLAY};font-size:30px;line-height:1.1;color:var(--wh-witch)}
${M} .wh-fn-question{font-size:17px;color:var(--color-text-muted)}
${M} .wh-fn-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
${M} .wh-fn-option{all:unset;box-sizing:border-box;cursor:pointer;display:flex;flex-direction:column;gap:2px;min-height:64px;padding:12px 14px;border-radius:var(--wh-petal-sm);background:var(--wh-gradient-vellum);border:1px solid var(--wh-hairline);transition:box-shadow ${EASE},border-color ${EASE}}
${M} .wh-fn-option:hover{box-shadow:var(--wh-aura)}
${M} .wh-fn-option:focus-visible{box-shadow:var(--wh-ring-focus)}
${M} .wh-fn-option[aria-pressed="true"]{border:2px solid var(--wh-season);box-shadow:var(--wh-aura)}
${M} .wh-fn-option-label{${DISPLAY};font-size:20px;color:var(--wh-witch)}
${M} .wh-fn-option-sub{font-family:var(--wh-ui);font-size:13px;color:var(--color-text-subtle)}
${M} .wh-fn-chosen{margin-top:4px}
${M} .wh-fn-picked{display:flex;flex-direction:column;gap:10px}
${M} .wh-fn-note{font-size:16px;color:var(--color-text-muted)}
${M} .wh-btn-wide{height:56px;justify-content:center;font-size:17px}

@media (max-width:719px){
${M} .mw-page{padding-bottom:56px}
${M} .mw-wrap{padding-left:20px;padding-right:20px}
${M} .mw-sec,${M} .mw-other,${M} .mw-page:has(.wh-moonstrip-head) :is(.mw-sec,.mw-other),${M} .mw-page:has(.wh-sm-centered,.mw-circle-grid,.wh-mark-split) :is(.mw-sec,.mw-other){padding-top:56px}
${M} .mw-hero{padding-top:28px}
${M} .mw-hero-split .mw-hero-inner{grid-template-columns:minmax(0,1fr);gap:18px}
${M} .mw-hero-split .mw-photo{order:-1;height:300px}
${M} .mw-hero-copy{gap:18px}
${M} .mw-hero-copy .mw-display,${M} .mw-page:has(.wh-moonstrip-head) .mw-hero-copy .mw-display,${M} .mw-page:has(.mw-circle-grid) .mw-hero-copy .mw-display,${M} .mw-page:has(.wh-sm-centered) .mw-hero-copy .mw-display,${M} .mw-hero-text .mw-hero-copy .mw-display{font-size:46px;line-height:1.02}
${M} .mw-hero-copy .mw-lead{font-size:19px;line-height:1.55}
${M} .mw-hero-copy .mw-actions{flex-direction:column;align-items:stretch}
${M} .mw-hero-copy .hs-btn-primary{height:56px;justify-content:center;font-size:17px;box-shadow:var(--wh-aura)}
${M} .mw-hero-copy .hs-btn-soft,${M} .mw-hero-note{display:none}
${M} .mw-hero::after,${M} .mw-hero-split .mw-hero-inner::before,${M} .mw-hero-split .mw-hero-inner::after{display:none}
${M} .wh-retreat{padding:0 20px}
${M} .wh-retreat-in{gap:14px}
${M} .wh-retreat-photo .wh-frame{height:320px}
${M} .wh-retreat-seal,${M} .wh-retreat-watermark,${M} .wh-days,${M} .wh-retreat-copy .wh-lead,${M} .wh-retreat-copy>.wh-label:last-child{display:none}
${M} .wh-retreat-copy{gap:14px}
${M} .wh-retreat-copy .wh-title-l{font-size:34px;line-height:1.05}
${M} .wh-retreat-copy .wh-actions .hs-btn-primary{height:52px;width:100%;justify-content:center;border-radius:var(--wh-pill);border:1px solid var(--wh-symbol-line-soft);background:var(--wh-gradient-vellum);color:var(--wh-symbol-ink);font-size:16px}
${M} .wh-retreat-copy .wh-actions .hs-btn-ghost{display:none}
${M} .mw-closing{padding-top:56px;grid-template-columns:minmax(0,1fr)}
${M} .mw-parts{grid-template-columns:minmax(0,1fr)}
${M} .wh-season-grid{gap:14px}
}

@media (prefers-reduced-motion:reduce){${W} *{transition:none!important;animation:none!important}}
`
