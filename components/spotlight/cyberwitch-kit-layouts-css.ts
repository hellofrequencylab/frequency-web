// The CyberWitch Kit Spotlight layouts' stylesheet (components/spotlight/cyberwitch-kit-layouts.tsx), drawn to the design system's
// products.jsx and tokens/base.css: riveted steel plates (.ng-plate), the arched portrait (.ng-arch), the sticker and placard buttons
// (components/core/Button.jsx), the wordmark with its lit tube lines (components/brand/Logo.jsx) and the sprayed marker tag. Every colour,
// shadow and face is a --cw-* token from lib/theme/cyberwitch.ts, so an accent change re-points the whole page and this file holds no
// literal colour. Class prefix `cws-`. Tokens are scoped to [data-house-theme="cyberwitch"], which only the stand-alone render and the
// Spotlight page carry; nothing here styles a member, Space console or admin area. Dark only: there is no Day register.

const RIVET = 'radial-gradient(circle,var(--cw-border-strong) 1.6px,transparent 2.2px)'
const ARCH = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 140' preserveAspectRatio='none'><path d='M0 140V52C0 22 22 4 50 0c28 4 50 22 50 52v88z'/></svg>") 0 0/100% 100%`
const CUT = 'polygon(1.5% 9%, 98.5% 0, 100% 88%, 2.5% 100%)'
const LABEL = 'font-family:var(--cw-font-caps);font-weight:600;letter-spacing:var(--cw-ls-label);text-transform:uppercase'
const DROP = 'drop-shadow(2px 3px 0 color-mix(in oklab,var(--cw-ink-950) 70%,transparent))'

export const CYBERWITCH_KIT_LAYOUTS_CSS = `
.cws{position:relative;box-sizing:border-box;min-height:100%;padding-bottom:34px;background:var(--cw-haze-top),var(--cw-tex-stone),var(--cw-ink-900);color:var(--cw-text-primary);font-family:var(--cw-font-body);font-size:16px;line-height:1.4;container-type:inline-size;overflow:hidden;isolation:isolate}
.cws::after{content:"";position:absolute;inset:0;z-index:0;pointer-events:none;background:var(--cw-tex-grain);background-size:140px 140px;opacity:.11;mix-blend-mode:overlay}
.cws>*{position:relative;z-index:1}
.cws *,.cws *::before{box-sizing:border-box}
:where(.cws) a{color:inherit;text-decoration:none}
.cws h1,.cws p,.cws blockquote{margin:0}
.cws-d{font-family:var(--cw-font-gothic);font-weight:700;text-transform:none;letter-spacing:0;line-height:.98;text-shadow:var(--cw-shadow-text);text-wrap:balance}
.cws-d em{font-family:var(--cw-font-scrawl);font-style:normal;font-weight:400;text-transform:uppercase;letter-spacing:.01em;font-size:.8em;line-height:.9;color:var(--cw-flare-400);text-shadow:0 0 1px var(--cw-flare-300),var(--cw-glow-text);display:inline-block;transform:rotate(-4deg) translateY(.06em)}
.cws-label{${LABEL};font-size:11px;letter-spacing:.16em;color:var(--cw-text-muted)}
.cws-scrawl{display:inline-block;font-family:var(--cw-font-scrawl);font-weight:400;line-height:1;text-transform:uppercase;color:var(--cw-spray);text-shadow:var(--cw-glow-text);transform:rotate(-7deg)}
.cws-glyph{display:inline-flex;flex:none;color:var(--cw-accent-text)}
.cws-col{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;padding:18px}
.cws-body{font-size:15px;line-height:var(--cw-lh-body);color:var(--cw-text-secondary)}
.cws-foot{display:flex;flex-direction:column;align-items:center;gap:12px;padding:14px 20px 8px}
.cws-foot i{display:block;width:60%;height:1px;background:linear-gradient(90deg,transparent,var(--cw-flare-500),transparent)}
/* The wordmark: blackletter name, the descriptor in tracked caps between two lit tube lines. */
.cws-logo{display:inline-flex;flex-direction:column;align-items:center;gap:6px;max-width:100%}
.cws-logo-name{display:block;font-family:var(--cw-font-gothic);font-weight:700;line-height:1.05;white-space:nowrap;color:var(--cw-chrome-50);text-shadow:var(--cw-shadow-text)}
.cws-logo-desc{display:flex;align-items:center;align-self:stretch;gap:10px;${LABEL};font-size:11px;letter-spacing:.22em;color:var(--cw-text-secondary);white-space:nowrap}
.cws-logo-desc i{flex:1;min-width:10px;height:2px;border-radius:2px;background:var(--cw-flare-300);box-shadow:var(--cw-glow-md)}
/* The arched portrait. */
.cws-arch{position:relative;display:block;flex:none;aspect-ratio:3/4;overflow:hidden;-webkit-mask:${ARCH};mask:${ARCH};background:linear-gradient(160deg,color-mix(in oklab,var(--cw-chrome-50) 10%,transparent),transparent 55%),var(--cw-tex-chain),var(--cw-tex-grime) center/600px,linear-gradient(180deg,var(--cw-ink-700),var(--cw-ink-850))}
.cws-top{display:grid;gap:10px;justify-items:center;padding:44px 22px 16px;text-align:center}
.cws-top--big{padding-top:54px;padding-bottom:22px}
.cws-pain{font-style:italic;font-size:18px;line-height:1.35;color:var(--cw-text-secondary)}
/* The sticker button: a hand-cut quad in marker, a degree off true; straightens and glows on hover. */
.cws-sticker{display:inline-flex;max-width:100%;filter:drop-shadow(0 0 10px color-mix(in oklab,var(--cw-flare-500) 28%,transparent)) ${DROP};transition:filter var(--cw-dur-base)}
.cws-sticker span{display:inline-flex;min-width:0;align-items:center;justify-content:center;gap:10px;width:100%;min-height:56px;padding:0 28px;clip-path:${CUT};background:var(--cw-accent);color:var(--cw-on-accent);font-family:var(--cw-font-scrawl);font-size:19px;letter-spacing:.02em;text-transform:uppercase;white-space:nowrap;transform:rotate(-1.2deg);transition:transform var(--cw-dur-base) var(--cw-ease-out),background var(--cw-dur-fast)}
.cws-sticker:hover{filter:drop-shadow(0 0 6px color-mix(in oklab,var(--cw-flare-500) 80%,transparent)) drop-shadow(0 0 22px color-mix(in oklab,var(--cw-flare-500) 45%,transparent))}
.cws-sticker:hover span{transform:none;background:var(--cw-accent-hover)}
/* The placard button: a double hairline frame, tracked serif caps. */
.cws-placard{display:inline-flex;align-items:center;justify-content:center;min-height:50px;padding:0 24px;${LABEL};font-size:15px;letter-spacing:.14em;color:var(--cw-text-primary);box-shadow:inset 0 0 0 1px var(--cw-border-strong),inset 0 0 0 4px var(--cw-ink-900),inset 0 0 0 5px var(--cw-border-default)}
.cws-placard:hover{color:var(--cw-accent-text);background:var(--cw-accent-tint)}
.cws-full{display:flex;width:100%}
.cws-sticker:focus-visible,.cws-placard:focus-visible,.cws-plate:focus-visible,.cws-prod:focus-visible{outline:2px solid var(--cw-flare-300);outline-offset:3px}
/* A riveted steel plate: hairline, rivets in the corners, grime in the metal, a lit top edge. */
.cws-plate{position:relative;isolation:isolate;background:linear-gradient(180deg,color-mix(in oklab,var(--cw-chrome-50) 4%,transparent),transparent 40%),var(--cw-tex-grime) 30% 20%/700px,var(--cw-surface-card);box-shadow:inset 0 0 0 1px var(--cw-border-default),var(--cw-shadow-plate)}
.cws-plate::before{content:"";position:absolute;inset:7px;z-index:0;pointer-events:none;background:${RIVET} 0 0/7px 7px no-repeat,${RIVET} 100% 0/7px 7px no-repeat,${RIVET} 0 100%/7px 7px no-repeat,${RIVET} 100% 100%/7px 7px no-repeat}
.cws-plate::after{content:"";position:absolute;left:12%;right:12%;top:0;height:1px;z-index:2;pointer-events:none;background:linear-gradient(90deg,transparent,color-mix(in oklab,var(--cw-accent-text) 70%,transparent),transparent);box-shadow:0 0 10px color-mix(in oklab,var(--cw-accent) 40%,transparent);opacity:.55;transition:opacity var(--cw-dur-base)}
.cws-plate:hover::after{opacity:1}
.cws-plate>*{position:relative;z-index:1}
.cws-door{display:flex;align-items:center;gap:14px;padding:16px 18px;color:var(--cw-text-primary)}
.cws-door--compact{padding:12px 14px}
.cws-door>span:nth-child(2){flex:1;min-width:0}
.cws-door b{display:block;${LABEL};font-size:14px;letter-spacing:.06em}
.cws-door small{display:block;font-size:13px;color:var(--cw-text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
/* Card wall. */
.cws-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px;padding:16px}
.cws-span{grid-column:1/-1}
.cws-sq{display:flex;flex-direction:column;justify-content:space-between;aspect-ratio:1;padding:14px}
.cws-sq b{${LABEL};font-size:15px;letter-spacing:.04em;line-height:.95}
/* Story. */
.cws-story-photo{position:relative;height:360px;display:flex;flex-direction:column;justify-content:space-between;padding:54px 22px 22px;overflow:hidden;background:var(--cw-tex-mist),var(--cw-haze-bottom),var(--cw-surface-sunken)}
.cws-story-photo::after{content:"";position:absolute;inset:0;z-index:1;background:linear-gradient(0deg,var(--cw-ink-900) 5%,transparent 60%)}
.cws-story-photo>*:not(img){position:relative;z-index:2}
.cws-story-name{align-self:flex-start}
.cws-story-photo h1{font-size:46px;color:var(--cw-chrome-50)}
/* Calendar first. */
.cws-date{display:flex;align-items:center;gap:14px;padding:12px}
.cws-day{display:grid;justify-items:center;width:44px}
.cws-day .cws-label{color:var(--cw-accent-text)}
.cws-day b{font-family:var(--cw-font-caps);font-weight:600;font-size:21px;line-height:.9}
.cws-date-t{flex:1;min-width:0}
.cws-date-t b{display:block;${LABEL};font-size:13px;letter-spacing:.04em;line-height:1}
.cws-date-t small{display:block;margin-top:4px;font-size:12px;color:var(--cw-text-muted)}
.cws-badge{display:inline-flex;align-items:center;min-height:24px;padding:0 10px;background:var(--cw-accent-tint);color:var(--cw-accent-text);box-shadow:inset 0 0 0 1px var(--cw-accent-line);${LABEL};font-size:10px;white-space:nowrap}
/* Shop front: taped wheatpaste squares. */
.cws-shop{gap:16px 12px}
.cws-prod{display:grid;gap:6px;align-content:start}
.cws-taped{position:relative;display:grid;place-items:center;aspect-ratio:1;background:linear-gradient(160deg,color-mix(in oklab,var(--cw-chrome-50) 10%,transparent),transparent 55%),var(--cw-tex-chain),var(--cw-tex-grime) center/600px,linear-gradient(180deg,var(--cw-ink-700),var(--cw-ink-850));box-shadow:inset 0 0 60px color-mix(in oklab,var(--cw-ink-950) 65%,transparent)}
.cws-taped::before{content:"";position:absolute;top:-7px;left:50%;width:64px;height:16px;transform:translateX(-50%) rotate(-3deg);background:color-mix(in oklab,var(--cw-chrome-50) 22%,transparent);box-shadow:0 1px 0 color-mix(in oklab,var(--cw-ink-950) 40%,transparent)}
.cws-prod b{${LABEL};font-size:12px;letter-spacing:.04em;line-height:1}
.cws-price{${LABEL};font-size:11px;letter-spacing:.06em;color:var(--cw-accent-text)}
/* Profile. */
.cws-profile{display:grid;gap:16px;padding:50px 22px 4px}
.cws-profile-head{display:flex;gap:14px;align-items:center}
.cws-profile-name{display:block;${LABEL};font-size:23px;letter-spacing:.02em;line-height:.9}
.cws-profile-role{display:block;margin-top:4px;font-style:italic;font-size:17px;color:var(--cw-text-secondary)}
.cws-quote{font-style:italic;font-size:22px;line-height:1.25}
.cws-profile .cws-scrawl{justify-self:end;font-size:20px}
`
