// THE FREE HUMAN CALENDAR SKIN (design: templates/website/Calendar.dc.html). Scoped under [data-house-theme="free-human"], so it can
// only dress the stand-alone site render (guarded by app/(main)/no-site-theme-in-member-area.test.ts). The hero's status trio, the
// three nearest dates, the paper card with its month strip, filters, month grid, agenda and panels, and the closing band. Every
// colour, wash and shadow reads the token block (lib/theme/free-human.ts); the sizes are the design's own. It layers after the
// blocks skin (free-human-blocks-css.ts), whose grounds, rows, eyebrows and titles it reuses.

const N = '[data-house-theme="free-human"]'
const DISPLAY = 'font-family:var(--font-display);font-weight:var(--weight-medium)'
const INSCRIPTION = 'font-family:var(--font-inscription);text-transform:uppercase'
const LYRIC = 'font-family:var(--font-lyric);font-style:italic'
const RULE = (a: number) => `linear-gradient(90deg,transparent,color-mix(in srgb,var(--fh-clay-500) ${a}%,transparent),transparent)`

export const FREE_HUMAN_CALENDAR_CSS = `
/* HERO: the copy on the left, the next gathering, the season and the moon as three columns with a hairline between. */
${N} .fh-cal-hero .fh-row{--fh-pad-top:clamp(40px,5vw,64px);--fh-pad-bottom:clamp(90px,10.3vw,132px);max-width:calc(1280px + 2 * clamp(16px,3vw,32px));display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:56px;align-items:end}
${N} .fhc-hero-copy{display:flex;flex-direction:column;align-items:flex-start;gap:18px}
${N} .fhc-hero-copy .fh-hero-title{font-size:clamp(52px,6.2vw,92px)}
${N} .fhc-hero-copy .fh-hero-lead{max-width:520px;font-size:18px}
${N} .fhc-hero-copy .fh-actions{gap:6px;margin-top:4px}
${N} .fhc-live{display:flex;align-items:center;gap:10px;${INSCRIPTION};font-size:12px;letter-spacing:.2em;color:var(--text-accent)}
${N} .fhc-pulse{position:relative;display:inline-flex;width:10px;height:10px}
${N} .fhc-pulse i{position:absolute;border-radius:50%}
${N} .fhc-pulse i:first-child{inset:-4px;background:radial-gradient(closest-side,color-mix(in srgb,var(--fh-jade-500) 35%,transparent),transparent);animation:fh-breathe var(--dur-breath,6s) var(--ease-breath,ease-in-out) infinite}
${N} .fhc-pulse i:last-child{inset:2px;background:var(--fh-jade-500)}
${N} .fhc-status{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));padding-bottom:6px}
${N} .fhc-stat{display:flex;flex-direction:column;gap:8px;padding:4px 18px;min-width:0}
${N} .fhc-stat+.fhc-stat{background:linear-gradient(180deg,transparent,color-mix(in srgb,var(--fh-clay-500) 18%,transparent),transparent) left/1px 100% no-repeat}
${N} .fhc-stat-k{${INSCRIPTION};font-size:11px;letter-spacing:.2em;color:var(--text-muted)}
${N} .fhc-stat-mark{display:inline-flex;color:var(--fh-clay-500)}
${N} .fhc-stat-v{${DISPLAY};font-size:22px;line-height:1.1;color:var(--text-strong)}
${N} .fhc-stat-s{${LYRIC};font-size:16px;color:var(--text-lyric)}

/* THE CALENDAR SECTION: paper-gold ground, the sun, the heading, three nearest dates, then the card. */
${N} .fhc-paper{background:radial-gradient(80% 60% at 50% 0%,color-mix(in srgb,var(--fh-saffron-100) 75%,transparent),transparent 70%),linear-gradient(180deg,var(--fh-peach-100),var(--fh-cream-100) 40%);box-shadow:none}
${N} .fhc-paper .fh-row{--fh-pad-top:clamp(90px,9.4vw,120px);--fh-pad-bottom:clamp(100px,11.7vw,150px);max-width:calc(1280px + 2 * clamp(16px,3vw,32px))}
${N} .fhc-head{display:flex;flex-direction:column;align-items:center;text-align:center;gap:12px;margin-bottom:36px;scroll-margin-top:110px}
${N} .fhc-head .fh-sec-title{font-size:clamp(38px,4.4vw,58px);line-height:1.05}
${N} .fhc-sun{position:relative;width:64px;height:64px}
${N} .fhc-sun .fh-rays{position:absolute;inset:0;opacity:.7}
${N} .fhc-sun .fh-halo{position:absolute;inset:16px}
${N} .fhc-featured{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:clamp(20px,3vw,48px);margin:0 0 56px}
${N} .fhc-feat{display:flex;flex-direction:column;align-items:center;text-align:center;gap:10px;padding:8px 6px 14px;color:inherit;text-decoration:none;transition:transform var(--dur-base) var(--ease-soft)}
${N} .fhc-feat:hover{transform:translateY(-2px)}
${N} .fhc-feat-seal{position:relative;width:78px;height:78px;display:flex;align-items:center;justify-content:center}
${N} .fhc-feat-seal .fh-halo{position:absolute;inset:0;opacity:.55}
${N} .fhc-feat-seal>span{position:relative;width:54px;height:54px;border-radius:50%;background:radial-gradient(circle at 40% 35%,var(--fh-cream-50),var(--fh-rose-100));box-shadow:var(--shadow-card);display:flex;align-items:center;justify-content:center;color:var(--fh-clay-500)}
${N} .fhc-feat-when{${INSCRIPTION};font-size:11px;letter-spacing:.2em;color:var(--text-accent)}
${N} .fhc-feat-title{${DISPLAY};font-size:26px;line-height:1.1;color:var(--text-strong);text-wrap:balance}
${N} .fhc-feat-meta{font-size:14px;line-height:1.5;color:var(--text-muted);max-width:30ch}
${N} .fhc-feat em{font-family:var(--font-display);font-size:17px;color:var(--fh-clay-700)}

/* THE CARD */
${N} .fhc-card{position:relative;border-radius:44px;padding:clamp(22px,3vw,40px) clamp(18px,3vw,40px) clamp(18px,2.4vw,30px);background:var(--texture-fiber),radial-gradient(90% 40% at 50% 0%,color-mix(in srgb,var(--fh-saffron-100) 35%,transparent),transparent 70%),linear-gradient(180deg,color-mix(in srgb,var(--fh-cream-50) 94%,transparent),color-mix(in srgb,var(--fh-cream-50) 82%,transparent));background-size:320px 320px,auto,auto;box-shadow:inset 0 2px 0 color-mix(in srgb,var(--fh-cream-50) 70%,transparent),var(--shadow-float),0 0 0 1px color-mix(in srgb,var(--fh-brass-600) 10%,transparent)}
${N} .fhc-bar{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:16px;margin-bottom:10px}
${N} .fhc-bar-left{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
${N} .fhc-count{font-size:13px;color:var(--text-muted)}
${N} .fhc-today{height:38px;padding:0 18px;font-size:15px}
${N} .fhc-nav{display:flex;align-items:center;gap:10px}
${N} .fhc-month{min-width:300px;text-align:center;${DISPLAY};font-size:44px;line-height:1;color:var(--text-strong)}
${N} .fhc-month em{font-weight:var(--weight-regular);color:var(--text-lyric)}
${N} .fhc-icon{display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;border:0;border-radius:50%;background:transparent;color:var(--fh-clay-700);cursor:pointer;transition:background var(--dur-quick) var(--ease-soft)}
${N} .fhc-icon:hover:not(:disabled){background:color-mix(in srgb,var(--fh-clay-500) 10%,transparent)}
${N} .fhc-icon:disabled{opacity:.3;cursor:default}
${N} .fhc-tabs{display:flex;justify-content:flex-end;gap:6px}
${N} .fhc-tab{border:0;background:transparent;cursor:pointer;padding:10px 16px;border-radius:var(--fh-radius-pill);font-family:var(--font-display);font-size:18px;color:var(--text-muted)}
${N} .fhc-tab[aria-selected="true"]{font-style:italic;color:var(--fh-clay-500);background:radial-gradient(60% 70% at 50% 100%,color-mix(in srgb,var(--fh-clay-300) 32%,transparent),transparent 72%)}
${N} .fhc-strip{display:grid;grid-template-columns:repeat(13,minmax(0,1fr));margin:0 0 14px;background:${RULE(14)} bottom/100% 1px no-repeat}
${N} .fhc-strip-m{display:flex;flex-direction:column;align-items:center;gap:4px;width:100%;border:0;cursor:pointer;background:none;padding:10px 2px 12px;transition:all var(--dur-base) var(--ease-soft)}
${N} .fhc-strip-m[data-on]{background:radial-gradient(60% 70% at 50% 100%,color-mix(in srgb,var(--fh-clay-300) 32%,transparent),transparent 72%)}
${N} .fhc-strip-y{${INSCRIPTION};font-size:9.5px;letter-spacing:.2em;color:var(--text-muted)}
${N} .fhc-strip-l{${DISPLAY};font-size:20px;line-height:1;color:var(--text-strong)}
${N} .fhc-strip-m[data-on] .fhc-strip-l{font-style:italic;color:var(--fh-clay-500)}
${N} .fhc-strip-m[data-season="winter"] .fhc-strip-l{color:var(--fh-indigo-500)}
${N} .fhc-strip-m[data-season="spring"] .fhc-strip-l{color:var(--fh-jade-500)}
${N} .fhc-strip-m[data-season="summer"] .fhc-strip-l{color:var(--fh-brass-600)}
${N} .fhc-strip-m[data-season="autumn"] .fhc-strip-l{color:var(--fh-clay-700)}
${N} .fhc-strip-m[data-on] .fhc-strip-l{color:var(--fh-clay-500)}
${N} .fhc-strip-n{display:flex;align-items:center;gap:5px;font-size:11px;color:var(--text-muted);white-space:nowrap}
${N} .fhc-strip-n i{width:5px;height:5px;border-radius:50%;background:var(--fh-clay-500)}
${N} .fhc-filters{display:flex;gap:2px;flex-wrap:wrap;justify-content:center;margin:0 0 26px}
${N} .fhc-tag{border:0;cursor:pointer;background:transparent;padding:8px 16px;border-radius:var(--fh-radius-pill);font-family:var(--font-display);font-size:17px;color:var(--text-body-ink)}
${N} .fhc-tag[aria-pressed="true"]{font-style:italic;color:var(--fh-clay-500);background:color-mix(in srgb,var(--fh-clay-300) 24%,transparent)}
${N} .fhc-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr))}
${N} .fhc-dow>div{padding:8px 10px 14px;${INSCRIPTION};font-size:11px;letter-spacing:.22em;color:var(--text-muted)}
${N} .fhc-cell{position:relative;min-height:128px;box-sizing:border-box;padding:12px 8px 10px;display:flex;flex-direction:column;gap:4px;background:${RULE(9)} top/100% 1px no-repeat}
${N} .fhc-cell[data-out]{opacity:.35}
${N} .fhc-num{align-self:flex-start;border:0;background:none;padding:0;cursor:pointer;border-radius:50%;font-family:var(--font-display);font-size:18px;color:var(--text-strong)}
${N} .fhc-cell[data-out] .fhc-num{font-size:16px;color:var(--fh-sand-300)}
${N} .fhc-cell[data-today] .fhc-num{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;margin:-4px 0 0 -4px;background:var(--fh-clay-500);color:var(--fh-cream-50)}
${N} .fhc-item{display:flex;align-items:center;gap:5px;width:100%;text-align:left;border:0;cursor:pointer;padding:3px 2px;background:none;color:var(--text-body-ink);font-family:var(--font-body);font-size:12.5px;line-height:1.25;white-space:nowrap;overflow:hidden;transition:color var(--dur-quick) var(--ease-soft)}
${N} .fhc-item:hover{color:var(--fh-clay-700)}
${N} .fhc-item span:last-child{overflow:hidden;text-overflow:ellipsis}
${N} .fhc-mark{display:inline-flex;flex:none;color:var(--fhc-kind,var(--fh-clay-500))}
${N} .fhc-more{border:0;background:none;cursor:pointer;text-align:left;padding:2px 7px;${LYRIC};font-size:14px;color:var(--fh-clay-700)}
${N} .fhc-dots{display:none}
${N} .fhc-agenda{display:flex;flex-direction:column;gap:40px;max-width:900px;margin:0 auto}
${N} .fhc-agenda-group{display:flex;flex-direction:column}
${N} .fhc-agenda-head{display:flex;align-items:baseline;gap:12px;padding-bottom:10px}
${N} .fhc-agenda-head span{${DISPLAY};font-size:32px;color:var(--text-strong)}
${N} .fhc-agenda-head em{${LYRIC};font-size:18px;color:var(--text-lyric)}
${N} .fhc-row{display:grid;grid-template-columns:72px minmax(0,1fr) auto;gap:20px;align-items:center;padding:16px 0;cursor:pointer;border:0;text-align:left;background:${RULE(16)} bottom/100% 1px no-repeat;color:inherit;font:inherit}
${N} .fhc-row-day{text-align:center}
${N} .fhc-row-day b{display:block;font-family:var(--font-display);font-style:italic;font-weight:var(--weight-regular);font-size:40px;line-height:.9;color:var(--fh-clay-500)}
${N} .fhc-row-day i{display:block;${INSCRIPTION};font-style:normal;font-size:10px;letter-spacing:.2em;color:var(--text-muted);margin-top:4px}
${N} .fhc-row-body{min-width:0}
${N} .fhc-row-title{display:flex;align-items:center;gap:8px;${DISPLAY};font-size:24px;line-height:1.15;color:var(--text-strong)}
${N} .fhc-row-meta{display:block;font-size:14px;color:var(--text-muted);margin-top:3px}
${N} .fhc-row-side{display:flex;flex-direction:column;align-items:flex-end;gap:6px}
${N} .fhc-row-price{font-family:var(--font-display);font-size:18px;color:var(--text-strong)}
${N} .fhc-row-side em{font-family:var(--font-display);font-size:16px;color:var(--fh-clay-700)}
${N} .fhc-empty{margin:0;${LYRIC};font-size:22px;color:var(--text-lyric);text-align:center}
${N} .fhc-key{margin-top:44px;padding-top:30px;display:flex;flex-direction:column;align-items:center;gap:22px;text-align:center;background:${RULE(16)} top/100% 1px no-repeat}
${N} .fhc-legend{display:flex;flex-wrap:wrap;justify-content:center;gap:10px 26px}
${N} .fhc-legend span{display:flex;align-items:center;gap:8px;${LYRIC};font-size:17px;color:var(--text-body-ink)}
${N} .fhc-legend .fhc-mark{color:var(--fh-clay-500)}
${N} .fhc-note{font-size:13px;color:var(--text-muted)}

/* PANELS: the day and the gathering slide in from the right over a veil. */
${N} .fhc-scrim{position:fixed;inset:0;z-index:58;background:color-mix(in srgb,var(--fh-night-900) 36%,transparent);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px)}
${N} .fhc-scrim--deep{z-index:60;background:color-mix(in srgb,var(--fh-night-900) 42%,transparent)}
${N} .fhc-panel{position:fixed;top:0;right:0;bottom:0;z-index:59;width:min(420px,92vw);box-sizing:border-box;padding:30px;display:flex;flex-direction:column;gap:14px;overflow:auto;border-radius:40px 0 0 40px;background:var(--texture-fiber),var(--wash-lazure),var(--fh-cream-50);background-size:320px 320px,auto,auto;box-shadow:inset 1px 0 0 color-mix(in srgb,var(--fh-brass-600) 22%,transparent),var(--shadow-float)}
${N} .fhc-panel--detail{z-index:61;width:min(440px,92vw);gap:16px}
${N} .fhc-panel-top{display:flex;justify-content:space-between;align-items:center}
${N} .fhc-panel-steps{display:flex;align-items:center;gap:6px}
${N} .fhc-panel-top .fhc-icon{width:40px;height:40px}
${N} .fhc-panel-eyebrow{${INSCRIPTION};font-size:12px;letter-spacing:.2em;color:var(--text-accent)}
${N} .fhc-panel-title{${DISPLAY};font-size:40px;line-height:1;color:var(--text-strong)}
${N} .fhc-detail-title{${DISPLAY};font-size:36px;line-height:1.05;color:var(--text-strong)}
${N} .fhc-seal{width:40px;height:40px;border-radius:50%;background:radial-gradient(circle,var(--fh-cream-50),var(--fh-rose-100));display:flex;align-items:center;justify-content:center;color:var(--fh-clay-500);flex:none}
${N} .fhc-seal--lg{width:52px;height:52px}
${N} .fhc-day-item{display:grid;grid-template-columns:40px 1fr;gap:12px;align-items:center;text-align:left;border:0;cursor:pointer;padding:12px 4px;background:${RULE(12)} bottom/100% 1px no-repeat;color:inherit;font:inherit}
${N} .fhc-day-item b{display:block;${DISPLAY};font-size:21px;line-height:1.1;color:var(--text-strong)}
${N} .fhc-day-item i{display:block;font-style:normal;font-size:13px;color:var(--text-muted);margin-top:3px}
${N} .fhc-empty--panel{text-align:left;font-size:20px}
${N} .fhc-facts{display:flex;flex-direction:column;gap:8px;font-size:15px;color:var(--text-body-ink)}
${N} .fhc-facts span{display:flex;align-items:center;gap:10px}
${N} .fhc-facts svg{color:var(--fh-clay-500);flex:none}
${N} .fhc-summary{margin:4px 0 0;font-size:16px;line-height:1.65}
${N} .fhc-detail-actions{display:flex;flex-direction:column;gap:10px;margin-top:auto;padding-top:12px}
${N} .fhc-wide{width:100%}

/* CLOSING BAND: the moon on the night ground, the letter and the feed. */
${N} .fhc-closing .fh-row{--fh-pad-top:clamp(90px,11.7vw,150px);--fh-pad-bottom:clamp(100px,13.3vw,170px);display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:72px;align-items:center}
${N} .fhc-closing-moon{position:relative;justify-self:center;width:min(320px,100%);aspect-ratio:1;display:flex;align-items:center;justify-content:center;color:var(--fh-saffron-100)}
${N} .fhc-closing-moon .fh-rays{position:absolute;inset:0;opacity:.55}
${N} .fhc-closing-moon .fh-halo{position:absolute;inset:18%;opacity:.5}
${N} .fhc-closing-moon .fh-moon{position:relative}
${N} .fhc-closing-copy{display:flex;flex-direction:column;gap:18px}
${N} .fhc-closing .fh-eyebrow{color:var(--text-gilt)}
${N} .fhc-closing .fh-sec-title{color:var(--fh-cream-50)}
${N} .fhc-closing .fh-sec-title em{color:var(--text-gilt)}
${N} .fhc-closing-copy p{margin:0;max-width:480px;font-size:17px;line-height:1.65;color:var(--fh-cream-100)}
${N} .fhc-feed{align-self:flex-start;margin-left:-14px;color:var(--fh-saffron-300)}

/* THE MOON: the disc and its lit part. */
${N} .fh-moon{display:block}
${N} .fh-moon-disc{fill:color-mix(in srgb,currentColor 14%,transparent);stroke:color-mix(in srgb,currentColor 55%,transparent);stroke-width:.8}
${N} .fh-moon-lit{fill:currentColor}
${N} .fhc-stat-mark .fh-moon{color:var(--fh-clay-500)}

@media (max-width:939px){
${N} .fh-cal-hero .fh-row{grid-template-columns:1fr;gap:36px}
${N} .fhc-featured{grid-template-columns:1fr}
${N} .fhc-bar{grid-template-columns:1fr;justify-items:center}
${N} .fhc-bar-left{justify-content:center}
${N} .fhc-tabs{justify-content:center}
${N} .fhc-month{min-width:0;font-size:36px}
${N} .fhc-strip{display:flex;overflow-x:auto;scrollbar-width:none}
${N} .fhc-strip-m{flex:none;width:76px}
${N} .fhc-closing .fh-row{grid-template-columns:1fr;gap:40px}
}
@media (max-width:599px){
${N} .fhc-status{grid-template-columns:1fr;gap:18px}
${N} .fhc-stat{padding:4px 0}
${N} .fhc-stat+.fhc-stat{background:none}
${N} .fhc-card{border-radius:28px}
${N} .fhc-cell{min-height:64px;padding:8px 4px 6px;align-items:center}
${N} .fhc-item,${N} .fhc-more{display:none}
${N} .fhc-dots{display:flex;gap:3px;margin-top:2px}
${N} .fhc-dots i{width:6px;height:6px;border-radius:50%}
${N} .fhc-dow>div{padding:6px 0 10px;text-align:center;letter-spacing:.1em;font-size:10px}
${N} .fhc-row{grid-template-columns:56px minmax(0,1fr);gap:14px}
${N} .fhc-row-side{display:none}
${N} .fhc-row-title{font-size:21px}
${N} .fhc-panel{border-radius:28px 0 0 28px;padding:22px}
}
`
