import { MENSWORK_PALETTE as P, MENSWORK_SEASONS as S } from '@/lib/theme/menswork'

// THE WEBSITE ADMIN PAGES' LOOK (LIVE-864): the Hearts on Fire design system's Executive Overview and
// Yearly Calendar templates, value for value (tokens/*.css, templates/executive-overview, website/calendar).
// Scoped under `.hfa`, the root both pages render, so nothing leaks into the website around them. The hex
// lives in the theme's token data (lib/theme/menswork.ts); this sheet only names it.

const chev = (h: number, notch = true) => {
  const n = +(h * 0.289).toFixed(2)
  return `polygon(0 0,calc(100% - ${n}px) 0,100% 50%,calc(100% - ${n}px) 100%,0 100%${notch ? `,${n}px 50%` : ''})`
}

const R = '.hfa'

export const SITE_ADMIN_CSS = `
${R}{--hof-charcoal:${P.charcoal};--hof-surface:${P.surface};--hof-raised:${P.raised};--hof-hairline:${P.hairline};--hof-muted:${P.muted};--hof-secondary:${P.secondary};--hof-primary:${P.primary};--hof-teal:${P.teal};--hof-teal-pressed:${P.tealPressed};--hof-teal-text:${P.tealText};--hof-winter:${S.winter};--hof-spring:${S.spring};--hof-summer:${S.summer};--hof-fall:${S.fall};
--bg-page:var(--hof-charcoal);--surface-card:var(--hof-surface);--surface-raised:var(--hof-raised);--border-hairline:var(--hof-hairline);--border-strong:var(--hof-muted);--text-primary:var(--hof-primary);--text-secondary:var(--hof-secondary);--text-muted:var(--hof-muted);--text-on-fill:var(--hof-charcoal);--text-link:var(--hof-teal-text);
--font-display:var(--font-sofia-xc),'Sofia Sans Extra Condensed','Arial Narrow',sans-serif;--font-body:var(--font-barlow),'Barlow',system-ui,sans-serif;--font-mono:var(--font-plex-mono),'IBM Plex Mono',ui-monospace,monospace;
--type-display-xl:800 120px/0.88 var(--font-display);--type-display-l:800 88px/0.9 var(--font-display);--type-display-m:800 60px/0.92 var(--font-display);--type-display-s:700 38px/0.95 var(--font-display);--type-display-xs:700 26px/1 var(--font-display);--tracking-display:0.005em;
--type-body-l:400 18px/1.5 var(--font-body);--type-body:400 16px/1.5 var(--font-body);--type-body-s:400 14px/1.5 var(--font-body);--type-body-strong:600 16px/1.5 var(--font-body);
--type-label-l:500 13px/1.2 var(--font-mono);--type-label:500 12px/1.2 var(--font-mono);--type-label-s:500 11px/1.2 var(--font-mono);--tracking-label:0.12em;
--clip-chamfer-sm:polygon(0 0,calc(100% - 8px) 0,100% 13.86px,100% 100%,0 100%);--clip-chamfer-md:polygon(0 0,calc(100% - 12px) 0,100% 20.78px,100% 100%,0 100%);--clip-chamfer-lg:polygon(0 0,calc(100% - 20px) 0,100% 34.64px,100% 100%,0 100%);
--pattern-chevron:repeating-linear-gradient(-60deg,var(--hof-hairline) 0 2px,transparent 2px 12px);
min-height:100vh;background:var(--bg-page);color:var(--text-primary);font:var(--type-body);color-scheme:dark}
${R} *{box-sizing:border-box}
/* The website's sticky header sits above these pages (64px menu, 1px rule), so every
   pinned rail and month heading pins just under it. */
${R}{--hfa-top:65px}
${R} a{color:var(--text-link)}
${R} a:focus-visible,${R} button:focus-visible{outline:2px solid var(--hof-teal-text);outline-offset:2px}
html:has(${R}){scroll-behavior:smooth;background:${P.charcoal}}
@media (prefers-reduced-motion:reduce){html:has(${R}){scroll-behavior:auto}${R} *{transition:none!important;animation:none!important}}
${R} .lbl{font:var(--type-label-s);letter-spacing:var(--tracking-label);text-transform:uppercase;color:var(--text-muted)}
${R} .mono-link{font:var(--type-label);letter-spacing:var(--tracking-label);text-transform:uppercase;text-decoration:none}

/* ── executive overview ── */
${R} .eo-body{max-width:1320px;margin:0 auto;padding:0 40px 120px;display:flex;flex-wrap:wrap;gap:32px 56px;align-items:flex-start}
${R} .eo-rail{flex:0 0 220px;position:sticky;top:var(--hfa-top);padding:48px 0 24px;display:flex;flex-direction:column;gap:20px;max-height:calc(100vh - var(--hfa-top));overflow-y:auto;scrollbar-width:none}
${R} .eo-rail .lbl{padding-left:8px}
${R} .eo-toc{display:flex;flex-direction:column;gap:2px}
${R} .eo-toc a{display:grid;grid-template-columns:14px 22px minmax(0,1fr);gap:8px;align-items:baseline;padding:9px 8px;text-decoration:none;color:color-mix(in oklab,var(--text-primary) calc(var(--w,0)*100%),var(--text-muted));background:color-mix(in oklab,var(--surface-card) calc(var(--w,0)*100%),transparent);font:600 15px/1.25 var(--font-body);transition:color 240ms linear,background-color 240ms linear}
${R} .eo-toc a:hover{color:var(--text-primary)}
${R} .eo-toc .chev{align-self:center;width:12px;height:8px;background:var(--hof-teal);clip-path:${chev(8)};opacity:calc(var(--w,0)*var(--w,0));transform:translateX(calc((1 - var(--w,0))*-8px));transition:opacity 240ms linear,transform 240ms linear}
${R} .eo-toc .num{font:var(--type-label-s);color:color-mix(in oklab,var(--text-link) calc(var(--a,0)*100%),var(--text-muted));transition:color 240ms linear}
${R} .retreat-card{display:flex;flex-direction:column;gap:6px;padding:14px 14px 12px;background:var(--hof-fall);color:var(--hof-charcoal);clip-path:var(--clip-chamfer-sm);text-decoration:none;margin-top:12px;overflow:hidden}
${R} .retreat-card:hover{background:color-mix(in oklab,var(--hof-fall) 88%,white)}
${R} .retreat-card img{display:block;width:calc(100% + 28px);margin:-14px -14px 8px;height:96px;object-fit:cover;object-position:50% 70%}
${R} .retreat-card .t{font:800 26px/0.95 var(--font-display);text-transform:uppercase}
${R} .retreat-card .d{font:500 11px/1.2 var(--font-mono);letter-spacing:0.1em;text-transform:uppercase}
${R} .eo-main{flex:1 1 440px;min-width:0;max-width:880px;display:flex;flex-direction:column}
${R} .eo-hero{padding:72px 0 48px;display:flex;flex-direction:column;gap:28px;border-bottom:1px solid var(--border-hairline)}
${R} .eo-hero h1{margin:0;display:flex;flex-direction:column;gap:10px}
${R} .eo-hero .h1a{font:var(--type-display-xl);font-size:clamp(56px,8.4vw,120px);text-transform:uppercase;letter-spacing:var(--tracking-display);text-wrap:balance}
${R} .eo-hero .h1b{font:var(--type-display-l);font-size:clamp(40px,5.6vw,80px);text-transform:uppercase;letter-spacing:var(--tracking-display);color:var(--text-link)}
${R} .eo-meta{display:flex;align-items:center;gap:20px;flex-wrap:wrap}
${R} .eo-meta .k{font:var(--type-label);letter-spacing:var(--tracking-label);text-transform:uppercase;color:var(--text-secondary)}
${R} .eo-meta .dia{width:6px;height:6px;background:var(--border-strong);transform:rotate(45deg)}
${R} .eo-meta .who{display:flex;align-items:center;gap:10px}
${R} .eo-meta .who img{width:32px;height:32px;border-radius:50%;object-fit:cover;object-position:50% 30%}
${R} .eo-meta .who span{font:var(--type-label);letter-spacing:0.06em;color:var(--text-secondary)}
${R} .eo-photo{position:relative;height:360px;overflow:hidden;clip-path:var(--clip-chamfer-lg);background:var(--surface-raised)}
${R} .eo-photo img{display:block;width:100%;height:100%;object-fit:cover}
${R} .band{height:18px;background:repeating-linear-gradient(120deg,var(--hof-teal) 0 3px,transparent 3px 13px);background-size:15.01px 100%;animation:hfa-band 10s linear infinite}
@keyframes hfa-band{from{background-position:0 0}to{background-position:15.01px 0}}
${R} .eo-sec{padding:56px 0 64px;border-bottom:1px solid var(--border-hairline);display:flex;flex-direction:column;gap:20px;scroll-margin-top:calc(var(--hfa-top) + 24px)}
${R} .eo-sec:last-child{padding-bottom:0;border-bottom:0}
${R} .eo-sec .kicker{display:flex;align-items:center;gap:10px}
${R} .eo-sec .kicker i{width:18px;height:12px;background:var(--hof-teal);clip-path:${chev(12)}}
${R} .eo-sec h2{margin:0;font:var(--type-display-m);text-transform:uppercase;letter-spacing:var(--tracking-display)}
${R} .eo-sec.small h2{font:var(--type-display-s)}
${R} .lede{margin:0;font:var(--type-body-l);color:var(--text-secondary);max-width:68ch;text-wrap:pretty}
${R} .para{margin:0;font:var(--type-body);color:var(--text-secondary);max-width:68ch;text-wrap:pretty}
${R} .note{margin:0;font:var(--type-label);letter-spacing:0.06em;color:var(--text-muted)}
${R} .pull{margin:0;padding-left:16px;border-left:2px solid var(--hof-teal);font:600 18px/1.45 var(--font-body);color:var(--text-primary)}
${R} .callout{margin-top:8px;padding:18px 20px;background:var(--surface-raised);clip-path:var(--clip-chamfer-md);display:flex;flex-wrap:wrap;gap:8px 16px;align-items:baseline}
${R} .callout .k{font:var(--type-label);letter-spacing:var(--tracking-label);text-transform:uppercase;color:var(--text-link)}
${R} .callout .v{font:var(--type-body-strong)}
${R} .photos{margin-top:8px;display:grid;gap:8px}
${R} .photos div{height:240px;overflow:hidden}
${R} .photos div:last-child{clip-path:var(--clip-chamfer-lg)}
${R} .photos img{display:block;width:100%;height:100%;object-fit:cover}
${R} .grid1{display:flex;flex-direction:column;gap:1px;background:var(--border-hairline);border:1px solid var(--border-hairline)}
${R} .cards{display:grid;gap:1px;background:var(--border-hairline);border:1px solid var(--border-hairline)}
${R} .cards.parts{grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}
${R} .cards.rows{margin-top:8px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
${R} .card{background:var(--surface-card);padding:20px;display:flex;flex-direction:column;gap:10px}
${R} .card .t{font:var(--type-display-xs);text-transform:uppercase}
${R} .card .b{font:var(--type-body-s);color:var(--text-secondary)}
${R} .rows .card{gap:12px}
${R} .rows .card .t{font:var(--type-display-s)}
${R} .rows .card .v{font:var(--type-body-s);color:var(--text-secondary);margin-top:-6px}
${R} .rows .card .v.first{color:var(--text-primary)}
${R} .path{margin:8px 0 0;padding:0;list-style:none}
${R} .path li{background:var(--surface-card);display:grid;grid-template-columns:56px 120px minmax(0,1fr);gap:16px;padding:18px 20px;align-items:baseline}
${R} .path li:hover{background:var(--surface-raised)}
${R} .path .n{justify-self:start;font:600 12px/1 var(--font-mono);letter-spacing:0.06em;padding:5px 14px 5px 10px;background:var(--surface-raised);color:var(--text-secondary);clip-path:${chev(22, false)}}
${R} .path .t{font:var(--type-display-xs);text-transform:uppercase}
${R} .path .b{font:var(--type-body);color:var(--text-secondary)}
${R} .path li.on{background:var(--surface-raised)}
${R} .path li.on .n{background:var(--hof-teal);color:var(--text-on-fill)}
${R} .path li.on .t{color:var(--text-link)}
${R} .pairs{margin-top:12px;display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:32px}
${R} .pairs > div,${R} .aside{display:flex;flex-direction:column;gap:12px}
${R} .pairs .lbl{color:var(--text-primary)}
${R} .bul{margin:0;padding:0 0 0 18px;display:flex;flex-direction:column;gap:8px;font:var(--type-body-s);color:var(--text-secondary)}
${R} .aside{margin-top:8px;gap:8px;max-width:68ch}
${R} .aside .lbl{color:var(--hof-summer)}
${R} .aside p{margin:0;font:var(--type-body-s);color:var(--text-secondary);text-wrap:pretty}
${R} .sources{margin:0;padding:0 0 0 24px;display:flex;flex-direction:column;gap:8px;font:var(--type-body-s);color:var(--text-secondary)}
${R} .beats{margin-top:8px;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px}
${R} .beats div{height:64px;display:flex;flex-direction:column;justify-content:center;gap:4px;padding:0 22px 0 24px;background:var(--surface-raised);color:var(--text-primary);clip-path:${chev(64)};margin-left:-14px}
${R} .beats div:first-child{padding-left:16px;margin-left:0;clip-path:${chev(64, false)}}
${R} .beats div:last-child{padding-right:18px}
${R} .beats div:hover{background:var(--hof-hairline)}
${R} .beats b{font:800 30px/0.9 var(--font-display);color:var(--text-link)}
${R} .beats span{font:500 10px/1 var(--font-mono);letter-spacing:0.1em;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
${R} .beats div.on{background:var(--hof-teal);color:var(--text-on-fill)}
${R} .beats div.on:hover{background:var(--hof-teal-pressed)}
${R} .beats div.on b{color:var(--text-on-fill)}
${R} .tr{background:var(--surface-card);display:grid;gap:16px;padding:16px 20px;align-items:baseline}
${R} .tr:hover{background:var(--surface-raised)}
${R} .tr.th{background:var(--bg-page);padding:10px 20px}
${R} .tr.th:hover{background:var(--bg-page)}
${R} .tr.th span{font:var(--type-label-s);letter-spacing:var(--tracking-label);text-transform:uppercase;color:var(--text-muted)}
${R} .beat-t .tr{grid-template-columns:160px minmax(0,1fr);padding:18px 20px}
${R} .beat-t .tr.th{padding:10px 20px}
${R} .beat-t .k{font:var(--type-display-xs);text-transform:uppercase}
${R} .beat-t .k em{font-style:normal;color:var(--text-link)}
${R} .plain-t .tr{grid-template-columns:minmax(0,2fr) minmax(0,3fr);gap:20px}
${R} .t-strong{font:var(--type-body-strong)}
${R} .t-soft{font:var(--type-body-s);color:var(--text-secondary)}
${R} .t-soft small{display:block;margin-top:4px;font:var(--type-label-s);letter-spacing:0.06em;color:var(--text-muted)}
${R} .level-t .tr{grid-template-columns:120px minmax(0,1fr) minmax(0,1fr)}
${R} .level-t .lv{font:var(--type-label);color:var(--text-muted)}
${R} .level-t .lv.all{color:var(--text-link)}
${R} .level-t .tr.loud{background:var(--hof-fall);color:var(--hof-charcoal);padding:18px 20px;align-items:center}
${R} .level-t .tr.loud .lv{color:var(--hof-charcoal)}
${R} .level-t .tr.loud .ev{font:800 30px/1 var(--font-display);text-transform:uppercase}
${R} .level-t .tr.loud .t-soft{font:500 15px/1.4 var(--font-body);color:var(--hof-charcoal)}
${R} .dec-t .tr{grid-template-columns:20px 120px minmax(0,1fr);padding:18px 20px}
${R} .dec-t .box{width:14px;height:14px;border:1px solid var(--border-strong);align-self:center}
${R} .dec-t .k{font:var(--type-display-xs);text-transform:uppercase}
${R} .dec-t .tag{font:var(--type-label);color:var(--hof-summer);letter-spacing:0.08em}
${R} .dec-t .tag.later{color:var(--text-muted)}
${R} .seasons{margin-top:8px}
${R} .season{background:var(--surface-card);display:grid;grid-template-columns:200px minmax(0,1fr)}
${R} .season .name{padding:18px 20px;border-top:3px solid var(--sc);display:flex;flex-direction:column;gap:6px}
${R} .season .name span{display:flex;align-items:center;gap:10px}
${R} .season .name i{flex:none;width:22px;height:14px;background:var(--sc);clip-path:${chev(14)}}
${R} .season .name b{font:var(--type-display-s);text-transform:uppercase;color:var(--sc)}
${R} .season .name small{font:var(--type-body-s);color:var(--text-secondary)}
${R} .season .list{display:flex;flex-direction:column;border-left:1px solid var(--border-hairline);border-top:3px solid var(--sc)}
${R} .season .row{display:grid;grid-template-columns:170px minmax(0,1fr);gap:16px;padding:14px 20px;align-items:baseline}
${R} .season .row + .row{border-top:1px solid var(--border-hairline)}
${R} .season .row .k{font:var(--type-label);letter-spacing:0.04em;color:var(--text-primary)}
${R} .season .row .k em{font-style:normal;color:var(--text-muted)}
@media (max-width:820px){${R} .eo-rail{position:relative;flex-basis:100%;max-height:none;padding-bottom:0}${R} .eo-body{padding:0 16px 96px}}
@media (max-width:640px){${R} .path li{grid-template-columns:48px minmax(0,1fr)}${R} .path .b{grid-column:2}${R} .season{grid-template-columns:1fr}${R} .season .list{border-left:0}${R} .season .row,${R} .plain-t .tr,${R} .level-t .tr,${R} .beat-t .tr{grid-template-columns:1fr;gap:6px}${R} .dec-t .tr{grid-template-columns:20px minmax(0,1fr)}${R} .dec-t .tr > :last-child{grid-column:2}${R} .beats{grid-template-columns:repeat(5,minmax(0,1fr))}${R} .beats div{padding:0 14px 0 18px}${R} .photos{grid-template-columns:1fr!important}}

/* ── yearly calendar ── */
${R} .cal-body{max-width:1320px;margin:0 auto;padding:0 40px 96px;display:grid;grid-template-columns:232px minmax(0,1fr);gap:32px}
${R} .cal-rail{position:sticky;top:var(--hfa-top);height:calc(100vh - var(--hfa-top));overflow-y:auto;padding:28px 24px 24px 0;display:flex;flex-direction:column;gap:28px;scrollbar-width:none}
${R} .cal-year{display:flex;flex-direction:column;gap:6px}
${R} .cal-year b{font:800 88px/0.85 var(--font-display)}
${R} .cal-seasons{display:flex;flex-direction:column;gap:2px}
${R} .cal-season{display:grid;grid-template-columns:18px minmax(0,1fr);gap:10px;padding:10px 10px 10px 8px;text-decoration:none;color:inherit}
${R} .cal-season i{width:18px;height:12px;margin-top:4px;background:var(--sc);clip-path:${chev(12)};opacity:0.55}
${R} .cal-season .nm{display:flex;align-items:baseline;gap:8px}
${R} .cal-season .nm b{font:var(--type-display-xs);text-transform:uppercase;color:var(--text-secondary)}
${R} .cal-season .nm .lbl{color:var(--text-primary)}
${R} .cal-season > span{display:flex;flex-direction:column;gap:4px;min-width:0}
${R} .cal-season.on{background:var(--surface-card);outline:1px solid var(--border-hairline);outline-offset:-1px}
${R} .cal-season.on i{opacity:1}
${R} .cal-season.on .nm b{color:var(--sc)}
${R} .cal-months{display:flex;flex-direction:column;gap:8px}
${R} .cal-months div{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:2px}
${R} .cal-months a{text-align:left;padding:7px 6px;font:500 11px/1 var(--font-mono);letter-spacing:0.08em;text-transform:uppercase;text-decoration:none;background:color-mix(in oklab,var(--hof-hairline) calc(var(--w,0)*100%),var(--surface-card));color:color-mix(in oklab,var(--text-primary) calc(var(--w,0)*100%),var(--text-secondary));transition:background-color 240ms linear,color 240ms linear}
${R} .cal-months a[aria-current]{background:var(--hof-teal);color:var(--text-on-fill)}
${R} .cal-key{display:flex;flex-direction:column;gap:10px}
${R} .key-retreat{height:20px;background:var(--hof-teal);clip-path:var(--clip-chamfer-sm);display:flex;align-items:center;padding:0 8px;font:800 14px/1 var(--font-display);text-transform:uppercase;color:var(--text-on-fill)}
${R} .holiday{font:400 12px/1.3 var(--font-body);color:var(--text-muted)}
${R} .cal-strip{display:none;position:sticky;top:var(--hfa-top);z-index:6;background:var(--bg-page);border-bottom:1px solid var(--border-hairline);height:52px;grid-template-columns:repeat(4,minmax(0,1fr));gap:3px;align-items:center;padding:0 16px}
${R} .cal-strip a{display:flex;flex-direction:column;gap:5px;min-width:0;padding:10px 0;text-decoration:none}
${R} .cal-strip i{height:8px;background:var(--surface-raised);clip-path:${chev(8)}}
${R} .cal-strip .lbl{font-size:10px}
${R} .cal-strip a.on i{background:var(--sc)}
${R} .cal-strip a.on .lbl{color:var(--sc)}
${R} .month{margin-bottom:48px;scroll-margin-top:var(--hfa-top)}
${R} .month-head{position:sticky;top:var(--hfa-top);z-index:5;background:var(--bg-page);border-bottom:1px solid var(--border-hairline)}
${R} .month-head .top{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;padding:28px 0 14px}
${R} .month-head .nm{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap}
${R} .month-head h2{margin:0;font:var(--type-display-m);text-transform:uppercase;letter-spacing:var(--tracking-display)}
${R} .month-head .yr{font:var(--type-label-l);letter-spacing:0.08em;color:var(--text-muted)}
${R} .month-head .sz{display:flex;align-items:center;gap:16px;flex-wrap:wrap}
${R} .month-head .sz > span{display:flex;align-items:center;gap:8px}
${R} .month-head .sw{display:flex;align-items:center;gap:6px}
${R} .month-head .sw i{width:16px;height:10px;background:var(--sc);clip-path:${chev(10)}}
${R} .month-head .sw .lbl{color:var(--text-primary)}
${R} .dow{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:1px;padding-bottom:8px}
${R} .dow span{padding-left:10px}
${R} .weeks{display:flex;flex-direction:column;gap:1px;background:var(--border-hairline);border:1px solid var(--border-hairline)}
${R} .week{position:relative;display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:1px}
${R} .pad{background:var(--pattern-chevron),var(--bg-page);min-height:136px}
${R} .day{position:relative;min-width:0;overflow:hidden;background:var(--surface-card);min-height:136px;display:flex;flex-direction:column}
${R} .day.today{background:var(--surface-raised);outline:2px solid var(--hof-teal);outline-offset:-2px;z-index:1}
${R} .rule{height:6px;flex:none}
${R} .rule i{display:block;height:2px;background:var(--sc)}
${R} .rule.split{position:relative;background:var(--sf)}
${R} .rule.split i{position:absolute;inset:0;height:auto;background:var(--sc);clip-path:polygon(50% 0,100% 0,100% 100%,calc(50% - 3.46px) 100%)}
${R} .past .rule i{opacity:0.6}
${R} .past .rule.split{opacity:0.7}
${R} .past .rule.split i{opacity:1}
${R} .day-in{flex:1;display:flex;flex-direction:column;gap:6px;padding:8px 10px 10px}
${R} .past .day-in{opacity:0.72}
${R} .dn{display:flex;align-items:center;justify-content:space-between;gap:6px;min-height:22px}
${R} .dn > span{font:500 13px/1 var(--font-mono);letter-spacing:0.04em;color:var(--text-primary)}
${R} .past .dn > span{color:var(--text-muted)}
${R} .dn .tchip{display:flex;align-items:center;gap:6px;min-width:0}
${R} .dn .tchip b{flex:none;background:var(--hof-teal);color:var(--text-on-fill);font:600 13px/1 var(--font-mono);padding:4px 8px 4px 6px;clip-path:var(--clip-chamfer-sm)}
${R} .dn .tchip .lbl{color:var(--text-link);overflow:hidden;text-overflow:ellipsis}
${R} .begins{font:var(--type-label-s);letter-spacing:0.06em;line-height:1.35;text-transform:uppercase;color:var(--sc)}
${R} .sign{display:flex;align-items:center;gap:6px;font:500 12px/1.2 var(--font-body);color:var(--text-muted)}
${R} .sign b{font-family:'Segoe UI Symbol','Noto Sans Symbols 2','Apple Symbols',sans-serif;font-variant-emoji:text;font-weight:400;font-size:13px;color:var(--text-secondary)}
${R} .spacer{height:46px;flex:none}
${R} .grow{flex:1}
${R} .empty{position:absolute;right:10px;bottom:10px}
${R} .chip{position:relative;clip-path:var(--clip-chamfer-sm);border:1px solid var(--cb);min-width:0}
${R} .chip::after{content:"";position:absolute;top:-2px;right:-9px;width:16px;height:2px;background:var(--cb);transform-origin:0 50%;transform:rotate(60deg);pointer-events:none}
${R} .chip.hof{--cb:var(--hof-summer);background:var(--hof-summer);color:var(--text-on-fill);padding:5px 10px 6px 8px;display:flex;flex-direction:column;gap:2px}
${R} .chip.hof .l1{font:500 11px/1.2 var(--font-mono);letter-spacing:0.1em;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
${R} .chip .l2{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:2px 6px}
${R} .chip.hof .l2 b{font:600 14px/1.2 var(--font-body)}
${R} .chip .tm{font:500 11px/1.2 var(--font-mono);white-space:nowrap}
${R} .chip.circle{--cb:var(--hof-teal);background:transparent;color:var(--text-link);padding:5px 10px 5px 8px;display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:2px 6px}
${R} .chip.circle b{font:600 13px/1.2 var(--font-body);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
${R} .chip.draft{border-style:dashed}
${R} .chip.cancelled b{text-decoration:line-through}
${R} .gather{border:1px dashed var(--hof-secondary);padding:5px 8px 6px;display:flex;flex-direction:column;gap:3px;min-width:0}
${R} .gather .l1{font:500 10px/1.2 var(--font-mono);letter-spacing:0.12em;text-transform:uppercase;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
${R} .gather b{font:600 14px/1.2 var(--font-body);color:var(--text-primary)}
${R} .gather small{font:500 10px/1.25 var(--font-mono);letter-spacing:0.06em;text-transform:uppercase;color:var(--text-secondary)}
${R} .enroll{display:flex;align-items:center;gap:6px}
${R} .enroll i{width:10px;height:8px;flex:none;background:var(--text-primary);clip-path:${chev(8)}}
${R} .enroll span{font:500 11px/1.25 var(--font-mono);letter-spacing:0.08em;text-transform:uppercase;color:var(--text-secondary)}
${R} .bar{position:absolute;top:48px;height:46px;z-index:2;pointer-events:none}
${R} .bar.past{opacity:0.55}
${R} .bar > div{position:absolute;inset:0;background:var(--hof-teal);display:flex;align-items:center;gap:12px;color:var(--text-on-fill);overflow:hidden}
${R} .bar .t1{font:800 24px/1 var(--font-display);text-transform:uppercase;letter-spacing:0.01em;white-space:nowrap;flex:none}
${R} .bar .t2{font:800 20px/1 var(--font-display);text-transform:uppercase;white-space:nowrap}
${R} .bar .d{font:500 11px/1.2 var(--font-mono);letter-spacing:0.1em;text-transform:uppercase;white-space:nowrap}
${R} .mlist{display:none;flex-direction:column;gap:16px;padding-top:12px}
${R} .mrow{display:grid;grid-template-columns:56px minmax(0,1fr);background:var(--surface-card)}
${R} .mrow.today{background:var(--surface-raised);outline:2px solid var(--hof-teal);outline-offset:-2px}
${R} .mrow .md{display:flex;flex-direction:column;gap:4px;padding:12px 0 12px 12px;border-right:1px solid var(--border-hairline)}
${R} .mrow .md b{font:500 18px/1 var(--font-mono)}
${R} .mrow .mc{display:flex;flex-direction:column;gap:6px;padding:10px 12px}
${R} .mrow.past .md,${R} .mrow.past .mc{opacity:0.5}
${R} .mretreat{background:var(--hof-teal);color:var(--text-on-fill);padding:8px 10px;clip-path:var(--clip-chamfer-sm);display:flex;justify-content:space-between;gap:8px;align-items:baseline}
${R} .mretreat b{font:800 20px/1 var(--font-display);text-transform:uppercase}
${R} .mretreat span{font:500 11px/1 var(--font-mono);letter-spacing:0.1em}
${R} .mnone{padding:16px 0}
@media (max-width:1179px){${R} .cal-body{grid-template-columns:minmax(0,1fr);gap:0}${R} .cal-rail{display:none}${R} .cal-strip{display:grid}${R} .month-head{top:calc(var(--hfa-top) + 52px)}${R} .month{scroll-margin-top:calc(var(--hfa-top) + 52px)}}
@media (max-width:759px){${R} .cal-body{padding:0 16px 64px}${R} .month{margin-bottom:24px}${R} .month-head .top{padding:16px 0 12px}${R} .month-head h2{font-size:40px}${R} .dow,${R} .weeks{display:none}${R} .mlist{display:flex}}
`
