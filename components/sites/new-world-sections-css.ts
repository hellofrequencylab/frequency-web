// THE NEW WORLD SECTION SHEET (LIVE-2055): the look of New World's own blocks (components/page-editor/blocks/new-world.tsx), lifted
// from the design system's Web Theme (docs/design-systems/new-world; ui_kits/site/Sections.jsx, Blocks.jsx and tokens/base, effects,
// textures). The design draws every section with inline styles; here each is a class and every colour, wash and shadow reads the
// New World token block (lib/theme/new-world.ts) or the owner's accent (--color-primary*, set by the site's AccentScope). No literal
// colours. Scoped under [data-house-theme="new-world"], so it only ever dresses the stand-alone site render (theme fence, ADR-1906).

const N = '[data-house-theme="new-world"]'
const MONO = 'font-family:var(--nw-font-mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;font-weight:var(--nw-fw-medium)'
const WRAP = 'position:relative;z-index:2;max-width:var(--nw-frame);margin:0 auto;padding:clamp(80px,9vw,128px) var(--nw-gutter)'
const CARD =
  'border:1px solid var(--nw-border-subtle);border-radius:var(--nw-radius-lg);background:linear-gradient(180deg,color-mix(in oklab,var(--nw-chrome-50) 6%,transparent),color-mix(in oklab,var(--nw-chrome-50) 2%,transparent));box-shadow:0 30px 70px -40px color-mix(in oklab,var(--nw-flare-500) 35%,transparent),inset 0 1px 0 color-mix(in oklab,var(--nw-chrome-50) 8%,transparent)'
const FACE = 'linear-gradient(135deg,color-mix(in oklab,var(--nw-flare-300) 70%,transparent),color-mix(in oklab,var(--nw-swell-300) 55%,transparent))'

/* THE ACCENT BRIDGE: the theme's accent ramps (Night --nw-n-flare-*, Day --nw-d-flare-*) follow the owner's accent, so a Signal,
 * Bloom, Ember or Fern site draws its own colour in every spread, glow and line, not only in the buttons. Tide resolves to the same
 * family. Day mixes toward the ink so accent text still reads on white. */
const ACCENT = `
${N}{--nw-n-flare-500:var(--color-primary);--nw-n-flare-400:var(--color-primary-strong);--nw-n-flare-300:color-mix(in oklab,var(--color-primary) 55%,var(--nw-chrome-50));--nw-n-flare-600:color-mix(in oklab,var(--color-primary) 80%,var(--nw-ink-950));--nw-n-flare-700:color-mix(in oklab,var(--color-primary) 60%,var(--nw-ink-950));--nw-d-flare-500:color-mix(in oklab,var(--color-primary) 74%,var(--nw-ink-950));--nw-d-flare-400:color-mix(in oklab,var(--color-primary) 86%,var(--nw-ink-950));--nw-d-flare-300:color-mix(in oklab,var(--color-primary) 45%,var(--nw-chrome-50));--nw-d-flare-600:color-mix(in oklab,var(--color-primary) 62%,var(--nw-ink-950));--nw-d-flare-700:color-mix(in oklab,var(--color-primary) 50%,var(--nw-ink-950))}
${N},${N} [data-th]{--nwa-text:color-mix(in oklab,var(--color-primary) 70%,var(--nw-chrome-50));--nwa-lit:linear-gradient(100deg,var(--nwa-text) 0%,var(--nw-halo-300) 48%,var(--nwa-text) 100%)}
${N} [data-th="day"],${N}[data-th="day"]{--nwa-text:color-mix(in oklab,var(--color-primary) 62%,var(--nw-chrome-50))}
`

/* TYPE: the default voice is Charge (the display face in sentence case with a serif italic phrase); Caps is the opt-in voice. */
const TYPE = `
${N} .sv-display,${N} .nw-display{font-family:var(--nw-font-display);font-stretch:var(--nw-stretch-display);font-weight:var(--nw-fw-display);text-transform:none;letter-spacing:var(--nw-ls-display);line-height:var(--nw-lh-display);margin:0;color:var(--nw-text-primary);text-wrap:balance}
${N} .sv-display em,${N} .nw-display em{font-family:var(--nw-font-accent);font-style:italic;font-weight:400;font-stretch:100%;text-transform:none;letter-spacing:-.01em;font-size:var(--nw-em-size);line-height:.85}
${N}[data-type="caps"] .sv-display,${N}[data-type="caps"] .nw-display{text-transform:uppercase;font-weight:var(--nw-fw-heavy);letter-spacing:-.02em;line-height:.92}
${N} .nw-break em{display:block}
${N} .nw-lit em{background:var(--nwa-lit) 0 0/200% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;padding-right:.1em;animation:nw-shimmer 10s linear infinite}
${N} .nw-mono{${MONO};color:var(--nw-text-muted)}
${N} .nw-eyebrow{${MONO};display:inline-flex;align-items:center;gap:12px;color:var(--nw-text-secondary)}
${N} .nw-eyebrow::before{content:"";width:6px;height:6px;border-radius:var(--nw-radius-pill);background:var(--color-primary);box-shadow:0 0 10px color-mix(in oklab,var(--color-primary) 70%,transparent)}
${N} .nw-eyebrow b{font-weight:inherit;color:var(--nwa-text)}
${N} .nw-eyebrow i{width:18px;height:1px;background:var(--nw-border-default)}
${N} .nw-lede{margin:0;font-size:17px;line-height:1.55;color:var(--nw-text-secondary);max-width:560px;text-wrap:pretty}
${N} .nw-note{margin:0;font-size:16px;line-height:1.55;color:var(--nw-text-secondary);text-wrap:pretty}
${N} .nw-note--sm{font-size:14px;color:var(--nw-text-muted)}
${N} .nw-fine{margin:24px 0 0;font-size:13px;color:var(--nw-text-muted);text-align:center}
`

/* SECTIONS: a band on the page ground with one corner spread, a glow line on top, an orb, and the wrap. Day halves the spread. */
const SECTION = `
/* THE DOCUMENT WRAPPER: a Space page wraps each block in its own rhythm (py-8 sm:py-10, lib/page-editor/config.tsx root), which drew an
 * ink band under the menu and gaps between the sections. New World's sections run flush and pad themselves, so the wrapper adds nothing
 * (the same reset as Free Human, the Temple kit and Services). */
${N} [data-mw-own]>div{padding-block:0}
${N} [data-mw-own]>div>*{margin-block:0}
${N} .nw-sec{position:relative;isolation:isolate;overflow:clip;background:var(--nw-surface-page);color:var(--nw-text-primary)}
${N} .nw-sec::before{content:"";position:absolute;left:0;right:0;top:0;height:1px;background:linear-gradient(90deg,transparent,color-mix(in oklab,var(--nw-flare-400) 55%,transparent),transparent);pointer-events:none;z-index:1}
${N} .nw-sec::after{content:"";position:absolute;inset:0;pointer-events:none;z-index:0;opacity:.55}
${N} [data-th="day"].nw-sec::after,${N}[data-th="day"] .nw-sec::after{opacity:.3}
${N} .nw-sec--tl::after{background:radial-gradient(60% 70% at 0% 0%,color-mix(in oklab,var(--nw-flare-500) 22%,transparent),transparent 70%)}
${N} .nw-sec--tr::after{background:radial-gradient(55% 70% at 100% 0%,color-mix(in oklab,var(--nw-flare-500) 18%,transparent),transparent 70%)}
${N} .nw-sec--bl::after{background:radial-gradient(55% 70% at 0% 100%,color-mix(in oklab,var(--nw-swell-500) 16%,transparent),transparent 70%)}
${N} .nw-sec--br::after{background:radial-gradient(55% 70% at 100% 100%,color-mix(in oklab,var(--nw-halo-500) 18%,transparent),transparent 70%)}
${N} .nw-sec--wash{background:linear-gradient(to top right,color-mix(in oklab,var(--nw-swell-500) 32%,var(--nw-ink-900)) 0%,color-mix(in oklab,var(--nw-swell-500) 12%,var(--nw-ink-900)) 45%,var(--nw-ink-900) 85%)}
${N} .nw-sec--stripes{background:repeating-linear-gradient(135deg,color-mix(in oklab,var(--nw-chrome-50) 3%,transparent) 0 1px,transparent 1px 14px),var(--nw-surface-page)}
${N} .nw-wrap{${WRAP}}
${N} .nw-center{display:flex;flex-direction:column;align-items:center;text-align:center;gap:24px}
${N} .nw-stack{display:flex;flex-direction:column;gap:28px;min-width:0}
${N} .nw-stack--lg{gap:40px}
${N} .nw-stack--sm{gap:12px}
${N} .nw-ruled{padding-top:24px;border-top:1px solid var(--nw-border-subtle)}
${N} .nw-cols{display:grid;gap:clamp(40px,5vw,80px);align-items:start}
${N} .nw-cols--center{align-items:center}
${N} .nw-cols--end{align-items:end}
@media (min-width:900px){
${N} .nw-cols--7-5{grid-template-columns:minmax(0,7fr) minmax(0,5fr)}
${N} .nw-cols--5-7{grid-template-columns:minmax(0,5fr) minmax(0,7fr)}
${N} .nw-cols--4-8{grid-template-columns:minmax(0,4fr) minmax(0,8fr)}
${N} .nw-cols--6-6{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
${N} .nw-sticky{position:sticky;top:96px}
}
${N} .nw-orb{position:absolute;border-radius:50%;pointer-events:none;z-index:0;filter:blur(80px);width:620px;height:620px;opacity:.6;background:radial-gradient(closest-side,color-mix(in oklab,var(--nw-flare-500) 36%,transparent),color-mix(in oklab,var(--nw-flare-500) 14%,transparent) 45%,transparent);animation:nw-drift 22s ease-in-out infinite}
${N} .nw-orb--a{left:-8%;top:52%}
${N} .nw-orb--b{left:58%;top:-20%;background:radial-gradient(closest-side,color-mix(in oklab,var(--nw-halo-500) 30%,transparent),transparent)}
${N} .nw-orb--c{left:66%;top:36%;background:radial-gradient(closest-side,color-mix(in oklab,var(--nw-swell-500) 30%,transparent),transparent)}
${N} .nw-dotgrid{position:absolute;inset:0;pointer-events:none;background-image:radial-gradient(circle,color-mix(in oklab,var(--nw-chrome-50) 14%,transparent) 1px,transparent 1.3px);background-size:22px 22px;-webkit-mask-image:radial-gradient(60% 60% at 50% 50%,black 30%,transparent 100%);mask-image:radial-gradient(60% 60% at 50% 50%,black 30%,transparent 100%)}
${N} .nw-glowline{display:block;height:1px;background:linear-gradient(90deg,transparent,color-mix(in oklab,var(--nw-flare-400) 70%,transparent),transparent);box-shadow:0 0 18px color-mix(in oklab,var(--nw-flare-500) 60%,transparent)}
`

/* THE HEAD, BUTTONS, BADGES, CARDS, PHOTOS: the shared parts. */
const PARTS = `
${N} .nw-head{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:24px;margin-bottom:clamp(40px,5vw,64px)}
${N} .nw-head-copy{display:flex;flex-direction:column;gap:22px;max-width:760px}
${N} .nw-head .nw-display{font-size:clamp(40px,5vw,76px)}
${N} .nw-head--md{margin-bottom:0}
${N} .nw-head--md .nw-display{font-size:clamp(40px,4.4vw,64px)}
${N} .nw-head-proof,${N} .nw-head-aside{display:inline-flex;align-items:center;gap:12px;${MONO};color:var(--nw-text-secondary)}
${N} .nw-actions{display:flex;flex-wrap:wrap;gap:14px;align-items:center}
${N} .nw-actions--center{justify-content:center}
${N} .nw-btn{position:relative;overflow:hidden;isolation:isolate;display:inline-flex;align-items:center;justify-content:center;gap:10px;height:48px;padding:0 26px;border-radius:var(--nw-radius-pill);font-family:var(--nw-font-mono);font-weight:var(--nw-fw-bold);font-size:12px;letter-spacing:var(--nw-ls-button);text-transform:uppercase;text-decoration:none;white-space:nowrap;cursor:pointer;border:1px solid transparent;transition:background var(--nw-dur-fast),border-color var(--nw-dur-fast),color var(--nw-dur-fast),transform var(--nw-dur-fast) var(--nw-ease-out)}
${N} .nw-btn--lg{height:56px;padding:0 30px;font-size:12.5px}
${N} .nw-btn--sm{height:38px;padding:0 18px;font-size:10.5px}
${N} .nw-btn--full{width:100%}
${N} .nw-btn--accent{background:linear-gradient(115deg,color-mix(in oklab,var(--color-primary) 86%,var(--nw-chrome-50)) 0%,var(--color-primary) 55%,color-mix(in oklab,var(--color-primary) 80%,var(--nw-halo-500)) 100%);color:var(--color-text-on-primary);box-shadow:var(--nw-shadow-glow)}
${N} .nw-btn--accent:hover{background:var(--color-primary-hover);color:var(--color-text-on-primary);transform:translateY(-1px)}
${N} .nw-btn--secondary{background:color-mix(in oklab,var(--nw-ink-950) 40%,transparent);color:var(--nw-text-primary);border-color:var(--nw-border-default)}
${N} .nw-btn--secondary:hover{border-color:var(--color-primary);color:var(--nw-text-primary)}
${N} .nw-btn--ghost{height:auto;padding:4px 0;border-radius:0;color:var(--nw-text-primary);border:0;border-bottom:1px solid var(--nw-border-strong)}
${N} .nw-btn--ghost:hover{color:var(--nwa-text);border-color:var(--color-primary)}
${N} .nw-btn:focus-visible,${N} .nw-card:focus-visible,${N} .nw-round:focus-visible{outline:2px solid var(--nw-focus-ring);outline-offset:3px}
${N} .nw-round{flex:none;display:grid;place-items:center;width:48px;height:48px;border-radius:var(--nw-radius-pill);border:1px solid var(--nw-border-default);color:var(--nw-text-primary);transition:border-color var(--nw-dur-fast),background var(--nw-dur-fast)}
${N} .nw-round:hover{border-color:var(--color-primary);background:var(--nw-accent-tint)}
${N} .nw-round--sm{width:32px;height:32px}
${N} .nw-badge{display:inline-flex;align-items:center;gap:8px;align-self:flex-start;padding:5px 12px;border-radius:var(--nw-radius-pill);${MONO};font-size:10px;color:var(--nwa-text);background:var(--nw-accent-tint);border:1px solid color-mix(in oklab,var(--color-primary) 35%,transparent)}
${N} .nw-badge i{width:5px;height:5px;border-radius:var(--nw-radius-pill);background:var(--color-primary)}
${N} .nw-badge--plain{color:var(--nw-text-secondary);background:color-mix(in oklab,var(--nw-chrome-50) 4%,transparent);border-color:var(--nw-border-default)}
${N} .nw-tile{flex:none;display:grid;place-items:center;width:40px;height:40px;border-radius:var(--nw-radius-md);color:var(--nwa-text);background:color-mix(in oklab,var(--nw-chrome-50) 5%,transparent);border:1px solid var(--nw-border-default);box-shadow:0 8px 24px -12px color-mix(in oklab,var(--nw-flare-500) 60%,transparent);font-style:normal}
${N} .nw-stars{display:inline-flex;gap:2px;color:var(--nwa-text)}
${N} .nw-faces{display:inline-flex}
${N} .nw-faces i{width:24px;height:24px;border-radius:var(--nw-radius-pill);background:${FACE};box-shadow:0 0 0 2px var(--nw-ink-900)}
${N} .nw-faces i+i{margin-left:-7px}
${N} .nw-card{${CARD};position:relative;display:flex;flex-direction:column;color:inherit;text-decoration:none}
${N} a.nw-card{transition:border-color var(--nw-dur-base),transform var(--nw-dur-base) var(--nw-ease-out)}
${N} a.nw-card:hover{border-color:color-mix(in oklab,var(--color-primary) 55%,transparent);transform:translateY(-3px)}
${N} .nw-grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr))}
${N} .nw-empty{${CARD};box-shadow:none;border-style:dashed;padding:28px;text-align:center;font-size:14px;color:var(--nw-text-muted);grid-column:1/-1}
${N} .nw-photo{position:relative;overflow:hidden;margin:0;border-radius:var(--nw-radius-xl);border:1px solid var(--nw-border-subtle);background:var(--nw-spread-tr),var(--nw-ink-800);display:grid;place-items:center}
${N} .nw-photo>img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
${N} .nw-photo figcaption{position:relative;display:flex;align-items:center;gap:10px;${MONO};color:var(--nw-text-muted);padding:0 20px;text-align:center}
${N}[data-image="mono"] .nw-photo>img{filter:grayscale(1) contrast(1.05)}
${N} .nw-photo--tall{aspect-ratio:4/5}
${N} .nw-photo--hero{aspect-ratio:4/5;box-shadow:0 0 0 1px color-mix(in oklab,var(--nw-flare-400) 35%,transparent),0 60px 120px -50px color-mix(in oklab,var(--nw-flare-500) 60%,transparent),var(--nw-depth-lg)}
${N} .nw-photo--feature{aspect-ratio:4/5;box-shadow:0 50px 100px -50px color-mix(in oklab,var(--nw-flare-500) 55%,transparent)}
${N} .nw-photo--feature::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent 50%,color-mix(in oklab,var(--nw-ink-950) 85%,transparent))}
${N} .nw-photo--person{aspect-ratio:3/4}
${N} .nw-photo--offer{aspect-ratio:16/10;border-radius:var(--nw-radius-lg)}
${N} .nw-person figcaption a{color:inherit;text-decoration:none}
${N} .nw-person figcaption a:hover b{text-decoration:underline}
${N} .nw-photo--map{aspect-ratio:4/3;background:var(--nw-spread-tl),var(--nw-spread-br),var(--nw-ink-800)}
${N} .nw-photo--tile{min-height:220px}
${N} .nw-chip{position:absolute;top:18px;left:18px;z-index:2;display:inline-flex;align-items:center;gap:8px;padding:8px 12px;border-radius:var(--nw-radius-pill);${MONO};font-size:10px;color:var(--nw-chrome-50);background:color-mix(in oklab,var(--nw-ink-950) 55%,transparent);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}
${N} .nw-pulse{display:inline-block;width:6px;height:6px;border-radius:var(--nw-radius-pill);background:var(--color-primary);animation:nw-pulse 2.2s ease-out infinite}
${N} .nw-date{display:flex;flex-direction:column;align-items:center;text-align:center;line-height:1}
${N} .nw-date small{${MONO};font-size:9px;color:var(--nw-text-muted)}
${N} .nw-date b{font-family:var(--nw-font-display);font-stretch:var(--nw-stretch-display);font-weight:var(--nw-fw-display);font-size:24px;margin-top:4px;color:var(--nw-text-primary)}
${N} .nw-pills{display:flex;flex-wrap:wrap;gap:8px}
${N} .nw-pills span{padding:6px 12px;border-radius:var(--nw-radius-pill);border:1px solid var(--nw-border-default);font-size:13px;color:var(--nw-text-secondary)}
${N} .nw-facts{display:flex;flex-direction:column;gap:14px}
${N} .nw-facts span{display:flex;align-items:center;gap:12px;font-size:15px;color:var(--nw-text-secondary)}
${N} .nw-facts svg{color:var(--nwa-text);flex:none}
`

/* HERO: the split hero with the "doors open" photo, the next three on a glass card, the faces line and the neighbourhood strip. */
const HERO = `
${N} .nw-hero{position:relative;isolation:isolate;overflow:hidden;display:flex;flex-direction:column;background:var(--nw-ink-950);color:var(--nw-text-primary)}
${N} .nw-hero-sky{position:absolute;inset:0;z-index:0;background:var(--nw-glow-sunset),linear-gradient(to bottom left,color-mix(in oklab,var(--nw-halo-500) 22%,var(--nw-ink-900)) 0%,color-mix(in oklab,var(--nw-halo-500) 8%,var(--nw-ink-900)) 30%,transparent 62%);opacity:.9}
${N} .nw-hero-sky::after{content:"";position:absolute;inset:0;background:radial-gradient(70% 60% at 30% 60%,color-mix(in oklab,var(--nw-ink-950) 70%,transparent),transparent 80%)}
${N} .nw-hero-in{position:relative;z-index:2;width:100%;box-sizing:border-box;max-width:var(--nw-frame);margin:0 auto;padding:clamp(56px,7vw,96px) var(--nw-gutter) 72px;display:grid;gap:56px clamp(32px,5vw,88px);align-items:center}
@media (min-width:900px){${N} .nw-hero-in{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}}
${N} .nw-hero-copy{display:flex;flex-direction:column;gap:26px;align-items:flex-start}
${N} .nw-hero-copy .nw-display{font-size:clamp(44px,5vw,76px);text-wrap:pretty}
${N} .nw-hero-copy .nw-display em{display:block}
${N} .nw-hero-lead{margin:0;font-size:18px;line-height:1.55;color:var(--nw-chrome-200);max-width:46ch;text-wrap:pretty}
${N} .nw-proof{display:flex;align-items:center;gap:14px;padding-top:22px;border-top:1px solid var(--nw-border-subtle);align-self:stretch;font-size:14px;color:var(--nw-chrome-200)}
${N} .nw-proof .nw-faces i{width:28px;height:28px;box-shadow:0 0 0 2px var(--nw-ink-950)}
${N} .nw-proof .nw-faces i+i{margin-left:-9px}
${N} .nw-proof em{font-family:var(--nw-font-accent);font-size:16px;color:var(--nwa-text)}
${N} .nw-hero-art{position:relative;padding-bottom:72px}
${N} .nw-hero-card{position:absolute;left:-28px;right:28px;bottom:0;display:flex;flex-direction:column;gap:4px;padding:8px;border-radius:var(--nw-radius-lg);background:color-mix(in oklab,var(--nw-ink-900) 78%,transparent);border:1px solid var(--nw-border-default);-webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px);box-shadow:var(--nw-depth-lg),inset 0 1px 0 color-mix(in oklab,var(--nw-chrome-50) 10%,transparent)}
${N} .nw-hero-row{display:grid;grid-template-columns:48px minmax(0,1fr) auto;gap:14px;align-items:center;padding:10px 12px;border-radius:var(--nw-radius-md);color:inherit;text-decoration:none}
${N} .nw-hero-row.is-first{background:var(--nw-accent-tint)}
${N} .nw-hero-row.is-first .nw-date small{color:var(--nwa-text)}
${N} .nw-hero-row-text{min-width:0;display:flex;flex-direction:column;gap:2px}
${N} .nw-hero-row-text b{font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
${N} .nw-hero-row-text small{font-size:12px;color:var(--nw-text-muted)}
${N} .nw-hero-row em{font-style:normal;${MONO};font-size:9.5px;color:var(--nw-chrome-200);white-space:nowrap}
@media (max-width:899px){${N} .nw-hero-card{left:12px;right:12px}}
${N} .nw-ticker{position:relative;z-index:2;border-top:1px solid var(--nw-border-subtle);overflow:hidden;padding:18px 0}
${N} .nw-ticker-track{display:flex;width:max-content;animation:nw-marquee 40s linear infinite}
${N} .nw-ticker-track span{display:flex;align-items:center;gap:40px;padding-right:40px;${MONO};color:var(--nw-chrome-200)}
${N} .nw-ticker-track span::after{content:"";width:5px;height:5px;border-radius:var(--nw-radius-pill);background:var(--color-primary);opacity:.8}
`

/* THE NUMBERS BAND, THE STORY, THE GROUPS, THE CALENDAR, THE FIRST VISIT. */
const HOME = `
${N} .nw-stats{position:relative;overflow:clip;background:var(--nw-spread-top),var(--nw-ink-900)}
${N} .nw-stats-in{max-width:var(--nw-frame);margin:0 auto;padding:56px var(--nw-gutter);display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr));gap:28px 0}
${N} .nw-stat{display:flex;flex-direction:column;gap:10px;padding:0 28px}
${N} .nw-stat:first-child{padding-left:0}
${N} .nw-stat+.nw-stat{border-left:1px solid var(--nw-border-subtle)}
${N} .nw-stat-icon{display:flex;color:var(--nwa-text)}
${N} .nw-stat-value{font-size:clamp(36px,3.4vw,52px);line-height:1}
${N} .nw-stat-word{font-size:clamp(24px,2vw,30px);line-height:1.05}
${N} .nw-stat b{font-size:16px;font-weight:var(--nw-fw-bold)}
${N} .nw-stat small{font-size:13px;color:var(--nw-text-muted)}
@media (max-width:640px){${N} .nw-stat{padding:0 16px}${N} .nw-stat:nth-child(odd){padding-left:0;border-left:0}}
${N} #story .nw-display--xl{font-size:clamp(48px,6vw,92px)}
${N} .nw-numbered{margin:0;padding:0;list-style:none;display:flex;flex-direction:column}
${N} .nw-numbered li{display:grid;grid-template-columns:64px 1fr;gap:20px;padding:26px 0;border-top:1px solid var(--nw-border-subtle)}
${N} .nw-numbered p{margin:0;font-size:19px;line-height:1.55;color:var(--nw-text-secondary);max-width:560px;text-wrap:pretty}
${N} .nw-outline{font-size:40px;line-height:1;color:transparent;-webkit-text-stroke:1px var(--nwa-text)}
${N} .nw-quote{margin:0;padding:22px 24px;border-left:2px solid var(--color-primary);font-family:var(--nw-font-display);font-size:clamp(20px,1.7vw,24px);line-height:1.25}
${N} .nw-quote em{font-family:var(--nw-font-accent);font-style:italic}
${N} .nw-quote span{display:block;margin-top:14px;${MONO};color:var(--nw-text-muted)}
${N} .nw-feature{position:absolute;left:20px;right:20px;bottom:20px;z-index:2;display:flex;justify-content:space-between;align-items:flex-end;gap:12px}
${N} .nw-feature small{display:block;${MONO};color:var(--nwa-text);margin-bottom:8px}
${N} .nw-feature b{display:block;font-size:24px;color:var(--nw-chrome-50)}
${N} .nw-rule-list{margin:0;padding:0;list-style:none;border-top:1px solid var(--nw-border-default)}
${N} .nw-rule-list>li{border-bottom:1px solid var(--nw-border-subtle)}
${N} .nw-group{display:grid;grid-template-columns:150px minmax(0,1fr) auto;gap:24px;align-items:start;padding:28px 0}
${N} .nw-group-when{display:flex;flex-direction:column;gap:6px;align-items:flex-start}
${N} .nw-group-when small{${MONO};color:var(--nwa-text)}
${N} .nw-group-when b{font-size:26px}
${N} .nw-group-what{display:flex;flex-direction:column;gap:10px;min-width:0}
${N} .nw-group-what h3{font-size:clamp(24px,2.2vw,32px)}
${N} .nw-group-what p{margin:0;font-size:15px;color:var(--nw-text-secondary);max-width:52ch;text-wrap:pretty}
${N} .nw-group-people{display:flex;align-items:center;gap:10px;font-size:13px;color:var(--nw-text-muted)}
@media (max-width:640px){${N} .nw-group{grid-template-columns:minmax(0,1fr) auto;gap:14px}${N} .nw-group-when{grid-column:1/-1;flex-direction:row;align-items:baseline;gap:12px}}
${N} .nw-week{display:flex;gap:6px;margin-bottom:36px}
${N} .nw-week>span{flex:1;display:flex;flex-direction:column;align-items:center;gap:8px;padding:12px 0;border-top:1px solid var(--nw-border-subtle)}
${N} .nw-week>span.is-on{border-top-color:var(--color-primary)}
${N} .nw-week small{${MONO};font-size:9.5px;color:var(--nw-text-muted)}
${N} .nw-week .is-on small{color:var(--nw-text-primary)}
${N} .nw-week>span>span{display:flex;gap:3px;min-height:5px}
${N} .nw-week i{width:5px;height:5px;border-radius:var(--nw-radius-pill);background:var(--color-primary);box-shadow:0 0 8px var(--color-primary)}
${N} .nw-dates{margin:0;padding:0;list-style:none;border-top:1px solid var(--nw-border-default)}
${N} .nw-date-row{display:grid;grid-template-columns:150px minmax(0,1fr) 200px auto;gap:28px;align-items:center;padding:26px 0;border-bottom:1px solid var(--nw-border-subtle)}
${N} .nw-date-row.is-first{padding-left:16px;border-radius:var(--nw-radius-md);background:linear-gradient(90deg,color-mix(in oklab,var(--color-primary) 12%,transparent),transparent 60%)}
${N} .nw-date-big{display:flex;flex-direction:column;align-items:flex-start;gap:6px}
${N} .nw-date-big b{font-size:clamp(40px,4vw,56px);line-height:1}
${N} .nw-date-big small{${MONO};color:var(--nw-text-muted)}
${N} .nw-date-row.is-first .nw-date-big small{color:var(--nwa-text)}
${N} .nw-date-what{display:flex;flex-direction:column;gap:6px;min-width:0}
${N} .nw-date-title{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
${N} .nw-date-title h3{font-size:clamp(22px,2vw,28px)}
${N} .nw-date-what p{margin:0;font-size:15px;color:var(--nw-text-secondary);text-wrap:pretty}
${N} .nw-date-when{display:flex;flex-direction:column;gap:4px;font-size:14px;color:var(--nw-text-secondary)}
${N} .nw-date-when b{font-weight:var(--nw-fw-bold);color:var(--nw-text-primary)}
${N} .nw-date-when small{${MONO};font-size:9.5px;color:var(--nwa-text)}
@media (max-width:900px){${N} .nw-date-row{grid-template-columns:84px minmax(0,1fr);gap:8px 16px}${N} .nw-date-big b{font-size:30px}${N} .nw-date-when,${N} .nw-date-row>.nw-btn{grid-column:2}${N} .nw-date-row>.nw-btn{justify-self:start}}
${N} .nw-stepper{position:relative;isolation:isolate;margin:0;padding:0;list-style:none}
${N} .nw-stepper::before{content:"";position:absolute;left:27px;top:24px;bottom:24px;width:1px;background:linear-gradient(var(--color-primary),var(--nw-border-subtle));z-index:0}
${N} .nw-stepper li{display:grid;grid-template-columns:56px 1fr;gap:20px;padding:18px 0;align-items:start}
${N} .nw-stepper li>span:last-child{padding-top:6px;display:flex;flex-direction:column;gap:8px}
${N} .nw-stepper small{${MONO};color:var(--nwa-text)}
${N} .nw-stepper li>span:last-child>span{font-size:18px;line-height:1.45}
${N} .nw-step-dot{position:relative;z-index:1;flex:none;width:56px;height:56px;border-radius:var(--nw-radius-pill);display:grid;place-items:center;font-size:18px;background:var(--nw-ink-900);color:var(--nw-chrome-50);border:1px solid var(--nw-border-default);box-shadow:0 0 0 6px var(--nw-ink-900)}
${N} .is-first>.nw-step-dot,${N} .is-first .nw-step-dot{background:var(--color-primary);color:var(--color-text-on-primary);border-color:var(--color-primary);box-shadow:var(--nw-shadow-glow)}
`

/* THE REGULARS, THE HOSTS, THE WAYS IN, THE PLANS, THE OPEN SPOTS, THE GALLERY, THE POSTS. */
const MORE = `
${N} .nw-reviews{display:grid;gap:16px;align-items:start;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr))}
${N} .nw-review{${CARD};margin:0;padding:28px;display:flex;flex-direction:column;gap:22px}
${N} .nw-review:nth-child(2){margin-top:40px}
${N} .nw-review.is-first{padding:36px;border-color:color-mix(in oklab,var(--color-primary) 35%,transparent);background:linear-gradient(to bottom left,color-mix(in oklab,var(--color-primary) 22%,transparent),transparent 70%),var(--nw-sheen),var(--nw-ink-850)}
${N} .nw-review blockquote{margin:0;flex:1;font-size:18px;line-height:1.5;color:var(--nw-text-primary);text-wrap:pretty}
${N} .nw-review blockquote.nw-display{font-size:26px;line-height:1.2}
${N} .nw-review figcaption{display:flex;justify-content:space-between;align-items:center;gap:12px;padding-top:18px;border-top:1px solid var(--nw-border-subtle)}
${N} .nw-review figcaption small{${MONO};font-size:10px;color:var(--nw-text-muted)}
@media (max-width:899px){${N} .nw-review:nth-child(2){margin-top:0}}
${N} .nw-wall .nw-wall-post{gap:14px}
${N} .nw-wall-who{display:flex;align-items:center;gap:12px}
${N} .nw-wall-who span:last-child{display:flex;flex-direction:column;line-height:1.25}
${N} .nw-wall-who small{font-size:12px;color:var(--nw-text-muted)}
${N} .nw-wall-face{flex:none;width:40px;height:40px;border-radius:999px;display:grid;place-items:center;font-weight:700;background:color-mix(in oklab,var(--color-primary) 22%,transparent);color:var(--color-primary)}
${N} .nw-wall-post p{margin:0;flex:1;font-size:18px;line-height:1.5;color:var(--nw-text-primary);text-wrap:pretty}
${N} .nw-wall-post p.nw-display{font-size:26px;line-height:1.2}
${N} .nw-wall-meta{padding-top:18px;border-top:1px solid var(--nw-border-subtle)}
${N} .nw-wall-meta small{${MONO};font-size:10px;color:var(--nw-text-muted)}
${N} .nw-team{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(min(100%,160px),1fr))}
${N} .nw-person{margin:0;display:flex;flex-direction:column;gap:12px}
${N} .nw-person:nth-child(even){margin-top:36px}
${N} .nw-person figcaption b{display:block;font-size:16px}
${N} .nw-person figcaption small{${MONO};font-size:9.5px;color:var(--nwa-text)}
${N} .nw-offer{padding:24px;gap:10px;background:linear-gradient(180deg,color-mix(in oklab,var(--color-primary) 16%,var(--nw-ink-850)),var(--nw-ink-850) 60%)}
${N} .nw-offer .nw-tile{margin-bottom:12px}
${N} .nw-offer-top{display:flex;justify-content:space-between;${MONO};font-size:10.5px;color:var(--nw-text-muted)}
${N} .nw-offer-top small:last-child{color:var(--nwa-text)}
${N} .nw-offer h3{font-size:22px;text-transform:uppercase;font-weight:var(--nw-fw-heavy)}
${N} .nw-offer p{margin:0;font-size:14px;color:var(--nw-text-secondary)}
${N} .nw-offer-foot{display:flex;justify-content:space-between;align-items:center;margin-top:12px;padding-top:16px;border-top:1px solid var(--nw-border-subtle)}
${N} .nw-offer-foot b{${MONO};font-size:11.5px;color:var(--nw-text-primary)}
${N} .nw-plans{display:grid;gap:0;align-items:stretch;padding-top:8px;border-top:1px solid var(--nw-border-default);grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr))}
${N} .nw-plan{padding:28px;gap:14px}
${N} .nw-plan h3{font-size:26px}
${N} .nw-plan p{margin:0;font-size:15px;color:var(--nw-text-secondary);flex:1}
${N} .nw-plan-price{font-size:30px}
${N} .nw-plan.is-featured{border-color:color-mix(in oklab,var(--color-primary) 45%,transparent);background:linear-gradient(to bottom left,color-mix(in oklab,var(--color-primary) 30%,transparent),transparent 70%),var(--nw-ink-850);box-shadow:0 40px 80px -40px color-mix(in oklab,var(--color-primary) 55%,transparent)}
${N} .nw-plan .nw-badge{align-self:stretch}
${N} .nw-slots{padding:8px;gap:4px}
${N} .nw-slot{display:grid;grid-template-columns:64px minmax(0,1fr) auto;gap:16px;align-items:center;padding:14px 16px;border-radius:var(--nw-radius-md);border:1px solid transparent;color:inherit;text-decoration:none}
${N} .nw-slot.is-first{background:var(--nw-accent-tint);border-color:color-mix(in oklab,var(--color-primary) 40%,transparent)}
${N} .nw-slot.is-first .nw-date small{color:var(--nwa-text)}
${N} .nw-slot .nw-date b{font-size:26px}
${N} .nw-slot-text{min-width:0;display:flex;flex-direction:column;gap:2px}
${N} .nw-slot-text b{font-size:16px}
${N} .nw-slot-text small{font-size:13px;color:var(--nw-text-muted)}
${N} .nw-slot .nw-badge{align-self:center}
${N} .nw-gallery{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr));grid-auto-rows:220px}
${N} .nw-gallery .is-first{grid-column:span 2;grid-row:span 2}
@media (max-width:640px){${N} .nw-gallery .is-first{grid-column:auto;grid-row:auto}}
${N} .nw-posts{display:grid;gap:0;border-top:1px solid var(--nw-border-default);grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr))}
${N} .nw-post{display:flex;flex-direction:column;gap:12px;padding:24px 24px 24px 0;border-bottom:1px solid var(--nw-border-subtle);color:inherit;text-decoration:none}
${N} .nw-post small{${MONO};color:var(--nwa-text)}
${N} .nw-post h3{margin:0;font-family:var(--nw-font-display);font-weight:var(--nw-fw-display);font-size:19px;line-height:1.25;text-wrap:balance}
${N} .nw-post span{margin-top:auto;font-size:13px;color:var(--nw-text-muted)}
${N} a.nw-post:hover h3{color:var(--nwa-text)}
`

/* HOW IT WORKS, WHERE, THE FORMS, THE QUESTIONS, THE TOOLS, THE CLOSER. */
const REST = `
${N} .nw-track{position:relative;height:1px;background:linear-gradient(90deg,transparent,color-mix(in oklab,var(--nw-flare-400) 70%,transparent),transparent);box-shadow:0 0 18px color-mix(in oklab,var(--nw-flare-500) 50%,transparent)}
${N} .nw-track i{position:absolute;top:-1px;left:0;width:120px;height:3px;border-radius:3px;background:linear-gradient(90deg,transparent,var(--nw-chrome-50),transparent);animation:nw-travel 6s ease-in-out infinite}
${N} .nw-process{margin:0;padding:0;list-style:none;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,190px),1fr))}
${N} .nw-process li{position:relative;display:flex;flex-direction:column;gap:16px;padding:40px 28px 0 0}
${N} .nw-process-dot{position:absolute;top:-4px;left:0;width:7px;height:7px;border-radius:var(--nw-radius-pill);background:var(--nw-chrome-200)}
${N} .nw-process .is-first .nw-process-dot{background:var(--color-primary)}
${N} .nw-process-top{display:flex;align-items:flex-end;justify-content:space-between;gap:12px}
${N} .nw-process h3{font-size:22px}
${N} .nw-process p{margin:0;font-size:15px;color:var(--nw-text-secondary);max-width:260px}
${N} .nw-hours{margin:0;display:grid;grid-template-columns:auto 1fr;gap:10px 24px;font-size:15px}
${N} .nw-hours div{display:contents}
${N} .nw-hours dt{color:var(--nw-text-muted)}
${N} .nw-hours dd{margin:0;font-weight:var(--nw-fw-bold)}
${N} .nw-mapgrid{position:absolute;inset:0;background-image:linear-gradient(var(--nw-border-subtle) 1px,transparent 1px),linear-gradient(90deg,var(--nw-border-subtle) 1px,transparent 1px);background-size:48px 48px;-webkit-mask-image:radial-gradient(60% 60% at 50% 50%,black 40%,transparent 100%);mask-image:radial-gradient(60% 60% at 50% 50%,black 40%,transparent 100%)}
${N} .nw-pin{position:absolute;left:62%;top:34%;width:12px;height:12px;margin:-6px 0 0 -6px}
${N} .nw-form-card{padding:32px}
${N} .nw-form{display:grid;gap:20px;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr))}
${N} .nw-field{display:flex;flex-direction:column;gap:10px;min-width:0}
${N} .nw-field>span{${MONO};font-size:10.5px;color:var(--nw-text-secondary)}
${N} .nw-field--wide{grid-column:1/-1}
${N} .nw-input{width:100%;min-height:48px;padding:12px 16px;border-radius:var(--nw-radius-md);border:1px solid var(--nw-border-default);background:color-mix(in oklab,var(--nw-ink-950) 70%,transparent);color:var(--nw-text-primary);font:400 15px var(--nw-font-body)}
${N} .nw-input:focus{outline:2px solid var(--nw-focus-ring);outline-offset:1px;border-color:transparent}
${N} .nw-input::placeholder{color:var(--nw-text-muted)}
${N} .nw-textarea{min-height:110px;resize:vertical}
${N} .nw-input--pill{border-radius:var(--nw-radius-pill);padding:0 18px;flex:1}
${N} .nw-check{display:flex;align-items:center;gap:10px;font-size:14px;color:var(--nw-text-secondary)}
${N} .nw-hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}
${N} .nw-form-foot{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
${N} .nw-form-note{display:inline-flex;align-items:center;gap:8px;font-size:13px;color:var(--nw-text-muted)}
${N} .nw-form-done{margin:0;font-family:var(--nw-font-display);font-size:24px;line-height:1.2}
${N} .nw-form-error{margin:0;font-size:14px;color:var(--nw-danger-500)}
${N} .nw-letter-form{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;width:100%;max-width:460px}
${N} #letter .nw-display--md{font-size:clamp(36px,4.4vw,64px)}
${N} .nw-faq{display:flex;flex-direction:column;gap:10px}
${N} .nw-faq-item{${CARD};padding:0}
${N} .nw-faq-item summary{list-style:none;display:flex;justify-content:space-between;align-items:center;gap:16px;padding:24px;cursor:pointer;font-family:var(--nw-font-display);font-weight:var(--nw-fw-heavy);font-size:16px;text-transform:uppercase;letter-spacing:.01em}
${N} .nw-faq-item summary::-webkit-details-marker{display:none}
${N} .nw-faq-item summary i{position:relative;flex:none;width:28px;height:28px;border-radius:var(--nw-radius-pill);border:1px solid var(--nw-border-default)}
${N} .nw-faq-item summary i::before,${N} .nw-faq-item summary i::after{content:"";position:absolute;left:50%;top:50%;width:10px;height:1.5px;margin:-.75px 0 0 -5px;background:currentColor}
${N} .nw-faq-item summary i::after{transform:rotate(90deg);transition:transform var(--nw-dur-fast)}
${N} .nw-faq-item[open] summary i{background:var(--nw-flare-500);border-color:var(--nw-flare-500);color:var(--nw-text-on-accent)}
${N} .nw-faq-item[open] summary i::after{transform:rotate(0)}
${N} .nw-faq-item p{margin:0;padding:0 24px 24px;font-size:15px;line-height:1.6;color:var(--nw-text-secondary);max-width:62ch}
${N} .nw-tool{display:grid;grid-template-columns:56px minmax(0,1fr) auto;gap:20px;align-items:center;padding:22px 0}
${N} .nw-tool b{display:block;font-size:18px}
${N} .nw-tool span>small{display:block;margin-top:4px;font-size:14px;color:var(--nw-text-secondary)}
${N} .nw-closer{position:relative;isolation:isolate;overflow:hidden;color:var(--nw-text-primary);background:repeating-linear-gradient(135deg,color-mix(in oklab,var(--nw-chrome-50) 3%,transparent) 0 1px,transparent 1px 14px),var(--nw-spread-bottom),var(--nw-spread-bl),var(--nw-ink-950)}
${N} .nw-closer::before{content:"";position:absolute;left:0;right:0;top:0;height:1px;background:linear-gradient(90deg,transparent,color-mix(in oklab,var(--nw-flare-400) 70%,transparent),transparent);z-index:2}
${N} .nw-closer .nw-center{gap:40px}
${N} .nw-closer h2{font-size:clamp(56px,8vw,120px)}
${N} .nw-closer-aside{font-size:clamp(18px,1.6vw,24px);color:var(--nw-chrome-200)}
${N} .nw-closer-aside em{font-size:1em}
@keyframes nw-shimmer{to{background-position:200% 0}}
@keyframes nw-marquee{to{transform:translateX(-50%)}}
@keyframes nw-drift{0%,100%{transform:translate(0,0)}50%{transform:translate(4%,-6%)}}
@keyframes nw-pulse{0%{box-shadow:0 0 0 0 color-mix(in oklab,var(--color-primary) 60%,transparent)}100%{box-shadow:0 0 0 10px transparent}}
@keyframes nw-travel{0%{left:0}50%{left:calc(100% - 120px)}100%{left:0}}
${N}[data-motion="off"] .nw-orb,${N}[data-motion="off"] .nw-ticker-track,${N}[data-motion="off"] .nw-track i,${N}[data-motion="off"] .nw-lit em,${N}[data-motion="off"] .nw-pulse{animation:none}
@media (prefers-reduced-motion:reduce){${N} .nw-orb,${N} .nw-ticker-track,${N} .nw-track i,${N} .nw-lit em,${N} .nw-pulse{animation:none}}
`

/* PAGES: Ways in, Our story and Book (ui_kits/site/WaysIn.jsx, About.jsx, Book.jsx). */
const PAGES = `
${N} .nw-display--md{font-size:clamp(36px,3.6vw,52px)}
${N} .nw-display--lg{font-size:clamp(44px,4.4vw,64px);text-wrap:balance}
${N} .nw-display--page{font-size:clamp(52px,7vw,96px)}
${N} .nw-sec--top::after{background:radial-gradient(60% 50% at 50% 0%,color-mix(in oklab,var(--nw-flare-500) 18%,transparent),transparent 70%)}
${N} .nw-pagehead{position:relative;isolation:isolate;overflow:clip;background:var(--nw-spread-top),var(--nw-spread-tr),var(--nw-surface-page);color:var(--nw-text-primary)}
${N} .nw-pagehead .nw-wrap{padding-top:clamp(80px,9vw,120px);padding-bottom:clamp(48px,6vw,80px)}
${N} .nw-ways{padding:0}
${N} .nw-way{position:relative;border-top:1px solid var(--nw-border-subtle)}
${N} .nw-way:nth-child(odd){background:var(--nw-spread-top)}
${N} .nw-way-in{display:grid;gap:clamp(32px,5vw,64px);align-items:stretch;padding-top:72px;padding-bottom:72px}
@media (min-width:900px){${N} .nw-way-in{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}${N} .nw-way.is-flipped .nw-way-photo{order:2}}
${N} .nw-way-photo{min-height:clamp(260px,32vw,420px);height:100%}
${N} .nw-way-copy{justify-content:center;gap:24px;padding:16px 0}
${N} .nw-way-top{display:flex;align-items:center;gap:16px}
${N} .nw-way-body{margin:0;font-size:18px;line-height:1.55;color:var(--nw-text-secondary);max-width:480px;text-wrap:pretty}
${N} .nw-way-facts{margin:0;display:grid;grid-template-columns:1fr 1fr;border-top:1px solid var(--nw-border-subtle);border-bottom:1px solid var(--nw-border-subtle)}
${N} .nw-way-facts div{display:flex;flex-direction:column;gap:6px;padding:16px 0}
${N} .nw-way-facts div+div{padding-left:20px;border-left:1px solid var(--nw-border-subtle)}
${N} .nw-way-facts dt{${MONO};font-size:10px;color:var(--nw-text-muted)}
${N} .nw-way-facts dd{margin:0;font-size:clamp(22px,2vw,28px)}
${N} .nw-always .nw-wrap{padding-top:96px;padding-bottom:96px}
${N} .nw-ticks{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));column-gap:32px}
${N} .nw-ticks li{display:flex;align-items:center;gap:12px;padding:18px 0;border-top:1px solid var(--nw-border-default);font-size:16px}
${N} .nw-ticks svg{flex:none;color:var(--nwa-text);filter:drop-shadow(0 0 6px currentColor)}
${N} .nw-ticks li:nth-child(even) svg{color:var(--nw-swell-300)}
${N} .nw-chips{display:flex;flex-wrap:wrap;gap:10px}
${N} .nw-chips span{display:inline-flex;align-items:center;gap:8px;padding:9px 14px;border-radius:var(--nw-radius-pill);border:1px solid var(--nw-border-default);background:linear-gradient(180deg,color-mix(in oklab,var(--nw-chrome-50) 6%,transparent),color-mix(in oklab,var(--nw-chrome-50) 1%,transparent));${MONO};font-size:10.5px;color:var(--nw-chrome-200)}
${N} .nw-chips svg{color:var(--nwa-text)}
${N} .nw-about-hero .nw-hero-art{padding-bottom:0}
${N} .nw-frame-glow{padding:1px;border-radius:var(--nw-radius-xl);background:linear-gradient(150deg,color-mix(in oklab,var(--nw-flare-300) 70%,transparent) 0%,color-mix(in oklab,var(--nw-chrome-50) 12%,transparent) 35%,color-mix(in oklab,var(--nw-flare-500) 8%,transparent) 65%,color-mix(in oklab,var(--nw-swell-300) 55%,transparent) 100%);box-shadow:var(--nw-depth-lg),0 30px 80px -40px color-mix(in oklab,var(--nw-flare-500) 60%,transparent)}
${N} .nw-photo--portrait{aspect-ratio:4/5;border:0;border-radius:calc(var(--nw-radius-xl) - 1px)}
${N} .nw-photo .nw-namecard{position:absolute;left:16px;right:16px;bottom:16px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border-radius:var(--nw-radius-md);background:color-mix(in oklab,var(--nw-ink-900) 55%,transparent);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);border:1px solid var(--nw-border-subtle);text-align:left;color:var(--nw-text-primary);font:inherit;letter-spacing:0;text-transform:none}
${N} .nw-namecard span{display:flex;flex-direction:column;gap:3px}
${N} .nw-namecard b{font-size:16px;color:var(--nw-chrome-50)}
${N} .nw-namecard small{${MONO};font-size:10px;color:var(--nw-text-muted)}
${N} .nw-prose{display:flex;flex-direction:column;gap:28px;max-width:680px}
${N} .nw-prose p{margin:0;font-size:19px;line-height:1.6;color:var(--nw-text-secondary);text-wrap:pretty}
${N} .nw-quoteband{background:var(--nw-ink-950)}
${N} .nw-quoteband .nw-center{gap:36px}
${N} .nw-quoteband blockquote{margin:0;font-size:clamp(34px,4.2vw,60px);max-width:1000px;text-wrap:balance}
${N} .nw-rule-label{display:flex;align-items:center;gap:16px;width:100%;max-width:520px;${MONO};color:var(--nw-text-secondary);white-space:nowrap}
${N} .nw-rule-label i{flex:1;height:1px;background:linear-gradient(90deg,transparent,var(--nw-border-strong))}
${N} .nw-rule-label i:last-child{background:linear-gradient(270deg,transparent,var(--nw-border-strong))}
${N} .nw-promises{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:40px;border-top:1px solid var(--nw-border-subtle)}
${N} .nw-promises article{padding-top:36px;display:flex;flex-direction:column;gap:16px}
${N} .nw-promise-top{display:flex;align-items:center;justify-content:space-between}
${N} .nw-promise-top small{${MONO};color:var(--nwa-text)}
${N} .nw-promises h3{font-size:26px}
${N} .nw-promises p{margin:0;font-size:16px;line-height:1.55;color:var(--nw-text-secondary);max-width:340px}
${N} .nw-book .nw-wrap{padding-top:clamp(80px,8vw,96px)}
${N} .nw-book .nw-display em{display:block}
${N} .nw-summary{padding:22px;gap:14px}
${N} .nw-summary dl{margin:0;display:flex;flex-direction:column;gap:12px}
${N} .nw-summary dl div{display:flex;justify-content:space-between;gap:12px;padding-top:12px;border-top:1px solid var(--nw-border-subtle);font-size:15px}
${N} .nw-summary dt{color:var(--nw-text-muted)}
${N} .nw-summary dd{margin:0;font-weight:var(--nw-fw-bold);text-align:right}
${N} .nw-book-card{padding:clamp(24px,3vw,40px);gap:32px;border-radius:var(--nw-radius-xl)}
${N} .nw-choices{display:flex;flex-direction:column;gap:8px}
${N} .nw-choice{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:16px;align-items:center;padding:16px 18px;border-radius:var(--nw-radius-md);border:1px solid var(--nw-border-default);background:color-mix(in oklab,var(--nw-chrome-50) 3%,transparent);color:inherit;text-decoration:none;transition:border-color var(--nw-dur-base),background-color var(--nw-dur-base)}
${N} a.nw-choice:hover,${N} .nw-choice.is-first{border-color:color-mix(in oklab,var(--color-primary) 55%,transparent);background:var(--nw-accent-tint)}
${N} .nw-choice-text{display:flex;flex-direction:column;gap:3px;min-width:0}
${N} .nw-choice-text b{font-size:16px}
${N} .nw-choice-text small{font-size:13px;color:var(--nw-text-muted)}
${N} .nw-slots--flat{display:flex;flex-direction:column;padding:0}
${N} .nw-book-foot{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:16px;padding-top:24px;border-top:1px solid var(--nw-border-subtle)}
@media (max-width:640px){${N} .nw-choice{grid-template-columns:minmax(0,1fr) auto}${N} .nw-choice .nw-mono{grid-column:1;grid-row:2}${N} .nw-slots .nw-slot{grid-template-columns:56px minmax(0,1fr);padding:12px 8px}${N} .nw-slots .nw-slot>.nw-badge,${N} .nw-slots .nw-slot>.nw-mono{grid-column:2;justify-self:start}}
`

export const NEW_WORLD_SECTIONS_CSS = `${ACCENT}${TYPE}${SECTION}${PARTS}${HERO}${HOME}${MORE}${REST}${PAGES}`
