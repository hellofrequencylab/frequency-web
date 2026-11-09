// The Services Kit Spotlight layouts' stylesheet (components/spotlight/services-kit-layouts.tsx). Every colour,
// radius, shadow and face is a --sv-* token from lib/theme/services.ts (SERVICES_TOKENS_CSS, and SERVICES_DAY_CSS for
// the Day register), so an accent or register change re-points the whole page and this file holds no literal colour.
// The only hex values that reach the page are the owner accent presets, emitted below from SERVICES_ACCENTS. Class
// prefix `svs-`. Tokens are scoped to [data-house-theme="services"], which only the stand-alone render and the
// Spotlight page carry; nothing here styles a member, Space console or admin area.
import { SERVICES_ACCENTS } from '@/lib/theme/services'

/** One block per owner accent preset and register: the flare ramp, the swell and halo mid steps. On Day the light flare steps take the
 *  preset's deep step, the way the design's record.js apply() does, so accent text keeps its contrast on the cream surface. */
export const SERVICES_ACCENT_CSS = Object.entries(SERVICES_ACCENTS)
  .map(([id, a]) => {
    const night = `[data-house-theme="services"][data-accent="${id}"]:not([data-th="day"]){--sv-flare-300:${a.deep};--sv-flare-400:${a.text};--sv-flare-500:${a.accent};--sv-flare-600:${a.hover};--sv-flare-700:${a.soft};--sv-swell-500:${a.glow2};--sv-halo-500:${a.glow3}}`
    const day = `[data-house-theme="services"][data-accent="${id}"][data-th="day"]{--sv-flare-300:${a.soft};--sv-flare-400:${a.soft};--sv-flare-500:${a.accent};--sv-flare-600:${a.hover};--sv-flare-700:${a.soft};--sv-swell-500:${a.glow2};--sv-halo-500:${a.glow3}}`
    return night + '\n' + day
  })
  .join('\n')

export const SERVICES_KIT_LAYOUTS_CSS = `
.svs{position:relative;box-sizing:border-box;min-height:100%;padding-bottom:34px;background:var(--sv-spread-top),var(--sv-surface-page);color:var(--sv-text-primary);font-family:var(--sv-font-body);font-size:16px;line-height:1.4;container-type:inline-size;overflow:hidden}
.svs *,.svs *::before,.svs *::after{box-sizing:border-box}
:where(.svs) a{color:inherit;text-decoration:none}
.svs h1,.svs p{margin:0}
.svs-pad{padding:0 20px}
.svs-d{font-family:var(--sv-font-display);font-stretch:var(--sv-stretch-display);font-weight:var(--sv-fw-heavy);text-transform:uppercase;letter-spacing:var(--sv-ls-display);line-height:var(--sv-lh-display)}
.svs-d em{font-family:var(--sv-font-accent);font-style:italic;font-weight:var(--sv-fw-regular);font-stretch:100%;text-transform:none;letter-spacing:-.01em;font-size:1.04em;line-height:.8;color:var(--sv-flare-300);padding-right:.1em}
.svs-mono{font-family:var(--sv-font-mono);font-size:10px;letter-spacing:var(--sv-ls-mono);text-transform:uppercase;color:var(--sv-text-muted)}
.svs-eb{display:flex;align-items:center;gap:8px;font-family:var(--sv-font-mono);font-size:10px;letter-spacing:var(--sv-ls-mono);text-transform:uppercase;color:var(--sv-chrome-200)}
.svs-eb::before{content:"";width:5px;height:5px;border-radius:9px;background:var(--sv-flare-500);box-shadow:0 0 8px var(--sv-flare-500);flex:none}
.svs-eb--accent{color:var(--sv-flare-400)}
.svs-card{border:var(--sv-border-hairline) solid transparent;border-radius:var(--sv-radius-lg);background:linear-gradient(180deg,color-mix(in oklab,var(--sv-chrome-50) 6%,transparent),color-mix(in oklab,var(--sv-chrome-50) 2%,transparent));box-shadow:0 30px 70px -40px color-mix(in oklab,var(--sv-flare-500) 35%,transparent),0 1px 0 color-mix(in oklab,var(--sv-chrome-50) 8%,transparent) inset}
.svs-btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:44px;padding:0 24px;border:0;border-radius:var(--sv-radius-pill);background:var(--sv-action-primary);color:var(--sv-action-primary-text);font:var(--sv-fw-bold) 12px/1 var(--sv-font-mono);letter-spacing:var(--sv-ls-button);text-transform:uppercase;white-space:nowrap;cursor:pointer}
.svs-btn--accent{background:var(--sv-accent);color:var(--sv-accent-text);box-shadow:var(--sv-shadow-glow)}
.svs-btn--secondary{background:transparent;color:var(--sv-text-primary);box-shadow:inset 0 0 0 1px var(--sv-border-default)}
.svs-btn--lg{width:100%;min-height:52px;font-size:13px}
.svs-btn--sm{min-height:34px;padding:0 16px;font-size:11px}
.svs-tile{display:inline-flex;align-items:center;justify-content:center;flex:none;border-radius:var(--sv-radius-md);background:var(--sv-accent-tint);color:var(--sv-flare-400);box-shadow:inset 0 0 0 1px var(--sv-border-subtle)}
.svs-badge{display:inline-flex;align-items:center;min-height:24px;padding:0 10px;border-radius:var(--sv-radius-pill);background:var(--sv-accent-tint);color:var(--sv-flare-400);font-family:var(--sv-font-mono);font-size:10px;letter-spacing:var(--sv-ls-mono);text-transform:uppercase;white-space:nowrap}
.svs-name{display:flex;align-items:center;gap:12px;min-width:0}
.svs-name span:last-child{font-family:var(--sv-font-display);font-stretch:var(--sv-stretch-display);font-weight:var(--sv-fw-heavy);text-transform:uppercase;letter-spacing:var(--sv-ls-display);line-height:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.svs-mark{font-size:18px;display:grid;place-items:center;flex:none;border-radius:50%;background:radial-gradient(70% 70% at 30% 20%,color-mix(in oklab,var(--sv-flare-300) 35%,transparent),transparent 70%),var(--sv-ink-950);box-shadow:0 0 0 1px color-mix(in oklab,var(--sv-flare-300) 40%,transparent),0 0 22px -6px var(--sv-flare-500);color:var(--sv-chrome-50);font-family:var(--sv-font-display);font-stretch:var(--sv-stretch-display);font-weight:var(--sv-fw-heavy);line-height:1}
.svs-hero{position:relative;display:flex;align-items:flex-end;overflow:hidden;background:var(--sv-spread-tr),var(--sv-spread-bl),var(--sv-surface-sunken);border-radius:0 0 var(--sv-radius-xl) var(--sv-radius-xl);isolation:isolate}
.svs-hero img,.svs-story-photo img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.svs-hero:not([data-photo])::before,.svs-story-photo:not([data-photo])::before{content:"";position:absolute;inset:0;z-index:0;background:repeating-linear-gradient(135deg,color-mix(in oklab,var(--sv-chrome-50) 4%,transparent) 0 1px,transparent 1px 14px)}
.svs-hero::after,.svs-story-photo::after{content:"";position:absolute;inset:0;z-index:1;background:linear-gradient(180deg,color-mix(in oklab,var(--sv-ink-950) 45%,transparent) 0%,transparent 30%),var(--sv-overlay-bottom),var(--sv-glow-sunset)}
.svs-hero-top{position:absolute;z-index:3;top:62px;left:20px;right:20px}
.svs-hero-body{position:relative;z-index:2;width:100%;padding:0 20px 26px}
.svs-hero h1{margin-top:12px;font-size:46px;color:var(--sv-chrome-50)}
.svs-stack-list{display:flex;flex-direction:column;gap:8px;padding:16px 20px 0}
.svs-door{display:flex;align-items:center;gap:14px;min-height:60px;padding:0 14px}
.svs-door > span:nth-child(2){flex:1;min-width:0}
.svs-door b{display:block;font-weight:var(--sv-fw-bold);font-size:16px;line-height:1.15}
.svs-door small{display:block;font-size:12px;color:var(--sv-text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.svs-letter{padding:18px}
.svs-letter .svs-d{font-size:20px}
.svs-letter p{margin-top:6px;font-size:13px;color:var(--sv-text-muted)}
.svs-letter form{display:flex;gap:8px;margin-top:14px}
.svs-input{flex:1;min-width:0;height:38px;padding:0 14px;border:var(--sv-border-hairline) solid var(--sv-border-default);border-radius:var(--sv-radius-pill);background:color-mix(in oklab,var(--sv-chrome-50) 4%,transparent);color:var(--sv-text-primary);font:var(--sv-fw-regular) 14px var(--sv-font-body);outline:none}
.svs-input:focus-visible{outline:2px solid var(--sv-focus-ring);outline-offset:2px}
.svs-foot{display:flex;flex-direction:column;align-items:center;gap:12px;padding:22px 20px 26px}
.svs-foot i{display:block;width:60%;height:1px;background:linear-gradient(90deg,transparent,var(--sv-flare-500),transparent)}
.svs-wall-head{display:flex;flex-direction:column;gap:12px;padding:66px 20px 0}
.svs-wall-head .svs-d.big{font-size:34px}
.svs-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px;padding:18px 20px 0}
.svs-sq{display:flex;flex-direction:column;justify-content:space-between;aspect-ratio:1.25;padding:14px}
.svs-sq b{display:block;font-weight:var(--sv-fw-bold);font-size:16px;line-height:1.15}
.svs-sq small{display:block;margin-top:4px;font-size:11px;color:var(--sv-text-muted)}
.svs-wide{grid-column:1/-1;aspect-ratio:2.4/1;border-color:color-mix(in oklab,var(--sv-flare-400) 35%,transparent);background:var(--sv-spread-tr),linear-gradient(180deg,color-mix(in oklab,var(--sv-chrome-50) 6%,transparent),color-mix(in oklab,var(--sv-chrome-50) 2%,transparent))}
.svs-wide .svs-d{font-size:24px}
.svs-wide small{font-size:12px;color:var(--sv-chrome-200)}
.svs-span{grid-column:1/-1}
.svs-story-photo{position:relative;height:420px;overflow:hidden;display:flex;align-items:flex-end;background:var(--sv-spread-tr),var(--sv-spread-bl),var(--sv-surface-sunken);isolation:isolate}
.svs-story-name{position:absolute;z-index:3;top:64px;left:20px;right:20px}
.svs-story-text{position:relative;z-index:2;padding:0 20px 26px}
.svs-story-text h1{margin-top:12px;font-size:46px;color:var(--sv-chrome-50)}
.svs-story-body{padding:24px 20px 0}
.svs-story-body p{font-size:17px;line-height:var(--sv-lh-body);color:var(--sv-text-secondary)}
.svs-links{display:flex;gap:18px;justify-content:center;flex-wrap:wrap;margin-top:16px;font-size:13px}
.svs-links a{color:var(--sv-flare-400);text-decoration:underline;text-underline-offset:3px}
.svs-quote{margin-top:22px;padding-top:20px;border-top:var(--sv-border-hairline) solid var(--sv-border-subtle)}
.svs-quote > div{padding:0 20px}
.svs-quote .svs-d{font-size:22px;line-height:1.15;text-transform:uppercase;text-wrap:balance}
.svs-quote .svs-mono{margin-top:12px}
.svs-quote .svs-mono span{color:var(--sv-chrome-50)}
.svs-row-head{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:66px 20px 0}
.svs-socials{display:flex;gap:8px}
.svs-iconbtn{display:grid;place-items:center;border-radius:var(--sv-radius-pill);border:var(--sv-border-hairline) solid var(--sv-border-default);background:color-mix(in oklab,var(--sv-chrome-50) 4%,transparent);color:var(--sv-chrome-200)}
.svs-lead{padding:24px 20px 0}
.svs-lead .svs-d{margin-top:10px;font-size:34px}
.svs-date{display:grid;grid-template-columns:56px 1fr auto;gap:14px;align-items:center;padding:14px 0;border-top:var(--sv-border-hairline) solid var(--sv-border-subtle)}
.svs-day{text-align:center;padding:7px 0;border:var(--sv-border-hairline) solid var(--sv-border-subtle);border-radius:var(--sv-radius-md)}
.svs-day--first{border-color:color-mix(in oklab,var(--sv-flare-400) 55%,transparent);background:var(--sv-accent-tint);box-shadow:0 0 24px -8px var(--sv-flare-500)}
.svs-day .svs-mono{display:block;font-size:9px}
.svs-day--first .svs-mono{color:var(--sv-flare-400)}
.svs-day b{display:block;font-family:var(--sv-font-display);font-stretch:var(--sv-stretch-display);font-weight:var(--sv-fw-heavy);font-size:22px;line-height:.92}
.svs-date b.t{display:block;font-weight:var(--sv-fw-bold);font-size:15px}
.svs-date small{display:block;margin-top:3px;font-size:11px;color:var(--sv-text-muted)}
.svs-stackbtns{display:flex;flex-direction:column;gap:10px}
.svs-chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.svs-chip{display:inline-flex;align-items:center;gap:8px;height:36px;padding:0 14px;border:var(--sv-border-hairline) solid var(--sv-border-default);border-radius:var(--sv-radius-pill);font-size:12px}
.svs-chip svg{color:var(--sv-flare-400)}
.svs-prod{overflow:hidden}
.svs-prod--first{grid-column:1/-1;order:-1}
.svs-prod-photo{position:relative;display:grid;place-items:center;aspect-ratio:1.1;background:var(--sv-spread-tr),var(--sv-spread-bl),var(--sv-surface-sunken)}
.svs-prod--first .svs-prod-photo{aspect-ratio:16/6}
.svs-prod-body{padding:12px}
.svs-prod-body b{display:block;font-weight:var(--sv-fw-bold);font-size:15px;line-height:1.15}
.svs-prod--first .svs-prod-body b{font-size:19px}
.svs-prod-body small{display:block;margin-top:3px;font-size:11px;color:var(--sv-text-muted)}
.svs-prod-body footer{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:12px}
.svs-prod-body footer .svs-mono{color:var(--sv-flare-400);font-size:9px}
.svs-proof{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px;background:var(--sv-spread-bl),linear-gradient(180deg,color-mix(in oklab,var(--sv-chrome-50) 6%,transparent),color-mix(in oklab,var(--sv-chrome-50) 2%,transparent))}
.svs-proof b{display:block;margin-top:6px;font-weight:var(--sv-fw-bold);font-size:16px}
.svs-profile-head{position:relative;display:flex;flex-direction:column;align-items:center;gap:14px;padding:70px 20px 0;text-align:center}
.svs-portrait{display:grid;place-items:center;width:116px;height:116px;border-radius:50%;padding:2px;background:linear-gradient(150deg,var(--sv-flare-400),color-mix(in oklab,var(--sv-chrome-50) 10%,transparent) 40%,var(--sv-swell-300));box-shadow:0 0 40px -10px var(--sv-flare-500)}
.svs-portrait > span{display:grid;place-items:center;width:100%;height:100%;border-radius:50%;background:var(--sv-spread-tr),var(--sv-spread-bl),var(--sv-surface-sunken);font-family:var(--sv-font-display);font-stretch:var(--sv-stretch-display);font-weight:var(--sv-fw-heavy);font-size:40px;color:var(--sv-chrome-50)}
.svs-profile-name{font-size:32px}
.svs-profile-head p{max-width:310px;font-size:15px;line-height:1.55;color:var(--sv-text-secondary)}
.svs-review{padding:18px}
.svs-review p{font-size:15px;line-height:1.5}
.svs-review .svs-mono{margin-top:12px;font-size:9px}
.svs-review .svs-mono span{color:var(--sv-chrome-50)}
.svs-list{margin-top:10px;overflow:hidden;padding:0 16px}
.svs-list a{display:flex;align-items:center;gap:14px;padding:14px 0}
.svs-list a + a{border-top:var(--sv-border-hairline) solid var(--sv-border-subtle)}
.svs-list a > span:nth-child(2){flex:1;min-width:0}
.svs-list b{display:block;font-weight:var(--sv-fw-bold);font-size:16px}
.svs-list small{display:block;font-size:12px;color:var(--sv-text-muted)}
.svs-sub{color:var(--sv-chrome-200)}
`
