// The /themes/cyberwitch page's stylesheet (cyberwitch-feature.tsx), drawn to the CyberWitch design system's ThemeFeature page and its
// tokens/base.css: the neon wall, the duct-tape labels, wheatpaste posters with a torn foot, riveted plates, the sticker and placard
// buttons. Every colour is a --cw-* token (lib/theme/cyberwitch.ts) under the page's CyberWitch root; no literal colour. Class prefix `cwf-`.

const RIVET = 'radial-gradient(circle,var(--cw-border-strong) 1.6px,transparent 2.2px)'
const TORN = 'polygon(0 0,100% 0,100.0% 100.00%,97.5% 98.10%,95.0% 99.75%,92.5% 96.70%,90.0% 99.50%,87.5% 97.75%,85.0% 99.25%,82.5% 98.80%,80.0% 99.00%,77.5% 97.40%,75.0% 100.00%,72.5% 98.45%,70.0% 99.75%,67.5% 97.05%,65.0% 99.50%,62.5% 98.10%,60.0% 99.25%,57.5% 96.70%,55.0% 99.00%,52.5% 97.75%,50.0% 100.00%,47.5% 98.80%,45.0% 99.75%,42.5% 97.40%,40.0% 99.50%,37.5% 98.45%,35.0% 99.25%,32.5% 97.05%,30.0% 99.00%,27.5% 98.10%,25.0% 100.00%,22.5% 96.70%,20.0% 99.75%,17.5% 97.75%,15.0% 99.50%,12.5% 98.80%,10.0% 99.25%,7.5% 97.40%,5.0% 99.00%,2.5% 98.45%,0.0% 100.00%)'
const CUT = 'polygon(1.5% 9%, 98.5% 0, 100% 88%, 2.5% 100%)'
const TAPE_CUT = 'polygon(0 6%,2% 0,98% 4%,100% 0,99% 100%,1% 94%)'
const LABEL = 'font-family:var(--cw-font-caps);font-weight:600;letter-spacing:.16em;text-transform:uppercase'
const DROP = 'color-mix(in oklab,var(--cw-ink-950) 70%,transparent)'

export const CYBERWITCH_FEATURE_CSS = `
.cwf{position:relative;isolation:isolate;background:var(--cw-tex-grime) 0 0/900px 900px,var(--cw-ink-950);color:var(--cw-text-primary);font-family:var(--cw-font-body);font-size:18px;line-height:1.55;overflow:hidden}
.cwf::after{content:"";position:absolute;inset:0;z-index:5;pointer-events:none;background:var(--cw-tex-grain);background-size:140px 140px;opacity:.1;mix-blend-mode:overlay}
.cwf *,.cwf *::before,.cwf *::after{box-sizing:border-box}
.cwf a{color:inherit;text-decoration:none}
.cwf h1,.cwf h2,.cwf h3,.cwf p,.cwf figure,.cwf ul{margin:0}
.cwf ul{padding:0;list-style:none}
.cwf :focus-visible{outline:2px solid var(--cw-flare-300);outline-offset:3px}
.cwf-d{font-family:var(--cw-font-gothic);font-weight:700;line-height:.98;letter-spacing:0;text-shadow:var(--cw-shadow-text);text-wrap:balance;font-size:clamp(51px,6.8vw,88px)}
.cwf-d em{display:inline-block;font-family:var(--cw-font-scrawl);font-style:normal;font-weight:400;font-size:.8em;line-height:.9;letter-spacing:.01em;text-transform:uppercase;color:var(--cw-flare-400);text-shadow:0 0 1px var(--cw-flare-300),var(--cw-glow-text);transform:rotate(-4deg) translateY(.06em)}
.cwf-label{${LABEL};font-size:11px;color:var(--cw-text-muted)}
.cwf-lede{max-width:620px;font-size:18px;line-height:1.55;color:var(--cw-text-secondary);text-wrap:pretty}
.cwf-tape{display:inline-flex;align-items:center;gap:10px;align-self:flex-start;padding:6px 12px 5px;${LABEL};font-size:12px;color:var(--cw-ink-900);background:repeating-linear-gradient(97deg,transparent 0 22px,color-mix(in oklab,var(--cw-ink-950) 6%,transparent) 22px 23px,transparent 23px 51px),linear-gradient(180deg,var(--cw-chrome-50),var(--cw-chrome-200));transform:rotate(-1.5deg);box-shadow:0 2px 0 color-mix(in oklab,var(--cw-ink-950) 35%,transparent);clip-path:${TAPE_CUT};white-space:nowrap}
.cwf-tape b{color:var(--cw-flare-700)}
/* Buttons: the sticker (hand-cut quad, marker, a degree off) and the placard (double hairline frame). */
.cwf-actions{display:flex;flex-wrap:wrap;gap:16px;align-items:center}
.cwf-actions--center{justify-content:center}
.cwf-sticker{display:inline-flex;filter:drop-shadow(0 0 10px color-mix(in oklab,var(--cw-flare-500) 28%,transparent)) drop-shadow(2px 3px 0 ${DROP});transition:filter var(--cw-dur-base)}
.cwf-sticker span{display:inline-flex;align-items:center;min-height:60px;padding:0 34px;clip-path:${CUT};background:var(--cw-flare-500);color:var(--cw-on-accent);font-family:var(--cw-font-scrawl);font-size:21px;letter-spacing:.02em;text-transform:uppercase;white-space:nowrap;transform:rotate(-1.2deg);transition:transform var(--cw-dur-base) var(--cw-ease-out),background var(--cw-dur-fast)}
.cwf-sticker:hover{filter:drop-shadow(0 0 6px color-mix(in oklab,var(--cw-flare-500) 80%,transparent)) drop-shadow(0 0 22px color-mix(in oklab,var(--cw-flare-500) 45%,transparent))}
.cwf-sticker:hover span{transform:none;background:var(--cw-flare-300)}
.cwf-placard{display:inline-flex;align-items:center;min-height:60px;padding:0 30px;${LABEL};font-size:16px;letter-spacing:.14em;color:var(--cw-text-primary);box-shadow:inset 0 0 0 1px var(--cw-border-strong),inset 0 0 0 4px var(--cw-ink-950),inset 0 0 0 5px var(--cw-border-default);transition:color var(--cw-dur-fast),background var(--cw-dur-fast)}
.cwf-placard:hover{color:var(--cw-flare-400);background:color-mix(in oklab,var(--cw-flare-500) 12%,transparent)}
/* The hero: the neon wall, a wash from below, the CYBER/Witch wordmark centred. */
.cwf-hero{position:relative;min-height:min(100svh,940px);display:grid;align-items:end;justify-items:center;text-align:center;padding:120px 24px 100px;background:var(--cw-ink-950)}
.cwf-hero-photo{object-fit:cover;object-position:84% 40%}
.cwf-hero-wash{position:absolute;inset:0;z-index:1;background:linear-gradient(0deg,var(--cw-ink-950) 0%,color-mix(in oklab,var(--cw-ink-950) 60%,transparent) 60%,color-mix(in oklab,var(--cw-ink-950) 35%,transparent))}
.cwf-hero-in{position:relative;z-index:2;display:grid;justify-items:center;gap:26px;max-width:900px}
.cwf-crumbs{${LABEL};font-size:11px;color:var(--cw-text-muted)}
.cwf-crumbs a:hover{color:var(--cw-flare-400)}
.cwf-crumbs span{color:var(--cw-text-secondary)}
.cwf-logo{position:relative;display:inline-flex;flex-direction:column;align-items:center;gap:14px;padding-top:clamp(36px,6vw,62px);font-weight:400}
.cwf-logo-name{display:block;font-family:var(--cw-font-gothic);font-weight:700;font-size:clamp(110px,17vw,220px);line-height:.9;color:var(--cw-chrome-50);text-shadow:var(--cw-shadow-text)}
.cwf-logo-tag{position:absolute;left:-4%;top:0;font-family:var(--cw-font-scrawl);font-size:clamp(56px,8.6vw,114px);line-height:1;text-transform:uppercase;color:var(--cw-flare-400);text-shadow:var(--cw-glow-text);transform:rotate(-8deg);transform-origin:left bottom;white-space:nowrap;animation:cwf-flicker 8s linear infinite}
.cwf-logo-desc{display:flex;align-items:center;align-self:stretch;gap:14px;${LABEL};font-size:clamp(14px,2vw,24px);letter-spacing:.22em;color:var(--cw-text-secondary);white-space:nowrap}
.cwf-logo-desc i{flex:1;min-width:16px;height:2px;border-radius:2px;background:var(--cw-flare-300);box-shadow:var(--cw-glow-md)}
.cwf-hero-lede{max-width:640px;font-size:20px;line-height:1.55;color:var(--cw-text-secondary)}
@keyframes cwf-flicker{0%,100%{opacity:1}3%{opacity:.4}5%{opacity:1}61%{opacity:1}62%{opacity:.65}64%{opacity:1}}
@media (prefers-reduced-motion:reduce){.cwf *{animation:none!important;transition:none!important}}
/* Sections. */
.cwf-sec{position:relative;z-index:1;max-width:1240px;margin:0 auto;padding:clamp(72px,9vw,110px) clamp(16px,4vw,32px);display:grid;gap:44px}
.cwf-sec--sunk{max-width:none;background:var(--cw-tex-chain),var(--cw-haze-bottom),var(--cw-ink-900);box-shadow:inset 0 1px 0 var(--cw-border-subtle),inset 0 -1px 0 var(--cw-border-subtle)}
.cwf-sec--sunk>*{width:100%;max-width:1176px;margin-inline:auto}
.cwf-head{display:flex;flex-direction:column;gap:18px;align-items:flex-start;max-width:820px}
/* Wheatpaste posters. */
.cwf-posters{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:26px 18px;padding-top:12px}
.cwf-poster{position:relative;display:flex;flex-direction:column;gap:12px;padding:26px 24px 40px;background:radial-gradient(60% 40% at 100% 0%,color-mix(in oklab,var(--cw-spray) 9%,transparent),transparent 70%),linear-gradient(90deg,transparent 49.7%,color-mix(in oklab,var(--cw-chrome-50) 9%,transparent) 50%,transparent 50.3%),linear-gradient(180deg,color-mix(in oklab,var(--cw-chrome-50) 7%,transparent),transparent 35%),var(--cw-tex-grime) center/600px,var(--cw-ink-800);box-shadow:inset 0 0 0 1px var(--cw-border-subtle);clip-path:${TORN};transform:rotate(var(--tilt,0deg));transition:transform var(--cw-dur-base) var(--cw-ease-out)}
.cwf-poster:hover{transform:rotate(0deg) translateY(-4px)}
.cwf-posters>.cwf-poster::before{content:"";position:absolute;z-index:3;top:0;left:50%;width:84px;height:18px;transform:translateX(-50%) rotate(-4deg);background:color-mix(in oklab,var(--cw-chrome-50) 45%,transparent)}
.cwf-poster-top{display:flex;justify-content:space-between;align-items:flex-start;color:var(--cw-text-secondary)}
.cwf-num{font-family:var(--cw-font-gothic);font-weight:700;font-size:44px;line-height:1;color:var(--cw-chrome-50)}
.cwf-poster h3{${LABEL};font-size:22px;letter-spacing:.02em;line-height:1}
.cwf-poster p{font-size:16px;line-height:1.5;color:var(--cw-text-secondary)}
/* The four surfaces, each pinned up with a strip of tape. */
.cwf-surfaces{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,.62fr);gap:44px 28px;align-items:start}
.cwf-frame{position:relative;display:grid;gap:0}
.cwf-frame-tag{position:absolute;z-index:3;top:-14px;left:18px}
.cwf-frame-in{overflow:hidden;background:var(--cw-ink-850);box-shadow:inset 0 0 0 1px var(--cw-border-default),0 30px 60px -24px var(--cw-ink-950),0 0 40px -20px var(--cw-flare-500)}
.cwf-frame-in img{display:block;width:100%;height:auto}
.cwf-frame--tall{grid-row:span 2}
.cwf-frame--tall .cwf-frame-in{border-radius:30px;box-shadow:0 0 0 8px var(--cw-ink-950),0 0 0 9px var(--cw-border-default),0 30px 60px -20px var(--cw-ink-950),0 0 50px -16px var(--cw-flare-500)}
.cwf-note{font-size:15px;color:var(--cw-text-muted);max-width:720px}
@media (max-width:900px){.cwf-surfaces{grid-template-columns:minmax(0,1fr)}.cwf-frame--tall{grid-row:auto;justify-self:center;width:min(300px,80%)}}
/* Riveted plates. */
.cwf-plate{position:relative;isolation:isolate;background:linear-gradient(180deg,color-mix(in oklab,var(--cw-chrome-50) 4%,transparent),transparent 40%),var(--cw-tex-grime) 30% 20%/700px,var(--cw-surface-card);box-shadow:inset 0 0 0 1px var(--cw-border-default),var(--cw-shadow-plate)}
.cwf-plate::before{content:"";position:absolute;inset:7px;z-index:0;pointer-events:none;background:${RIVET} 0 0/7px 7px no-repeat,${RIVET} 100% 0/7px 7px no-repeat,${RIVET} 0 100%/7px 7px no-repeat,${RIVET} 100% 100%/7px 7px no-repeat}
.cwf-plate::after{content:"";position:absolute;left:12%;right:12%;top:0;height:1px;z-index:2;pointer-events:none;background:linear-gradient(90deg,transparent,color-mix(in oklab,var(--cw-flare-400) 70%,transparent),transparent);box-shadow:0 0 10px color-mix(in oklab,var(--cw-flare-500) 40%,transparent);opacity:.55;transition:opacity var(--cw-dur-base)}
.cwf-plate:hover::after{opacity:1}
.cwf-plate>*{position:relative;z-index:1}
.cwf-kits{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:14px}
.cwf-kit{display:grid;gap:6px;padding:22px 24px 24px;transition:box-shadow var(--cw-dur-fast)}
.cwf-kit:hover{box-shadow:inset 0 0 0 1px var(--cw-flare-500),var(--cw-shadow-plate),var(--cw-glow-sm)}
.cwf-kit-name{font-family:var(--cw-font-gothic);font-weight:700;font-size:32px;line-height:1}
.cwf-kit small{font-size:15px;line-height:1.5;color:var(--cw-text-secondary)}
/* Five neon tags. */
.cwf-tags{display:flex;flex-wrap:wrap;gap:22px 40px}
.cwf-tags li{display:grid;gap:8px}
.cwf-tag{font-family:var(--cw-font-scrawl);font-size:clamp(34px,4vw,48px);line-height:1;text-transform:uppercase;color:var(--cw-flare-400);text-shadow:0 0 1px var(--cw-flare-300),var(--cw-glow-text);transform:rotate(-4deg);display:inline-block}
/* Questions. */
.cwf-faq{display:grid;gap:12px;max-width:900px}
.cwf-faq summary{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:20px 24px;${LABEL};font-size:16px;letter-spacing:.06em;cursor:pointer;list-style:none}
.cwf-faq summary::-webkit-details-marker{display:none}
.cwf-faq details[open] summary{color:var(--cw-flare-400)}
.cwf-faq details[open] summary svg{transform:rotate(90deg)}
.cwf-faq p{padding:0 24px 22px;font-size:17px;color:var(--cw-text-secondary)}
/* The last line. */
.cwf-last{position:relative;z-index:1;display:grid;justify-items:center;gap:22px;text-align:center;padding:clamp(90px,12vw,150px) 24px;background:var(--cw-haze-spray),var(--cw-tex-chain),var(--cw-ink-950)}
.cwf-last .cwf-d{font-size:clamp(60px,9vw,128px)}
/* The neon picker: the five tags are buttons, and a small riveted dial sits bottom right (design's DialBar). */
.cwf-tagbtn{display:grid;gap:8px;justify-items:start;background:none;border:0;padding:6px 4px;cursor:pointer;color:inherit;text-align:left;opacity:.62;transition:opacity .2s}
.cwf-tagbtn:hover,.cwf-tagbtn[aria-pressed="true"]{opacity:1}
.cwf-tagbtn[aria-pressed="true"] .cwf-label{color:var(--cw-flare-300)}
.cwf-tagbtn:focus-visible,.cwf-dial button:focus-visible{outline:2px solid var(--cw-flare-300);outline-offset:4px}
.cwf-dial{position:fixed;right:16px;bottom:16px;z-index:40;display:flex;align-items:center;gap:12px;padding:10px 14px;background:color-mix(in oklab,var(--cw-ink-950) 90%,transparent);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);box-shadow:inset 0 0 0 1px var(--cw-border-default),var(--cw-shadow-plate)}
.cwf-dial-sw{display:flex;gap:8px}
.cwf-dial button{width:12px;height:30px;padding:0;border:0;cursor:pointer;background:var(--cw-flare-500);box-shadow:0 0 0 1px var(--cw-border-default);opacity:.55;transition:opacity .2s,box-shadow .2s}
.cwf-dial button[aria-pressed="true"]{opacity:1;box-shadow:0 0 0 1px var(--cw-flare-300),var(--cw-glow-sm)}
.cwf-dial-name{font-family:var(--cw-font-scrawl);font-weight:400;font-size:18px;color:var(--cw-flare-400);min-width:6ch}
@media (max-width:599px){.cwf-dial{left:16px;right:16px;justify-content:space-between}}
`
