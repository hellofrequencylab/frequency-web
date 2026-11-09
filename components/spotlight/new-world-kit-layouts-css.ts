// The New World Kit Spotlight layouts' stylesheet (components/spotlight/new-world-kit-layouts.tsx). Every colour,
// radius, shadow and face is a --nw-* token from lib/theme/new-world.ts (NEW_WORLD_TOKENS_CSS, and NEW_WORLD_DAY_CSS for
// the Day register), so an accent or register change re-points the whole page and this file holds no literal colour.
// The only hex values that reach the page are the owner accent presets, emitted below from NEW_WORLD_ACCENTS. Class
// prefix `nws-`. Tokens are scoped to [data-house-theme="new-world"], which only the stand-alone render and the
// Spotlight page carry; nothing here styles a member, Space console or admin area.
import { NEW_WORLD_ACCENTS } from '@/lib/theme/new-world'

/** One block per owner accent preset for the Night register: the flare ramp, the swell and halo mid steps. Day keeps the theme's
 *  own deep steps (--nw-d-*), which already carry the contrast the cream surface needs. */
export const NEW_WORLD_ACCENT_CSS = Object.entries(NEW_WORLD_ACCENTS)
  .map(([id, a]) => {
    const night = `[data-house-theme="new-world"][data-accent="${id}"]:not([data-th="day"]){--nw-flare-300:${a.deep};--nw-flare-400:${a.text};--nw-flare-500:${a.accent};--nw-flare-600:${a.hover};--nw-flare-700:${a.soft};--nw-swell-500:${a.glow2};--nw-halo-500:${a.glow3}}`
    return night
  })
  .join('\n')

export const NEW_WORLD_KIT_LAYOUTS_CSS = `
.nws{position:relative;box-sizing:border-box;min-height:100%;padding-bottom:34px;background:var(--nw-spread-top),var(--nw-surface-page);color:var(--nw-text-primary);font-family:var(--nw-font-body);font-size:16px;line-height:1.4;container-type:inline-size;overflow:hidden}
.nws *,.nws *::before,.nws *::after{box-sizing:border-box}
:where(.nws) a{color:inherit;text-decoration:none}
.nws h1,.nws p{margin:0}
.nws-pad{padding:0 20px}
.nws-d{font-family:var(--nw-font-display);font-stretch:var(--nw-stretch-display);font-weight:var(--nw-fw-display);text-transform:none;letter-spacing:var(--nw-ls-display);line-height:var(--nw-lh-display);text-wrap:balance}
.nws-d em{font-family:var(--nw-font-accent);font-style:italic;font-weight:var(--nw-fw-regular);font-stretch:100%;text-transform:none;letter-spacing:-.01em;font-size:1.04em;line-height:.8;color:var(--nw-flare-300);padding-right:.1em}
.nws-mono{font-family:var(--nw-font-mono);font-size:10px;letter-spacing:var(--nw-ls-mono);text-transform:uppercase;color:var(--nw-text-muted)}
.nws-eb{display:flex;align-items:center;gap:8px;font-family:var(--nw-font-mono);font-size:10px;letter-spacing:var(--nw-ls-mono);text-transform:uppercase;color:var(--nw-chrome-200)}
.nws-eb::before{content:"";width:5px;height:5px;border-radius:9px;background:var(--nw-flare-500);box-shadow:0 0 8px var(--nw-flare-500);flex:none}
.nws-eb--accent{color:var(--nw-flare-400)}
.nws-card{border:var(--nw-border-hairline) solid transparent;border-radius:var(--nw-radius-lg);background:linear-gradient(180deg,color-mix(in oklab,var(--nw-chrome-50) 6%,transparent),color-mix(in oklab,var(--nw-chrome-50) 2%,transparent));box-shadow:0 30px 70px -40px color-mix(in oklab,var(--nw-flare-500) 35%,transparent),0 1px 0 color-mix(in oklab,var(--nw-chrome-50) 8%,transparent) inset}
.nws-btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:44px;padding:0 24px;border:0;border-radius:var(--nw-radius-pill);background:var(--nw-action-primary);color:var(--nw-action-primary-text);font:var(--nw-fw-bold) 12px/1 var(--nw-font-mono);letter-spacing:var(--nw-ls-button);text-transform:uppercase;white-space:nowrap;cursor:pointer}
.nws-btn--accent{background:var(--nw-accent);color:var(--nw-accent-text);box-shadow:var(--nw-shadow-glow)}
.nws-btn--secondary{background:transparent;color:var(--nw-text-primary);box-shadow:inset 0 0 0 1px var(--nw-border-default)}
.nws-btn--lg{width:100%;min-height:52px;font-size:13px}
.nws-btn--sm{min-height:34px;padding:0 16px;font-size:11px}
.nws-tile{display:inline-flex;align-items:center;justify-content:center;flex:none;border-radius:var(--nw-radius-md);background:var(--nw-accent-tint);color:var(--nw-flare-400);box-shadow:inset 0 0 0 1px var(--nw-border-subtle)}
.nws-badge{display:inline-flex;align-items:center;min-height:24px;padding:0 10px;border-radius:var(--nw-radius-pill);background:var(--nw-accent-tint);color:var(--nw-flare-400);font-family:var(--nw-font-mono);font-size:10px;letter-spacing:var(--nw-ls-mono);text-transform:uppercase;white-space:nowrap}
.nws-name{display:flex;align-items:center;gap:12px;min-width:0}
.nws-name span:last-child{font-family:var(--nw-font-display);font-stretch:var(--nw-stretch-display);font-weight:var(--nw-fw-display);text-transform:none;letter-spacing:var(--nw-ls-display);line-height:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nws-mark{font-size:18px;display:grid;place-items:center;flex:none;border-radius:50%;background:radial-gradient(70% 70% at 30% 20%,color-mix(in oklab,var(--nw-flare-300) 35%,transparent),transparent 70%),var(--nw-ink-950);box-shadow:0 0 0 1px color-mix(in oklab,var(--nw-flare-300) 40%,transparent),0 0 22px -6px var(--nw-flare-500);color:var(--nw-chrome-50);font-family:var(--nw-font-display);font-stretch:var(--nw-stretch-display);font-weight:var(--nw-fw-heavy);line-height:1}
.nws-hero{position:relative;display:flex;flex-direction:column;justify-content:space-between;overflow:hidden;background:var(--nw-spread-tr),var(--nw-spread-bl),var(--nw-surface-sunken);border-radius:0 0 var(--nw-radius-xl) var(--nw-radius-xl);isolation:isolate}
.nws-hero img,.nws-story-photo img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.nws-hero:not([data-photo])::before,.nws-story-photo:not([data-photo])::before{content:"";position:absolute;inset:0;z-index:0;background:repeating-linear-gradient(135deg,color-mix(in oklab,var(--nw-chrome-50) 4%,transparent) 0 1px,transparent 1px 14px)}
.nws-hero::after,.nws-story-photo::after{content:"";position:absolute;inset:0;z-index:1;background:linear-gradient(180deg,color-mix(in oklab,var(--nw-ink-950) 45%,transparent) 0%,transparent 30%),var(--nw-overlay-bottom),var(--nw-glow-sunset)}
.nws-hero-top{position:relative;z-index:3;padding:62px 20px 28px}
.nws-hero-body{position:relative;z-index:2;width:100%;padding:0 20px 26px}
.nws-hero h1{margin-top:12px;font-size:46px;color:var(--nw-chrome-50)}
.nws-stack-list{display:flex;flex-direction:column;gap:8px;padding:16px 20px 0}
.nws-door{display:flex;align-items:center;gap:14px;min-height:60px;padding:0 14px}
.nws-door > span:nth-child(2){flex:1;min-width:0}
.nws-door b{display:block;font-weight:var(--nw-fw-bold);font-size:16px;line-height:1.15}
.nws-door small{display:block;font-size:12px;color:var(--nw-text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nws-letter{padding:18px}
.nws-letter .nws-d{font-size:20px}
.nws-letter p{margin-top:6px;font-size:13px;color:var(--nw-text-muted)}
.nws-letter form{display:flex;gap:8px;margin-top:14px}
.nws-input{flex:1;min-width:0;height:38px;padding:0 14px;border:var(--nw-border-hairline) solid var(--nw-border-default);border-radius:var(--nw-radius-pill);background:color-mix(in oklab,var(--nw-chrome-50) 4%,transparent);color:var(--nw-text-primary);font:var(--nw-fw-regular) 14px var(--nw-font-body);outline:none}
.nws-input:focus-visible{outline:2px solid var(--nw-focus-ring);outline-offset:2px}
.nws-closing .nws-btn{width:100%;height:auto;min-height:52px;padding-block:14px;white-space:normal;text-align:center;line-height:1.25}
.nws-foot{display:flex;flex-direction:column;align-items:center;gap:12px;padding:22px 20px 26px}
.nws-foot i{display:block;width:60%;height:1px;background:linear-gradient(90deg,transparent,var(--nw-flare-500),transparent)}
.nws-wall-head{display:flex;flex-direction:column;gap:12px;padding:66px 20px 0}
.nws-wall-head .nws-d.big{font-size:34px}
.nws-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px;padding:18px 20px 0}
.nws-sq{display:flex;flex-direction:column;justify-content:space-between;aspect-ratio:1.25;padding:14px}
.nws-sq b{display:block;font-weight:var(--nw-fw-bold);font-size:16px;line-height:1.15}
.nws-sq small{display:block;margin-top:4px;font-size:11px;color:var(--nw-text-muted)}
.nws-wide{grid-column:1/-1;aspect-ratio:2.4/1;border-color:color-mix(in oklab,var(--nw-flare-400) 35%,transparent);background:var(--nw-spread-tr),linear-gradient(180deg,color-mix(in oklab,var(--nw-chrome-50) 6%,transparent),color-mix(in oklab,var(--nw-chrome-50) 2%,transparent))}
.nws-wide .nws-d{font-size:24px}
.nws-wide small{font-size:12px;color:var(--nw-chrome-200)}
.nws-span{grid-column:1/-1}
.nws-story-photo{position:relative;height:420px;overflow:hidden;display:flex;align-items:flex-end;background:var(--nw-spread-tr),var(--nw-spread-bl),var(--nw-surface-sunken);isolation:isolate}
.nws-story-name{position:absolute;z-index:3;top:64px;left:20px;right:20px}
.nws-story-text{position:relative;z-index:2;padding:0 20px 26px}
.nws-story-text h1{margin-top:12px;font-size:46px;color:var(--nw-chrome-50)}
.nws-story-body{padding:24px 20px 0}
.nws-story-body p{font-size:17px;line-height:var(--nw-lh-body);color:var(--nw-text-secondary)}
.nws-links{display:flex;gap:18px;justify-content:center;flex-wrap:wrap;margin-top:16px;font-size:13px}
.nws-links a{color:var(--nw-flare-400);text-decoration:underline;text-underline-offset:3px}
.nws-quote{margin-top:22px;padding-top:20px;border-top:var(--nw-border-hairline) solid var(--nw-border-subtle)}
.nws-quote > div{padding:0 20px}
.nws-quote .nws-d{font-size:22px;line-height:1.15}
.nws-quote .nws-mono{margin-top:12px}
.nws-quote .nws-mono span{color:var(--nw-chrome-50)}
.nws-row-head{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:66px 20px 0}
.nws-socials{display:flex;gap:8px}
.nws-iconbtn{display:grid;place-items:center;border-radius:var(--nw-radius-pill);border:var(--nw-border-hairline) solid var(--nw-border-default);background:color-mix(in oklab,var(--nw-chrome-50) 4%,transparent);color:var(--nw-chrome-200)}
.nws-lead{padding:24px 20px 0}
.nws-lead .nws-d{margin-top:10px;font-size:34px}
.nws-date{display:grid;grid-template-columns:56px 1fr auto;gap:14px;align-items:center;padding:14px 0;border-top:var(--nw-border-hairline) solid var(--nw-border-subtle)}
.nws-day{text-align:center;padding:7px 0;border:var(--nw-border-hairline) solid var(--nw-border-subtle);border-radius:var(--nw-radius-md)}
.nws-day--first{border-color:color-mix(in oklab,var(--nw-flare-400) 55%,transparent);background:var(--nw-accent-tint);box-shadow:0 0 24px -8px var(--nw-flare-500)}
.nws-day .nws-mono{display:block;font-size:9px}
.nws-day--first .nws-mono{color:var(--nw-flare-400)}
.nws-day b{display:block;font-family:var(--nw-font-display);font-stretch:var(--nw-stretch-display);font-weight:var(--nw-fw-heavy);font-size:22px;line-height:.92}
.nws-date b.t{display:block;font-weight:var(--nw-fw-bold);font-size:15px}
.nws-date small{display:block;margin-top:3px;font-size:11px;color:var(--nw-text-muted)}
.nws-stackbtns{display:flex;flex-direction:column;gap:10px}
.nws-chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.nws-chip{display:inline-flex;align-items:center;gap:8px;height:36px;padding:0 14px;border:var(--nw-border-hairline) solid var(--nw-border-default);border-radius:var(--nw-radius-pill);font-size:12px}
.nws-chip svg{color:var(--nw-flare-400)}
.nws-prod{overflow:hidden}
.nws-prod--first{grid-column:1/-1;order:-1}
.nws-prod-photo{position:relative;display:grid;place-items:center;aspect-ratio:1.1;background:var(--nw-spread-tr),var(--nw-spread-bl),var(--nw-surface-sunken)}
.nws-prod--first .nws-prod-photo{aspect-ratio:16/6}
.nws-prod-body{padding:12px}
.nws-prod-body b{display:block;font-weight:var(--nw-fw-bold);font-size:15px;line-height:1.15}
.nws-prod--first .nws-prod-body b{font-size:19px}
.nws-prod-body small{display:block;margin-top:3px;font-size:11px;color:var(--nw-text-muted)}
.nws-prod-body footer{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:12px}
.nws-prod-body footer .nws-mono{color:var(--nw-flare-400);font-size:9px}
.nws-proof{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px;background:var(--nw-spread-bl),linear-gradient(180deg,color-mix(in oklab,var(--nw-chrome-50) 6%,transparent),color-mix(in oklab,var(--nw-chrome-50) 2%,transparent))}
.nws-proof b{display:block;margin-top:6px;font-weight:var(--nw-fw-bold);font-size:16px}
.nws-profile-head{position:relative;display:flex;flex-direction:column;align-items:center;gap:14px;padding:70px 20px 0;text-align:center}
.nws-portrait{display:grid;place-items:center;width:116px;height:116px;border-radius:50%;padding:2px;background:linear-gradient(150deg,var(--nw-flare-400),color-mix(in oklab,var(--nw-chrome-50) 10%,transparent) 40%,var(--nw-swell-300));box-shadow:0 0 40px -10px var(--nw-flare-500)}
.nws-portrait > span{display:grid;place-items:center;width:100%;height:100%;border-radius:50%;background:var(--nw-spread-tr),var(--nw-spread-bl),var(--nw-surface-sunken);font-family:var(--nw-font-display);font-stretch:var(--nw-stretch-display);font-weight:var(--nw-fw-heavy);font-size:40px;color:var(--nw-chrome-50)}
.nws-profile-head--cover{overflow:hidden;padding-top:56px}
.nws-profile-head--cover::after{content:'';position:absolute;inset:0;z-index:0;background:linear-gradient(180deg,color-mix(in oklab,var(--nw-surface-page) 35%,transparent),var(--nw-surface-page) 92%)}
.nws-profile-head--cover > *:not(.nws-profile-cover){position:relative;z-index:1}
.nws-profile-cover{object-fit:cover;z-index:0}
.nws-portrait-img{width:100%;height:100%;border-radius:50%;object-fit:cover}
.nws-profile-name{font-size:32px}
.nws-profile-head p{max-width:310px;font-size:15px;line-height:1.55;color:var(--nw-text-secondary)}
.nws-review{padding:18px}
.nws-review p{font-size:15px;line-height:1.5}
.nws-review .nws-mono{margin-top:12px;font-size:9px}
.nws-review .nws-mono span{color:var(--nw-chrome-50)}
.nws-list{margin-top:10px;overflow:hidden;padding:0 16px}
.nws-list a{display:flex;align-items:center;gap:14px;padding:14px 0}
.nws-list a + a{border-top:var(--nw-border-hairline) solid var(--nw-border-subtle)}
.nws-list a > span:nth-child(2){flex:1;min-width:0}
.nws-list b{display:block;font-weight:var(--nw-fw-bold);font-size:16px}
.nws-list small{display:block;font-size:12px;color:var(--nw-text-muted)}
.nws-sub{color:var(--nw-chrome-200)}
.nws-rating{display:inline-flex;align-items:center;gap:8px;font-size:13px;color:var(--nw-chrome-200)}
.nws-rating > span{display:inline-flex;gap:2px;color:var(--nw-flare-300)}
.nws-hero .nws-rating{margin-top:12px}
.nws-review .nws-rating{margin-bottom:12px;font-size:12px}
.nws-wide .nws-btn{background:var(--nw-chrome-50);color:var(--nw-ink-950);box-shadow:none}
`
