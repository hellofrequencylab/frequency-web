// The Free Human Theme Kit Spotlight layouts' stylesheet (components/spotlight/free-human-layouts.tsx). Every colour, radius, depth
// and face is a token from lib/theme/free-human.ts (FREE_HUMAN_TOKENS_CSS, FREE_HUMAN_VARIANTS_CSS), so a profile change
// re-points the whole page and this file holds no literal colour. The faces read the kit's variables (set by the website's
// font class) with the named faces as the fallback, because a custom property that reads an unset next/font variable is
// invalid and a bare var() would then paint the browser default. Class prefix `fhs-`.
const DISPLAY = "var(--font-display,'Cormorant Garamond',Georgia,'Times New Roman',serif)"
const SANS = "var(--font-sans,'Hanken Grotesk','Helvetica Neue',Helvetica,sans-serif)"

export const FREE_HUMAN_LAYOUTS_CSS = `
.fhs{position:relative;box-sizing:border-box;min-height:100%;padding-bottom:34px;background:var(--color-canvas);color:var(--color-text);font-family:${SANS};font-size:16px;font-weight:400;line-height:1.4}
.fhs *,.fhs *::before,.fhs *::after{box-sizing:border-box}
:where(.fhs) a{color:inherit;text-decoration:none}
.fhs h1,.fhs p{margin:0}
.fhs-pad{padding:0 20px}
.fhs-d{font-family:${DISPLAY};font-weight:var(--weight-display,500);line-height:1.15;letter-spacing:var(--tracking-display,-.015em);color:var(--color-heading,var(--color-text))}
.fhs-d em{font-style:italic;color:var(--color-accent)}
.fhs-eb{font-family:${SANS};font-size:10px;font-weight:500;line-height:1.3;text-transform:uppercase;letter-spacing:var(--label-tracking,.18em);color:var(--color-text-muted)}
.fhs-eb--media{color:var(--color-on-media)}
.fhs-eb--ink{color:var(--color-on-ink-muted)}
.fhs-eb--accent{color:var(--color-accent-strong)}
.fhs-subtle{color:var(--color-text-subtle)}
.fhs-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 22px;border:1px solid var(--mn-solid);border-radius:var(--radius-control);background:var(--mn-solid);color:var(--color-text-on-primary,var(--fh-cream-50));font:500 16px/1.2 ${SANS};box-shadow:0 1px 2px color-mix(in srgb,var(--fh-umber-800) 14%,transparent);transition:background-color var(--motion-fast,0ms)}
.fhs-btn:hover{background:var(--mn-solid-hover);border-color:var(--mn-solid-hover);color:var(--color-text-on-primary,var(--fh-cream-50))}
.fhs-btn--lg{min-height:56px;padding:0 28px;font-size:18px;width:100%}
.fhs-btn--sm{min-height:36px;padding:0 16px;font-size:14px}
.fhs-btn--secondary{background:var(--color-surface);border-color:var(--color-border-strong);color:var(--color-text);box-shadow:none}
.fhs-btn--secondary:hover{background:var(--color-surface);border-color:var(--color-border-strong);color:var(--color-text)}
.fhs-btn--inverse{background:var(--color-on-ink);border-color:var(--color-on-ink);color:var(--color-ink);box-shadow:none}
.fhs-btn--inverse:hover{background:var(--color-on-ink);border-color:var(--color-on-ink);color:var(--color-ink)}
.fhs-seal{position:relative;display:inline-flex;align-items:center;justify-content:center;flex:none;border-radius:var(--radius-arch-soft);border:1px solid var(--line-hairline);background-color:var(--surface-card);background-image:radial-gradient(ellipse 90% 70% at 50% 0%,color-mix(in srgb,var(--fh-saffron-400) 28%,transparent),transparent 70%);color:var(--color-accent);box-shadow:0 1px 2px color-mix(in srgb,var(--fh-umber-800) 14%,transparent)}
.fhs-seal::before{content:"";position:absolute;inset:3px;border:1px solid var(--line-hairline);border-radius:inherit}
.fhs-seal svg{position:relative}
.fhs-badge{display:inline-flex;align-items:center;min-height:24px;padding:0 10px;border-radius:var(--radius-xs,3px);background:var(--color-accent-bg);color:var(--color-accent-strong);font:500 10px/1 ${SANS};text-transform:uppercase;letter-spacing:var(--label-tracking,.18em);white-space:nowrap}
.fhs-name{display:flex;align-items:center;gap:12px}
.fhs-name span{font-family:${DISPLAY};font-weight:400;letter-spacing:var(--tracking-display,-.015em);line-height:1}
.fhs-name--media span{color:var(--color-on-media);text-shadow:0 1px 12px var(--color-scrim)}
.fhs-mark{position:relative;display:flex;align-items:center;justify-content:center;flex:none;border-radius:var(--radius-arch-soft);border:1px solid var(--line-rule);background:var(--surface-card);color:var(--color-accent);box-shadow:0 1px 2px color-mix(in srgb,var(--fh-umber-800) 14%,transparent)}
.fhs-mark::before{content:"";position:absolute;inset:3px;border:1px solid var(--line-hairline);border-radius:inherit}
.fhs-mark svg{position:relative}
.fhs-grain{position:relative;isolation:isolate}
.fhs-hero{position:relative;display:flex;align-items:flex-end;overflow:hidden}
.fhs-hero img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.fhs-hero::before{content:"";position:absolute;inset:0;z-index:1;background:var(--gradient-media-protect),linear-gradient(180deg,var(--color-scrim),transparent 32%)}
.fhs-hero-top{position:absolute;z-index:3;top:62px;left:20px;right:20px}
.fhs-hero-body{position:relative;z-index:2;width:100%;padding:0 20px 28px}
.fhs-hero h1{margin-top:12px;font-size:40px;line-height:1.03;color:var(--color-on-media);text-wrap:balance}
.fhs-hero h1 em,.fhs-story-text h1 em{color:var(--fh-saffron-400)}
.fhs-stack-list{display:flex;flex-direction:column;gap:8px;padding:16px 20px 0}
.fhs-door{display:flex;align-items:center;gap:14px;min-height:58px;padding:0 14px;border:1px solid var(--color-border);border-radius:var(--radius-card);background:var(--color-surface);box-shadow:0 2px 8px color-mix(in srgb,var(--fh-umber-800) 14%,transparent)}
.fhs-door > span:nth-child(2){flex:1;min-width:0}
.fhs-door b{display:block;font-family:${DISPLAY};font-weight:400;font-size:17px;line-height:1.15}
.fhs-door small{display:block;font-size:11px;color:var(--color-text-muted)}
.fhs-letter{border:1px solid var(--color-border);border-radius:var(--radius-card);background:var(--color-surface);padding:18px;box-shadow:0 2px 8px color-mix(in srgb,var(--fh-umber-800) 14%,transparent)}
.fhs-letter form{display:flex;gap:10px;align-items:flex-end;margin-top:12px}
.fhs-field{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px}
.fhs-input{width:100%;min-height:44px;padding:0 14px;border:1px solid var(--color-border);border-radius:var(--radius-control);background:var(--surface-sunken,var(--color-surface));color:var(--color-text);font:400 16px ${SANS};outline:none}
.fhs-input:focus-visible{box-shadow:var(--ring-focus)}
.fhs-foot{padding:22px 20px 24px;text-align:center}
.fhs-foot--tight{padding-top:14px;padding-bottom:16px}
.fhs-orn{display:flex;align-items:center;gap:12px;width:56%;margin:0 auto}
.fhs-orn::before,.fhs-orn::after{content:"";flex:1;height:1px;background:var(--line-hairline)}
.fhs-orn i{width:9px;height:9px;background:var(--fh-saffron-400);clip-path:polygon(50% 0,60% 40%,100% 50%,60% 60%,50% 100%,40% 60%,0 50%,40% 40%)}
.fhs-foot small{display:block;margin-top:12px;font:500 9px/1.3 ${SANS};text-transform:uppercase;letter-spacing:var(--label-tracking,.18em);color:var(--color-text-subtle)}
.fhs-wall-head{display:flex;flex-direction:column;gap:10px;padding:66px 20px 0}
.fhs-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px;padding:16px 20px 0}
.fhs-card{display:flex;flex-direction:column;justify-content:space-between;aspect-ratio:1.34;padding:14px;border:1px solid var(--color-border);border-radius:var(--radius-card);background:var(--color-surface);box-shadow:0 2px 8px color-mix(in srgb,var(--fh-umber-800) 14%,transparent)}
.fhs-card b{display:block;font-family:${DISPLAY};font-weight:400;font-size:18px;line-height:1.1}
.fhs-card small{display:block;margin-top:4px;font-size:11px;color:var(--color-text-muted)}
.fhs-card--wide{grid-column:1/-1;aspect-ratio:2.6/1;background:var(--color-ink);border:0;color:var(--color-on-ink);box-shadow:none}
.fhs-card--wide b{font-size:22px;color:var(--color-on-ink)}
.fhs-card--wide small{font-size:12px;color:var(--color-on-ink-muted)}
.fhs-card--auto{grid-column:1/-1;aspect-ratio:auto;padding:0;border:0;background:transparent;box-shadow:none}
.fhs-story-photo{position:relative;height:420px;overflow:hidden;display:flex;align-items:flex-end}
.fhs-story-photo img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.fhs-story-photo::before{content:"";position:absolute;inset:0;z-index:1;background:var(--gradient-media-protect),linear-gradient(180deg,var(--color-scrim),transparent 32%)}
.fhs-story-name{position:absolute;z-index:3;top:70px;left:20px}
.fhs-story-text{position:relative;z-index:2;padding:0 20px 28px}
.fhs-story-text h1{margin-top:10px;font-size:38px;line-height:1.03;color:var(--color-on-media)}
.fhs-story-body{padding:26px 20px 0}
.fhs-story-body p{font-size:17px;line-height:1.6}
.fhs-links{display:flex;gap:18px;justify-content:center;flex-wrap:wrap;margin-top:16px;font-size:13px;color:var(--color-accent-strong)}
.fhs-links a{text-decoration:underline;text-underline-offset:3px}
.fhs-quote{margin-top:20px;padding-top:18px;border-top:1px solid var(--color-border)}
.fhs-quote > div{padding:0 20px}
.fhs-quote p{font-family:var(--font-quote,var(--font-lyric,'Cormorant Garamond'),Georgia,serif);font-style:italic;font-size:20px;line-height:1.25}
.fhs-row-head{display:flex;justify-content:space-between;align-items:center;padding:66px 20px 0}
.fhs-socials{display:flex;gap:8px}
.fhs-iconbtn{display:inline-flex;align-items:center;justify-content:center;border-radius:50%;background:var(--color-surface);border:1px solid var(--color-border)}
.fhs-date{display:grid;grid-template-columns:54px 1fr auto;gap:14px;align-items:center;padding:14px 0;border-top:1px solid var(--color-border)}
.fhs-tile{text-align:center;padding:6px 0;border:1px solid var(--color-border);border-radius:var(--radius-sm);background:var(--color-surface)}
.fhs-tile--first{border-color:var(--color-accent);background:var(--color-accent-bg)}
.fhs-tile--first .fhs-eb{color:var(--color-accent-strong)}
.fhs-tile .fhs-eb{font-size:9px}
.fhs-tile b{display:block;font-family:${DISPLAY};font-weight:400;font-size:20px;line-height:1.2}
.fhs-date b.t{font-family:${DISPLAY};font-weight:400;font-size:16px;line-height:1.15;display:block}
.fhs-date small{display:block;margin-top:3px;font-size:11px;color:var(--color-text-muted)}
.fhs-chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.fhs-chip{display:inline-flex;align-items:center;gap:8px;height:36px;padding:0 12px;border:1px solid var(--color-border);border-radius:var(--radius-pill);background:var(--color-surface);font-size:12px}
.fhs-chip svg{color:var(--color-accent-strong)}
.fhs-prod{display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--color-border);border-radius:var(--radius-card);background:var(--color-surface);box-shadow:0 2px 8px color-mix(in srgb,var(--fh-umber-800) 14%,transparent)}
.fhs-prod--first{grid-column:1/-1}
.fhs-prod-img{position:relative;aspect-ratio:1}
.fhs-prod--first .fhs-prod-img{aspect-ratio:16/5}
.fhs-prod-img img{width:100%;height:100%;object-fit:cover}
.fhs-prod > div:last-child{padding:10px}
.fhs-prod b{display:block;font-family:${DISPLAY};font-weight:400;font-size:15px;line-height:1.15}
.fhs-prod--first b{font-size:20px}
.fhs-prod small{display:block;margin-top:3px;font-size:11px;color:var(--color-text-muted)}
.fhs-prod footer{display:flex;justify-content:space-between;align-items:center;margin-top:10px}
.fhs-price{font-family:var(--font-mono,ui-monospace,monospace);font-size:14px}
.fhs-gift{grid-column:1/-1;display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px;border:1px solid var(--color-border);border-radius:var(--radius-card);background:var(--color-accent-bg)}
.fhs-gift b{display:block;margin-top:4px;font-family:${DISPLAY};font-weight:400;font-size:18px;line-height:1.1}
.fhs-profile-head{display:flex;flex-direction:column;align-items:center;gap:14px;padding:70px 20px 0;text-align:center}
.fhs-portrait{position:relative;width:112px;height:112px;border-radius:50%;overflow:hidden;box-shadow:0 2px 8px color-mix(in srgb,var(--fh-umber-800) 14%,transparent),0 0 0 4px var(--color-surface),0 0 0 5px var(--color-border)}
.fhs-portrait img{width:100%;height:100%;object-fit:cover}
.fhs-profile-name{font-size:28px;line-height:1.05}
.fhs-profile-head p{max-width:300px;font-size:15px;line-height:1.55;color:var(--color-text-muted)}
.fhs-list{margin-top:8px;overflow:hidden;border:1px solid var(--color-border);border-radius:var(--radius-card);background:var(--color-surface);box-shadow:0 2px 8px color-mix(in srgb,var(--fh-umber-800) 14%,transparent)}
.fhs-list a{display:flex;align-items:center;gap:14px;padding:14px 16px}
.fhs-list a + a{border-top:1px solid var(--color-border)}
.fhs-list a svg:first-child{color:var(--color-accent)}
.fhs-list a > span{flex:1}
.fhs-list b{display:block;font-family:${DISPLAY};font-weight:400;font-size:16px}
.fhs-list small{font-size:11px;color:var(--color-text-muted)}
`
