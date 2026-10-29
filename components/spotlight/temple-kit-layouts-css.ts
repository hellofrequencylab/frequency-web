// The Temple Theme Kit Spotlight layouts' stylesheet (components/spotlight/temple-kit-layouts.tsx). Every colour, radius, depth
// and face is a token from lib/theme/temple-kit.ts (TEMPLE_KIT_TOKENS_CSS, TEMPLE_KIT_VARIANTS_CSS), so a profile change
// re-points the whole page and this file holds no literal colour. The faces read the kit's variables (set by the website's
// font class) with the named faces as the fallback, because a custom property that reads an unset next/font variable is
// invalid and a bare var() would then paint the browser default. Class prefix `tks-`.
const DISPLAY = "var(--font-display,Marcellus,Georgia,'Times New Roman',serif)"
const SANS = "var(--font-sans,Jost,'Helvetica Neue',Helvetica,sans-serif)"

export const TEMPLE_KIT_LAYOUTS_CSS = `
.tks{position:relative;box-sizing:border-box;min-height:100%;padding-bottom:34px;background:var(--color-canvas);color:var(--color-text);font-family:${SANS};font-size:16px;font-weight:400;line-height:1.4}
.tks *,.tks *::before,.tks *::after{box-sizing:border-box}
:where(.tks) a{color:inherit;text-decoration:none}
.tks h1,.tks p{margin:0}
.tks-pad{padding:0 20px}
.tks-d{font-family:${DISPLAY};font-weight:var(--weight-display,400);line-height:1.15;letter-spacing:var(--tracking-display,-.015em);color:var(--color-heading,var(--color-text))}
.tks-d em{font-style:normal;color:var(--color-accent)}
.tks-eb{font-family:${SANS};font-size:10px;font-weight:500;line-height:1.3;text-transform:uppercase;letter-spacing:var(--label-tracking,.18em);color:var(--color-text-muted)}
.tks-eb--media{color:var(--color-on-media)}
.tks-eb--ink{color:var(--color-on-ink-muted)}
.tks-eb--accent{color:var(--color-accent-strong)}
.tks-subtle{color:var(--color-text-subtle)}
.tks-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 22px;border:1px solid var(--mn-solid);border-radius:var(--radius-control);background:var(--mn-solid);color:var(--kit-on-solid);font:500 16px/1.2 ${SANS};box-shadow:var(--tk-depth-xs);transition:background-color var(--motion-fast,0ms)}
.tks-btn:hover{background:var(--mn-solid-hover);border-color:var(--mn-solid-hover);color:var(--kit-on-solid)}
.tks-btn--lg{min-height:56px;padding:0 28px;font-size:18px;width:100%}
.tks-btn--sm{min-height:36px;padding:0 16px;font-size:14px}
.tks-btn--secondary{background:var(--color-surface);border-color:var(--color-border-strong);color:var(--color-text);box-shadow:none}
.tks-btn--secondary:hover{background:var(--color-surface);border-color:var(--color-border-strong);color:var(--color-text)}
.tks-btn--inverse{background:var(--color-on-ink);border-color:var(--color-on-ink);color:var(--color-ink);box-shadow:none}
.tks-btn--inverse:hover{background:var(--color-on-ink);border-color:var(--color-on-ink);color:var(--color-ink)}
.tks-seal{position:relative;display:inline-flex;align-items:center;justify-content:center;flex:none;border-radius:var(--radius-arch-soft);border:1px solid var(--line-hairline);background-color:var(--surface-card);background-image:radial-gradient(ellipse 90% 70% at 50% 0%,color-mix(in srgb,var(--tk-saffron-400) 28%,transparent),transparent 70%);color:var(--color-accent);box-shadow:var(--tk-depth-xs)}
.tks-seal::before{content:"";position:absolute;inset:3px;border:1px solid var(--line-hairline);border-radius:inherit}
.tks-seal svg{position:relative}
.tks-badge{display:inline-flex;align-items:center;min-height:24px;padding:0 10px;border-radius:var(--radius-xs,3px);background:var(--color-accent-bg);color:var(--color-accent-strong);font:500 10px/1 ${SANS};text-transform:uppercase;letter-spacing:var(--label-tracking,.18em);white-space:nowrap}
.tks-name{display:flex;align-items:center;gap:12px}
.tks-name span{font-family:${DISPLAY};font-weight:400;letter-spacing:var(--tracking-display,-.015em);line-height:1}
.tks-name--media span{color:var(--color-on-media);text-shadow:0 1px 12px var(--color-scrim)}
.tks-mark{position:relative;display:flex;align-items:center;justify-content:center;flex:none;border-radius:var(--radius-arch-soft);border:1px solid var(--line-rule);background:var(--surface-card);color:var(--color-accent);box-shadow:var(--tk-depth-xs)}
.tks-mark::before{content:"";position:absolute;inset:3px;border:1px solid var(--line-hairline);border-radius:inherit}
.tks-mark svg{position:relative}
.tks-grain{position:relative;isolation:isolate}
.tks-grain::after{content:"";position:absolute;inset:0;z-index:1;pointer-events:none;background-image:var(--texture-sand);background-size:200px;opacity:var(--texture-opacity-sand);mix-blend-mode:multiply}
.tks-hero{position:relative;display:flex;align-items:flex-end;overflow:hidden}
.tks-hero img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.tks-hero::before{content:"";position:absolute;inset:0;z-index:1;background:var(--gradient-media-protect),linear-gradient(180deg,var(--color-scrim),transparent 32%)}
.tks-hero-top{position:absolute;z-index:3;top:62px;left:20px;right:20px}
.tks-hero-body{position:relative;z-index:2;width:100%;padding:0 20px 28px}
.tks-hero h1{margin-top:12px;font-size:40px;line-height:1.03;color:var(--color-on-media);text-wrap:balance}
.tks-hero h1 em,.tks-story-text h1 em{color:var(--tk-saffron-400)}
.tks-stack-list{display:flex;flex-direction:column;gap:8px;padding:16px 20px 0}
.tks-door{display:flex;align-items:center;gap:14px;min-height:58px;padding:0 14px;border:1px solid var(--color-border);border-radius:var(--radius-card);background:var(--color-surface);box-shadow:var(--tk-depth-sm)}
.tks-door > span:nth-child(2){flex:1;min-width:0}
.tks-door b{display:block;font-family:${DISPLAY};font-weight:400;font-size:17px;line-height:1.15}
.tks-door small{display:block;font-size:11px;color:var(--color-text-muted)}
.tks-letter{border:1px solid var(--color-border);border-radius:var(--radius-card);background:var(--color-surface);padding:18px;box-shadow:var(--tk-depth-sm)}
.tks-letter form{display:flex;gap:10px;align-items:flex-end;margin-top:12px}
.tks-field{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px}
.tks-input{width:100%;min-height:44px;padding:0 14px;border:1px solid var(--color-border);border-radius:var(--radius-control);background:var(--surface-sunk,var(--color-surface));color:var(--color-text);font:400 16px ${SANS};outline:none}
.tks-input:focus-visible{box-shadow:var(--ring-focus)}
.tks-foot{padding:22px 20px 24px;text-align:center}
.tks-foot--tight{padding-top:14px;padding-bottom:16px}
.tks-orn{display:flex;align-items:center;gap:12px;width:56%;margin:0 auto}
.tks-orn::before,.tks-orn::after{content:"";flex:1;height:1px;background:var(--line-hairline)}
.tks-orn i{width:9px;height:9px;background:var(--tk-saffron-500);clip-path:polygon(50% 0,60% 40%,100% 50%,60% 60%,50% 100%,40% 60%,0 50%,40% 40%)}
.tks-foot small{display:block;margin-top:12px;font:500 9px/1.3 ${SANS};text-transform:uppercase;letter-spacing:var(--label-tracking,.18em);color:var(--color-text-subtle)}
.tks-wall-head{display:flex;flex-direction:column;gap:10px;padding:66px 20px 0}
.tks-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px;padding:16px 20px 0}
.tks-card{display:flex;flex-direction:column;justify-content:space-between;aspect-ratio:1.34;padding:14px;border:1px solid var(--color-border);border-radius:var(--radius-card);background:var(--color-surface);box-shadow:var(--tk-depth-sm)}
.tks-card b{display:block;font-family:${DISPLAY};font-weight:400;font-size:18px;line-height:1.1}
.tks-card small{display:block;margin-top:4px;font-size:11px;color:var(--color-text-muted)}
.tks-card--wide{grid-column:1/-1;aspect-ratio:2.6/1;background:var(--color-ink);border:0;color:var(--color-on-ink);box-shadow:none}
.tks-card--wide b{font-size:22px;color:var(--color-on-ink)}
.tks-card--wide small{font-size:12px;color:var(--color-on-ink-muted)}
.tks-card--auto{grid-column:1/-1;aspect-ratio:auto;padding:0;border:0;background:transparent;box-shadow:none}
.tks-story-photo{position:relative;height:420px;overflow:hidden;display:flex;align-items:flex-end}
.tks-story-photo img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.tks-story-photo::before{content:"";position:absolute;inset:0;z-index:1;background:var(--gradient-media-protect),linear-gradient(180deg,var(--color-scrim),transparent 32%)}
.tks-story-name{position:absolute;z-index:3;top:70px;left:20px}
.tks-story-text{position:relative;z-index:2;padding:0 20px 28px}
.tks-story-text h1{margin-top:10px;font-size:38px;line-height:1.03;color:var(--color-on-media)}
.tks-story-body{padding:26px 20px 0}
.tks-story-body p{font-size:17px;line-height:1.6}
.tks-links{display:flex;gap:18px;justify-content:center;flex-wrap:wrap;margin-top:16px;font-size:13px;color:var(--color-accent-strong)}
.tks-links a{text-decoration:underline;text-underline-offset:3px}
.tks-quote{margin-top:20px;padding-top:18px;border-top:1px solid var(--color-border)}
.tks-quote > div{padding:0 20px}
.tks-quote p{font-family:var(--font-quote,var(--font-tp-cormorant,'Cormorant Garamond'),Georgia,serif);font-style:italic;font-size:20px;line-height:1.25}
.tks-row-head{display:flex;justify-content:space-between;align-items:center;padding:66px 20px 0}
.tks-socials{display:flex;gap:8px}
.tks-iconbtn{display:inline-flex;align-items:center;justify-content:center;border-radius:50%;background:var(--color-surface);border:1px solid var(--color-border)}
.tks-date{display:grid;grid-template-columns:54px 1fr auto;gap:14px;align-items:center;padding:14px 0;border-top:1px solid var(--color-border)}
.tks-tile{text-align:center;padding:6px 0;border:1px solid var(--color-border);border-radius:var(--radius-sm);background:var(--color-surface)}
.tks-tile--first{border-color:var(--color-accent);background:var(--color-accent-bg)}
.tks-tile--first .tks-eb{color:var(--color-accent-strong)}
.tks-tile .tks-eb{font-size:9px}
.tks-tile b{display:block;font-family:${DISPLAY};font-weight:400;font-size:20px;line-height:1.2}
.tks-date b.t{font-family:${DISPLAY};font-weight:400;font-size:16px;line-height:1.15;display:block}
.tks-date small{display:block;margin-top:3px;font-size:11px;color:var(--color-text-muted)}
.tks-chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.tks-chip{display:inline-flex;align-items:center;gap:8px;height:36px;padding:0 12px;border:1px solid var(--color-border);border-radius:var(--radius-pill);background:var(--color-surface);font-size:12px}
.tks-chip svg{color:var(--color-accent-strong)}
.tks-prod{display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--color-border);border-radius:var(--radius-card);background:var(--color-surface);box-shadow:var(--tk-depth-sm)}
.tks-prod--first{grid-column:1/-1}
.tks-prod-img{position:relative;aspect-ratio:1}
.tks-prod--first .tks-prod-img{aspect-ratio:16/5}
.tks-prod-img img{width:100%;height:100%;object-fit:cover}
.tks-prod > div:last-child{padding:10px}
.tks-prod b{display:block;font-family:${DISPLAY};font-weight:400;font-size:15px;line-height:1.15}
.tks-prod--first b{font-size:20px}
.tks-prod small{display:block;margin-top:3px;font-size:11px;color:var(--color-text-muted)}
.tks-prod footer{display:flex;justify-content:space-between;align-items:center;margin-top:10px}
.tks-price{font-family:var(--font-mono,ui-monospace,monospace);font-size:14px}
.tks-gift{grid-column:1/-1;display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px;border:1px solid var(--color-border);border-radius:var(--radius-card);background:var(--color-accent-bg)}
.tks-gift b{display:block;margin-top:4px;font-family:${DISPLAY};font-weight:400;font-size:18px;line-height:1.1}
.tks-profile-head{display:flex;flex-direction:column;align-items:center;gap:14px;padding:70px 20px 0;text-align:center}
.tks-portrait{position:relative;width:112px;height:112px;border-radius:50%;overflow:hidden;box-shadow:var(--tk-depth-sm),0 0 0 4px var(--color-surface),0 0 0 5px var(--color-border)}
.tks-portrait img{width:100%;height:100%;object-fit:cover}
.tks-profile-name{font-size:28px;line-height:1.05}
.tks-profile-head p{max-width:300px;font-size:15px;line-height:1.55;color:var(--color-text-muted)}
.tks-list{margin-top:8px;overflow:hidden;border:1px solid var(--color-border);border-radius:var(--radius-card);background:var(--color-surface);box-shadow:var(--tk-depth-sm)}
.tks-list a{display:flex;align-items:center;gap:14px;padding:14px 16px}
.tks-list a + a{border-top:1px solid var(--color-border)}
.tks-list a svg:first-child{color:var(--color-accent)}
.tks-list a > span{flex:1}
.tks-list b{display:block;font-family:${DISPLAY};font-weight:400;font-size:16px}
.tks-list small{font-size:11px;color:var(--color-text-muted)}
`
