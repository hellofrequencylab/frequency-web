// THE MINDLESS WEBSITE LAYOUT (design: the Mindless website kit, ui_kits/website app.css, v13). The skin (mindless-css.ts) paints the
// borrowed Services blocks in Mindless colour; this sheet lays them out the way the design's website does, so a Mindless site reads as the
// design and not as Services in yellow. Owner, 2026-11-16: header, hero and footer full width; the colourful blob pattern is the main
// graphic, behind the hero with no logo; every icon is the design's icon sticker. Tokens only (lib/theme/mindless.ts). Scoped like the
// skin, so it only reaches the stand-alone site render (ADR-1906).

const M = '[data-house-theme="mindless"]'
const DAY = '[data-house-theme="mindless"][data-th="day"]'
const LABEL = 'font-family:var(--ml-font-body);font-weight:800;letter-spacing:.1em;text-transform:uppercase'
const TORN = 'polygon(0 0,100% 0,97% 25%,100% 50%,97% 75%,100% 100%,0 100%,3% 75%,0 50%,3% 25%)'

/** Every declaration here wins over the borrowed Services sheet, whose selectors carry more classes than these do. The skin's own hover
 *  and Day rules that must still win are written below with the same weight. */
const weigh = (css: string) => css.replace(/([{;])([a-z-]+:[^;{}]+?)(?=[;}])/g, (m, lead: string, decl: string) => (decl.includes('!important') ? m : `${lead}${decl}!important`))

export const MINDLESS_SITE_CSS = weigh(`
/* The site page stacks blocks flush: the design's sections carry their own rhythm, so the page wrapper adds none. */
${M} .site-doc-section>div>div{padding-block:0;margin-block:0}
${M} .site-doc-section>div>div>*+*{margin-top:0}
${M} .sv-orb,${M} .sv-pinstripe,${M} .sv-dotgrid{display:none}

/* HEADER: a full-width bar on the ground with a fine grain, a pit ledge under it. The name in the drip display, no logo image. */
${M} .hs-header{position:sticky;top:0;z-index:40;padding:0;background:transparent}
${M} .hs-pill{margin:0;max-width:none;width:100%;box-sizing:border-box;border-radius:0;min-height:76px;padding:14px max(24px,4vw);background:var(--ml-ground) var(--ml-tex-grain);background-size:180px;border:0;border-bottom:1px solid var(--ml-line);box-shadow:0 4px 0 0 var(--ml-pit);-webkit-backdrop-filter:none;backdrop-filter:none}
${M} .hs-logo{display:none}
${M} .hs-brand-name{display:inline-block;width:136px;height:46px;background:url("/sites/mindless/logo-drip.png") left center/contain no-repeat;color:transparent;text-shadow:none;font-size:0;overflow:hidden}
${M} .hs-footer .hs-brand-name{width:170px;height:58px;background-image:url("/sites/mindless/logo-drip-tagline.png")}
${M} .hs-nav a{${LABEL};font-size:13px;letter-spacing:.08em;color:var(--ml-head);box-shadow:none;padding-block:6px}
${M} .hs-nav a:hover,${M} .hs-nav a[aria-current="page"]{color:var(--ml-accent-text)}
${M} .hs-nav a[aria-current="page"]{box-shadow:inset 0 -3px 0 var(--ml-accent)}
${DAY} .hs-pill{background-color:var(--ml-ground);box-shadow:0 3px 0 0 var(--ml-ink)}

/* SECTIONS: the design's rhythm, pit, ground, raised, violet, in a 1140px column with wide gutters. */
${M} .sv-sec{padding-block:clamp(80px,9vw,128px)}
${M} .sv-sec--depth{background:var(--ml-ground)}
${M} .sv-sec--sky{background:var(--ml-raised)}
${M} .sv-sec--aurora{background:var(--ml-violet)}
${M} .sv-sec--ink,${M} .sv-band{background:var(--ml-band-pit);border:0}
${M} .sv-wrap{max-width:1140px;padding-inline:clamp(24px,7vw,120px);box-sizing:content-box}

/* THE SECTION LABEL: a strip of torn bone tape, a degree off true, its number in the offset paint. */
${M} .sv-sec .sv-eyebrow{display:inline-flex;align-items:center;gap:8px;padding:4px 12px 5px;border-radius:0;background:var(--ml-bone) var(--ml-tex-grain);color:var(--ml-ink);box-shadow:none;${LABEL};font-size:12px;transform:rotate(-1.5deg);clip-path:${TORN};margin-bottom:14px}
${M} .sv-sec .sv-eyebrow b{color:var(--ml-noise-1)}

/* HEADLINES: the key phrase is flat paint, never italic, never a gradient. One offset paint per section: blue on the raised band,
 * pink on the violet one, the accent everywhere else. */
${M} .sv-display em,${M} .hs-h1 em,${M} .hs-h2 em{font-family:inherit;font-style:normal;font-weight:inherit;background:none;-webkit-background-clip:border-box;background-clip:border-box;-webkit-text-fill-color:currentColor;color:var(--ml-accent-text);text-shadow:inherit;padding:0}
${M} .sv-sec .sv-head .sv-display{font-size:clamp(36px,5vw,56px);line-height:1.08}
${M} .sv-sec--sky .sv-display em{color:var(--ml-noise-2-text)}
${M} .sv-sec--aurora .sv-display em{color:var(--ml-noise-1-text)}
${DAY} .sv-sec--sky .sv-display em,${DAY} .sv-sec--aurora .sv-display em{color:var(--ml-ink)}
${M} .sv-lede{font-size:clamp(17px,1.6vw,20px);line-height:1.55;color:var(--ml-secondary);max-width:62ch;margin-top:18px}

/* THE HERO: the blob pattern full bleed (owner: the main graphic), the words on an ink slab with a pit ledge, no logo. */
${M} .sv-hero--photo{min-height:clamp(560px,78vh,780px);align-items:center}
${M} .sv-hero-bg--photo{background-position:50% 50%}
${M} .sv-hero-bg--photo::before{background:none}
${M} .sv-hero--photo .sv-hero-in{align-items:center}
${M} .sv-hero--photo .sv-hero-copy{max-width:min(100%,620px);padding:clamp(28px,4vw,48px);border-radius:var(--ml-corner-lg);background:var(--ml-pit);border:3px solid var(--ml-pit);box-shadow:8px 10px 0 0 var(--ml-pit)}
${M} .sv-hero .sv-eyebrow{background:none;box-shadow:none;padding:0;${LABEL};font-size:13px;color:var(--ml-accent-text)}
${M} .sv-hero .sv-display{font-size:clamp(48px,6.4vw,88px);line-height:1.02;color:var(--ml-head)}
${M} .sv-hero .sv-display em{display:block;color:var(--ml-accent)}
${M} .sv-hero-lead{color:var(--ml-secondary);max-width:46ch;font-size:clamp(17px,1.6vw,20px);line-height:1.55}
${DAY} .sv-hero--photo .sv-hero-copy{background:var(--ml-ink);color:var(--ml-paper)}
${DAY} .sv-hero .sv-display,${DAY} .sv-hero-lead{color:var(--ml-paper)}
${DAY} .sv-hero .sv-display em{background:none;color:var(--ml-yellow)}

/* BUTTONS: the paint sticker and the bone ghost with its offset ledge. No arrow glyph: the design's buttons are words only. */
${M} .sv-btn{border-radius:var(--ml-radius-pill);font-family:var(--ml-font-body);font-weight:800;letter-spacing:.08em;text-transform:uppercase}
${M} .sv-btn svg{display:none}
${M} .sv-btn--accent{background:var(--ml-accent);color:var(--ml-on-accent);border:3px solid var(--ml-pit);box-shadow:var(--ml-shadow-sticker)}
${M} .sv-btn--secondary{background:transparent;color:var(--ml-head);border:3px solid var(--ml-bone);box-shadow:3px 4px 0 0 var(--ml-noise-1)}
${M} .sv-hero .sv-btn--secondary{box-shadow:var(--ml-shadow-sticker)}

/* CARDS: one slab, raised with a hairline; on a raised band it sits back on the ground. */
${M} .sv-card,${M} .sv-panel{background:var(--ml-raised);border:1px solid var(--ml-line);box-shadow:none;border-radius:var(--ml-corner);padding:24px}
${M} .sv-sec--sky .sv-card{background:var(--ml-ground)}
${M} .sv-sec--aurora .sv-card{background:var(--ml-violet-raised)}
${M} .sv-price{font-family:var(--ml-font-display);font-weight:400;font-size:28px;line-height:1.1;color:var(--ml-accent-text);text-shadow:var(--ml-depth-ink)}

/* ICONS: the design's icon sticker everywhere a block draws an icon or a number tile. A 44px paint square, ink outline, a pit ledge,
 * tipped four degrees; the glyph is a 22px line icon at stroke 2 in ink. */
${M} .sv-tile{display:inline-grid;place-items:center;width:44px;height:44px;flex:none;padding:0;border-radius:var(--ml-corner-sm);background:var(--ml-accent);color:var(--ml-on-accent);border:3px solid var(--ml-pit);box-shadow:var(--ml-shadow-sticker);transform:rotate(-4deg);${LABEL};font-size:13px;letter-spacing:0}
${M} .sv-tile svg{width:22px;height:22px;stroke-width:2;color:var(--ml-on-accent)}
${M} .sv-card .sv-tile{margin-bottom:16px}
${M} .sv-grid>:nth-child(3n+2) .sv-tile{background:var(--ml-noise-1);color:var(--ml-ink)}
${M} .sv-grid>:nth-child(3n) .sv-tile{background:var(--ml-noise-2);color:var(--ml-ink)}
${M} .sv-grid>:nth-child(3n+2) .sv-tile svg,${M} .sv-grid>:nth-child(3n) .sv-tile svg{color:var(--ml-ink)}

/* THE TRUST ROW: the design's stat slabs, a paint rule on top, the figure in the drip display. */
${M} .sv-trust{max-width:1140px;margin:0 auto;padding-inline:clamp(24px,7vw,120px);box-sizing:content-box;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}
${M} .sv-sec:has(> .sv-trust){background:var(--ml-band-pit);padding-block:clamp(40px,5vw,64px)}
${M} .sv-trust-item{display:flex;flex-direction:column;align-items:flex-start;gap:12px;padding:22px 24px;border-radius:var(--ml-corner);border-top:6px solid var(--ml-accent);background:var(--ml-raised);box-shadow:inset 0 1px 0 0 color-mix(in oklab,var(--ml-bone) 8%,transparent),0 6px 0 -1px var(--ml-pit)}
${M} .sv-trust-item .sv-tile{display:none}
${M} .sv-trust-item b{display:block;font-family:var(--ml-font-display);font-weight:400;font-size:clamp(28px,2.8vw,40px);line-height:1.05;color:var(--ml-head);text-shadow:var(--ml-depth-ink);text-transform:uppercase}
${M} .sv-trust-item small{display:block;margin-top:6px;${LABEL};font-size:12px;color:var(--ml-muted)}
@media (max-width:760px){${M} .sv-trust{grid-template-columns:repeat(2,minmax(0,1fr))}}

/* FOOTER: full width on the pit. */
${M} .hs-footer{background:var(--ml-band-pit);margin:0;max-width:none;border-radius:0}
${M} .hs-footer-top{max-width:none;border-radius:0;margin:0}
${M} .hs-footer a:not(.hs-partner){color:var(--ml-head);font-weight:600;text-decoration:none}
${M} .hs-footer a:not(.hs-partner):hover{color:var(--ml-accent-text)}
${M} .hs-footer .hs-brand,${M} .hs-footer .hs-brand-name{font-family:var(--ml-font-display);font-weight:400;color:var(--ml-accent);text-shadow:var(--ml-depth-ink);text-transform:uppercase}
/* The page column ends where the last section does: no gap above the footer. */
${M} .mw-page{padding-bottom:0}
/* Contested by the Services sheet: its glow layers, its gradient text and its shadows. */
${M} .sv-sec{background-image:none}
${M} .sv-sec::before,${M} .sv-sec::after{display:none}
${M} .hs-header{box-shadow:none}
${M} .sv-display em{-webkit-text-stroke:0;text-transform:inherit}
${M} .sv-hero .sv-display{background:none;-webkit-text-fill-color:currentColor}
${M} .sv-sec .sv-eyebrow{width:fit-content;align-self:flex-start}
${M} .sv-trust-item>span{padding:0;margin:0}
${M} .sv-tile{opacity:1}
/* Hover and press, at the same weight as the rest of this sheet. */
${M} .sv-btn--accent:hover{background:var(--ml-accent-hover);transform:translate(-1px,-1px);box-shadow:var(--ml-shadow-sticker-lift)}
${M} .sv-btn--accent:active{transform:translate(2px,3px);box-shadow:none}
${M} .sv-btn--secondary:hover{background:var(--ml-bone);color:var(--ml-ink)}
${M} a.sv-card:hover{border-color:var(--ml-line-strong);transform:translateY(-2px)}
`)
