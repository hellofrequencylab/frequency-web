// The CyberWitch Kit Spotlight layouts' stylesheet (components/spotlight/cyberwitch-kit-layouts.tsx). Every colour, radius, shadow and
// face is a --cw-* token from lib/theme/cyberwitch.ts (CYBERWITCH_TOKENS_CSS and the accent presets), so an accent change re-points
// the whole page and this file holds no literal colour. Class prefix `cws-`. Tokens are scoped to [data-house-theme="cyberwitch"],
// which only the stand-alone render and the Spotlight page carry; nothing here styles a member, Space console or admin area.
// Dark only: there is no Day register.

export const CYBERWITCH_KIT_LAYOUTS_CSS = `
.cws{position:relative;box-sizing:border-box;min-height:100%;padding-bottom:34px;background:var(--cw-haze-top),var(--cw-surface-page);color:var(--cw-text-primary);font-family:var(--cw-font-body);font-size:16px;line-height:1.4;container-type:inline-size;overflow:hidden}
.cws *,.cws *::before,.cws *::after{box-sizing:border-box}
:where(.cws) a{color:inherit;text-decoration:none}
.cws h1,.cws p{margin:0}
.cws-pad{padding:0 20px}
.cws-d{font-family:var(--cw-font-gothic);font-stretch:100%;font-weight:700;text-transform:none;text-shadow:var(--cw-shadow-text);letter-spacing:var(--cw-ls-display);line-height:var(--cw-lh-display)}
.cws-d em{font-family:var(--cw-font-scrawl);font-style:normal;font-weight:400;font-stretch:100%;text-transform:uppercase;letter-spacing:.01em;font-size:.8em;line-height:.9;color:var(--cw-flare-400);text-shadow:0 0 1px var(--cw-flare-300),var(--cw-glow-text);display:inline-block;transform:rotate(-4deg);padding-right:.1em}
.cws-mono{font-family:var(--cw-font-caps);font-size:10px;letter-spacing:var(--cw-ls-label);text-transform:uppercase;color:var(--cw-text-muted)}
.cws-eb{display:flex;align-items:center;gap:8px;font-family:var(--cw-font-caps);font-size:10px;letter-spacing:var(--cw-ls-label);text-transform:uppercase;color:var(--cw-chrome-200)}
.cws-eb::before{content:"";width:5px;height:5px;border-radius:9px;background:var(--cw-flare-500);box-shadow:0 0 8px var(--cw-flare-500);flex:none}
.cws-eb--accent{color:var(--cw-flare-400)}
.cws-card{border:1px solid transparent;border-radius:var(--cw-plate-md);background:linear-gradient(180deg,color-mix(in oklab,var(--cw-chrome-50) 6%,transparent),color-mix(in oklab,var(--cw-chrome-50) 2%,transparent));box-shadow:0 30px 70px -40px color-mix(in oklab,var(--cw-flare-500) 35%,transparent),0 1px 0 color-mix(in oklab,var(--cw-chrome-50) 8%,transparent) inset}
.cws-btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:44px;padding:0 24px;border:0;border-radius:var(--cw-radius-pill);background:var(--cw-accent);color:var(--cw-on-accent);font:700 12px/1 var(--cw-font-caps);letter-spacing:var(--cw-ls-label);text-transform:uppercase;white-space:nowrap;cursor:pointer}
.cws-btn--accent{background:var(--cw-accent);color:var(--cw-on-accent);box-shadow:var(--cw-glow-md)}
.cws-btn--secondary{background:transparent;color:var(--cw-text-primary);box-shadow:inset 0 0 0 1px var(--cw-border-default)}
.cws-btn--lg{width:100%;min-height:52px;font-size:13px}
.cws-btn--sm{min-height:34px;padding:0 16px;font-size:11px}
.cws-tile{display:inline-flex;align-items:center;justify-content:center;flex:none;border-radius:var(--cw-plate-sm);background:var(--cw-accent-tint);color:var(--cw-flare-400);box-shadow:inset 0 0 0 1px var(--cw-border-subtle)}
.cws-badge{display:inline-flex;align-items:center;min-height:24px;padding:0 10px;border-radius:var(--cw-radius-pill);background:var(--cw-accent-tint);color:var(--cw-flare-400);font-family:var(--cw-font-caps);font-size:10px;letter-spacing:var(--cw-ls-label);text-transform:uppercase;white-space:nowrap}
.cws-name{display:flex;align-items:center;gap:12px;min-width:0}
.cws-name span:last-child{font-family:var(--cw-font-gothic);font-stretch:100%;font-weight:700;text-transform:none;letter-spacing:var(--cw-ls-display);line-height:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cws-mark{font-size:18px;display:grid;place-items:center;flex:none;border-radius:50%;background:radial-gradient(70% 70% at 30% 20%,color-mix(in oklab,var(--cw-flare-300) 35%,transparent),transparent 70%),var(--cw-ink-950);box-shadow:0 0 0 1px color-mix(in oklab,var(--cw-flare-300) 40%,transparent),0 0 22px -6px var(--cw-flare-500);color:var(--cw-chrome-50);font-family:var(--cw-font-gothic);font-stretch:100%;font-weight:700;line-height:1}
.cws-hero{position:relative;display:flex;align-items:flex-end;overflow:hidden;background:var(--cw-tex-mist),var(--cw-haze-bottom),var(--cw-surface-sunken);border-radius:0 0 var(--cw-plate-lg) var(--cw-plate-lg);isolation:isolate}
.cws-hero img,.cws-story-photo img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.cws-hero:not([data-photo])::before,.cws-story-photo:not([data-photo])::before{content:"";position:absolute;inset:0;z-index:0;background:repeating-linear-gradient(135deg,color-mix(in oklab,var(--cw-chrome-50) 4%,transparent) 0 1px,transparent 1px 14px)}
.cws-hero::after,.cws-story-photo::after{content:"";position:absolute;inset:0;z-index:1;background:linear-gradient(180deg,color-mix(in oklab,var(--cw-ink-950) 45%,transparent) 0%,transparent 30%),var(--cw-haze-bottom),var(--cw-tex-mist)}
.cws-hero-top{position:absolute;z-index:3;top:62px;left:20px;right:20px}
.cws-hero-body{position:relative;z-index:2;width:100%;padding:0 20px 26px}
.cws-hero h1{margin-top:12px;font-size:46px;color:var(--cw-chrome-50)}
.cws-stack-list{display:flex;flex-direction:column;gap:8px;padding:16px 20px 0}
.cws-door{display:flex;align-items:center;gap:14px;min-height:60px;padding:0 14px}
.cws-door > span:nth-child(2){flex:1;min-width:0}
.cws-door b{display:block;font-weight:700;font-size:16px;line-height:1.15}
.cws-door small{display:block;font-size:12px;color:var(--cw-text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cws-letter{padding:18px}
.cws-letter .cws-d{font-size:20px}
.cws-letter p{margin-top:6px;font-size:13px;color:var(--cw-text-muted)}
.cws-letter form{display:flex;gap:8px;margin-top:14px}
.cws-input{flex:1;min-width:0;height:38px;padding:0 14px;border:1px solid var(--cw-border-default);border-radius:var(--cw-radius-pill);background:color-mix(in oklab,var(--cw-chrome-50) 4%,transparent);color:var(--cw-text-primary);font:400 14px var(--cw-font-body);outline:none}
.cws-input:focus-visible{outline:2px solid var(--cw-accent);outline-offset:2px}
.cws-closing .cws-btn{width:100%;height:auto;min-height:52px;padding-block:14px;white-space:normal;text-align:center;line-height:1.25}
.cws-foot{display:flex;flex-direction:column;align-items:center;gap:12px;padding:22px 20px 26px}
.cws-foot i{display:block;width:60%;height:1px;background:linear-gradient(90deg,transparent,var(--cw-flare-500),transparent)}
.cws-wall-head{display:flex;flex-direction:column;gap:12px;padding:66px 20px 0}
.cws-wall-head .cws-d.big{font-size:34px}
.cws-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px;padding:18px 20px 0}
.cws-sq{display:flex;flex-direction:column;justify-content:space-between;aspect-ratio:1.25;padding:14px}
.cws-sq b{display:block;font-weight:700;font-size:16px;line-height:1.15}
.cws-sq small{display:block;margin-top:4px;font-size:11px;color:var(--cw-text-muted)}
.cws-wide{grid-column:1/-1;aspect-ratio:2.4/1;border-color:color-mix(in oklab,var(--cw-flare-400) 35%,transparent);background:var(--cw-tex-mist),linear-gradient(180deg,color-mix(in oklab,var(--cw-chrome-50) 6%,transparent),color-mix(in oklab,var(--cw-chrome-50) 2%,transparent))}
.cws-wide .cws-d{font-size:24px}
.cws-wide small{font-size:12px;color:var(--cw-chrome-200)}
.cws-span{grid-column:1/-1}
.cws-story-photo{position:relative;height:420px;overflow:hidden;display:flex;align-items:flex-end;background:var(--cw-tex-mist),var(--cw-haze-bottom),var(--cw-surface-sunken);isolation:isolate}
.cws-story-name{position:absolute;z-index:3;top:64px;left:20px;right:20px}
.cws-story-text{position:relative;z-index:2;padding:0 20px 26px}
.cws-story-text h1{margin-top:12px;font-size:46px;color:var(--cw-chrome-50)}
.cws-story-body{padding:24px 20px 0}
.cws-story-body p{font-size:17px;line-height:var(--cw-lh-body);color:var(--cw-text-secondary)}
.cws-links{display:flex;gap:18px;justify-content:center;flex-wrap:wrap;margin-top:16px;font-size:13px}
.cws-links a{color:var(--cw-flare-400);text-decoration:underline;text-underline-offset:3px}
.cws-quote{margin-top:22px;padding-top:20px;border-top:1px solid var(--cw-border-subtle)}
.cws-quote > div{padding:0 20px}
.cws-quote .cws-d{font-size:22px;line-height:1.15;text-wrap:balance}
.cws-quote .cws-mono{margin-top:12px}
.cws-quote .cws-mono span{color:var(--cw-chrome-50)}
.cws-row-head{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:66px 20px 0}
.cws-socials{display:flex;gap:8px}
.cws-iconbtn{display:grid;place-items:center;border-radius:var(--cw-radius-pill);border:1px solid var(--cw-border-default);background:color-mix(in oklab,var(--cw-chrome-50) 4%,transparent);color:var(--cw-chrome-200)}
.cws-lead{padding:24px 20px 0}
.cws-lead .cws-d{margin-top:10px;font-size:34px}
.cws-date{display:grid;grid-template-columns:56px 1fr auto;gap:14px;align-items:center;padding:14px 0;border-top:1px solid var(--cw-border-subtle)}
.cws-day{text-align:center;padding:7px 0;border:1px solid var(--cw-border-subtle);border-radius:var(--cw-plate-sm)}
.cws-day--first{border-color:color-mix(in oklab,var(--cw-flare-400) 55%,transparent);background:var(--cw-accent-tint);box-shadow:0 0 24px -8px var(--cw-flare-500)}
.cws-day .cws-mono{display:block;font-size:9px}
.cws-day--first .cws-mono{color:var(--cw-flare-400)}
.cws-day b{display:block;font-family:var(--cw-font-gothic);font-stretch:100%;font-weight:700;font-size:22px;line-height:.92}
.cws-date b.t{display:block;font-weight:700;font-size:15px}
.cws-date small{display:block;margin-top:3px;font-size:11px;color:var(--cw-text-muted)}
.cws-stackbtns{display:flex;flex-direction:column;gap:10px}
.cws-chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.cws-chip{display:inline-flex;align-items:center;gap:8px;height:36px;padding:0 14px;border:1px solid var(--cw-border-default);border-radius:var(--cw-radius-pill);font-size:12px}
.cws-chip svg{color:var(--cw-flare-400)}
.cws-prod{overflow:hidden}
.cws-prod--first{grid-column:1/-1;order:-1}
.cws-prod-photo{position:relative;display:grid;place-items:center;aspect-ratio:1.1;background:var(--cw-tex-mist),var(--cw-haze-bottom),var(--cw-surface-sunken)}
.cws-prod--first .cws-prod-photo{aspect-ratio:16/6}
.cws-prod-body{padding:12px}
.cws-prod-body b{display:block;font-weight:700;font-size:15px;line-height:1.15}
.cws-prod--first .cws-prod-body b{font-size:19px}
.cws-prod-body small{display:block;margin-top:3px;font-size:11px;color:var(--cw-text-muted)}
.cws-prod-body footer{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:12px}
.cws-prod-body footer .cws-mono{color:var(--cw-flare-400);font-size:9px}
.cws-proof{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px;background:var(--cw-haze-bottom),linear-gradient(180deg,color-mix(in oklab,var(--cw-chrome-50) 6%,transparent),color-mix(in oklab,var(--cw-chrome-50) 2%,transparent))}
.cws-proof b{display:block;margin-top:6px;font-weight:700;font-size:16px}
.cws-profile-head{position:relative;display:flex;flex-direction:column;align-items:center;gap:14px;padding:70px 20px 0;text-align:center}
.cws-portrait{display:grid;place-items:center;width:116px;height:116px;border-radius:50%;padding:2px;background:linear-gradient(150deg,var(--cw-flare-400),color-mix(in oklab,var(--cw-chrome-50) 10%,transparent) 40%,var(--cw-flare-300));box-shadow:0 0 40px -10px var(--cw-flare-500)}
.cws-portrait > span{display:grid;place-items:center;width:100%;height:100%;border-radius:50%;background:var(--cw-tex-mist),var(--cw-haze-bottom),var(--cw-surface-sunken);font-family:var(--cw-font-gothic);font-stretch:100%;font-weight:700;font-size:40px;color:var(--cw-chrome-50)}
.cws-profile-name{font-size:32px}
.cws-profile-head p{max-width:310px;font-size:15px;line-height:1.55;color:var(--cw-text-secondary)}
.cws-review{padding:18px}
.cws-review p{font-size:15px;line-height:1.5}
.cws-review .cws-mono{margin-top:12px;font-size:9px}
.cws-review .cws-mono span{color:var(--cw-chrome-50)}
.cws-list{margin-top:10px;overflow:hidden;padding:0 16px}
.cws-list a{display:flex;align-items:center;gap:14px;padding:14px 0}
.cws-list a + a{border-top:1px solid var(--cw-border-subtle)}
.cws-list a > span:nth-child(2){flex:1;min-width:0}
.cws-list b{display:block;font-weight:700;font-size:16px}
.cws-list small{display:block;font-size:12px;color:var(--cw-text-muted)}
.cws-sub{color:var(--cw-chrome-200)}
`
