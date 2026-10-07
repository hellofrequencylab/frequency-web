// THE MENSWORK PAGE SECTIONS' LOOK (components/sites/menswork-page.tsx), layered after MENSWORK_CSS on a
// Menswork website. Same rules as the skin: one 60 degree chamfer, top-right; hairlines, never shadows; no
// gradients except the hatch band; condensed caps headlines, Barlow body, mono labels; the teal is constant
// and one seasonal accent marks "now". DAWN and `--mw-*` tokens only.

const M = '[data-house-theme="menswork"]'

const CLIP = {
  sm: 'polygon(0 0,calc(100% - 8px) 0,100% 13.86px,100% 100%,0 100%)',
  md: 'polygon(0 0,calc(100% - 12px) 0,100% 20.78px,100% 100%,0 100%)',
  lg: 'polygon(0 0,calc(100% - 20px) 0,100% 34.64px,100% 100%,0 100%)',
} as const
const diag = (cut: number) =>
  `content:"";position:absolute;top:-2px;right:${-1 - cut}px;width:${cut * 2}px;height:2px;background:var(--mw-edge);transform-origin:0 50%;transform:rotate(60deg);pointer-events:none`
const chev = (h: number, flat = false) => {
  const n = +(h * 0.289).toFixed(2)
  return `polygon(0 0,calc(100% - ${n}px) 0,100% 50%,calc(100% - ${n}px) 100%,0 100%${flat ? '' : `,${n}px 50%`})`
}
const LABEL = 'font-family:var(--mw-mono);font-weight:500;font-size:12px;line-height:1.3;letter-spacing:.12em;text-transform:uppercase'
const DISPLAY = 'font-family:var(--mw-display);font-weight:800;text-transform:uppercase;letter-spacing:.005em;margin:0;text-wrap:balance'
const HATCH = 'repeating-linear-gradient(-60deg,var(--mw-hairline) 0 2px,transparent 2px 12px)'
const PAD = 'clamp(20px,4vw,48px)'

export const MENSWORK_PAGE_CSS = `
${M} [data-season-mark="winter"]{--mw-s:var(--mw-winter)}
${M} [data-season-mark="spring"]{--mw-s:var(--mw-spring)}
${M} [data-season-mark="summer"]{--mw-s:var(--mw-summer)}
${M} [data-season-mark="fall"]{--mw-s:var(--mw-fall)}
${M} .mw-page{display:flex;flex-direction:column;padding-bottom:clamp(48px,6vw,96px)}
${M} .mw-wrap{width:100%;max-width:1248px;margin:0 auto;padding-left:${PAD};padding-right:${PAD};box-sizing:border-box}
${M} .mw-sec{padding-top:clamp(48px,7vw,88px)}
${M} .mw-display{${DISPLAY};color:var(--color-text)}
${M} .mw-xl{font-size:clamp(3.5rem,8vw,7.5rem);line-height:.88}
${M} .mw-l{font-size:clamp(3rem,6.4vw,5.5rem);line-height:.9}
${M} .mw-m{font-size:clamp(2.4rem,4.6vw,3.75rem);line-height:.92}
${M} .mw-s{font-size:clamp(1.9rem,3vw,2.4rem);line-height:.95;font-weight:700}
${M} .mw-xs{font-size:1.625rem;line-height:1;font-weight:700}
${M} .mw-accent{color:var(--color-primary-strong)}
${M} .mw-kicker{${LABEL};display:flex;align-items:center;gap:10px;margin:0 0 16px;color:var(--color-text-muted)}
${M} .mw-kicker::before{content:"";flex:none;width:18px;height:12px;background:var(--color-primary);clip-path:${chev(12)}}
${M} .mw-kicker-summer::before{background:var(--mw-summer)}
${M} .mw-kicker-season::before{background:var(--mw-s,var(--mw-accent))}
${M} .mw-lead{margin:20px 0 0;max-width:58ch;font-size:1.125rem;line-height:1.55;color:var(--color-text-muted)}
${M} .mw-body{margin:12px 0 0;font-size:1rem;line-height:1.55;color:var(--color-text-muted)}
${M} .mw-small{margin:0;font-size:.9rem;line-height:1.5;color:var(--color-text-muted)}
${M} .mw-label{${LABEL};color:var(--color-text-subtle)}
${M} .mw-label-strong{color:var(--color-text)}
${M} .mw-actions{display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin-top:28px}
${M} .mw-actions:empty{display:none}
${M} .mw-textlink{${LABEL};font-size:13px;color:var(--color-primary-strong);text-decoration:none;white-space:nowrap}
${M} .mw-textlink:hover{color:var(--color-text)}
${M} .mw-freqtag{${LABEL};display:inline-flex;align-items:center;gap:8px;color:var(--color-primary-strong)}
${M} .mw-freqtag::before{content:"";width:8px;height:8px;background:var(--color-primary);transform:rotate(45deg)}
${M} .mw-icon{color:var(--color-primary-strong);flex:none}
${M} .mw-photo{position:relative;margin:0;overflow:hidden;background:var(--mw-raised)}
${M} .mw-photo img{display:block;width:100%;height:100%;object-fit:cover;filter:none}
${M} .mw-chamfer{clip-path:${CLIP.lg}}
${M} .mw-frame{position:relative;clip-path:${CLIP.md};background:var(--mw-surface);border:1px solid var(--mw-edge)}
${M} .mw-frame::after{${diag(12)}}
${M} .mw-grid{list-style:none;margin:0;padding:0;display:grid;gap:1px;background:var(--mw-hairline);border:1px solid var(--mw-hairline)}
${M} .mw-grid>*{background:var(--mw-surface);padding:24px;display:flex;flex-direction:column;gap:12px;min-width:0}
${M} .mw-cols-1{grid-template-columns:minmax(0,1fr)}${M} .mw-cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}${M} .mw-cols-3{grid-template-columns:repeat(3,minmax(0,1fr))}${M} .mw-cols-4{grid-template-columns:repeat(4,minmax(0,1fr))}@media (max-width:900px){${M} .mw-cols-3,${M} .mw-cols-4{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (max-width:560px){${M} .mw-cols-2,${M} .mw-cols-3,${M} .mw-cols-4{grid-template-columns:minmax(0,1fr)}}
${M} .mw-grid-3{grid-template-columns:repeat(3,minmax(0,1fr))}@media (max-width:900px){${M} .mw-grid-3{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (max-width:560px){${M} .mw-grid-3{grid-template-columns:minmax(0,1fr)}}
${M} .mw-band{height:14px;margin-top:clamp(48px,6vw,80px);background:${HATCH}}
${M} .mw-sec-head{margin-bottom:28px}
${M} .mw-sec-head .mw-kicker{margin-bottom:10px}
${M} .mw-sec-head-row{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:16px 24px}

${M} .mw-hero{padding-top:clamp(48px,7vw,88px)}
${M} .mw-hero-inner{display:grid;gap:clamp(32px,5vw,48px);align-items:end}
${M} .mw-hero-split .mw-hero-inner{grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr))}
${M} .mw-hero-split .mw-photo{height:clamp(280px,32vw,380px)}
${M} .mw-hero-copy{max-width:900px}
${M} .mw-hero-stack .mw-hero-copy .mw-display{font-size:clamp(3.75rem,8.5vw,7.5rem)}
${M} .mw-hero-photo{width:100%;max-width:1248px;margin:clamp(40px,5vw,48px) auto 0;height:clamp(280px,38vw,480px)}
${M} .mw-hero-photo+*{margin-top:0}

${M} .mw-head{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,380px),1fr));gap:clamp(24px,5vw,48px);align-items:start}
${M} .mw-head-card{padding:clamp(24px,4vw,40px)}
${M} .mw-head-text .mw-lead:first-child{margin-top:0}
${M} .mw-head-aside{margin:12px 0 0}

${M} .mw-facts{grid-template-columns:repeat(auto-fit,minmax(min(100%,160px),1fr));margin:0}
${M} .mw-facts>div{gap:10px;padding:18px 20px}
${M} .mw-facts dd{margin:0}
${M} .mw-fact-v{${DISPLAY};font-size:clamp(1.5rem,2.6vw,2.5rem);line-height:.95;color:var(--color-text)}
${M} .mw-faqs{display:flex;flex-direction:column;gap:8px;max-width:880px}

${M} .mw-beats{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,140px),1fr));gap:4px}
${M} .mw-beat{all:unset;box-sizing:border-box;cursor:pointer;height:88px;display:flex;flex-direction:column;justify-content:center;gap:6px;padding:0 24px 0 30px;margin-right:-12px;background:var(--mw-raised);color:var(--color-text);clip-path:${chev(88)};transition:background 150ms linear}
${M} .mw-beat:first-child{padding-left:18px;clip-path:${chev(88, true)}}
${M} .mw-beat:hover{background:var(--mw-hairline)}
${M} .mw-beat:focus-visible{outline:2px solid var(--color-focus-ring);outline-offset:-4px}
${M} .mw-beat[aria-pressed="true"]{background:var(--color-primary);color:var(--color-text-on-primary)}
${M} .mw-beat-l{font-family:var(--mw-display);font-weight:800;font-size:40px;line-height:.9;color:var(--color-primary-strong)}
${M} .mw-beat[aria-pressed="true"] .mw-beat-l{color:var(--color-text-on-primary)}
${M} .mw-beat-w{${LABEL};font-size:11px;color:inherit}
${M} .mw-beat-panel{margin-top:24px;padding:24px 28px;display:grid;grid-template-columns:auto minmax(0,1fr);gap:12px 24px;align-items:baseline}
${M} .mw-beat-name{${DISPLAY};font-weight:700;font-size:2.4rem;line-height:.95;color:var(--color-primary-strong)}
${M} .mw-beat-body{font-size:1.125rem;line-height:1.5;color:var(--color-text-muted)}

${M} .mw-path{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr));gap:24px 4px}
${M} .mw-path li{position:relative;padding-top:56px;display:flex;flex-direction:column;gap:12px;min-width:0}
${M} .mw-path li::before{content:"";position:absolute;top:0;left:0;right:-10px;height:40px;background:var(--mw-raised);clip-path:${chev(40)}}
${M} .mw-path li:first-child::before{background:var(--color-primary);clip-path:${chev(40, true)}}
${M} .mw-path-n{position:absolute;top:0;left:22px;height:40px;display:flex;align-items:center;${LABEL};color:var(--color-text-muted)}
${M} .mw-path li:first-child .mw-path-n{left:14px;color:var(--color-text-on-primary)}
${M} .mw-path .mw-small{padding-right:12px}
${M} .mw-tag-chev{align-self:flex-start;${LABEL};padding:6px 18px 6px 10px;background:var(--mw-raised);color:var(--color-text-muted);clip-path:${chev(24, true)}}
${M} .mw-path-grid>li:nth-child(3) .mw-tag-chev{background:var(--mw-summer);color:var(--mw-charcoal)}

${M} .mw-parts-top{display:flex;align-items:center;justify-content:space-between}
${M} .mw-hero-stack+.mw-parts-sec{position:relative;z-index:1;margin-top:-104px;padding-top:0}
${M} .mw-hero-stack:has(+.mw-parts-sec) .mw-hero-photo{margin-bottom:0}

${M} .mw-lists{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:32px clamp(32px,5vw,48px)}
${M} .mw-label-strong.mw-label{margin:0 0 14px}
${M} .mw-chevlist{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:12px}
${M} .mw-chevlist li{position:relative;padding-left:28px;font-size:.95rem;line-height:1.5;color:var(--color-text-muted)}
${M} .mw-chevlist li::before{content:"";position:absolute;left:0;top:7px;width:14px;height:9px;background:var(--color-primary);clip-path:${chev(9, true)}}
${M} .mw-chevlist-quiet li::before{background:var(--color-border-strong)}
${M} .mw-checklist .mw-chevlist{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:14px 40px}

${M} .mw-photos{display:grid;gap:8px}
${M} .mw-photos-item{display:flex;flex-direction:column;gap:10px}
${M} .mw-photos .mw-photo{height:clamp(200px,22vw,260px)}
${M} .mw-quote{margin:0;padding-left:16px;border-left:2px solid var(--color-primary)}
${M} .mw-quote blockquote{margin:0 0 10px;font-size:1.2rem;line-height:1.45;font-weight:500;color:var(--color-text)}
${M} .mw-grid>.mw-quote{border-left:0;padding:24px}

${M} .mw-story{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,7fr);gap:clamp(32px,5vw,48px);align-items:center}
${M} .mw-story-right{grid-template-columns:minmax(0,7fr) minmax(0,5fr)}
${M} .mw-story-right .mw-story-photo{order:2}
${M} .mw-story-solo{grid-template-columns:minmax(0,1fr);max-width:1248px}
${M} .mw-story-photo{height:clamp(300px,40vw,520px)}
${M} .mw-story-copy{display:flex;flex-direction:column;gap:0;min-width:0}
${M} .mw-story-copy .mw-chevlist{margin-top:24px}
${M} .mw-story-copy .mw-textlink{display:inline-block;margin-top:24px}
${M} .mw-story-copy .mw-quote{margin-top:20px}
@media (max-width:760px){${M} .mw-story,${M} .mw-story-right{grid-template-columns:minmax(0,1fr)}${M} .mw-story-right .mw-story-photo{order:0}}

${M} .mw-closing{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:24px;align-items:end}
${M} .mw-closing .mw-actions{margin-top:0}
@media (max-width:760px){${M} .mw-closing{grid-template-columns:minmax(0,1fr)}}
${M} .mw-strip{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:20px;align-items:center;padding:16px 20px;border:1px solid var(--mw-hairline);color:var(--color-text);text-decoration:none;transition:background 150ms linear}
${M} a.mw-strip:hover{background:var(--mw-surface)}
${M} .mw-strip-chev{width:22px;height:14px;background:var(--mw-fall);clip-path:${chev(14)}}
${M} .mw-strip-text{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 16px}
${M} .mw-strip-end{color:var(--color-text-muted)}
${M} .mw-note{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:16px 24px;align-items:center;padding:20px 24px;background:var(--mw-surface);border:1px solid var(--mw-hairline)}
${M} .mw-note strong{display:block;margin-bottom:6px;font-weight:600;color:var(--color-text)}
${M} .mw-badge{${LABEL};font-size:11px;display:inline-block;padding:4px 8px;white-space:nowrap;color:var(--color-primary-strong);background:var(--color-primary-bg)}
${M} .mw-badge-full{background:transparent;color:var(--color-text);border:1px solid var(--color-border-strong)}
${M} .mw-badge-forming{background:var(--mw-fall);color:var(--mw-charcoal)}
${M} .mw-text-head .mw-display{max-width:16ch}
${M} .mw-text .mw-lead{max-width:68ch}
${M} .mw-other{padding-top:clamp(40px,6vw,72px)}

${M} .mw-dates{list-style:none;margin:0;padding:0;border-top:1px solid var(--mw-hairline)}
${M} .mw-date-row{display:grid;grid-template-columns:14px minmax(150px,210px) minmax(0,1fr) auto;gap:8px 16px;align-items:baseline;padding:14px 0;border-bottom:1px solid var(--mw-hairline)}
${M} .mw-date-mark{align-self:center;width:10px;height:10px;transform:rotate(45deg);background:var(--mw-accent)}
${M} .mw-date-mark[data-kind="circle"]{background:var(--color-primary)}
${M} .mw-date-mark[data-kind="retreat"]{background:var(--mw-fall)}
${M} .mw-date-text{display:flex;flex-direction:column;gap:4px;min-width:0}
${M} .mw-date-text strong{font-weight:600;color:var(--color-text)}
@media (max-width:640px){${M} .mw-date-row{grid-template-columns:14px minmax(0,1fr)}${M} .mw-date-row>:nth-child(n+3){grid-column:2}}

${M} .mw-finder{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,6fr);gap:32px;align-items:start}
@media (max-width:860px){${M} .mw-finder{grid-template-columns:minmax(0,1fr)}}
${M} .mw-tags{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}
${M} .mw-tag{all:unset;box-sizing:border-box;cursor:pointer;position:relative;${LABEL};padding:9px 16px 9px 12px;border:1px solid var(--mw-edge);--mw-edge:var(--color-border-strong);clip-path:${CLIP.sm};color:var(--color-text)}
${M} .mw-tag::after{${diag(8)}}
${M} .mw-tag[aria-pressed="true"]{--mw-edge:var(--color-primary-strong);color:var(--color-primary-strong);background:var(--color-primary-bg)}
${M} .mw-rows{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:1px;background:var(--mw-hairline);border:1px solid var(--mw-hairline)}
${M} .mw-circle-row{all:unset;box-sizing:border-box;cursor:pointer;width:100%;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 14px;align-items:center;padding:18px 20px 18px 40px;position:relative;background:var(--mw-surface)}
${M} .mw-circle-row[aria-pressed="true"]{background:var(--mw-raised)}
${M} .mw-circle-row[aria-pressed="true"]::before{content:"";position:absolute;left:18px;top:50%;margin-top:-4px;width:12px;height:8px;background:var(--color-primary);clip-path:${chev(8)}}
${M} .mw-circle-row:focus-visible{outline:2px solid var(--color-focus-ring);outline-offset:-2px}
${M} .mw-circle-row-name{${DISPLAY};font-weight:700;font-size:1.6rem;line-height:1}
${M} .mw-circle-row .mw-label{grid-column:1}
${M} .mw-circle-row .mw-badge{grid-column:2;grid-row:1/span 2}
${M} .mw-circle-card{display:flex;flex-direction:column;overflow:hidden}
${M} .mw-circle-photo{display:block;width:100%;height:240px;object-fit:cover}
${M} .mw-circle-body{padding:28px;display:flex;flex-direction:column;gap:18px}
${M} .mw-circle-body .mw-body{margin:0}
${M} .mw-circle-body .mw-actions{margin-top:0}
${M} .mw-circle-head{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:8px 16px}
${M} .mw-circle-meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;padding-top:16px;border-top:1px solid var(--mw-hairline)}
${M} .mw-circle-meta>span>span,${M} .mw-person>span{display:flex;flex-direction:column;gap:6px}
${M} .mw-circle-meta strong{font-weight:600;color:var(--color-text)}
${M} .mw-person{display:flex!important;flex-direction:row!important;align-items:center;gap:12px!important}
${M} .mw-avatar{width:40px;height:40px;border-radius:50%;object-fit:cover}
${M} .mw-progress{display:flex;flex-direction:column;gap:8px}
${M} .mw-progress-head{display:flex;justify-content:space-between;align-items:baseline;gap:12px}
${M} .mw-progress-count{${LABEL};color:var(--color-text)}
${M} .mw-progress-count span{color:var(--color-text-subtle)}
${M} .mw-progress-bar{display:grid;gap:2px}
${M} .mw-progress-bar span{height:10px;clip-path:${chev(10)};background:var(--mw-raised)}
${M} .mw-progress-bar span[data-state="done"]{background:var(--color-primary)}
${M} .mw-progress-bar span[data-state="next"]{background:repeating-linear-gradient(-60deg,var(--color-primary) 0 2px,transparent 2px 6px)}

${M} .mw-journeys{display:flex;flex-direction:column;gap:32px}
${M} .mw-journey{display:grid;grid-template-columns:minmax(0,4fr) minmax(0,7fr);gap:clamp(24px,5vw,48px);align-items:start}
@media (max-width:860px){${M} .mw-journey{grid-template-columns:minmax(0,1fr)}}
${M} .mw-journey-head{display:flex;flex-direction:column;align-items:flex-start;gap:4px}
${M} .mw-journey-head .mw-textlink{margin-top:20px}
${M} .mw-weeks{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:1px;background:var(--mw-hairline);border:1px solid var(--mw-hairline)}
${M} .mw-weeks li{display:grid;grid-template-columns:auto 72px minmax(0,1fr);gap:20px;align-items:center;padding:14px 20px;background:var(--mw-surface)}
${M} .mw-weeks strong{font-weight:600;color:var(--color-text)}
${M} .mw-week-tag{${LABEL};padding:6px 16px 6px 10px;background:var(--mw-summer);color:var(--mw-charcoal);clip-path:${chev(24, true)}}
${M} .mw-weeks .mw-weeks-more{display:block;background:var(--mw-charcoal);padding:10px 20px}

${M} .mw-year{display:grid;grid-template-columns:280px minmax(0,1fr);gap:56px;align-items:start}
@media (max-width:960px){${M} .mw-year{grid-template-columns:minmax(0,1fr)}${M} .mw-wheel-aside{position:static!important}${M} .mw-wheel{display:none}}
${M} .mw-wheel-aside{position:sticky;top:96px;display:flex;flex-direction:column;gap:20px}
${M} .mw-wheel{position:relative;width:280px;height:280px}
${M} .mw-wheel-turn{position:absolute;inset:0;transition:transform 700ms cubic-bezier(.2,.7,.2,1)}
${M} .mw-wheel-svg polygon{fill:var(--mw-raised);stroke:var(--mw-charcoal);cursor:pointer;transition:fill 250ms linear}
${M} .mw-wheel-svg polygon[data-on]{fill:var(--mw-s)}
${M} .mw-wheel-pointer{position:absolute;left:50%;top:-14px;width:16px;height:10px;margin-left:-8px;background:var(--mw-accent);clip-path:polygon(0 0,100% 0,50% 100%)}
${M} .mw-wheel-center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;pointer-events:none}
${M} .mw-wheel-name{${DISPLAY};font-size:46px;line-height:.88;color:var(--mw-accent)}
${M} .mw-wheel-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px}
${M} .mw-wheel-list button{all:unset;box-sizing:border-box;cursor:pointer;width:100%;display:grid;grid-template-columns:14px minmax(0,1fr) auto;gap:10px;align-items:center;padding:9px 10px;transition:background 240ms linear}
${M} .mw-wheel-list button[aria-current]{background:var(--mw-surface)}
${M} .mw-wheel-list button:focus-visible{outline:2px solid var(--color-focus-ring)}
${M} .mw-wheel-chev{width:12px;height:8px;background:var(--mw-s);clip-path:${chev(8)};opacity:.4}
${M} .mw-wheel-list button[aria-current] .mw-wheel-chev{opacity:1}
${M} .mw-wheel-item{font-weight:600;font-size:15px;color:var(--color-text-subtle)}
${M} .mw-wheel-list button[aria-current] .mw-wheel-item{color:var(--color-text)}
${M} .mw-year-seasons{display:flex;flex-direction:column;gap:96px;min-width:0}
${M} .mw-season{display:flex;flex-direction:column;gap:14px;scroll-margin-top:110px}
${M} .mw-season .mw-kicker{margin:0}
${M} .mw-season-name{color:var(--mw-s)}
${M} .mw-season .mw-lead{margin-top:0}
${M} .mw-season-photo{height:300px;margin-top:14px}
${M} .mw-modules{list-style:none;margin:14px 0 0;padding:0;display:flex;flex-direction:column;gap:1px;background:var(--mw-hairline);border:1px solid var(--mw-hairline);border-top:3px solid var(--mw-s)}
${M} .mw-modules li{display:grid;grid-template-columns:40px minmax(0,1fr) minmax(0,1.1fr);gap:20px;align-items:start;padding:20px;background:var(--mw-surface)}
@media (max-width:640px){${M} .mw-modules li{grid-template-columns:32px minmax(0,1fr)}${M} .mw-module-dates{grid-column:2}}
${M} .mw-glyph{font-family:'Segoe UI Symbol','Noto Sans Symbols 2','Apple Symbols',sans-serif;font-size:26px;line-height:1;color:var(--mw-s)}
${M} .mw-module-text,${M} .mw-module-dates{display:flex;flex-direction:column;gap:6px;min-width:0}
${M} .mw-module-dates>span{display:grid;grid-template-columns:64px minmax(0,1fr);gap:10px;align-items:baseline}
${M} .mw-keydates{display:flex;flex-direction:column;gap:10px;margin-top:10px}

${M} .hs-season-next{margin:0;${LABEL};font-size:11px;color:var(--color-text-muted);text-align:right}
${M} .hs-season-next span{display:block;color:var(--color-text)}
`
