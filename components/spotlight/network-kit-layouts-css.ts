// The Network Theme Kit Spotlight layouts' stylesheet (components/spotlight/network-kit-layouts.tsx). Every colour,
// radius, shadow and face is a token from lib/theme/network-kit.ts (NETWORK_KIT_TOKENS_CSS), so a scheme change
// re-points the whole page and this file holds no literal colour. The faces read the kit's variables (set by the
// website's font class) with the named faces as the fallback, because a custom property that reads an unset next/font
// variable is invalid and a bare var() would then paint the browser default. Class prefix `nks-`.
export const NETWORK_KIT_LAYOUTS_CSS = `
.nks{position:relative;box-sizing:border-box;min-height:100%;padding-bottom:34px;background:var(--color-canvas);color:var(--color-text);font-family:var(--font-sans,'Outfit',system-ui,sans-serif);font-size:16px;line-height:1.4;container-type:inline-size}
.nks *,.nks *::before,.nks *::after{box-sizing:border-box}
:where(.nks) a{color:inherit;text-decoration:none}
.nks h1,.nks p{margin:0}
.nks-pad{padding:0 20px}
.nks-d{font-family:var(--font-display,'Bricolage Grotesque','Outfit',system-ui,sans-serif);font-weight:700;line-height:1;letter-spacing:-.035em;font-optical-sizing:auto}
.nks-d em{font-family:var(--font-accent,'Instrument Serif',Georgia,serif);font-style:italic;font-weight:400;letter-spacing:-.005em;color:inherit;padding-right:.04em}
.nks-eb{display:inline-flex;align-items:center;gap:10px;font-size:13px;font-weight:500;line-height:1.3;color:var(--color-text-muted)}
.nks-eb::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--color-accent);flex:none}
.nks-eb--media{color:var(--color-on-media)}
.nks-eb--ink{color:var(--color-on-ink-muted)}
.nks-eb--accent{color:var(--color-accent-strong)}
.nks-eb--pill{padding:6px 14px;font-size:14px;border-radius:var(--nk-radius-pill);background:var(--color-glass);color:var(--color-text)}
.nks-muted{color:var(--color-text-muted)}
.nks-subtle{color:var(--color-text-subtle)}
.nks-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:var(--nk-control-h);padding:0 26px;border:0;border-radius:var(--nk-radius-control);background:var(--color-accent);color:var(--color-text-on-accent);font:500 17px/1.2 var(--font-sans,'Outfit',system-ui,sans-serif);box-shadow:var(--nk-shadow-button);white-space:nowrap;cursor:pointer}
.nks-btn--lg{min-height:var(--nk-control-h-lg);padding:0 32px;font-size:18px;width:100%}
.nks-btn--sm{min-height:var(--nk-control-h-sm);padding:0 20px;font-size:15px}
.nks-btn--secondary{background:transparent;color:var(--color-text);box-shadow:inset 0 0 0 1px var(--color-border-strong)}
.nks-btn--inverse{background:var(--color-on-ink);color:var(--color-ink)}
.nks-seal{display:inline-flex;align-items:center;justify-content:center;flex:none;border-radius:32%;background:var(--color-surface);color:var(--color-text);box-shadow:var(--nk-shadow-sm)}
.nks-badge{display:inline-flex;align-items:center;min-height:28px;padding:0 12px;border-radius:var(--nk-radius-pill);background:var(--color-accent-bg);color:var(--color-accent-strong);font-size:13px;font-weight:500;white-space:nowrap}
.nks-name{display:flex;align-items:center;gap:12px}
.nks-name span{font-family:var(--font-display,'Bricolage Grotesque','Outfit',system-ui,sans-serif);font-weight:700;letter-spacing:-.035em;line-height:1}
.nks-name--media span{color:var(--color-on-media);text-shadow:0 1px 12px var(--color-scrim)}
.nks-mark{display:flex;align-items:center;justify-content:center;flex:none;border-radius:999px;background:var(--color-accent);color:var(--color-text-on-accent);box-shadow:0 0 0 3px var(--color-surface),0 0 0 4px var(--color-border)}
.nks-hero{position:relative;display:flex;align-items:flex-end;overflow:hidden;border-radius:0 0 var(--nk-radius-card) var(--nk-radius-card);box-shadow:var(--nk-shadow-md)}
.nks-hero--flat{border-radius:0;box-shadow:none}
.nks-hero img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.nks-hero::before{content:"";position:absolute;inset:0;z-index:1;background:var(--nk-gradient-media-protect),linear-gradient(180deg,var(--color-scrim),transparent 32%)}
.nks-hero-top{position:absolute;z-index:3;top:62px;left:20px;right:20px}
.nks-hero-body{position:relative;z-index:2;width:100%;padding:0 20px 28px}
.nks-hero h1{margin-top:14px;font-size:40px;line-height:1.02;color:var(--color-on-media);text-wrap:balance;text-shadow:0 1px 18px var(--color-scrim)}
.nks-stack-list{display:flex;flex-direction:column;gap:8px;padding:16px 20px 0}
.nks-door{display:flex;align-items:center;gap:14px;min-height:58px;padding:0 14px;border-radius:var(--nk-radius-card);background:var(--color-surface);box-shadow:var(--nk-shadow-sm)}
.nks-door > span:nth-child(2){flex:1;min-width:0}
.nks-door b{display:block;font-family:var(--font-display,'Bricolage Grotesque','Outfit',system-ui,sans-serif);font-weight:700;font-size:17px;letter-spacing:-.02em;line-height:1.15}
.nks-door small{display:block;font-size:13px;color:var(--color-text-muted)}
.nks-letter{border-radius:var(--nk-radius-card);background:var(--color-surface);padding:18px;box-shadow:var(--nk-shadow-sm)}
.nks-letter form{display:flex;gap:10px;align-items:flex-end;margin-top:12px}
.nks-input{flex:1;min-width:0;min-height:var(--nk-control-h-sm);padding:0 18px;border:0;border-radius:var(--nk-radius-field);background:var(--color-surface);color:var(--color-text);font:400 16px var(--font-sans,'Outfit',system-ui,sans-serif);box-shadow:inset 0 0 0 1px var(--color-border);outline:none}
.nks-foot{padding:22px 20px 24px;text-align:center}
.nks-foot--tight{padding-top:14px;padding-bottom:16px}
.nks-orn{display:flex;align-items:center;gap:16px;width:56%;margin:0 auto;color:var(--color-accent)}
.nks-orn::before,.nks-orn::after{content:"";flex:1;height:1px;background:var(--color-border)}
.nks-orn i{width:8px;height:8px;border-radius:50%;background:currentColor}
.nks-foot small{display:block;margin-top:12px;font-size:13px;color:var(--color-text-subtle)}
.nks-wall-head{display:flex;flex-direction:column;gap:10px;padding:66px 20px 0}
.nks-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px;padding:16px 20px 0}
.nks-card{display:flex;flex-direction:column;justify-content:space-between;aspect-ratio:1.34;padding:14px;border-radius:var(--nk-radius-card);background:var(--color-surface);box-shadow:var(--nk-shadow-sm)}
.nks-card b{display:block;font-family:var(--font-display,'Bricolage Grotesque','Outfit',system-ui,sans-serif);font-weight:700;font-size:18px;letter-spacing:-.025em;line-height:1.1}
.nks-card small{display:block;margin-top:4px;font-size:13px;color:var(--color-text-muted)}
.nks-card--wide{grid-column:1/-1;aspect-ratio:2.6/1;background:var(--color-ink);color:var(--color-on-ink);box-shadow:none}
.nks-card--wide b{font-size:22px}
.nks-card--wide small{font-size:12px;color:var(--color-on-ink-muted)}
.nks-card--auto{grid-column:1/-1;aspect-ratio:auto}
.nks-story-photo{position:relative;height:420px;overflow:hidden;display:flex;align-items:flex-end}
.nks-story-photo img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.nks-story-photo::before{content:"";position:absolute;inset:0;z-index:1;background:var(--nk-gradient-media-protect),linear-gradient(180deg,var(--color-scrim),transparent 32%)}
.nks-story-photo::after{content:"";position:absolute;inset:0;z-index:1;background-image:var(--nk-tg-grain);opacity:var(--nk-tg-grain-opacity);mix-blend-mode:multiply;pointer-events:none}
.nks-story-name{position:absolute;z-index:3;top:70px;left:20px}
.nks-story-text{position:relative;z-index:2;padding:0 20px 28px}
.nks-story-text h1{margin-top:10px;font-size:38px;line-height:1.03;color:var(--color-on-media)}
.nks-story-body{padding:26px 20px 0}
.nks-story-body p{font-size:17px;line-height:1.6}
.nks-links{display:flex;gap:18px;justify-content:center;flex-wrap:wrap;margin-top:16px;font-size:13px;color:var(--color-accent-strong)}
.nks-links a{text-decoration:underline;text-underline-offset:3px}
.nks-quote{margin-top:20px;padding-top:18px;border-top:1px solid var(--color-border)}
.nks-quote > div{padding:0 20px}
.nks-quote p{font-size:17px;line-height:1.25}
.nks-row-head{display:flex;justify-content:space-between;align-items:center;padding:66px 20px 0}
.nks-socials{display:flex;gap:8px}
.nks-iconbtn{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;background:var(--color-surface);box-shadow:inset 0 0 0 1px var(--color-border)}
.nks-iconbtn--lg{width:38px;height:38px}
.nks-date{display:grid;grid-template-columns:54px 1fr auto;gap:14px;align-items:center;padding:14px 0;border-top:1px solid var(--color-border)}
.nks-tile{text-align:center;padding:6px 0;border:1px solid var(--color-border);border-radius:var(--nk-radius-sm);background:var(--color-surface)}
.nks-tile--first{border-color:var(--color-accent);background:var(--color-accent-bg)}
.nks-tile--first .nks-eb{color:var(--color-accent-strong)}
.nks-tile b{display:block;font-family:var(--font-display,'Bricolage Grotesque','Outfit',system-ui,sans-serif);font-weight:700;font-size:20px;line-height:1.1}
.nks-date b.t{font-family:var(--font-display,'Bricolage Grotesque','Outfit',system-ui,sans-serif);font-weight:700;font-size:16px;letter-spacing:-.025em;line-height:1.15;display:block}
.nks-date small{display:block;margin-top:3px;font-size:13px;color:var(--color-text-muted)}
.nks-chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.nks-chip{display:inline-flex;align-items:center;gap:8px;height:36px;padding:0 12px;border-radius:var(--nk-radius-pill);background:var(--color-surface);box-shadow:inset 0 0 0 1px var(--color-border);font-size:12px}
.nks-chip svg{color:var(--color-accent-strong)}
.nks-prod{display:flex;flex-direction:column;overflow:hidden;border-radius:var(--nk-radius-card);background:var(--color-surface);box-shadow:var(--nk-shadow-sm)}
.nks-prod--first{grid-column:1/-1}
.nks-prod img{display:block;width:100%;aspect-ratio:1;object-fit:cover}
.nks-prod--first img{aspect-ratio:16/5}
.nks-prod > div{padding:10px}
.nks-prod b{display:block;font-family:var(--font-display,'Bricolage Grotesque','Outfit',system-ui,sans-serif);font-weight:700;font-size:15px;letter-spacing:-.025em;line-height:1.15}
.nks-prod--first b{font-size:20px}
.nks-prod small{display:block;margin-top:3px;font-size:13px;color:var(--color-text-muted)}
.nks-prod footer{display:flex;justify-content:space-between;align-items:center;margin-top:10px}
.nks-price{font-size:14px;font-weight:500}
.nks-gift{grid-column:1/-1;display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px;border-radius:var(--nk-radius-card);background:var(--color-accent-bg)}
.nks-gift b{display:block;margin-top:4px;font-family:var(--font-display,'Bricolage Grotesque','Outfit',system-ui,sans-serif);font-weight:700;font-size:18px;letter-spacing:-.025em;line-height:1.1}
.nks-profile-head{display:flex;flex-direction:column;align-items:center;gap:14px;padding:70px 20px 0;text-align:center}
.nks-portrait{width:112px;height:112px;border-radius:50%;overflow:hidden;box-shadow:var(--nk-shadow-sm),0 0 0 4px var(--color-surface),0 0 0 5px var(--color-border)}
.nks-portrait img{width:100%;height:100%;object-fit:cover}
.nks-profile-name{font-size:28px;line-height:1.05}
.nks-profile-head p{max-width:300px;font-size:15px;line-height:1.55;color:var(--color-text-muted)}
.nks-list{margin-top:8px;overflow:hidden;border-radius:var(--nk-radius-card);background:var(--color-surface);box-shadow:var(--nk-shadow-sm)}
.nks-list a{display:flex;align-items:center;gap:14px;padding:14px 16px}
.nks-list a + a{border-top:1px solid var(--color-border)}
.nks-list a svg:first-child{color:var(--color-accent-strong)}
.nks-list a > span{flex:1}
.nks-list b{display:block;font-family:var(--font-display,'Bricolage Grotesque','Outfit',system-ui,sans-serif);font-weight:700;font-size:16px;letter-spacing:-.02em}
.nks-list small{font-size:13px;color:var(--color-text-muted)}
`
