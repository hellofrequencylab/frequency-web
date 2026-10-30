// THE FREE HUMAN SITE CHROME SKIN (design: templates/website/Website.dc.html, the announce bar, the sticky vellum header with its
// four mega menus, the bag drawer, the account menu and the sky footer). Scoped under [data-house-theme="free-human"], so it can
// only ever dress the stand-alone site render (components/sites/site-chrome.tsx sets that attribute; nothing in a member, Space
// console or admin area does: app/(main)/no-site-theme-in-member-area.test.ts guards it). Every colour, wash and shadow reads the
// token block (lib/theme/free-human.ts); the sizes are the design's own. It layers after the foundation skin (free-human-css.ts)
// and the house sheets.

const N = '[data-house-theme="free-human"]'
const T = `${N} .fh-top`
/** The design's rows are 1180 of content inside a gutter, so a border-box row is the 1180 plus both gutters. */
const ROW = 'calc(1180px + 2 * clamp(16px,3vw,32px))'
const EASE = 'var(--ease-soft)'
const DISPLAY = 'font-family:var(--font-display);font-weight:var(--weight-medium)'
const INSCRIPTION = 'font-family:var(--font-inscription);text-transform:uppercase'

export const FREE_HUMAN_CHROME_CSS = `
${N} .fh-top{position:sticky;top:0;z-index:50}
${T} .hs-header{position:relative;top:auto;z-index:auto;padding:0;transition:none;background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--fh-brass-600) 38%,transparent),transparent) bottom/100% 1px no-repeat,var(--texture-fiber),linear-gradient(180deg,color-mix(in srgb,var(--fh-cream-50) 96%,transparent),color-mix(in srgb,var(--fh-cream-100) 86%,transparent));background-size:100% 1px,320px 320px,auto;-webkit-backdrop-filter:blur(16px) saturate(1.1);backdrop-filter:blur(16px) saturate(1.1);box-shadow:var(--fh-depth-header)}
${T} .hs-header[data-hidden]{opacity:1;transform:none;pointer-events:auto}

/* THE BUTTONS (design: components/core/Button.jsx): pills in the display face, madder by default, gilt for the sunny call, rose for the quiet one. */
${N} .hs-btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;box-sizing:border-box;height:48px;padding:0 26px;border:0;font-family:var(--font-display);font-weight:var(--weight-semibold);font-size:19px;letter-spacing:.01em;line-height:1;white-space:nowrap;cursor:pointer;transition:background var(--dur-base) ${EASE},box-shadow var(--dur-base) ${EASE},transform var(--dur-base) ${EASE}}
${N} .hs-btn[data-size="sm"]{height:38px;padding:0 18px;font-size:16px}
${N} .hs-btn[data-size="lg"]{height:58px;padding:0 34px;font-size:21px}
${N} .hs-btn:hover{transform:translateY(-1px)}
${N} .hs-btn:active{transform:scale(var(--press-scale))}
${N} .hs-btn:disabled,${N} .hs-btn[aria-disabled="true"]{opacity:.45;cursor:not-allowed;pointer-events:none}
${N} .hs-btn-primary,${N} .hs-btn-dark{background:linear-gradient(180deg,color-mix(in srgb,var(--fh-clay-500) 82%,var(--fh-clay-300)) 0%,var(--fh-clay-500) 55%,color-mix(in srgb,var(--fh-clay-500) 84%,black) 100%);color:var(--fh-cream-50);border:0;box-shadow:inset 0 1px 0 color-mix(in srgb,var(--fh-rose-100) 35%,transparent)}
${N} .hs-btn-primary:hover,${N} .hs-btn-dark:hover{background:linear-gradient(180deg,color-mix(in srgb,var(--fh-clay-500) 90%,var(--fh-clay-700)) 0%,var(--fh-clay-700) 100%);color:var(--fh-cream-50);box-shadow:inset 0 1px 0 color-mix(in srgb,var(--fh-rose-100) 35%,transparent),0 10px 24px -10px color-mix(in srgb,var(--fh-clay-500) 60%,transparent)}
${N} .hs-btn-gilt{background:linear-gradient(180deg,var(--fh-saffron-300) 0%,var(--fh-saffron-400) 55%,var(--fh-brass-600) 100%);color:var(--fh-ink-900);border:0;box-shadow:inset 0 1px 0 color-mix(in srgb,var(--fh-saffron-100) 60%,transparent)}
${N} .hs-btn-gilt:hover{background:linear-gradient(180deg,color-mix(in srgb,var(--fh-saffron-300) 80%,var(--fh-cream-50)) 0%,var(--fh-saffron-300) 60%,var(--fh-saffron-400) 100%);color:var(--fh-ink-900);box-shadow:inset 0 1px 0 color-mix(in srgb,var(--fh-saffron-100) 60%,transparent),var(--glow-accent)}
${N} .hs-btn-secondary,${N} .hs-btn-soft,${N} .hs-btn-light{background:var(--fh-rose-100);color:var(--fh-clay-700);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--fh-clay-500) 14%,transparent)}
${N} .hs-btn-secondary:hover,${N} .hs-btn-soft:hover,${N} .hs-btn-light:hover{background:var(--fh-rose-200);color:var(--fh-clay-700)}
${N} .hs-btn-ghost{background:transparent;color:var(--fh-clay-700);font-style:italic}
${N} .hs-btn-ghost:hover{background:var(--fh-rose-100);color:var(--fh-clay-700)}

/* THE ANNOUNCE BAR: night, a candle wash and a halo that breathes. */
${N} .fh-bar{position:relative;z-index:2;height:38px;background:var(--texture-glint),var(--wash-candle),var(--fh-night-900);background-size:180px 180px,auto,auto;color:var(--fh-cream-100);box-shadow:inset 0 -10px 14px -12px color-mix(in srgb,black 60%,transparent)}
${N} .fh-bar-row{box-sizing:border-box;max-width:${ROW};height:38px;margin:0 auto;padding:0 clamp(16px,3vw,32px);display:flex;align-items:center;gap:20px;font-size:13px}
${N} .fh-bar-line{margin:0;min-width:0;display:flex;align-items:center;gap:10px;font-family:var(--font-lyric);font-style:italic;font-size:16px;color:var(--fh-saffron-100)}
${N} .fh-bar-line a{color:inherit;display:flex;align-items:center;gap:10px;min-width:0}
${N} .fh-bar-line .fh-halo{flex:none;width:12px;height:12px}
${N} .fh-bar-line span{min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
${N} .fh-bar-more{font-style:normal;opacity:.8;flex:none}
${N} .fh-bar-links{display:none;margin-left:auto;gap:18px}
${N} .fh-bar-links a{color:var(--fh-cream-100);white-space:nowrap}
${N} .fh-bar-links a:first-child{color:var(--fh-saffron-300)}
${N} .fh-bar-links a:hover{color:var(--fh-saffron-100)}
@media (min-width:900px){${N} .fh-bar-links{display:flex}}
@media (max-width:640px){${N} .fh-bar-more{display:none}}

/* THE HEADER ROW: wordmark left, the menu right, then bag, account and the button. */
/* Phone: the house two-row pill (wordmark and actions, the menu scrolling beneath), in vellum. */
${T} .hs-pill{max-width:${ROW};padding:10px clamp(16px,3vw,32px) 4px;border-radius:0;background:transparent;box-shadow:none;-webkit-backdrop-filter:none;backdrop-filter:none;animation:none}
${T} .hs-header .hs-brand{display:flex;padding:0;overflow:visible;flex:none;min-width:0}
${T} .hs-nav a,${T} .hs-nav-mega{padding:6px 10px;border-radius:0;background:none;color:var(--text-strong);${DISPLAY};font-size:18px}
${T} .hs-nav-track{font-size:18px}
@media (min-width:940px){
${T} .hs-pill{max-width:${ROW};height:78px;padding:0 clamp(16px,3vw,32px);display:flex;align-items:center;gap:clamp(14px,2.4vw,30px);border-radius:0;background:transparent;box-shadow:none;-webkit-backdrop-filter:none;backdrop-filter:none;animation:none}
${T} .hs-nav{flex:1;min-width:0;overflow:visible;-webkit-mask-image:none;mask-image:none}
${T} .hs-nav-track{width:auto;justify-content:flex-end;gap:clamp(12px,2vw,26px);margin:0;padding:0;font-size:19px;font-weight:var(--weight-medium)}
${T} .hs-nav a,${T} .hs-nav-mega{height:78px;padding:0 2px;gap:4px;border-radius:0;background:none;color:var(--text-strong);${DISPLAY};font-size:19px;text-shadow:0 1px 0 color-mix(in srgb,var(--fh-cream-50) 90%,transparent);transition:color var(--dur-quick) ${EASE}}
}
${T} .hs-nav a:hover,${T} .hs-nav-mega:hover,${T} .hs-nav-mega[aria-expanded="true"]{background:none;color:var(--fh-clay-700)}
${T} .hs-nav a[aria-current="page"]{font-style:italic;color:var(--fh-clay-500);text-shadow:0 0 18px color-mix(in srgb,var(--fh-saffron-400) 55%,transparent)}
${T} .hs-nav .fh-glyph{flex:none;color:var(--fh-clay-500)}
${T} .hs-nav a .fh-glyph{margin-right:2px}
${T} .hs-nav-mega .fh-glyph{width:14px;height:14px;transition:transform var(--dur-base) ${EASE}}
${T} .hs-nav-mega[aria-expanded="true"] .fh-glyph{transform:rotate(180deg)}
${T} .hs-header-actions{flex:none;gap:2px;margin-left:clamp(0px,1vw,12px)}
${T} .hs-header-actions .hs-btn-dark{margin-left:6px;height:38px;padding:0 20px;font-size:14px}

/* THE MENU FOLDS ON SCROLL (components/sites/free-human-header-state.tsx sets data-scrolled past 40px): the announce bar closes to nothing and the
   header takes 14px off its height on a soft shadow, so the menu stays in reach and gives the page its room back. */
${N} .fh-bar{overflow:hidden;transition:height var(--dur-base) ${EASE},box-shadow var(--dur-base) ${EASE}}
${N}[data-scrolled] .fh-bar{height:0;box-shadow:none}
@media (min-width:940px){
${T} .hs-pill{transition:height var(--dur-base) ${EASE}}
${N}[data-scrolled] .fh-top .hs-pill{height:64px}
${N}[data-scrolled] .fh-top .hs-nav a,${N}[data-scrolled] .fh-top .hs-nav-mega{height:64px}
}

/* THE LOGO LOCKUP: the gilt arch mark, the name in the display face with the lyric second word, the inscription tagline. */
${N} .fh-logo{display:flex;align-items:center;gap:12px;white-space:nowrap}
${N} .fh-logo-mark{flex:none;width:38px;height:48px;object-fit:contain;filter:drop-shadow(0 4px 8px color-mix(in srgb,var(--fh-clay-700) 22%,transparent))}
${N} .fh-logo-text{display:flex;flex-direction:column;gap:4px}
${N} .fh-logo-name{${DISPLAY};font-size:clamp(24px,2.6vw,31px);line-height:1;color:var(--text-strong);text-shadow:0 1px 0 color-mix(in srgb,var(--fh-cream-50) 90%,transparent)}
${N} .fh-logo-name em{font-weight:var(--weight-regular);color:var(--text-lyric)}
${N} .fh-logo-tag{font-family:var(--font-inscription);font-size:10px;letter-spacing:.3em;text-transform:uppercase;color:var(--text-muted)}
@media (max-width:1279px){${N} .fh-logo-tag{display:none}}
@media (max-width:479px){${N} .fh-logo-mark{width:30px;height:38px}${N} .fh-logo-name{font-size:20px}${N} .fh-logo{gap:8px}${N} .hs-header-actions .fh-tools{display:none}${N} .hs-header-actions .hs-btn-dark{padding:0 16px}}

/* THE MEGA MENU: a lazure panel hung from the header, the lyric and four doors left, two pictured tiles right. */
${N} .hs-mega{padding:0 clamp(16px,3vw,32px);z-index:29}
${N} .hs-mega-panel{max-width:1172px;padding:26px 28px 30px;gap:28px;border-radius:0 0 40px 40px;background:var(--texture-fiber),var(--wash-lazure),var(--fh-cream-50);background-size:320px 320px,auto,auto;-webkit-backdrop-filter:none;backdrop-filter:none;box-shadow:inset 0 16px 22px -18px color-mix(in srgb,var(--fh-clay-700) 28%,transparent),var(--fh-depth-3)}
${N} .hs-mega-panel[data-tiles]{grid-template-columns:minmax(0,1.25fr) minmax(0,1fr)}
${N} .hs-mega-links{grid-template-columns:1fr 1fr;gap:2px 8px;align-content:start;padding:0}
${N} .hs-mega-lyric{grid-column:1/-1;margin:0;padding:0 12px 6px;font-family:var(--font-lyric);font-style:italic;font-size:17px;color:var(--text-lyric)}
${N} .hs-mega-links a{display:grid;grid-template-columns:38px 1fr;column-gap:12px;align-items:start;padding:10px 12px;border-radius:20px;color:var(--text-body-ink);transition:background var(--dur-quick) ${EASE}}
${N} .hs-mega-links a:hover{background:color-mix(in srgb,var(--fh-rose-100) 55%,transparent)}
${N} .hs-mega-links a .fh-door{grid-row:1/3;width:38px;height:38px;border-radius:50%;background:radial-gradient(circle,var(--fh-cream-50),var(--fh-rose-100));display:flex;align-items:center;justify-content:center;color:var(--fh-clay-500)}
${N} .hs-mega-label{${DISPLAY};font-size:19px;line-height:1.15;color:var(--text-strong)}
${N} .hs-mega-desc{font-size:13px;line-height:1.4;color:var(--text-muted);margin-top:2px;grid-column:2}
${N} .hs-mega-tiles{display:grid;grid-template-columns:1fr 1fr;gap:18px}
${N} .hs-mega-tile{display:flex;flex-direction:column;gap:10px;color:var(--text-body-ink)}
${N} .hs-mega-tile-photo{display:block;aspect-ratio:4/4.6;overflow:hidden;border-radius:var(--radius-arch);box-shadow:var(--fh-depth-2)}
${N} .hs-mega-tile-photo img{display:block;width:100%;height:100%;object-fit:cover;object-position:center}
${N} .hs-mega-tile-kicker{${INSCRIPTION};font-size:10px;letter-spacing:.2em;color:var(--text-accent)}
${N} .hs-mega-tile-title{${DISPLAY};font-style:italic;font-size:19px;line-height:1.15;color:var(--text-strong);margin-top:-4px}
@media (max-width:939px){${N} .hs-mega{display:none}}

/* THE PHONE MENU: the house panel, dressed in the vellum and the display face. */
${N} .hs-menu-button{background:var(--fh-rose-100);color:var(--fh-clay-700)}
${N} .hs-menu-panel{border-radius:28px;background:var(--texture-fiber),var(--wash-lazure),var(--fh-cream-50);box-shadow:var(--fh-depth-3);-webkit-backdrop-filter:none;backdrop-filter:none}
${N} .hs-menu-panel a{${DISPLAY};font-size:21px;color:var(--text-strong)}

/* BAG AND ACCOUNT TOOLS. */
${N} .fh-tools{position:relative;display:flex;align-items:center;gap:2px}
${N} .fh-icon-btn{position:relative;display:inline-flex;align-items:center;justify-content:center;width:42px;height:42px;padding:0;border:0;border-radius:50%;background:transparent;color:var(--fh-clay-700);cursor:pointer;transition:background var(--dur-quick) ${EASE},color var(--dur-quick) ${EASE}}
${N} .fh-icon-btn:hover,${N} .fh-icon-btn[data-active]{background:color-mix(in srgb,var(--fh-rose-100) 70%,transparent);color:var(--fh-clay-700)}
${N} .fh-icon-btn[data-soft]{background:var(--fh-rose-100)}
${N} .fh-count{position:absolute;right:-3px;top:-3px;min-width:18px;height:18px;padding:0 5px;box-sizing:border-box;border-radius:var(--fh-radius-pill);background:linear-gradient(180deg,var(--fh-saffron-300),var(--fh-saffron-400));color:var(--fh-ink-900);font-size:11px;font-weight:var(--weight-semibold);display:flex;align-items:center;justify-content:center;pointer-events:none}
${N} .fh-avatar{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;overflow:hidden;border-radius:50%;background:radial-gradient(circle at 35% 35%,var(--fh-rose-200),var(--fh-clay-300));color:var(--fh-clay-700);${DISPLAY};font-size:13px;font-weight:var(--weight-semibold)}
${N} .fh-avatar[data-size="lg"]{width:44px;height:44px;font-size:18px}
${N} .fh-avatar img{width:100%;height:100%;object-fit:cover}
${N} .fh-menu{position:absolute;right:0;top:calc(100% + 6px);z-index:31;width:320px;box-sizing:border-box;padding:24px;border-radius:32px;background:var(--wash-lazure),var(--fh-cream-50);box-shadow:var(--fh-depth-3);display:flex;flex-direction:column;gap:12px}
${N} .fh-menu-in{display:flex;flex-direction:column;gap:14px}
${N} .fh-menu-welcome{margin:0;${DISPLAY};font-size:28px;line-height:1;color:var(--text-strong)}
${N} .fh-menu-welcome em{font-weight:var(--weight-regular);color:var(--text-lyric)}
${N} .fh-menu-body{margin:0;font-size:14px;line-height:1.55}
${N} .fh-menu-who{display:flex;align-items:center;gap:12px;padding-bottom:10px}
${N} .fh-menu-who b{display:block;${DISPLAY};font-size:21px;font-weight:var(--weight-medium);color:var(--text-strong)}
${N} .fh-menu-who small{display:block;font-size:13px;color:var(--text-muted)}
${N} .fh-menu-item{display:block;padding:10px 12px;border-radius:16px;${DISPLAY};font-size:19px;color:var(--text-strong)}
${N} .fh-menu-item:hover{background:color-mix(in srgb,var(--fh-rose-100) 55%,transparent);color:var(--text-strong)}
${N} .fh-menu-out{text-align:left;padding:10px 12px;background:none;border:0;cursor:pointer;font-family:var(--font-display);font-style:italic;font-size:18px;color:var(--fh-clay-700)}
@media (max-width:479px){${N} .fh-menu{position:fixed;left:16px;right:16px;top:auto;width:auto}}

${N} .fh-drawer{position:fixed;inset:0 0 0 auto;margin:0;max-width:none;max-height:none;width:min(420px,92vw);height:100%;padding:0;border:0;border-radius:40px 0 0 40px;background:var(--wash-lazure),var(--fh-cream-50);color:var(--text-body-ink);box-shadow:var(--fh-depth-3);overflow:hidden}
${N} .fh-drawer::backdrop{background:color-mix(in srgb,var(--fh-umber-800) 42%,transparent);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px)}
${N} .fh-drawer-panel{box-sizing:border-box;height:100%;padding:30px 28px;display:flex;flex-direction:column;gap:18px}
${N} .fh-drawer-head{display:flex;align-items:center;justify-content:space-between}
${N} .fh-drawer-title{${DISPLAY};font-size:32px;color:var(--text-strong)}
${N} .fh-drawer-title em{font-weight:var(--weight-regular);color:var(--text-lyric)}
${N} .fh-drawer-meter{display:flex;flex-direction:column;gap:6px;font-size:13px;color:var(--text-muted)}
${N} .fh-meter{display:block;height:6px;border-radius:var(--fh-radius-pill);background:var(--fh-rose-100);overflow:hidden}
${N} .fh-meter span{display:block;height:100%;border-radius:var(--fh-radius-pill);background:linear-gradient(90deg,var(--fh-saffron-300),var(--fh-clay-500))}
${N} .fh-drawer-body{flex:1;overflow:auto;display:flex;flex-direction:column;gap:16px;padding-top:6px}
${N} .fh-line{display:grid;grid-template-columns:64px 1fr auto;gap:14px;align-items:center}
${N} .fh-line-img{display:block;width:64px;height:78px;overflow:hidden;border-radius:var(--radius-arch);background:var(--fh-rose-200);object-fit:cover}
${N} .fh-line-title{margin:0;${DISPLAY};font-size:20px;line-height:1.1;color:var(--text-strong)}
${N} .fh-line-meta{margin:3px 0 0;font-size:13px;color:var(--text-muted)}
${N} .fh-line-price{margin:0;${DISPLAY};font-weight:var(--weight-regular);font-size:19px;color:var(--text-strong)}
${N} .fh-drawer-foot{display:flex;flex-direction:column;gap:18px}
${N} .fh-drawer-sub{margin:0;display:flex;justify-content:space-between;align-items:baseline;padding-top:14px;background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--fh-clay-500) 25%,transparent),transparent) top/100% 1px no-repeat}
${N} .fh-drawer-sub span{${DISPLAY};font-style:italic;font-weight:var(--weight-regular);font-size:20px;color:var(--text-body-ink)}
${N} .fh-drawer-sub b{${DISPLAY};font-size:26px;color:var(--text-strong)}
${N} .fh-drawer-fine{margin:0;font-size:12px;line-height:1.5;color:var(--text-muted);text-align:center}
${N} .fh-empty{display:flex;flex-direction:column;align-items:center;gap:10px;padding:40px 0;text-align:center}
${N} .fh-empty-title{margin:0;${DISPLAY};font-size:24px;color:var(--text-strong)}
${N} .fh-empty-body{margin:0;max-width:260px;font-size:14px;line-height:1.55}

/* THE FOOTER: the sky ground, the letter, then the brand and three columns. */
${N} .fh-footer-ground{position:relative;overflow:hidden}
${N} .fh-footer-letter{position:relative;z-index:2;max-width:${ROW};margin:0 auto;padding:90px clamp(16px,3vw,32px) 64px;display:flex;flex-direction:column;align-items:center;text-align:center;gap:18px}
${N} .fh-footer-emblem{position:relative;width:84px;height:84px}
${N} .fh-footer-emblem .fh-rays{position:absolute;inset:0;opacity:.8}
${N} .fh-footer-emblem .fh-halo{position:absolute;inset:20px}
${N} .fh-letter-title{margin:0;${DISPLAY};font-size:clamp(34px,4vw,50px);line-height:1.08;color:var(--fh-cream-50)}
${N} .fh-letter-title em{font-weight:var(--weight-regular);color:var(--text-gilt)}
${N} .fh-letter-body{margin:0;max-width:440px;line-height:1.6;color:var(--fh-cream-100)}
${N} .fh-letter-form{display:flex;gap:12px;align-items:flex-end;width:min(460px,100%);margin-top:6px}
${N} .fh-letter-field{flex:1;min-width:0;text-align:left}
${N} .fh-letter-form input[type="email"]{box-sizing:border-box;width:100%;height:48px;padding:0 6px;background:transparent;border:0;border-bottom:1px solid color-mix(in srgb,var(--fh-saffron-300) 55%,transparent);border-radius:0;color:var(--fh-cream-50);font-family:var(--font-body);font-size:17px;outline:none;box-shadow:none}
${N} .fh-letter-form input[type="email"]::placeholder{color:color-mix(in srgb,var(--fh-cream-100) 70%,transparent)}
${N} .fh-letter-form input[type="email"]:focus-visible{border-bottom-color:var(--fh-saffron-300);box-shadow:0 1px 0 var(--fh-saffron-300)}
${N} .fh-letter-form .hs-btn{height:48px;padding:0 24px}
${N} .fh-hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}
${N} .fh-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
${N} .fh-letter-done{margin:6px 0 0;font-family:var(--font-lyric);font-style:italic;font-size:20px;color:var(--fh-saffron-100)}
${N} .fh-footer-grid{position:relative;z-index:2;max-width:${ROW};margin:0 auto;padding:40px clamp(16px,3vw,32px) 48px;display:grid;grid-template-columns:1.5fr 1fr 1fr 1fr;gap:40px;background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--fh-saffron-300) 30%,transparent),transparent) top/100% 1px no-repeat}
${N} .fh-footer-brand{display:flex;flex-direction:column;gap:14px}
${N} .fh-footer-brand .fh-logo-mark{width:44px;height:55px;filter:drop-shadow(0 0 14px color-mix(in srgb,var(--fh-amber-500) 35%,transparent))}
${N} .fh-footer-brand .fh-logo{gap:14px}
${N} .fh-footer-brand .fh-logo-name{font-size:36px;color:var(--fh-cream-50);text-shadow:none}
${N} .fh-footer-brand .fh-logo-name em{color:var(--text-gilt)}
${N} .fh-footer-brand .fh-logo-tag{display:block;color:var(--fh-saffron-300)}
${N} .fh-footer-blurb{margin:0;max-width:330px;line-height:1.65;color:var(--fh-cream-100)}
${N} .fh-footer-col{display:flex;flex-direction:column;gap:10px}
${N} .fh-footer-col-title{${INSCRIPTION};font-size:12px;letter-spacing:.2em;color:var(--text-gilt)}
${N} .fh-footer-col a{font-size:15px;color:var(--fh-cream-100)}
${N} .fh-footer-col a:hover{color:var(--fh-saffron-100)}
${N} .fh-footer-ground .hs-footer{position:relative;z-index:2;box-sizing:border-box;max-width:${ROW};margin:0 auto;padding:18px clamp(16px,3vw,32px) 34px;display:flex;align-items:center;gap:20px;flex-wrap:wrap;font-size:13px;color:var(--fh-cream-100)}
${N} .fh-footer-ground .hs-footer>span:first-child{opacity:.75}
${N} .fh-footer-ground .hs-footer a{color:var(--fh-cream-100);opacity:.75}
${N} .fh-footer-ground .hs-footer a:hover{opacity:1;color:var(--fh-cream-100)}
${N} .fh-footer-ground .hs-footer [data-partner-line]{order:9;margin-left:auto;display:flex;align-items:center;gap:8px;opacity:.85}
${N} .fh-footer-ground .hs-footer [data-partner-line]::before{content:"";width:10px;height:10px;border-radius:50%;background:radial-gradient(circle at 40% 35%,var(--fh-saffron-100),var(--fh-saffron-300) 55%,var(--fh-saffron-400));box-shadow:var(--glow-sun)}
@media (max-width:939px){${N} .fh-footer-grid{grid-template-columns:1fr 1fr}${N} .fh-footer-brand{grid-column:1/-1}}
@media (max-width:479px){${N} .fh-footer-grid{grid-template-columns:1fr}${N} .fh-letter-form{flex-direction:column;align-items:stretch}}
`
