// The Designer Theme Kit Spotlight layouts' stylesheet (components/spotlight/designer-kit-layouts.tsx). Every colour,
// radius, shadow and face is a token from lib/theme/designer.ts (DESIGNER_TOKENS_CSS, scoped to data-house-theme="designer"),
// so this file holds no literal colour. The profile's accent ramp comes from designerKitAccentCss below, one rule for the one
// profile on the page. The faces read the kit's variables (set by the website's font class) with the named faces as the
// fallback, because a custom property that reads an unset next/font variable is invalid and a bare var() would then paint
// the browser default. Class prefix `dzs-`.
export const DESIGNER_KIT_LAYOUTS_CSS = `
.dzs{position:relative;box-sizing:border-box;min-height:100vh;background:var(--dz-plaster-tex),var(--color-canvas);color:var(--color-text);font-family:var(--dz-sans,'Jost',Futura,'Century Gothic',system-ui,sans-serif);font-size:16px;line-height:1.4}
.dzs *,.dzs *::before,.dzs *::after{box-sizing:border-box}
.dzs-col{max-width:36rem;margin:0 auto;padding-bottom:34px}
:where(.dzs) a{color:inherit;text-decoration:none}
.dzs h1,.dzs p{margin:0}
.dzs a:focus-visible,.dzs button:focus-visible,.dzs input:focus-visible{outline:2px solid var(--color-focus-ring);outline-offset:2px}
.dzs-pad{padding:0 20px}
.dzs-d{font-family:var(--dz-display,'Cormorant','Cormorant Garamond',Georgia,serif);font-weight:var(--weight-display,400);line-height:1.15;letter-spacing:var(--dz-tracking-display,-.01em);text-wrap:balance}
.dzs-d em{font-style:italic;color:inherit}
.dzs-eb{display:block;font-size:10px;font-weight:500;line-height:1.2;letter-spacing:.22em;text-transform:uppercase;color:var(--color-accent-strong)}
.dzs-eb--hero{font-size:11px;color:var(--dz-sand)}
.dzs-eb--media{color:var(--color-on-media)}
.dzs-eb--ink{color:var(--color-on-ink-muted)}
.dzs-eb--tiny{font-size:9px}
.dzs-eb b{font-weight:500;color:var(--color-text)}
.dzs-btn{display:inline-flex;align-items:center;justify-content:center;gap:14px;min-height:50px;padding:0 28px;border:1px solid transparent;border-radius:var(--dz-r-1);background:var(--color-ink);color:var(--color-on-ink);font:500 13px/1 var(--dz-sans,'Jost',Futura,'Century Gothic',system-ui,sans-serif);letter-spacing:var(--dz-tracking-button,.16em);text-transform:uppercase;box-shadow:var(--dz-shadow-btn);white-space:nowrap;cursor:pointer}
.dzs-btn--lg{min-height:58px;padding:0 36px;font-size:14px;width:100%}
.dzs-btn--sm{min-height:40px;padding:0 20px;font-size:12px}
.dzs-btn--secondary{background:var(--dz-wash);color:var(--color-text);border-color:var(--color-ink);box-shadow:inset 0 1px 0 var(--dz-wash)}
.dzs-btn--inverse{background:var(--dz-plaster);color:var(--dz-charcoal);box-shadow:var(--dz-shadow-inverse)}
.dzs-btn--ink{background:var(--color-on-ink);color:var(--color-ink);border-color:var(--color-on-ink);box-shadow:none}
.dzs-seal{position:relative;display:inline-grid;place-items:center;flex:none;border:1px solid var(--color-accent);border-radius:999px;background:var(--color-surface-elevated);color:var(--color-accent-strong);box-shadow:var(--dz-shadow-1)}
.dzs-badge{display:inline-flex;align-items:center;height:26px;padding:0 12px;border:1px solid currentColor;border-radius:var(--dz-r-pill);color:var(--color-accent-strong);font-size:11px;font-weight:500;letter-spacing:.16em;text-transform:uppercase;white-space:nowrap}
.dzs-name{display:flex;align-items:center;gap:12px}
.dzs-name span{font-family:var(--dz-display,'Cormorant','Cormorant Garamond',Georgia,serif);font-weight:var(--weight-display,400);line-height:1.15;letter-spacing:var(--dz-tracking-display,-.01em)}
.dzs-name--media span{color:var(--color-on-media)}
.dzs-mark{position:relative;display:flex;align-items:center;justify-content:center;flex:none;border-radius:999px;background:var(--color-accent-soft);color:var(--color-accent-strong)}
.dzs-mark::before{content:"";position:absolute;inset:-4px;border:1px solid var(--color-accent);border-radius:999px;opacity:.5}
.dzs-hero{position:relative;display:flex;align-items:flex-end;overflow:hidden;background:var(--color-ink);border-radius:0 0 var(--dz-r-3) var(--dz-r-3)}
.dzs-hero img,.dzs-story-photo img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.dzs-hero::before,.dzs-story-photo::before{content:"";position:absolute;inset:0;z-index:1;background:var(--dz-scrim-header),var(--dz-scrim-card)}
.dzs-hero-top{position:absolute;z-index:3;top:62px;left:20px;right:20px}
.dzs-hero-body{position:relative;z-index:2;width:100%;padding:0 20px 28px}
.dzs-hero h1,.dzs-story-text h1{margin-top:12px;font-size:38px;line-height:1.04;color:var(--color-on-media)}
.dzs-hero h1 em{color:var(--color-on-media-accent)}
.dzs-hero .dzs-btn{margin-top:22px}
.dzs-stack-list{display:flex;flex-direction:column;gap:8px;padding:16px 20px 0}
.dzs-door{display:flex;align-items:center;gap:14px;min-height:58px;padding:0 14px;border:1px solid var(--color-border);border-radius:var(--radius-card);background:var(--color-surface);box-shadow:var(--shadow-card)}
.dzs-door > span:nth-child(2){flex:1;min-width:0}
.dzs-door b{display:block;font-family:var(--dz-display,'Cormorant','Cormorant Garamond',Georgia,serif);font-weight:var(--weight-display,400);font-size:17px;line-height:1.15}
.dzs-door small{display:block;font-size:11px;color:var(--color-text-muted)}
.dzs-letter{border:1px solid var(--color-border);border-radius:var(--radius-card);background:var(--color-surface);padding:18px;box-shadow:var(--shadow-card)}
.dzs-letter form{display:flex;gap:10px;align-items:flex-end;margin-top:12px}
.dzs-field{flex:1;min-width:0}
.dzs-field label{display:block;margin-bottom:8px;font-size:12px;font-weight:500;letter-spacing:.16em;text-transform:uppercase;color:var(--color-text)}
.dzs-input{width:100%;height:52px;padding:0 16px;border:1px solid var(--color-border);border-radius:var(--dz-r-1);background:var(--dz-paper);color:var(--color-text);font:400 17px var(--dz-sans,'Jost',Futura,'Century Gothic',system-ui,sans-serif);box-shadow:var(--dz-shadow-inset);outline:none}
.dzs-foot{padding:14px 20px 16px;text-align:center}
.dzs-orn{display:flex;align-items:center;gap:16px;width:56%;margin:0 auto;color:var(--color-accent)}
.dzs-orn::before{content:"";flex:1;height:1px;background:linear-gradient(90deg,transparent,var(--color-border))}
.dzs-orn::after{content:"";flex:1;height:1px;background:linear-gradient(270deg,transparent,var(--color-border))}
.dzs-orn i{font-style:normal;font-weight:300;font-size:20px;line-height:.6}
.dzs-foot small{display:block;margin-top:12px;font-size:9px;font-weight:500;letter-spacing:.22em;text-transform:uppercase;color:var(--color-text-subtle)}
.dzs-wall-head{display:flex;flex-direction:column;gap:10px;padding:66px 20px 0}
.dzs-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px;padding:16px 20px 0}
.dzs-card{display:flex;flex-direction:column;justify-content:space-between;aspect-ratio:1.34;padding:14px;border:1px solid var(--color-border);border-radius:var(--radius-card);background:var(--color-surface);box-shadow:var(--shadow-card)}
.dzs-card > .dzs-seal{align-self:center}
.dzs-card b{display:block;font-family:var(--dz-display,'Cormorant','Cormorant Garamond',Georgia,serif);font-weight:var(--weight-display,400);font-size:18px;line-height:1.1}
.dzs-card small{display:block;margin-top:4px;font-size:11px;color:var(--color-text-muted)}
.dzs-card--wide{grid-column:1/-1;aspect-ratio:2.6/1;border:0;background:var(--color-ink);color:var(--color-on-ink)}
.dzs-card--wide b{font-size:22px;line-height:1.1}
.dzs-card--wide small{margin-top:4px;font-size:12px;color:var(--color-on-ink-muted)}
.dzs-card--wide .dzs-btn{align-self:flex-start}
.dzs-card--auto{grid-column:1/-1;aspect-ratio:auto}
.dzs-card--auto .dzs-d{font-size:16px}
.dzs-card--auto form{display:flex;gap:10px;align-items:flex-end;margin-top:10px}
.dzs-story-photo{position:relative;height:420px;overflow:hidden;display:flex;align-items:flex-end;isolation:isolate}
.dzs-story-photo img{object-position:50% 100%}
.dzs-story-photo::after{content:"";position:absolute;inset:0;z-index:1;pointer-events:none;opacity:.07;background-image:var(--dz-grain-light)}
.dzs-story-name{position:absolute;z-index:3;top:70px;left:20px}
.dzs-story-text{position:relative;z-index:2;width:100%;padding:0 20px 28px}
.dzs-story-text h1{margin-top:10px;line-height:1.03}
.dzs-story-text h1 em{color:var(--color-on-media-accent)}
.dzs-story-body{padding:26px 20px 0}
.dzs-story-body p{font-size:17px;line-height:1.6}
.dzs-story-body .dzs-btn{margin-top:18px}
.dzs-links{display:flex;gap:18px;justify-content:center;flex-wrap:wrap;margin-top:16px;font-size:13px;color:var(--color-accent-strong)}
.dzs-links a{text-decoration:underline;text-underline-offset:3px}
.dzs-quote{margin-top:20px;padding-top:18px;border-top:1px solid var(--color-border)}
.dzs-quote > div{padding:0 20px}
.dzs-quote p{font-size:17px;line-height:1.25}
.dzs-quote .dzs-eb{margin-top:10px}
.dzs-row-head{display:flex;justify-content:space-between;align-items:center;padding:66px 20px 0}
.dzs-socials{display:flex;gap:8px}
.dzs-iconbtn{display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--color-border);border-radius:var(--dz-r-pill);color:var(--color-text)}
.dzs-intro{padding:22px 20px 0}
.dzs-intro .dzs-d{margin-top:8px;font-size:28px;line-height:1.05}
.dzs-dates{display:flex;flex-direction:column;padding:16px 20px 0}
.dzs-date{display:grid;grid-template-columns:54px 1fr auto;gap:14px;align-items:center;padding:14px 0;border-top:1px solid var(--color-border)}
.dzs-tile{text-align:center;padding:6px 0;border:1px solid var(--color-border);border-radius:var(--dz-r-1);background:var(--color-surface)}
.dzs-tile--first{border-color:var(--color-accent);background:var(--color-accent-bg)}
.dzs-tile b{display:block;font-family:var(--dz-display,'Cormorant','Cormorant Garamond',Georgia,serif);font-weight:var(--weight-display,400);font-size:20px;line-height:1.15}
.dzs-date b.t{display:block;font-family:var(--dz-display,'Cormorant','Cormorant Garamond',Georgia,serif);font-weight:var(--weight-display,400);font-size:16px;line-height:1.15}
.dzs-date small{display:block;margin-top:3px;font-size:11px;color:var(--color-text-muted)}
.dzs-chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.dzs-chip{display:inline-flex;align-items:center;gap:8px;height:36px;padding:0 12px;border:1px solid var(--color-border);border-radius:var(--dz-r-pill);background:var(--color-surface);font-size:12px}
.dzs-chip svg{color:var(--color-accent-strong)}
.dzs-prod{display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--color-border);border-radius:var(--radius-card);background:var(--color-surface);box-shadow:var(--shadow-card)}
.dzs-prod--first{grid-column:1/-1}
.dzs-prod-img{position:relative;aspect-ratio:1;background:var(--color-surface-hover)}
.dzs-prod--first .dzs-prod-img{aspect-ratio:16/5}
.dzs-prod-img img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.dzs-prod-body{padding:10px}
.dzs-prod b{display:block;font-family:var(--dz-display,'Cormorant','Cormorant Garamond',Georgia,serif);font-weight:var(--weight-display,400);font-size:15px;line-height:1.15}
.dzs-prod--first b{font-size:20px}
.dzs-prod small{display:block;margin-top:3px;font-size:11px;color:var(--color-text-muted)}
.dzs-prod footer{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:10px}
.dzs-price{font-size:14px;letter-spacing:.02em;font-variant-numeric:tabular-nums lining-nums}
.dzs-gift{grid-column:1/-1;display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px;border:1px solid var(--color-border);border-radius:var(--radius-card);background:var(--color-accent-bg)}
.dzs-gift b{display:block;margin-top:4px;font-family:var(--dz-display,'Cormorant','Cormorant Garamond',Georgia,serif);font-weight:var(--weight-display,400);font-size:18px;line-height:1.15}
.dzs-gift .dzs-eb{color:var(--color-accent-strong)}
.dzs-profile-head{display:flex;flex-direction:column;align-items:center;gap:14px;padding:70px 20px 0;text-align:center}
.dzs-portrait{position:relative;width:112px;height:112px;border-radius:50%;overflow:hidden;box-shadow:var(--shadow-card),0 0 0 4px var(--color-surface),0 0 0 5px var(--color-border)}
.dzs-portrait img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.dzs-profile-name{font-size:28px;line-height:1.05}
.dzs-profile-head p{max-width:300px;font-size:15px;line-height:1.55;color:var(--color-text-muted)}
.dzs-list{margin-top:8px;overflow:hidden;border:1px solid var(--color-border);border-radius:var(--radius-card);background:var(--color-surface);box-shadow:var(--shadow-card)}
.dzs-list a{display:flex;align-items:center;gap:14px;padding:14px 16px}
.dzs-list a + a{border-top:1px solid var(--color-border)}
.dzs-list a > svg:first-child{color:var(--color-accent)}
.dzs-list a > span{flex:1}
.dzs-list b{display:block;font-family:var(--dz-display,'Cormorant','Cormorant Garamond',Georgia,serif);font-weight:var(--weight-display,400);font-size:16px;line-height:1.15}
.dzs-list small{font-size:11px;color:var(--color-text-muted)}
.dzs-muted{color:var(--color-text-muted)}
.dzs-subtle{color:var(--color-text-subtle)}
`

/** The one profile's accent ramp, as the design's tokens/kits.css names it (a kit changes only its accent). Scoped to the
 *  profile on the page, so a page carries one rule and a saved Designer website is untouched. The values come from the
 *  design's kit data (lib/themes/designer-kits.json), never from this file. */
export function designerKitAccentCss(profile: string, a: { base: string; hover: string; text: string; deep: string; soft: string; bg: string; on: string }): string {
  return `.dzs[data-profile="${profile}"]{--color-primary:${a.base};--color-primary-hover:${a.hover};--color-primary-strong:${a.text};--color-primary-bg:${a.bg};--color-text-on-primary:${a.on};--color-accent-soft:${a.soft};--color-accent-deep:${a.deep}}`
}
