// THE FREQUENCY PAGE SECTIONS' LOOK (ADR-1727). A website page's blocks are drawn once, as the site page
// sections (components/sites/menswork-page.tsx, planned by lib/sites/menswork-page.ts), whichever theme the
// site wears; the theme is only the stylesheet. Bold dresses them in MENSWORK_PAGE_CSS; this sheet dresses
// them in the house look the Frequency theme's Home wears (components/sites/house-css.ts): the house serif
// headlines, soft rounded cards with warm diffuse shadows, tonal panels, round markers, no rules or cuts.
// DAWN semantic tokens only, so the Space's accent (AccentScope) repaints every amber. Switching a site
// between the two themes changes this sheet and nothing a block stores.
//
// Scoped to a house site that does NOT wear the Bold skin, so the two sheets never meet.

const F = '[data-house-site]:not([data-house-theme="menswork"])'

/** `color-mix` shorthand: a token at a percentage over transparent. */
const a = (token: string, pct: number) => `color-mix(in srgb,var(--color-${token}) ${pct}%,transparent)`
const WARM = (y: number, blur: number, spread: number, pct: number) => `0 ${y}px ${blur}px -${spread}px ${a('text', pct)}`

const EYEBROW = 'font-size:12px;font-weight:600;letter-spacing:.2em;text-transform:uppercase'
const SERIF = 'font-family:var(--hs-serif),Georgia,serif;font-weight:400;letter-spacing:-.02em;margin:0;text-wrap:balance'
const CARD = `background:var(--color-surface);border-radius:28px;box-shadow:${WARM(24, 60, 36, 40)}`
const DOT = 'content:"";flex:none;width:8px;height:8px;border-radius:50%;background:var(--color-primary)'
const PAD = 'clamp(20px,4vw,48px)'

export const FREQUENCY_PAGE_CSS = `
${F} .mw-page{--mw-s:var(--color-primary-strong);--mw-accent:var(--color-primary);display:flex;flex-direction:column;padding-bottom:clamp(80px,10vw,140px)}
${F} .mw-wrap{width:100%;max-width:1160px;margin:0 auto;padding-left:${PAD};padding-right:${PAD};box-sizing:border-box}
${F} .mw-sec{padding-top:clamp(72px,9vw,128px)}
${F} .mw-display{${SERIF};color:var(--color-text)}
${F} .mw-xl{font-size:clamp(3.4rem,8vw,6.6rem);line-height:.98}
${F} .mw-l{font-size:clamp(2.8rem,6vw,4.8rem);line-height:1}
${F} .mw-m{font-size:clamp(2.4rem,4.8vw,3.8rem);line-height:1.04}
${F} .mw-s{font-size:clamp(1.7rem,2.6vw,2.1rem);line-height:1.15}
${F} .mw-xs{font-size:1.5rem;line-height:1.2}
${F} .mw-accent{font-style:italic;color:var(--color-primary-strong)}
${F} .mw-kicker{${EYEBROW};display:flex;align-items:center;gap:10px;margin:0 0 16px;color:var(--color-primary-strong)}
${F} .mw-kicker::before{${DOT}}
${F} .mw-kicker-summer::before,${F} .mw-kicker-season::before{background:var(--mw-s)}
${F} .mw-lead{margin:20px 0 0;max-width:58ch;font-size:1.15rem;line-height:1.7;color:var(--color-text-muted);text-wrap:pretty}
${F} .mw-body{margin:12px 0 0;font-size:1.05rem;line-height:1.65;color:var(--color-text-muted)}
${F} .mw-small{margin:0;font-size:.98rem;line-height:1.6;color:var(--color-text-muted)}
${F} .mw-label{${EYEBROW};font-size:11px;letter-spacing:.16em;color:var(--color-text-subtle)}
${F} .mw-label-strong{color:var(--color-text)}
${F} .mw-actions{display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin-top:28px}
${F} .mw-actions:empty{display:none}
${F} .mw-textlink{display:inline-flex;align-items:center;gap:8px;font-weight:600;font-size:15px;color:var(--color-primary-strong);white-space:nowrap}
${F} .mw-textlink:hover{color:var(--color-text)}
${F} .mw-freqtag{display:inline-flex;align-items:center;gap:8px;font-weight:600;font-size:14px;color:var(--color-primary-strong)}
${F} .mw-freqtag::before{${DOT}}
${F} .mw-icon{color:var(--color-primary-strong);flex:none}
${F} .mw-photo{position:relative;margin:0;overflow:hidden;border-radius:clamp(20px,2.6vw,32px);background:var(--color-surface-elevated);box-shadow:${WARM(30, 70, 40, 45)}}
${F} .mw-photo img{display:block;width:100%;height:100%;object-fit:cover}
${F} .mw-chamfer{border-radius:clamp(24px,3vw,36px)}
${F} .mw-frame{position:relative;${CARD}}
${F} .mw-grid{list-style:none;margin:0;padding:0;display:grid;gap:clamp(16px,2.5vw,24px)}
${F} .mw-grid>*{${CARD};padding:clamp(24px,3vw,32px);display:flex;flex-direction:column;gap:12px;min-width:0}
${F} .mw-cols-1{grid-template-columns:minmax(0,1fr)}${F} .mw-cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}${F} .mw-cols-3{grid-template-columns:repeat(3,minmax(0,1fr))}${F} .mw-cols-4{grid-template-columns:repeat(4,minmax(0,1fr))}@media (max-width:900px){${F} .mw-cols-3,${F} .mw-cols-4{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (max-width:560px){${F} .mw-cols-2,${F} .mw-cols-3,${F} .mw-cols-4{grid-template-columns:minmax(0,1fr)}}
${F} .mw-grid-3{grid-template-columns:repeat(3,minmax(0,1fr))}@media (max-width:900px){${F} .mw-grid-3{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (max-width:560px){${F} .mw-grid-3{grid-template-columns:minmax(0,1fr)}}
${F} .mw-band{height:1px;margin-top:clamp(72px,9vw,128px);background:transparent}
${F} .mw-sec-head{margin-bottom:clamp(28px,4vw,48px)}
${F} .mw-sec-head .mw-kicker{margin-bottom:12px}
${F} .mw-sec-head-row{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:16px 24px}

${F} .mw-hero{padding-top:clamp(112px,13vw,170px)}
${F} .mw-hero-inner{display:grid;gap:clamp(32px,5vw,64px);align-items:center}
${F} .mw-hero-split .mw-hero-inner{grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr))}
${F} .mw-hero-split .mw-photo{aspect-ratio:4/5;max-height:620px}
${F} .mw-hero-copy{max-width:820px}
${F} .mw-hero-stack .mw-hero-copy .mw-display{font-size:clamp(3.4rem,8vw,6.6rem)}
${F} .mw-hero-photo{width:calc(100% - 2 * ${PAD});max-width:1240px;margin:clamp(40px,5vw,56px) auto 0;height:clamp(300px,40vw,540px)}

${F} .mw-head{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,380px),1fr));gap:clamp(24px,6vw,88px);align-items:start}
${F} .mw-head-card{padding:clamp(32px,5vw,56px);background:var(--color-marketing-canvas);box-shadow:none;border-radius:clamp(24px,3vw,40px)}
${F} .mw-head-text .mw-lead:first-child{margin-top:0}
${F} .mw-head-aside{margin:14px 0 0}

${F} .mw-facts{grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr));margin:0}
${F} .mw-facts>div{gap:10px;padding:24px}
${F} .mw-facts dd{margin:0}
${F} .mw-fact-v{${SERIF};font-size:clamp(2rem,3.6vw,3rem);line-height:1;color:var(--color-primary-strong)}
${F} .mw-faqs{display:flex;flex-direction:column;gap:10px;max-width:880px}

${F} .mw-beats{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,140px),1fr));gap:10px}
${F} .mw-beat{all:unset;box-sizing:border-box;cursor:pointer;min-height:96px;display:flex;flex-direction:column;justify-content:center;gap:6px;padding:16px 22px;border-radius:24px;background:var(--color-surface);box-shadow:${WARM(14, 34, 22, 35)};color:var(--color-text);transition:background 160ms ease,color 160ms ease}
${F} .mw-beat:hover{background:var(--color-surface-elevated)}
${F} .mw-beat:focus-visible{outline:2px solid var(--color-focus-ring);outline-offset:2px}
${F} .mw-beat[aria-pressed="true"]{background:var(--color-primary);color:var(--color-text-on-primary)}
${F} .mw-beat-l{font-family:var(--hs-serif),Georgia,serif;font-style:italic;font-size:2.6rem;line-height:.9;color:var(--color-primary-strong)}
${F} .mw-beat[aria-pressed="true"] .mw-beat-l{color:var(--color-text-on-primary)}
${F} .mw-beat-w{font-size:13px;font-weight:600;color:inherit}
${F} .mw-beat-panel{margin-top:20px;padding:28px 32px;display:grid;grid-template-columns:auto minmax(0,1fr);gap:12px 28px;align-items:baseline}
${F} .mw-beat-name{${SERIF};font-size:2.2rem;line-height:1.1;color:var(--color-primary-strong)}
${F} .mw-beat-body{font-size:1.1rem;line-height:1.65;color:var(--color-text-muted)}

${F} .mw-path{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:clamp(32px,4vw,56px)}
${F} .mw-path li{position:relative;display:flex;flex-direction:column;gap:12px;min-width:0}
${F} .mw-path-n{font-family:var(--hs-serif),Georgia,serif;font-style:italic;font-size:3.4rem;line-height:.9;color:var(--color-primary-strong)}
${F} .mw-tag-chev{align-self:flex-start;padding:4px 12px;border-radius:999px;background:var(--color-primary-bg);color:var(--color-primary-strong);font-size:12px;font-weight:600}
${F} .mw-path-grid{grid-template-columns:repeat(3,minmax(0,1fr))}@media (max-width:860px){${F} .mw-path-grid{grid-template-columns:minmax(0,1fr)}}

${F} .mw-parts-top{display:flex;align-items:center;justify-content:space-between}
${F} .mw-parts-sec{position:relative}

${F} .mw-lists{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:32px clamp(32px,5vw,56px)}
${F} .mw-label-strong.mw-label{margin:0 0 14px}
${F} .mw-chevlist{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:12px}
${F} .mw-chevlist li{position:relative;padding-left:24px;font-size:1rem;line-height:1.6;color:var(--color-text-muted)}
${F} .mw-chevlist li::before{${DOT};position:absolute;left:2px;top:.6em}
${F} .mw-chevlist-quiet li::before{background:var(--color-border-strong)}
${F} .mw-checklist .mw-chevlist{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:14px 40px}

${F} .mw-photos{display:grid;gap:clamp(12px,2vw,20px)}
${F} .mw-photos-item{display:flex;flex-direction:column;gap:10px}
${F} .mw-photos .mw-photo{height:clamp(220px,24vw,300px)}
${F} .mw-quote{margin:0}
${F} .mw-quote blockquote{margin:0 0 12px;font-family:var(--hs-serif),Georgia,serif;font-size:1.4rem;line-height:1.45;color:var(--color-text);text-wrap:pretty}
${F} .mw-grid>.mw-quote{padding:clamp(28px,3vw,36px)}

${F} .mw-story{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,6fr);gap:clamp(40px,7vw,104px);align-items:center}
${F} .mw-story-right{grid-template-columns:minmax(0,6fr) minmax(0,5fr)}
${F} .mw-story-right .mw-story-photo{order:2}
${F} .mw-story-solo{grid-template-columns:minmax(0,1fr)}
${F} .mw-story-photo{aspect-ratio:4/5;max-height:640px}
${F} .mw-story-copy{display:flex;flex-direction:column;min-width:0}
${F} .mw-story-copy .mw-chevlist{margin-top:24px}
${F} .mw-story-copy .mw-textlink{margin-top:24px}
${F} .mw-story-copy .mw-quote{margin-top:24px}
@media (max-width:760px){${F} .mw-story,${F} .mw-story-right{grid-template-columns:minmax(0,1fr)}${F} .mw-story-right .mw-story-photo{order:0}}

${F} .mw-closing{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:24px 48px;align-items:center;padding:clamp(48px,7vw,96px) clamp(28px,6vw,80px);border-radius:clamp(24px,3vw,40px);background:var(--color-ink);color:var(--color-on-ink)}
${F} .mw-closing .mw-display{color:var(--color-on-ink)}
${F} .mw-closing .mw-lead,${F} .mw-closing .mw-body{color:var(--color-on-ink-muted)}
${F} .mw-closing .mw-actions{margin-top:0}
@media (max-width:760px){${F} .mw-closing{grid-template-columns:minmax(0,1fr)}}
${F} .mw-strip{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:16px 20px;align-items:center;padding:18px 24px;border-radius:22px;background:${a('surface', 65)};box-shadow:${WARM(12, 30, 22, 40)};color:var(--color-text);transition:background 160ms ease}
${F} a.mw-strip:hover{background:var(--color-surface)}
${F} .mw-strip-chev{width:8px;height:8px;border-radius:50%;background:var(--color-primary)}
${F} .mw-strip-text{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 16px}
${F} .mw-strip-end{color:var(--color-text-muted)}
${F} .mw-note{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:16px 24px;align-items:center;padding:24px 28px;border-radius:24px;background:var(--color-marketing-canvas)}
${F} .mw-note strong{display:block;margin-bottom:6px;font-weight:600;color:var(--color-text)}
${F} .mw-badge{display:inline-block;padding:3px 10px;border-radius:999px;white-space:nowrap;font-size:12px;font-weight:600;color:var(--color-primary-strong);background:var(--color-primary-bg)}
${F} .mw-badge-full{background:var(--color-surface-elevated);color:var(--color-text-muted)}
${F} .mw-badge-forming{background:var(--color-primary);color:var(--color-text-on-primary)}
${F} .mw-text-head .mw-display{max-width:18ch}
${F} .mw-text .mw-lead{max-width:68ch}
${F} .mw-other{padding-top:clamp(56px,7vw,96px)}

${F} .mw-dates{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
${F} .mw-date-row{display:grid;grid-template-columns:14px minmax(150px,210px) minmax(0,1fr) auto;gap:8px 18px;align-items:baseline;padding:18px 22px;border-radius:20px;background:var(--color-surface);box-shadow:${WARM(12, 30, 22, 30)}}
${F} .mw-date-mark{align-self:center;width:10px;height:10px;border-radius:50%;background:var(--color-primary)}
${F} .mw-date-mark[data-kind="circle"]{background:var(--color-primary-strong)}
${F} .mw-date-mark[data-kind="retreat"]{background:var(--color-success)}
${F} .mw-date-text{display:flex;flex-direction:column;gap:4px;min-width:0}
${F} .mw-date-text strong{font-weight:600;color:var(--color-text)}
@media (max-width:640px){${F} .mw-date-row{grid-template-columns:14px minmax(0,1fr)}${F} .mw-date-row>:nth-child(n+3){grid-column:2}}

${F} .mw-finder{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,6fr);gap:32px;align-items:start}
@media (max-width:860px){${F} .mw-finder{grid-template-columns:minmax(0,1fr)}}
${F} .mw-tags{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}
${F} .mw-tag{all:unset;box-sizing:border-box;cursor:pointer;padding:9px 16px;border-radius:999px;background:var(--color-surface-elevated);font-size:14px;font-weight:500;color:var(--color-text-muted)}
${F} .mw-tag[aria-pressed="true"]{background:var(--color-primary-bg);color:var(--color-primary-strong)}
${F} .mw-tag:focus-visible{outline:2px solid var(--color-focus-ring);outline-offset:2px}
${F} .mw-rows{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
${F} .mw-circle-row{all:unset;box-sizing:border-box;cursor:pointer;width:100%;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 14px;align-items:center;padding:18px 22px;border-radius:20px;background:${a('surface', 60)};transition:background 160ms ease,box-shadow 160ms ease}
${F} .mw-circle-row[aria-pressed="true"]{background:var(--color-surface);box-shadow:${WARM(14, 34, 22, 35)}}
${F} .mw-circle-row:focus-visible{outline:2px solid var(--color-focus-ring);outline-offset:2px}
${F} .mw-circle-row-name{${SERIF};font-size:1.45rem;line-height:1.15}
${F} .mw-circle-row .mw-label{grid-column:1}
${F} .mw-circle-row .mw-badge{grid-column:2;grid-row:1/span 2}
${F} .mw-circle-card{display:flex;flex-direction:column;overflow:hidden}
${F} .mw-circle-photo{display:block;width:100%;height:240px;object-fit:cover}
${F} .mw-circle-body{padding:28px;display:flex;flex-direction:column;gap:18px}
${F} .mw-circle-body .mw-body{margin:0}
${F} .mw-circle-body .mw-actions{margin-top:0}
${F} .mw-circle-head{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:8px 16px}
${F} .mw-circle-meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;padding-top:4px}
${F} .mw-circle-meta>span>span,${F} .mw-person>span{display:flex;flex-direction:column;gap:6px}
${F} .mw-circle-meta strong{font-weight:600;color:var(--color-text)}
${F} .mw-person{display:flex!important;flex-direction:row!important;align-items:center;gap:12px!important}
${F} .mw-avatar{width:40px;height:40px;border-radius:50%;object-fit:cover}
${F} .mw-progress{display:flex;flex-direction:column;gap:8px}
${F} .mw-progress-head{display:flex;justify-content:space-between;align-items:baseline;gap:12px}
${F} .mw-progress-count{font-weight:600;font-size:14px;color:var(--color-text)}
${F} .mw-progress-count span{color:var(--color-text-subtle)}
${F} .mw-progress-bar{display:grid;gap:4px}
${F} .mw-progress-bar span{height:8px;border-radius:999px;background:var(--color-surface-elevated)}
${F} .mw-progress-bar span[data-state="done"]{background:var(--color-primary)}
${F} .mw-progress-bar span[data-state="next"]{background:${a('primary', 40)}}

${F} .mw-journeys{display:flex;flex-direction:column;gap:clamp(40px,5vw,64px)}
${F} .mw-journey{display:grid;grid-template-columns:minmax(0,4fr) minmax(0,7fr);gap:clamp(24px,5vw,56px);align-items:start}
@media (max-width:860px){${F} .mw-journey{grid-template-columns:minmax(0,1fr)}}
${F} .mw-journey-head{display:flex;flex-direction:column;align-items:flex-start;gap:6px}
${F} .mw-journey-head .mw-textlink{margin-top:20px}
${F} .mw-weeks{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
${F} .mw-weeks li{display:grid;grid-template-columns:auto 72px minmax(0,1fr);gap:20px;align-items:center;padding:16px 22px;border-radius:20px;background:var(--color-surface);box-shadow:${WARM(12, 30, 22, 30)}}
${F} .mw-weeks strong{font-weight:600;color:var(--color-text)}
${F} .mw-week-tag{padding:4px 12px;border-radius:999px;background:var(--color-primary-bg);color:var(--color-primary-strong);font-size:12px;font-weight:600}
${F} .mw-weeks .mw-weeks-more{display:block;background:var(--color-marketing-canvas);box-shadow:none;padding:12px 22px}

${F} .mw-year{display:grid;grid-template-columns:280px minmax(0,1fr);gap:56px;align-items:start}
@media (max-width:960px){${F} .mw-year{grid-template-columns:minmax(0,1fr)}${F} .mw-wheel-aside{position:static!important}${F} .mw-wheel{display:none}}
${F} .mw-wheel-aside{position:sticky;top:112px;display:flex;flex-direction:column;gap:20px}
${F} .mw-wheel{position:relative;width:280px;height:280px}
${F} .mw-wheel-turn{position:absolute;inset:0;transition:transform 700ms cubic-bezier(.2,.7,.2,1)}
${F} .mw-wheel-svg polygon{fill:var(--color-surface-elevated);stroke:var(--color-canvas);cursor:pointer;transition:fill 250ms ease}
${F} .mw-wheel-svg polygon[data-on]{fill:var(--color-primary)}
${F} .mw-wheel-pointer{position:absolute;left:50%;top:-12px;width:10px;height:10px;margin-left:-5px;border-radius:50%;background:var(--color-primary-strong)}
${F} .mw-wheel-center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;pointer-events:none}
${F} .mw-wheel-name{${SERIF};font-style:italic;font-size:40px;line-height:1;color:var(--color-primary-strong)}
${F} .mw-wheel-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px}
${F} .mw-wheel-list button{all:unset;box-sizing:border-box;cursor:pointer;width:100%;display:grid;grid-template-columns:14px minmax(0,1fr) auto;gap:10px;align-items:center;padding:10px 14px;border-radius:16px;transition:background 200ms ease}
${F} .mw-wheel-list button[aria-current]{background:var(--color-surface)}
${F} .mw-wheel-list button:focus-visible{outline:2px solid var(--color-focus-ring)}
${F} .mw-wheel-chev{width:8px;height:8px;border-radius:50%;background:var(--color-primary);opacity:.4}
${F} .mw-wheel-list button[aria-current] .mw-wheel-chev{opacity:1}
${F} .mw-wheel-item{font-weight:600;font-size:15px;color:var(--color-text-subtle)}
${F} .mw-wheel-list button[aria-current] .mw-wheel-item{color:var(--color-text)}
${F} .mw-year-seasons{display:flex;flex-direction:column;gap:96px;min-width:0}
${F} .mw-season{display:flex;flex-direction:column;gap:14px;scroll-margin-top:120px}
${F} .mw-season .mw-kicker{margin:0}
${F} .mw-season-name{color:var(--color-primary-strong)}
${F} .mw-season .mw-lead{margin-top:0}
${F} .mw-season-photo{height:320px;margin-top:14px}
${F} .mw-modules{list-style:none;margin:14px 0 0;padding:0;display:flex;flex-direction:column;gap:8px}
${F} .mw-modules li{display:grid;grid-template-columns:40px minmax(0,1fr) minmax(0,1.1fr);gap:20px;align-items:start;padding:20px 22px;border-radius:20px;background:var(--color-surface);box-shadow:${WARM(12, 30, 22, 30)}}
@media (max-width:640px){${F} .mw-modules li{grid-template-columns:32px minmax(0,1fr)}${F} .mw-module-dates{grid-column:2}}
${F} .mw-glyph{font-family:'Segoe UI Symbol','Noto Sans Symbols 2','Apple Symbols',sans-serif;font-size:26px;line-height:1;color:var(--color-primary-strong)}
${F} .mw-module-text,${F} .mw-module-dates{display:flex;flex-direction:column;gap:6px;min-width:0}
${F} .mw-module-dates>span{display:grid;grid-template-columns:64px minmax(0,1fr);gap:10px;align-items:baseline}
${F} .mw-keydates{display:flex;flex-direction:column;gap:10px;margin-top:10px}
`
