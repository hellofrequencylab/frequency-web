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

const W = '[data-house-theme="wildheart"]'

const LABEL = 'font-family:var(--wh-ui);font-weight:500;font-size:12px;line-height:1.3;letter-spacing:var(--wh-tracking-label);text-transform:uppercase'
const DISPLAY = 'font-family:var(--wh-display);font-weight:400;text-transform:none;letter-spacing:-.005em;font-style:normal'
const UI = 'font-family:var(--wh-ui);font-weight:500;font-size:15px;line-height:1.2;letter-spacing:0;text-transform:none'
const CARD = 'background:var(--wh-wash-violet),var(--wh-grain),var(--wh-gradient-vellum);border:1px solid var(--wh-hairline);box-shadow:var(--wh-shadow-soft)'
const EASE = 'var(--wh-dur-base) var(--wh-ease)'

export const WILDHEART_CSS = `${WILDHEART_TOKENS_CSS}
${W}{--hs-serif:var(--wh-display);--hs-sans:var(--wh-body);font-family:var(--wh-body);font-size:19px;line-height:1.65;color:var(--color-text);background:var(--wh-page)}
html:has(${W}),body:has(${W}){background:var(--wh-parchment)}
${W} ::selection{background:var(--wh-lavender);color:var(--wh-nightshade)}
${W} :focus-visible{outline:2px solid var(--color-focus-ring);outline-offset:2px;box-shadow:var(--wh-aura)}
${W} main [class*="shadow"]{box-shadow:var(--wh-shadow-soft)}
${W} em,${W} i{font-style:italic;color:var(--color-primary-strong)}
${W} strong,${W} b{font-weight:500}

${W} .hs-serif,${W} .hs-h1,${W} .hs-h2,${W} .hs-brand{${DISPLAY};color:var(--wh-nightshade)}
${W} .hs-h1{font-size:clamp(3.4rem,8vw,6.75rem);line-height:.98;text-shadow:none}
${W} .hs-h2{font-size:clamp(2.4rem,5vw,3.5rem);line-height:1.04}
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

${W} .hs-btn{position:relative;border-radius:var(--wh-petal-sm);${UI};box-shadow:none;transition:background ${EASE},color ${EASE},box-shadow ${EASE},border-color ${EASE}}
${W} .hs-btn-primary{height:52px;padding:0 26px;background:var(--wh-gradient-violet);color:var(--color-text-on-primary)}
${W} .hs-btn-primary:hover{background:var(--wh-gradient-violet);color:var(--color-text-on-primary);box-shadow:var(--wh-aura)}
${W} .hs-btn-primary:active{background:var(--wh-violet-pressed);box-shadow:none}
${W} :is(.hs-btn-glass,.hs-btn-light,.hs-btn-soft){height:52px;padding:0 24px;background:var(--wh-gradient-lavender);border:0;color:var(--color-primary-strong);-webkit-backdrop-filter:none;backdrop-filter:none;box-shadow:none}
${W} :is(.hs-btn-glass,.hs-btn-light,.hs-btn-soft):hover{background:var(--wh-gradient-lavender);color:var(--color-primary-strong);box-shadow:var(--wh-aura)}
${W} .hs-btn-dark{height:44px;padding:0 clamp(14px,3vw,20px);font-size:clamp(13px,3.5vw,15px);background:var(--wh-gradient-violet);color:var(--color-text-on-primary)}
${W} .hs-btn-dark:hover{background:var(--wh-gradient-violet);color:var(--color-text-on-primary);box-shadow:var(--wh-aura)}
${W} .hs-btn-dark:active{background:var(--wh-violet-pressed)}
${W} .hs-btn svg{transition:transform ${EASE}}
${W} .hs-btn:hover svg{transform:translateX(3px)}
${W} .hs-dot{width:8px;height:8px;border-radius:50%;background:var(--wh-season);animation:wh-breathe var(--wh-breath) var(--wh-ease) infinite}
@keyframes wh-breathe{0%,100%{opacity:.55}50%{opacity:1}}

${W} .hs-header{padding:0;background:color-mix(in srgb,var(--wh-parchment) 92%,transparent);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);border-bottom:1px solid var(--wh-hairline)}
${W} .hs-pill{display:flex;justify-content:space-between;gap:16px;overflow:visible;max-width:1200px;min-height:72px;padding:0 clamp(16px,3vw,48px);border-radius:0;background:transparent;-webkit-backdrop-filter:none;backdrop-filter:none;box-shadow:none;animation:none}
${W} .hs-brand{display:inline-flex;padding-left:0;align-items:center;gap:10px;font-size:clamp(22px,5vw,28px);line-height:1;letter-spacing:.02em;color:var(--wh-nightshade)}
${W} .hs-logo{height:clamp(32px,6vw,46px);width:auto;filter:none}
${W} .hs-brand-name{font-family:var(--wh-display)}
${W} .hs-nav{display:none;align-self:stretch;overflow:visible;-webkit-mask-image:none;mask-image:none}
${W} .hs-nav-track{height:100%;align-items:stretch;gap:24px;width:auto;margin:0;padding:0}
@media (min-width:940px){${W} .hs-nav{display:flex}}
${W} .hs-nav a{${LABEL};display:flex;align-items:center;padding:0;border-radius:0;border-bottom:1.5px solid transparent;color:var(--color-text-muted);transition:color ${EASE},border-color ${EASE}}
${W} .hs-nav a:hover,${W} .hs-nav a[aria-current="page"]{background:transparent;color:var(--wh-nightshade);border-image:var(--wh-gradient-violet) 1;border-bottom-color:var(--color-primary)}
${W} .hs-member{${LABEL};font-size:11px;padding:8px 14px;border-radius:var(--wh-pill);border:1px solid var(--wh-hairline);background:var(--wh-gradient-vellum);color:var(--color-text-muted);transition:color ${EASE},box-shadow ${EASE}}
${W} .hs-member:hover{color:var(--color-primary-strong);box-shadow:var(--wh-aura)}
${W} .hs-logo-avatar{border-radius:50%;box-shadow:0 0 0 1.5px var(--wh-symbol-line-soft)}
${W} .hs-logo-image{border-radius:0;box-shadow:none}
${W} .hs-header-actions{gap:10px}
${W} .hs-nav-mega{${LABEL};padding:0;border-radius:0;border-bottom:1.5px solid transparent;color:var(--color-text-muted);transition:color ${EASE},border-color ${EASE}}
${W} .hs-nav-mega:hover,${W} .hs-nav-mega[aria-expanded="true"]{background:transparent;color:var(--wh-nightshade);border-bottom-color:var(--color-primary)}
${W} .hs-mega{padding:0}
${W} .hs-mega-panel{max-width:none;padding:20px clamp(16px,3vw,48px);border-radius:0 0 var(--wh-petal-md) var(--wh-petal-md);${CARD};-webkit-backdrop-filter:none;backdrop-filter:none}
${W} .hs-mega-links a{border-radius:var(--wh-petal-sm);padding:12px 10px}
${W} .hs-mega-links a:hover{background:var(--wh-mist);color:var(--color-primary-strong)}
${W} .hs-mega-label{${DISPLAY};font-size:22px;color:var(--wh-nightshade)}
${W} .hs-mega-desc{font-size:15px;color:var(--color-text-muted)}
${W} .hs-mega-feature{border-radius:var(--wh-arch)}
${W} .hs-mega-feature-shade{background:var(--wh-veil)}
${W} .hs-mega-feature-title{${DISPLAY};font-size:24px;color:var(--wh-nightshade)}
${W} .hs-mega-feature-desc{${LABEL};font-size:11px;color:var(--color-text-muted)}
${W} .hs-menu-button{width:44px;height:44px;border-radius:var(--wh-pill);background:var(--wh-gradient-vellum);border:1px solid var(--wh-hairline);color:var(--wh-nightshade)}
${W} .hs-menu-panel{top:72px;left:0;right:0;max-width:none;padding:8px clamp(16px,3vw,24px) 16px;border-radius:0 0 var(--wh-petal-md) var(--wh-petal-md);${CARD};-webkit-backdrop-filter:none;backdrop-filter:none}
${W} .hs-menu-panel a{${DISPLAY};font-size:26px;padding:14px 4px;border-radius:0;border-bottom:1px solid var(--wh-hairline);color:var(--wh-nightshade)}
${W} .hs-menu-panel a:last-child{border-bottom:0}
${W} .hs-menu-panel a:hover{color:var(--color-primary-strong)}
${W} .hs-menu{gap:0}

${W} .hs-hero{margin-top:0;min-height:0;flex-direction:column;align-items:stretch;background:transparent;color:var(--color-text)}
${W} .hs-hero-photo{position:relative;inset:auto;order:2;width:calc(100% - 2 * clamp(20px,4vw,48px));max-width:1200px;margin:0 auto;height:clamp(280px,42vw,540px);border-radius:var(--wh-arch);overflow:hidden;box-shadow:var(--wh-shadow-soft);filter:none}
${W} .hs-hero-photo::after{content:"";position:absolute;inset:0;background:var(--wh-grain);pointer-events:none}
${W} .hs-hero-wash,${W} .hs-hero-side{display:none}
${W} .hs-hero-grid{order:1;max-width:1200px;padding:clamp(48px,7vw,96px) clamp(20px,4vw,48px) 48px}
${W} .hs-hero-copy{gap:24px;max-width:52rem}
${W} .hs-hero .hs-h1{font-size:clamp(4rem,9vw,6.75rem);color:var(--wh-nightshade)}
${W} .hs-hero-pill{${LABEL};gap:10px;padding:8px 16px;border-radius:var(--wh-pill);background:var(--wh-gradient-vellum);border:1px solid var(--wh-hairline);-webkit-backdrop-filter:none;backdrop-filter:none;color:var(--color-text-muted)}
${W} .hs-hero-pill:hover{background:var(--wh-gradient-vellum);color:var(--color-primary-strong);box-shadow:var(--wh-aura)}
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
${W} .hs-pull{margin-top:20px;padding-left:20px;border-left:1.5px solid var(--wh-symbol-line);font-family:var(--wh-display);font-style:italic;font-weight:400;font-size:1.5rem;line-height:1.35;color:var(--wh-nightshade)}

${W} .hs-panel{border-radius:var(--wh-petal-lg);${CARD};padding:clamp(40px,6vw,88px) clamp(24px,5vw,72px)}
${W} .hs-panel .hs-lead{text-align:left!important;margin:-24px 0 48px!important;max-width:64ch!important}
${W} .hs-panel:has(.hs-steps){background:transparent;border:0;box-shadow:none;padding:0}
${W} .hs-steps{grid-template-columns:repeat(auto-fit,minmax(min(100%,160px),1fr));gap:24px}
${W} .hs-step{position:relative;padding:24px;border-radius:var(--wh-petal-md);${CARD}}
${W} .hs-step-n{${DISPLAY};font-style:italic;font-size:1.5rem;color:var(--wh-symbol-ink)}
${W} .hs-step h3{margin:8px 0 0;${DISPLAY};font-size:1.5rem;line-height:1.1;color:var(--wh-nightshade)}
${W} .hs-step p{margin-top:10px;font-size:1rem;line-height:1.55;color:var(--color-text-muted)}

${W} .hs-photo{border-radius:var(--wh-arch);box-shadow:var(--wh-shadow-soft);background:var(--wh-aged)}
${W} .hs-photo img{filter:sepia(.08) saturate(.95)}
${W} .hs-photo::after{content:"";position:absolute;inset:0;background:var(--wh-grain);pointer-events:none}
${W} .hs-quote{padding-left:20px;border-left:1.5px solid var(--wh-symbol-line);font-family:var(--wh-display);font-style:italic;font-weight:400;font-size:1.6rem;line-height:1.3;color:var(--wh-nightshade)}
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
${W} .hs-card{position:relative;gap:14px;padding:clamp(24px,3vw,36px);border-radius:var(--wh-petal-md);${CARD};transition:box-shadow ${EASE},border-color ${EASE}}
${W} .hs-cards .hs-card:hover{box-shadow:var(--wh-aura)}
${W} .hs-card h3{${DISPLAY};font-size:clamp(1.6rem,2.4vw,2.1rem);line-height:1.1;color:var(--wh-nightshade)}
${W} .hs-card p{font-size:1.05rem;line-height:1.6;color:var(--color-text-muted)}
${W} .hs-card>div:first-child>span:first-child{${LABEL};font-size:11px!important;color:var(--color-text-muted)!important}
${W} .hs-card .hs-serif{${DISPLAY};font-style:italic;font-size:1.6rem!important;color:var(--wh-symbol-ink)}
${W} .hs-card label{${LABEL};font-size:11px;color:var(--color-text-muted)}
${W} .hs-card :is(input,textarea,select){border-radius:var(--wh-petal-md);border:1px solid var(--color-border-strong);background:var(--wh-gradient-vellum);color:var(--color-text);font-family:var(--wh-ui);transition:border-color ${EASE},box-shadow ${EASE}}
${W} .hs-card :is(input,textarea,select):focus{border:2px solid var(--color-primary);box-shadow:var(--wh-aura);outline:none}
${W} .hs-card input[type="checkbox"]{border-radius:4px;accent-color:var(--color-primary)}
${W} .hs-card [role="alert"]{font-family:var(--wh-ui);padding:10px 14px;border-radius:var(--wh-petal-sm);background:var(--wh-madder-soft);color:var(--wh-madder)}
${W} .hs-card .hs-btn{margin-top:4px}

${W} .hs-tier{padding:20px 24px;border-radius:var(--wh-petal-md);${CARD};transition:box-shadow ${EASE}}
${W} .hs-tier:hover{box-shadow:var(--wh-aura)}
${W} .hs-tier .hs-serif{font-size:1.6rem!important;line-height:1.1}
${W} .hs-tier svg{transition:transform ${EASE}}
${W} .hs-tier:hover svg{transform:translateX(3px)}
${W} .hs-chip{${LABEL};display:inline-block;font-size:11px;padding:5px 12px;border-radius:var(--wh-pill);background:var(--wh-gradient-lavender);color:var(--color-primary-strong)}
${W} p.hs-serif{font-family:var(--wh-display)!important;font-style:italic!important;font-weight:400;font-size:1.4rem!important;padding-left:20px;border-left:1.5px solid var(--wh-symbol-line);color:var(--wh-nightshade)}

${W} .hs-faq{border-radius:var(--wh-petal-md);${CARD};transition:box-shadow ${EASE}}
${W} .hs-faq[open]{box-shadow:var(--wh-aura);border-color:var(--wh-symbol-line-soft)}
${W} .hs-faq summary{padding:18px 22px;font-family:var(--wh-display);font-size:1.3rem;font-weight:400;color:var(--wh-nightshade)}
${W} .hs-faq summary::after{width:32px;height:32px;border-radius:50%;background:var(--wh-gradient-lavender);border:0;font-family:var(--wh-ui);font-size:1rem;color:var(--color-primary-strong)}
${W} .hs-faq-a{padding:0 64px 22px 22px;font-size:1.05rem;line-height:1.6;color:var(--color-text-muted)}

${W} .hs-band{border-radius:var(--wh-petal-lg);background:var(--wh-smoke),var(--wh-wash-madder),var(--wh-grain),var(--wh-gradient-dusk);border:1px solid var(--wh-hairline);box-shadow:var(--wh-shadow-soft);color:var(--color-text)}
${W} .hs-band-photo{border-radius:var(--wh-arch);overflow:hidden;filter:sepia(.1)}
${W} .hs-band-wash{background:var(--wh-veil)}
${W} .hs-band-grid{padding:clamp(48px,7vw,104px) clamp(24px,5vw,80px)}
${W} .hs-band h2{${DISPLAY};font-size:clamp(2.8rem,6vw,4.5rem);line-height:1.02;color:var(--wh-nightshade)}
${W} .hs-band-body{font-size:1.2rem;line-height:1.6;color:var(--color-text-muted)}
${W} .hs-band .hs-eyebrow{color:var(--color-primary-strong)!important}
${W} .hs-contact{padding:clamp(24px,3vw,32px);border-radius:var(--wh-petal-md);${CARD};-webkit-backdrop-filter:none;backdrop-filter:none}
${W} .hs-contact .hs-serif{font-size:1.6rem!important}
${W} .hs-contact a,${W} .hs-contact span{font-size:1.05rem;color:var(--color-text)}
${W} .hs-contact a:hover{color:var(--color-primary-strong)}
${W} .hs-contact .hs-contact-muted{${LABEL};font-size:11px;line-height:1.6;color:var(--color-text-muted)}
${W} .hs-contact .hs-socials a{${LABEL};font-size:11px;padding:9px 14px;border-radius:var(--wh-pill);background:var(--wh-gradient-vellum);border:1px solid var(--wh-hairline)}
${W} .hs-contact .hs-socials a:hover{box-shadow:var(--wh-aura);color:var(--color-primary-strong)}

${W} .hs-plain{max-width:1200px}

${W} .hs-season{max-width:none;margin:0;border-bottom:1px solid var(--wh-hairline);padding-left:max(clamp(16px,4vw,48px),calc((100% - 1200px) / 2 + clamp(16px,4vw,48px)));padding-right:max(clamp(16px,4vw,48px),calc((100% - 1200px) / 2 + clamp(16px,4vw,48px)));min-height:44px;padding-top:8px;padding-bottom:8px;display:flex;align-items:center;justify-content:space-between;gap:8px 32px;flex-wrap:wrap;background:color-mix(in srgb,var(--wh-parchment) 92%,transparent)}
${W} .hs-season-now{margin:0}
${W} .hs-season-track{display:none}
${W} .hs-season-next{margin:0;${LABEL};font-size:11px;color:var(--color-text-muted)}
${W} .hs-season-next span{color:var(--wh-symbol-ink)}

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
${W} .wh-block-head h2{${DISPLAY};font-size:clamp(2.4rem,5vw,3.5rem);line-height:1.04;margin:0;color:var(--wh-nightshade);text-wrap:balance}
${W} .wh-block-head p{margin:0;font-size:1.2rem;line-height:1.6;color:var(--color-text-muted);max-width:64ch}
${W} .wh-label{${LABEL};font-size:11px;color:var(--color-text-muted)}

${W} .wh-journey{display:flex;gap:20px;margin:0;padding:8px 4px 24px;list-style:none;overflow-x:auto;scroll-snap-type:x mandatory;scroll-padding:0 24px;-webkit-overflow-scrolling:touch;scrollbar-width:thin;scrollbar-color:var(--wh-symbol-line-soft) transparent}
${W} .wh-journey>li{flex:0 0 min(84vw,340px);scroll-snap-align:start;display:flex;flex-direction:column;gap:14px;padding:24px;border-radius:var(--wh-petal-md);${CARD};transition:box-shadow ${EASE},border-color ${EASE}}
${W} .wh-journey>li[aria-current="date"]{border:2px solid var(--wh-season);box-shadow:var(--wh-aura)}
${W} .wh-journey-sign{display:flex;align-items:center;gap:14px}
${W} .wh-journey-sign .wh-glyph-halo{width:52px;height:52px;font-size:24px}
${W} .wh-journey-house{${DISPLAY};font-style:italic;font-size:1.1rem;color:var(--wh-symbol-ink)}
${W} .wh-journey h3{margin:0;${DISPLAY};font-size:1.9rem;line-height:1.05;color:var(--wh-nightshade)}
${W} .wh-journey-range{${LABEL};font-size:11px;color:var(--wh-season-ink)}
${W} .wh-journey ol{margin:4px 0 0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px}
${W} .wh-journey-empty{margin:0;font-style:italic;color:var(--color-text-muted)}
${W} .wh-journey-hint{margin:8px 0 0;font-family:var(--wh-body);font-style:italic;font-size:15px;color:var(--color-text-muted)}

${W} .wh-row{display:grid;grid-template-columns:58px 22px minmax(0,1fr);gap:10px;align-items:center;padding:7px 10px;border-radius:var(--wh-petal-sm);border:1px solid var(--wh-hairline);background:var(--wh-gradient-vellum);color:var(--color-text);text-decoration:none;transition:box-shadow ${EASE}}
${W} a.wh-row:hover{box-shadow:var(--wh-aura)}
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
${W} .wh-wheel-moon{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%)}
${W} .wh-skymap-now{display:flex;flex-direction:column;gap:10px}
${W} .wh-skymap-now h3{margin:0;${DISPLAY};font-size:2.2rem;line-height:1.05;color:var(--wh-nightshade)}
${W} .wh-skymap-months{margin:0;padding:0;list-style:none;display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,240px),1fr));gap:16px}
${W} .wh-skymap-months>li{display:flex;flex-direction:column;gap:8px;padding:16px;border-radius:var(--wh-petal-md);${CARD}}
${W} .wh-skymap-months h4{margin:0;${DISPLAY};font-size:1.4rem;color:var(--wh-nightshade);display:flex;justify-content:space-between;align-items:baseline;gap:8px}
${W} .wh-skymap-months ol{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px}
${W} .wh-legend{display:flex;flex-wrap:wrap;gap:8px 16px;margin:0;padding:0;list-style:none;${LABEL};font-size:11px;color:var(--color-text-muted)}
${W} .wh-legend li{display:inline-flex;align-items:center;gap:6px}

${W} .mw-page .mw-photo,${W} .mw-page .mw-frame{border-radius:var(--wh-arch)!important;clip-path:none!important}
${W} .mw-page :is(.mw-grid>*,.mw-beat,.mw-strip,.mw-note,.mw-closing,.mw-date-row,.mw-circle-row,.mw-head-card,.mw-weeks li,.mw-modules li){border-radius:var(--wh-petal-md)!important;clip-path:none!important}
${W} .mw-page :is(.mw-tag,.mw-badge,.mw-tag-chev,.mw-week-tag){border-radius:var(--wh-pill)!important;clip-path:none!important}
${W} .mw-page .mw-display{font-family:var(--wh-display);font-weight:400;letter-spacing:-.005em;color:var(--wh-nightshade)}
${W} .mw-page :is(.mw-kicker,.mw-label){${LABEL};font-size:11px}
${W} .mw-page .mw-chamfer{clip-path:none!important;border-radius:var(--wh-petal-md)!important}

${W} .hs-footer-top{width:100%;box-sizing:border-box;max-width:1200px;margin:clamp(48px,6vw,80px) auto 0;padding:clamp(40px,5vw,56px) clamp(20px,4vw,48px);display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:32px clamp(32px,6vw,96px);border-top:1px solid var(--wh-hairline)}
${W} .hs-footer-brand{display:flex;flex-direction:column;align-items:flex-start;gap:16px}
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
${W} .hs-admin-tag{${LABEL};font-size:11px;padding:5px 12px;border-radius:var(--wh-pill);background:var(--wh-vellum);color:var(--wh-nightshade)}
${W} .hs-admin-nav{display:flex;flex-wrap:wrap;gap:12px 24px}
${W} .hs-admin-nav a{${LABEL};font-size:12px;border-bottom:1.5px solid transparent;color:var(--color-on-ink);text-decoration:none;transition:border-color ${EASE}}
${W} .hs-admin-nav a:hover,${W} .hs-admin-nav a[aria-current="page"]{border-bottom-color:var(--color-on-ink)}
@media (prefers-reduced-motion:reduce){${W} *{transition:none!important;animation:none!important}}
`
