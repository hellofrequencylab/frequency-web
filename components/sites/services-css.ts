import { SERVICES_DAY_CSS, SERVICES_TOKENS_CSS } from "@/lib/theme/services";
// THE SERVICES SKIN (design: Services design system, ui_kits/site Sections.jsx + Blocks.jsx + tokens base/effects/textures). Scoped
// under [data-house-theme="services"], so it can only ever dress the stand-alone site render (components/sites/site-chrome.tsx sets the
// attribute; nothing in a member, Space console or admin area does: app/(main)/no-site-theme-in-member-area.test.ts guards it, ADR-1906).
// The design draws every section with inline styles; here each is a class, every colour, wash and shadow reads the token block
// (lib/theme/services.ts), and the sizes are the design's own. Type voice, image treatment and motion are the three data-* switches the
// design's base and effects sheets define, scoped to the same attribute. The kit is dark by default; Day is the token block's own register.

const S = '[data-house-theme="services"]';
const GUT = "var(--sv-gutter)";
const WRAP = `max-width:var(--sv-container-max);margin:0 auto;padding:clamp(72px,9vw,128px) ${GUT}`;
const MONO =
  "font-family:var(--sv-font-mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase";
const CARD =
  "border:1px solid var(--sv-border-subtle);border-radius:var(--sv-radius-lg);background:var(--sv-sheen),var(--sv-ink-850);box-shadow:var(--sv-shadow-md)";

/* THE CONTRACT BRIDGE: the shared block contract (lib/theme/block-contract-map.json) reads --color-*, --radius-*, --font-* and
 * the motion names, never --sv-*, so a role block would draw unthemed without these aliases. Night is the default register; Day
 * (data-th="day") needs no aliases of its own: the Day register (SERVICES_DAY_CSS) flips the ink and chrome ramps, so the same names
 * resolve to salt and cream. On Day the eyebrow step and the accent text step are darkened toward the ink so they read on cream. The --color-primary family is never set here: it is the owner's accent
 * (servicesAccentVars, Tide when none), set on the site root's accent scope. ACCENT_BRIDGE (in SERVICES_SITE_CSS, not the skin, which
 * reads only --sv-* and is shared with New World) points the skin's own accent ramp (--sv-flare-*) at it. */
const BRIDGE = `
${S}{--color-canvas:var(--sv-surface-page);--color-surface:var(--sv-surface-raised);--color-surface-post:var(--sv-surface-raised);--color-surface-elevated:var(--sv-surface-card);--color-surface-hover:var(--sv-ink-700);--color-border:var(--sv-border-default);--color-border-strong:var(--sv-border-strong);--color-text:var(--sv-text-primary);--color-text-muted:var(--sv-text-secondary);--color-text-subtle:var(--sv-text-muted);--color-focus-ring:var(--sv-focus-ring);--color-success:var(--sv-success-500);--color-warning:var(--sv-warning-500);--color-danger:var(--sv-danger-500);--color-info:var(--sv-halo-500);--color-ink:var(--sv-action-primary);--color-on-ink:var(--sv-action-primary-text);--radius-control:var(--sv-radius-pill);--radius-card:var(--sv-radius-lg);--radius-cover:var(--sv-radius-xl);--radius-media:var(--sv-radius-lg);--font-display:var(--sv-font-display);--font-body:var(--sv-font-body);--font-label:var(--sv-font-mono);--space-section:clamp(72px,9vw,128px);--motion-fast:var(--sv-dur-fast);--motion-base:var(--sv-dur-base);--ease-out:var(--sv-ease-out)}
`;

/* THE ACCENT BRIDGE: the skin's accent ramp follows the owner's accent, so an Ember or Fern site draws Ember or Fern everywhere, not
 * only in the role blocks. On Day the light flare step and the accent text step mix toward the light chrome so they read on cream. */
const ACCENT_BRIDGE = `
${S}{--sv-flare-500:var(--color-primary,var(--sv-flare-600));--sv-flare-400:var(--color-primary-strong,var(--sv-flare-600));--sv-flare-300:color-mix(in oklab,var(--sv-flare-500) 50%,white);--sv-flare-700:color-mix(in oklab,var(--sv-flare-500) 45%,var(--sv-ink-900));--sv-accent-hover:var(--color-primary-hover,var(--sv-flare-600));--sv-accent-text:var(--color-text-on-primary,var(--sv-ink-900))}
${S}[data-th="day"]{--sv-flare-300:color-mix(in oklab,var(--sv-flare-500) 55%,var(--sv-chrome-50));--color-primary-strong:color-mix(in oklab,var(--color-primary) 62%,var(--sv-chrome-50))}
`;

export const SERVICES_CSS = `
${BRIDGE}/* DISPLAY TYPE: condensed caps with a Lora italic, three voices (data-type). */
${S} .sv-display{font-family:var(--sv-font-display);font-stretch:var(--sv-stretch-display);font-weight:800;text-transform:uppercase;letter-spacing:var(--sv-ls-display);line-height:var(--sv-lh-display);margin:0;color:var(--sv-text-primary);text-wrap:balance}
${S} .sv-display em{font-family:var(--sv-font-accent);font-style:italic;font-weight:400;font-stretch:100%;text-transform:none;letter-spacing:-.01em;font-size:1.04em;line-height:.8}
${S}[data-type="quiet"] .sv-display{text-transform:none;font-stretch:100%;font-weight:600;letter-spacing:-.03em;line-height:1}
${S}[data-type="quiet"] .sv-display em{font-family:var(--sv-font-display);font-style:normal;font-weight:300;font-size:1em;line-height:inherit;letter-spacing:-.03em}
${S}[data-type="editorial"] .sv-display{font-family:var(--sv-font-accent);text-transform:none;font-stretch:100%;font-weight:500;letter-spacing:-.02em;line-height:1.02}
${S}[data-type="editorial"] .sv-display em{font-family:var(--sv-font-display);font-style:normal;font-weight:700;font-stretch:85%;text-transform:uppercase;font-size:.78em;letter-spacing:0;line-height:inherit;vertical-align:.06em}
${S} .sv-mono{${MONO}}
${S} .sv-eyebrow{${MONO};display:inline-flex;align-items:center;gap:10px;color:var(--sv-flare-300)}
${S} .sv-eyebrow b{font-weight:400;color:var(--sv-text-muted)}
${S} .sv-eyebrow::before{content:"";width:18px;height:1px;background:currentColor}

/* THE SECTION: a band with a wrap, a texture and a top glow line. */
${S} .sv-sec{position:relative;isolation:isolate;overflow:clip;color:var(--sv-text-primary)}
${S} .sv-sec::before{content:"";position:absolute;left:0;right:0;top:0;height:1px;background:linear-gradient(90deg,transparent,color-mix(in oklab,var(--sv-flare-400) 75%,transparent),transparent);pointer-events:none;z-index:1}
${S} .sv-sec--aurora{background:linear-gradient(to bottom right,color-mix(in oklab,var(--sv-flare-500) 14%,var(--sv-ink-900)) 0%,color-mix(in oklab,var(--sv-flare-500) 3%,var(--sv-ink-900)) 48%,transparent 72%),linear-gradient(to top left,color-mix(in oklab,var(--sv-swell-500) 8%,var(--sv-ink-900)) 0%,transparent 72%)}
${S} .sv-sec--depth{background:linear-gradient(180deg,var(--sv-ink-900),var(--sv-ink-950))}
${S} .sv-sec--sky{background:linear-gradient(to bottom left,color-mix(in oklab,var(--sv-halo-500) 16%,var(--sv-ink-900)) 0%,color-mix(in oklab,var(--sv-halo-500) 7%,var(--sv-ink-900)) 24%,transparent 58%),var(--sv-ink-950)}
${S} .sv-sec--ink{background:var(--sv-ink-950)}
${S} .sv-wrap{position:relative;z-index:2;${WRAP}}
${S} .sv-split{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,400px),1fr));gap:clamp(40px,6vw,80px);align-items:center}
${S} .sv-orb{position:absolute;border-radius:50%;pointer-events:none;z-index:0;filter:blur(90px);opacity:.5;animation:sv-drift 22s ease-in-out infinite;background:radial-gradient(closest-side,color-mix(in oklab,var(--sv-flare-500) 36%,transparent),transparent)}
${S} .sv-orb--sea{background:radial-gradient(closest-side,color-mix(in oklab,var(--sv-swell-500) 36%,transparent),transparent)}
${S} .sv-orb--gold{background:radial-gradient(closest-side,color-mix(in oklab,var(--sv-halo-500) 32%,transparent),transparent)}
${S} .sv-pinstripe{position:absolute;inset:0;pointer-events:none;background-image:repeating-linear-gradient(135deg,color-mix(in oklab,var(--sv-chrome-50) 4%,transparent) 0 1px,transparent 1px 14px)}
${S} .sv-dotgrid{position:absolute;inset:0;pointer-events:none;background-image:radial-gradient(circle,color-mix(in oklab,var(--sv-chrome-50) 14%,transparent) 1px,transparent 1.3px);background-size:22px 22px;-webkit-mask-image:radial-gradient(60% 60% at 50% 50%,black 30%,transparent 100%);mask-image:radial-gradient(60% 60% at 50% 50%,black 30%,transparent 100%)}

/* THE HEAD: index, eyebrow, title with its italic, lede, optional action. */
${S} .sv-head{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:24px;margin-bottom:clamp(40px,5vw,72px)}
${S} .sv-head-copy{display:flex;flex-direction:column;gap:20px;max-width:720px}
${S} .sv-head .sv-display{font-size:clamp(40px,5vw,72px)}
${S} .sv-lede{margin:0;font-size:var(--sv-fs-body-l);line-height:1.55;color:var(--sv-text-secondary);max-width:560px;text-wrap:pretty}

/* BUTTONS: filled accent (ink label), secondary outline, ghost. */
${S} .sv-btn{position:relative;overflow:hidden;isolation:isolate;display:inline-flex;align-items:center;justify-content:center;gap:12px;height:50px;padding:0 26px;border-radius:var(--sv-radius-pill);font-family:var(--sv-font-display);font-stretch:var(--sv-stretch-display);text-transform:uppercase;white-space:nowrap;font-weight:var(--sv-fw-bold);font-size:11.5px;letter-spacing:var(--sv-ls-button);text-decoration:none;cursor:pointer;transition:background var(--sv-dur-fast),color var(--sv-dur-fast),border-color var(--sv-dur-fast)}
${S} .sv-btn--lg{height:60px;padding:0 34px;font-size:12.5px}
${S} .sv-btn--accent{background:var(--sv-accent);color:var(--sv-action-primary-text);border:1px solid var(--sv-accent)}
${S} .sv-btn--accent:hover{box-shadow:var(--sv-shadow-glow)}
${S} .sv-btn--accent:hover{background:var(--sv-accent-hover);color:var(--sv-action-primary-text)}
${S} .sv-btn--secondary{background:color-mix(in oklab,var(--sv-chrome-50) 2%,transparent);color:var(--sv-text-primary);border:1px solid var(--sv-border-default);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}
${S} .sv-btn--secondary:hover{border-color:var(--sv-accent);color:var(--sv-text-primary)}
${S} .sv-btn:focus-visible,${S} .sv-card:focus-visible,${S} .sv-row:focus-visible{outline:2px solid var(--sv-focus-ring);outline-offset:3px}
${S} .sv-actions{display:flex;flex-wrap:wrap;gap:14px;align-items:center}

/* CARDS */
${S} .sv-grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(var(--sv-min,280px),1fr))}
${S} .sv-card{${CARD};position:relative;display:flex;flex-direction:column;gap:14px;padding:28px;color:inherit;text-decoration:none}
${S} a.sv-card{transition:border-color var(--sv-dur-base),transform var(--sv-dur-base) var(--sv-ease-out)}
${S} a.sv-card:hover{border-color:var(--sv-accent);transform:translateY(-3px)}
${S} .sv-card--lit{border-color:color-mix(in oklab,var(--sv-flare-400) 45%,transparent);background:var(--sv-spread-tr),var(--sv-sheen),var(--sv-ink-850)}
${S} .sv-card h3{margin:0;font-size:22px;line-height:1.2;font-weight:var(--sv-fw-bold);color:var(--sv-text-primary)}
${S} .sv-card p{margin:0;font-size:15px;line-height:1.55;color:var(--sv-text-secondary)}
${S} .sv-card .sv-mono{color:var(--sv-text-muted);font-size:10.5px}
${S} .sv-price{font-family:var(--sv-font-display);font-stretch:var(--sv-stretch-display);font-weight:800;font-size:34px;color:var(--sv-text-primary);letter-spacing:var(--sv-ls-display)}
${S} .sv-price small{${MONO};font-size:10px;color:var(--sv-text-muted);margin-left:6px;font-weight:400}
${S} .sv-tile{display:grid;place-items:center;width:44px;height:44px;border-radius:var(--sv-radius-md);background:var(--sv-accent-tint);border:1px solid color-mix(in oklab,var(--sv-flare-400) 30%,transparent);color:var(--sv-flare-300);font-family:var(--sv-font-mono);font-size:13px}
${S} .sv-empty{${CARD};box-shadow:none;border-style:dashed;padding:28px;text-align:center;font-size:14px;color:var(--sv-text-muted);grid-column:1/-1}
${S} .sv-list{display:flex;flex-direction:column;gap:4px;padding:8px;${CARD}}
${S} .sv-row{display:grid;grid-template-columns:64px 1fr auto;gap:16px;align-items:center;padding:14px 16px;border-radius:var(--sv-radius-md);border:1px solid transparent;color:inherit;text-decoration:none}
${S} .sv-row:first-child{background:var(--sv-accent-tint);border-color:color-mix(in oklab,var(--sv-flare-400) 30%,transparent)}
${S} .sv-row b{display:block;font-size:16px}
${S} .sv-row span{font-size:13px;color:var(--sv-text-muted)}
${S} .sv-day{${MONO};font-size:10.5px;color:var(--sv-flare-300)}

/* PHOTOS: a frame with the dot grid behind a missing picture, and the three image treatments (data-image). */
${S} .sv-photo{position:relative;overflow:hidden;border-radius:var(--sv-radius-xl);border:1px solid var(--sv-border-subtle);background:var(--sv-spread-tl),var(--sv-spread-br),var(--sv-ink-800);aspect-ratio:var(--sv-ratio,4/5);margin:0}
${S} .sv-photo img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
${S}[data-image="mono"] .sv-photo img{filter:grayscale(1) contrast(1.05)}
${S}[data-image="clean"] .sv-photo::after{display:none}
${S}[data-image="grain"] .sv-photo::after{content:"";position:absolute;inset:0;pointer-events:none;opacity:.22;mix-blend-mode:overlay;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")}
${S} .sv-photo--wide{--sv-ratio:4/3}
${S} .sv-photo--sq{--sv-ratio:1/1}
${S} .sv-photo figcaption{position:absolute;left:14px;bottom:14px;${MONO};font-size:10px;color:var(--sv-chrome-200)}

/* HERO: four variants (photo, split, minimal, glow) with the booking panel and the area ticker. */
${S} .sv-hero{position:relative;display:flex;flex-direction:column;overflow:hidden;background:var(--sv-ink-950);isolation:isolate}
${S} .sv-hero-bg{position:absolute;inset:0;background:var(--sv-glow-sunset),linear-gradient(to bottom left,color-mix(in oklab,var(--sv-halo-500) 16%,var(--sv-ink-900)) 0%,color-mix(in oklab,var(--sv-halo-500) 7%,var(--sv-ink-900)) 24%,transparent 58%);z-index:0}
${S} .sv-hero-bg--photo{background-size:cover;background-position:70% 30%}
${S} .sv-hero-bg--photo::after{content:"";position:absolute;inset:0;background:var(--sv-overlay-bottom)}
${S} .sv-hero-in{position:relative;z-index:2;flex:1;width:100%;box-sizing:border-box;max-width:var(--sv-container-max);margin:0 auto;padding:clamp(120px,14vw,176px) ${GUT} 96px;display:grid;gap:36px 72px;align-items:end;grid-template-columns:repeat(auto-fit,minmax(min(100%,400px),1fr))}
${S} .sv-hero--split .sv-hero-in{align-items:center}
${S} .sv-hero--minimal .sv-hero-in{display:flex;flex-direction:column;align-items:center;text-align:center;padding-bottom:72px}
${S} .sv-hero-copy{display:flex;flex-direction:column;gap:30px;align-items:flex-start}
${S} .sv-hero--minimal .sv-hero-copy{align-items:center}
${S} .sv-hero-copy .sv-display{font-size:clamp(52px,8vw,132px)}
${S} .sv-hero--split .sv-hero-copy .sv-display{font-size:clamp(48px,6.4vw,100px)}
${S} .sv-hero--minimal .sv-hero-copy .sv-display{font-size:clamp(48px,7vw,112px)}
${S} .sv-hero-lead{margin:0;font-size:20px;line-height:1.55;max-width:560px;color:var(--sv-chrome-200);text-wrap:pretty}
/* THE PHOTO HERO IN THE FOLD (owner, 2026-11-04, on the Vanta site), drawn as the kit's photo hero (Sections.jsx Hero, look photo).
   The Space document wraps every block in the page rhythm (py-8, space-y-14), which sat a 40px ink band above the photo hero; the
   design's sections run flush and carry their own padding, so the wrapper adds nothing here. The kit's own pieces: the overlay scrim
   over the photo, the eyebrow as a flare dot and mono line, the italic lit with the shimmer gradient, the lead in chrome 200. The owner's
   rules on top: everything in the first viewport (a shorter top and a display size held by the viewport height), and the services box
   keeps its left edge and stops at 440px so the photo's subject stays in view. */
${S} [data-mw-own]>div{padding-block:0}
${S} [data-mw-own]>div>*{margin-block:0}
${S} .sv-hero-bg--photo::before{content:"";position:absolute;inset:0;z-index:1;background:var(--sv-overlay-scrim)}
${S} .sv-hero--photo{min-height:min(100svh,980px)}
${S} .sv-hero--photo .sv-hero-in{padding:clamp(104px,9vw,132px) ${GUT} clamp(40px,6vh,72px);gap:36px 72px}
${S} .sv-hero--photo .sv-hero-copy{gap:clamp(20px,3.3vh,30px)}
${S} .sv-hero--photo .sv-hero-copy .sv-display{font-size:clamp(64px,min(9vw,11.5vh),148px)}
${S} .sv-hero-copy .sv-display em{background:var(--sv-grad-lit) 0 0/200% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;padding-right:.1em;animation:sv-shimmer 10s linear infinite}
${S}[data-motion="off"] .sv-hero-copy .sv-display em{animation:none}
@keyframes sv-shimmer{to{background-position:200% 0}}
${S} .sv-hero-copy > .sv-eyebrow{gap:12px;font-size:13px;color:var(--sv-text-secondary)}
${S} .sv-hero-copy > .sv-eyebrow::before{width:7px;height:7px;border-radius:9px;background:var(--sv-flare-500);box-shadow:0 0 12px color-mix(in oklab,var(--sv-flare-500) 80%,transparent)}
${S} .sv-hero--photo .sv-panel{justify-self:start;width:min(100%,440px)}
${S} .sv-proof{display:flex;align-items:center;gap:12px;font-size:14px;color:var(--sv-chrome-200)}
${S} .sv-stars{display:inline-flex;gap:2px;color:var(--sv-flare-300)}
${S} .sv-panel{display:flex;flex-direction:column;gap:4px;padding:6px;border-radius:var(--sv-radius-lg);background:color-mix(in oklab,var(--sv-ink-900) 62%,transparent);border:1px solid var(--sv-border-default);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}
${S} .sv-panel-top{display:flex;justify-content:space-between;align-items:center;padding:12px 14px 8px;${MONO};font-size:10.5px;color:var(--sv-chrome-200)}
${S} .sv-panel-top i{display:inline-block;width:6px;height:6px;border-radius:9px;background:var(--sv-flare-400);margin-right:8px}
${S} .sv-panel-row{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:var(--sv-radius-md);border:1px solid var(--sv-border-subtle);background:color-mix(in oklab,var(--sv-chrome-50) 4%,transparent);color:inherit;text-decoration:none}
${S} .sv-panel-row span{display:flex;flex-direction:column;gap:2px;flex:1;min-width:0}
${S} .sv-panel-row b{font-size:16px;color:var(--sv-chrome-50)}
${S} .sv-panel-row small{font-size:13px;color:var(--sv-text-muted)}
${S} .sv-panel-row em{font-style:normal;${MONO};font-size:10.5px;color:var(--sv-chrome-50);white-space:nowrap}
${S} .sv-panel-foot{padding:10px 14px 8px;font-size:13px;color:var(--sv-text-muted)}
${S} .sv-panel-foot b{color:var(--sv-chrome-50);font-weight:600}
${S} .sv-hero-quick{position:relative;z-index:2;max-width:var(--sv-container-max);width:100%;box-sizing:border-box;margin:0 auto;padding:0 ${GUT} 72px;display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
${S} .sv-ticker{position:relative;z-index:2;border-top:1px solid var(--sv-border-subtle);overflow:hidden;padding:18px 0}
${S} .sv-ticker-track{display:flex;width:max-content;animation:sv-marquee 40s linear infinite}
${S} .sv-ticker-track span{display:flex;align-items:center;gap:40px;padding-right:40px;${MONO};color:var(--sv-chrome-200)}
${S} .sv-ticker-track span::after{content:"";width:5px;height:5px;border-radius:9px;background:var(--sv-flare-400);opacity:.7}

/* TRUST, STORY, STEPS, REVIEWS, FAQ, BAND */
${S} .sv-trust{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:28px 0;max-width:var(--sv-container-max);margin:0 auto;padding:44px ${GUT}}
${S} .sv-trust-item{display:flex;align-items:center;gap:16px;padding:4px 24px;border-left:1px solid var(--sv-border-subtle)}
${S} .sv-trust-item:first-child{border-left:0;padding-left:0}
${S} .sv-trust-item span{display:flex;flex-direction:column;gap:4px}
${S} .sv-trust-item b{font-size:16px}
${S} .sv-trust-item small{font-size:13px;color:var(--sv-text-muted)}
${S} .sv-story-copy{display:flex;flex-direction:column;gap:28px;align-items:flex-start}
${S} .sv-story-copy .sv-display{font-size:clamp(40px,5.2vw,76px)}
${S} .sv-story-copy p{margin:0;font-size:19px;line-height:1.6;color:var(--sv-text-secondary);max-width:560px;text-wrap:pretty}
${S} .sv-steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));border-top:1px solid var(--sv-border-default)}
${S} .sv-step{position:relative;display:flex;flex-direction:column;gap:16px;padding:40px 28px 0 0}
${S} .sv-step::before{content:"";position:absolute;top:-4px;left:0;width:7px;height:7px;border-radius:9px;background:var(--sv-chrome-200)}
${S} .sv-step:first-child::before{background:var(--sv-flare-500)}
${S} .sv-step-num{font-family:var(--sv-font-display);font-stretch:var(--sv-stretch-display);font-weight:800;font-size:56px;line-height:1;color:transparent;-webkit-text-stroke:1px var(--sv-border-strong)}
${S} .sv-step h3{margin:0;font-family:var(--sv-font-display);font-stretch:var(--sv-stretch-display);font-weight:800;text-transform:uppercase;font-size:22px;letter-spacing:var(--sv-ls-display)}
${S} .sv-step p{margin:0;font-size:15px;color:var(--sv-text-secondary);max-width:260px}
${S} .sv-quote{margin:0;display:flex;flex-direction:column;gap:22px;padding:28px;border-radius:var(--sv-radius-lg);border:1px solid var(--sv-border-subtle);background:var(--sv-sheen),var(--sv-ink-850)}
${S} .sv-quote:first-child{border-color:color-mix(in oklab,var(--sv-flare-300) 35%,transparent)}
${S} .sv-quote blockquote{margin:0;flex:1;font-size:18px;line-height:1.5;color:var(--sv-chrome-50);text-wrap:pretty}
${S} .sv-quote figcaption{display:flex;justify-content:space-between;align-items:center;gap:12px;padding-top:18px;border-top:1px solid var(--sv-border-subtle)}
${S} .sv-quote figcaption b{font-weight:700}
${S} .sv-quote figcaption span{${MONO};font-size:10px;color:var(--sv-text-muted)}
${S} .sv-faq{display:flex;flex-direction:column}
${S} .sv-faq details{border-bottom:1px solid var(--sv-border-subtle);padding:22px 0}
${S} .sv-faq summary{cursor:pointer;list-style:none;display:flex;justify-content:space-between;gap:16px;font-size:19px;font-weight:var(--sv-fw-bold)}
${S} .sv-faq summary::-webkit-details-marker{display:none}
${S} .sv-faq summary::after{content:"+";color:var(--sv-flare-300);font-family:var(--sv-font-mono)}
${S} .sv-faq details[open] summary::after{content:"\\2212"}
${S} .sv-faq p{margin:14px 0 0;font-size:16px;line-height:1.6;color:var(--sv-text-secondary);max-width:620px}
${S} .sv-facts{display:flex;flex-direction:column;gap:14px;font-size:15px;color:var(--sv-chrome-200)}
${S} .sv-chips{display:flex;flex-wrap:wrap;gap:8px}
${S} .sv-chips span{padding:6px 12px;border-radius:var(--sv-radius-pill);border:1px solid var(--sv-border-default);font-size:13px;color:var(--sv-chrome-200)}
${S} .sv-hours{margin:0;display:grid;grid-template-columns:auto 1fr;gap:10px 24px;font-size:15px}
${S} .sv-hours dt{color:var(--sv-text-muted)}
${S} .sv-hours dd{margin:0;font-weight:600}
${S} .sv-band{text-align:center}
${S} .sv-band .sv-wrap{display:flex;flex-direction:column;align-items:center;gap:40px}
${S} .sv-band .sv-display{font-size:clamp(52px,8vw,120px)}
${S} .sv-center{display:flex;flex-direction:column;align-items:center;text-align:center;gap:24px}
${S} .sv-center .sv-display{font-size:clamp(36px,4.4vw,64px)}
${S} .sv-people{margin:0;display:flex;flex-direction:column;gap:14px}
${S} .sv-people figcaption b{display:block;font-size:17px}
${S} .sv-people figcaption span{font-size:14px;color:var(--sv-text-muted)}
${S} .sv-mosaic{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));grid-auto-rows:220px;gap:10px}
${S} .sv-mosaic .sv-photo{aspect-ratio:auto;border-radius:var(--sv-radius-lg)}
${S} .sv-mosaic .sv-photo:first-child{grid-column:span 2;grid-row:span 2}

/* CHROME: the header (bar, pill, centered) and the footer (full, minimal). */
${S} .sv-logo{font-family:var(--sv-font-display);font-stretch:var(--sv-stretch-display);font-weight:800;text-transform:uppercase;letter-spacing:var(--sv-ls-display);font-size:20px;color:var(--sv-text-primary);text-decoration:none}
${S} .sv-header{position:relative;z-index:5;background:var(--sv-ink-950);border-bottom:1px solid var(--sv-border-subtle)}
${S} .sv-header--overlay{position:absolute;left:0;right:0;top:0;background:linear-gradient(180deg,color-mix(in oklab,var(--sv-ink-950) 55%,transparent),transparent);border-bottom:0}
${S} .sv-header-in{display:flex;align-items:center;gap:clamp(20px,3vw,40px);max-width:var(--sv-container-max);margin:0 auto;padding:18px ${GUT}}
${S} .sv-header-end{display:flex;align-items:center;gap:clamp(16px,2vw,28px);margin-left:auto}
${S} .sv-header-in--centered{display:grid;grid-template-columns:1fr auto 1fr}
${S} .sv-header-in--centered .sv-header-end{justify-content:flex-end}
${S} .sv-header-nav{display:flex;justify-content:center;padding:0 ${GUT} 14px}
${S} .sv-nav{display:flex;flex-wrap:wrap;gap:clamp(16px,2.4vw,32px)}
${S} .sv-nav a,${S} .sv-phone{${MONO};color:var(--sv-chrome-200);text-decoration:none;white-space:nowrap;transition:color var(--sv-dur-fast)}
${S} .sv-nav a:hover,${S} .sv-phone:hover{color:var(--sv-chrome-50)}
${S} .sv-header--bar .sv-nav{padding:10px 22px;border-radius:var(--sv-radius-pill);border:1px solid var(--sv-border-subtle)}
${S} .sv-header--pill{background:transparent;border-bottom:0;padding:16px ${GUT};position:sticky;top:0}
${S} .sv-header--pill .sv-header-in{max-width:min(var(--sv-container-max),1080px);height:64px;padding:0 10px 0 22px;border-radius:var(--sv-radius-pill);background:color-mix(in oklab,var(--sv-ink-950) 72%,transparent);border:1px solid var(--sv-border-default);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);box-shadow:var(--sv-shadow-lg)}
${S} .sv-footer{position:relative;overflow:hidden;background:var(--sv-glow-sunset),var(--sv-ink-950);color:var(--sv-chrome-50);border-top:1px solid var(--sv-border-subtle)}
${S} .sv-footer-cols{display:grid;grid-template-columns:1.6fr 1fr 1fr;gap:48px;max-width:var(--sv-container-max);margin:0 auto;padding:clamp(56px,7vw,96px) ${GUT} 56px}
${S} .sv-footer-brand{display:flex;flex-direction:column;gap:24px;align-items:flex-start}
${S} .sv-footer-brand p{margin:0;font-size:var(--sv-fs-body-l);color:var(--sv-chrome-200);max-width:360px}
${S} .sv-footer-col{display:flex;flex-direction:column;gap:12px;font-size:15px;color:var(--sv-chrome-200)}
${S} .sv-footer-col a{color:inherit;text-decoration:none}
${S} .sv-footer-col a:hover{color:var(--sv-chrome-50)}
${S} .sv-footer-col .sv-mono{color:var(--sv-text-muted);margin-bottom:6px}
${S} .sv-footer-min{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:24px;max-width:var(--sv-container-max);margin:0 auto;padding:64px ${GUT} 24px}
${S} .sv-footer-base{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;max-width:var(--sv-container-max);margin:0 auto;padding:24px ${GUT};color:var(--sv-text-muted);font-size:10.5px}
@media (max-width:760px){${S} .sv-footer-cols{grid-template-columns:1fr}${S} .sv-header-in{flex-wrap:wrap}${S} .sv-header-in--centered{grid-template-columns:1fr}${S} .sv-header-end{margin-left:0;flex-wrap:wrap}}

/* QUOTE FORM (ServicesQuote, design: Vanta Quote.jsx): copy left and sticky, the stepper and the glass card right. */
${S} .sv-qf{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,7fr);gap:clamp(40px,6vw,80px);align-items:start}
${S} .sv-qf-copy{position:sticky;top:120px;display:flex;flex-direction:column;gap:36px}
${S} .sv-qf-form{display:flex;flex-direction:column;gap:32px;min-width:0}
${S} .sv-stepper{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
${S} .sv-stepper button{all:unset;box-sizing:border-box;width:100%;display:flex;align-items:center;gap:12px;padding-top:14px;border-top:2px solid var(--sv-border-subtle);${MONO};font-size:10.5px;color:var(--sv-text-muted);cursor:default}
${S} .sv-stepper li[aria-current] button{border-top-color:var(--sv-accent);color:var(--sv-text-primary)}
${S} .sv-stepper li[data-done] button{border-top-color:var(--sv-accent);color:var(--sv-text-secondary);cursor:pointer}
${S} .sv-stepper-num{display:inline-grid;place-items:center;width:24px;height:24px;border-radius:var(--sv-radius-pill);border:1px solid var(--sv-border-strong);font-size:10px}
${S} .sv-stepper li[aria-current] .sv-stepper-num,${S} .sv-stepper li[data-done] .sv-stepper-num{background:var(--sv-accent);border-color:transparent;color:var(--sv-action-primary-text)}
${S} .sv-qf-card{${CARD};display:flex;flex-direction:column;gap:28px;padding:clamp(24px,4vw,40px);border-radius:var(--sv-radius-xl)}
${S} .sv-qf-done{align-items:flex-start}
${S} .sv-qf-badge{display:inline-flex;align-items:center;gap:8px;height:28px;padding:0 12px;border-radius:var(--sv-radius-pill);background:var(--sv-accent-tint);color:var(--sv-text-accent);${MONO};font-size:10px}
${S} .sv-fieldset{margin:0;padding:0;border:0;display:flex;flex-direction:column;gap:14px;min-width:0}
${S} .sv-field-label{${MONO};font-size:10.5px;color:var(--sv-text-muted);padding:0}
${S} .sv-choices{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
${S} .sv-choices--3{grid-template-columns:repeat(3,minmax(0,1fr))}
${S} .sv-choice{display:flex;align-items:center;gap:12px;min-height:56px;padding:14px 16px;border-radius:var(--sv-radius-md);border:1px solid var(--sv-border-default);background:var(--sv-surface-sunken);color:var(--sv-text-primary);font:inherit;font-size:15px;text-align:left;cursor:pointer;transition:border-color var(--sv-dur-fast),background var(--sv-dur-fast)}
${S} .sv-choice:hover{border-color:var(--sv-border-strong)}
${S} .sv-choice[aria-pressed="true"]{border-color:var(--sv-accent);background:var(--sv-accent-tint)}
${S} .sv-choice-box{flex:none;display:inline-grid;place-items:center;width:20px;height:20px;border-radius:var(--sv-radius-sm);border:1px solid var(--sv-border-strong);color:var(--sv-action-primary-text)}
${S} .sv-choice[aria-pressed="true"] .sv-choice-box{background:var(--sv-accent);border-color:transparent}
${S} .sv-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}
${S} .sv-field{display:flex;flex-direction:column;gap:10px;min-width:0}
${S} .sv-field--wide{grid-column:1/-1}
${S} .sv-input{width:100%;box-sizing:border-box;min-height:48px;padding:12px 14px;border-radius:var(--sv-radius-md);border:1px solid var(--sv-border-default);background:var(--sv-surface-sunken);color:var(--sv-text-primary);font:inherit;font-size:15px}
${S} .sv-input::placeholder{color:var(--sv-text-muted)}
${S} .sv-input:focus-visible,${S} .sv-choice:focus-visible,${S} .sv-stepper button:focus-visible{outline:2px solid var(--sv-focus-ring);outline-offset:2px}
${S} textarea.sv-input{resize:vertical}
${S} .sv-qf-foot{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;padding-top:24px;border-top:1px solid var(--sv-border-subtle)}
${S} .sv-qf-note{display:inline-flex;align-items:center;gap:8px;margin:0;font-size:13px;color:var(--sv-text-muted)}
${S} .sv-btn:disabled{opacity:.5;cursor:not-allowed}
${S} .sv-hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}
@media (max-width:900px){${S} .sv-qf{grid-template-columns:1fr}${S} .sv-qf-copy{position:static}}
@media (max-width:600px){${S} .sv-choices,${S} .sv-choices--3,${S} .sv-fields{grid-template-columns:1fr}${S} .sv-stepper button{font-size:9.5px;gap:8px}}

/* MOTION (data-motion): calm keeps the slow glow and drops the sweeps; off stops everything. Reduced motion always wins. */
@keyframes sv-drift{0%,100%{transform:translate3d(-5%,-3%,0) scale(1)}50%{transform:translate3d(5%,4%,0) scale(1.12)}}
@keyframes sv-marquee{to{transform:translateX(-50%)}}
${S}[data-motion="calm"] .sv-orb{animation-duration:44s}
${S}[data-motion="off"] .sv-orb,${S}[data-motion="off"] .sv-ticker-track{animation:none}
@media (prefers-reduced-motion:reduce){${S} .sv-orb,${S} .sv-ticker-track{animation:none}${S} a.sv-card{transition:none}}
@media (max-width:600px){${S} .sv-trust-item{border-left:0;padding-left:0}${S} .sv-row{grid-template-columns:48px 1fr}${S} .sv-row>:last-child{grid-column:2}}
`;

/* THE SITE SHEET (LIVE-2040, the integration the skin above waited on): what components/sites/site-chrome.tsx and site-page.tsx emit on a
 * Services website. The token block (Night, then the Day register), the faces the site root's font class sets, the skin above, then the
 * house chrome (header bar, nav, buttons, footer) re-pointed at the tokens so a Services site draws the design's glass header, mono
 * labels and ink footer around the Services blocks. The owner's accent (--color-primary*) comes from servicesAccentVars, never set here. */
const LABEL = "font-family:var(--sv-font-mono);text-transform:uppercase;letter-spacing:var(--sv-ls-mono);font-weight:var(--sv-fw-medium);font-size:11px";

export const SERVICES_SITE_CSS = `${SERVICES_TOKENS_CSS}${SERVICES_DAY_CSS}
${S}{--sv-font-display:var(--font-sv-bricolage,'Bricolage Grotesque'),'Helvetica Neue',Arial,sans-serif;--sv-font-body:var(--font-sv-bricolage,'Bricolage Grotesque'),'Helvetica Neue',Arial,sans-serif;--sv-font-accent:var(--font-sv-lora,'Lora'),Georgia,serif;--sv-font-mono:var(--font-sv-mono,'DM Mono'),ui-monospace,Menlo,monospace}
${SERVICES_CSS}${ACCENT_BRIDGE}
${S}{font-family:var(--sv-font-body);line-height:var(--sv-lh-body);background:var(--sv-surface-page);color:var(--sv-text-primary)}
${S} .hs-root{background:var(--sv-surface-page);color:var(--sv-text-primary)}
${S} .hs-h1,${S} .hs-h2,${S} .hs-brand{font-family:var(--sv-font-display);font-stretch:var(--sv-stretch-display);font-weight:var(--sv-fw-heavy);text-transform:uppercase;letter-spacing:var(--sv-ls-display);line-height:var(--sv-lh-display)}
${S} .hs-h1 em,${S} .hs-h2 em{font-family:var(--sv-font-accent);font-style:italic;font-weight:var(--sv-fw-regular);text-transform:none;font-stretch:100%;letter-spacing:-.01em;color:var(--color-primary-strong)}
${S} .hs-eyebrow,${S} .hs-label,${S} .hs-badge{${LABEL}}
${S} .hs-btn,${S} .hs-btn-primary,${S} .hs-btn-dark{${LABEL};letter-spacing:var(--sv-ls-button);min-height:44px;padding:0 24px;border-radius:var(--sv-radius-pill)}
${S} .hs-btn-primary,${S} .hs-btn-dark{background:var(--color-primary);color:var(--color-text-on-primary);border:0;box-shadow:var(--sv-shadow-glow)}
${S} .hs-btn-primary:hover,${S} .hs-btn-dark:hover{background:var(--color-primary-hover);color:var(--color-text-on-primary)}
${S} .hs-btn-soft{background:transparent;color:var(--sv-text-primary);border:var(--sv-border-hairline) solid var(--sv-border-default)}
${S} .hs-btn-soft:hover{background:var(--sv-accent-tint)}
${S} :focus-visible{outline:2px solid var(--sv-focus-ring);outline-offset:3px}
${S} .hs-header{position:sticky;top:0;z-index:40}
${S} .hs-pill{background:color-mix(in oklab,var(--sv-ink-950) 82%,transparent);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);border-bottom:var(--sv-border-hairline) solid var(--sv-border-subtle)}
${S} .hs-logo{flex:none;display:block;height:clamp(28px,6vw,36px);width:auto;max-width:160px;object-fit:contain}
${S} .hs-nav a,${S} .hs-nav-mega{${LABEL};color:var(--sv-text-secondary)}
${S} .hs-nav a:hover,${S} .hs-nav a[aria-current="page"]{color:var(--sv-text-primary)}
${S} .hs-menu-panel,${S} .hs-mega-panel{background:var(--sv-ink-800);border:var(--sv-border-hairline) solid var(--sv-border-subtle);border-radius:var(--sv-radius-lg)}
/* One lifted-panel rule for the hero panel and the header menus. */
${S} .sv-panel,${S} .hs-menu-panel,${S} .hs-mega-panel{box-shadow:var(--sv-shadow-lg)}
${S} .hs-footer-top{background:var(--sv-glow-sky,var(--sv-surface-sunken)),var(--sv-surface-sunken);border-top:var(--sv-border-hairline) solid var(--sv-border-subtle)}
${S} .hs-footer-col-title{${LABEL};color:var(--sv-text-muted)}
${S} .hs-footer-top{grid-template-columns:1.6fr repeat(3,1fr)}
@media (max-width:860px){${S} .hs-footer-top{grid-template-columns:1fr}}
${S} .hs-footer-col{display:flex;flex-direction:column;align-items:flex-start;gap:12px;font-size:15px;color:var(--sv-text-secondary)}
${S} .hs-footer-col p{margin:0;font-size:15px;line-height:1.6;color:var(--sv-text-secondary)}
${S} .hs-footer-col-title{margin:0 0 6px}
${S} .hs-footer-brand{display:flex;flex-direction:column;align-items:flex-start;gap:20px}
${S} .hs-footer-brand p{margin:0;color:var(--sv-text-secondary)}
${S} .hs-footer-top a{color:var(--sv-text-secondary)}
${S} .hs-footer-top a:hover{color:var(--sv-text-primary)}
/* THE KIT'S HEADER (Chrome.jsx SiteHeader): a full-width ink bar, a glow hairline under it, the wordmark left, the menu in a glass capsule
   on the right with the flare dot on the current page, the phone in mono, then the small accent button. Over a photo hero it lies on the
   picture with a soft top shade. */
${S} .hs-header{position:sticky;top:0;z-index:40;padding:0;background:linear-gradient(180deg,color-mix(in oklab,var(--sv-chrome-50) 3.5%,transparent),transparent),var(--sv-ink-950);border-bottom:var(--sv-border-hairline) solid var(--sv-border-subtle);box-shadow:0 20px 40px -24px color-mix(in oklab,var(--sv-ink-950) 70%,transparent)}
${S} .hs-header::after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:1px;background:linear-gradient(90deg,transparent 0%,color-mix(in oklab,var(--sv-flare-400) 55%,transparent) 30%,color-mix(in oklab,var(--sv-halo-300) 50%,transparent) 55%,color-mix(in oklab,var(--sv-swell-300) 45%,transparent) 75%,transparent 100%);opacity:.7;pointer-events:none}
${S}:has(.sv-hero-bg--photo) .hs-header{position:absolute;left:0;right:0;background:linear-gradient(180deg,color-mix(in oklab,var(--sv-ink-950) 55%,transparent) 0%,transparent 100%);box-shadow:none}
${S} .hs-pill{box-sizing:content-box;max-width:var(--sv-container-max);margin:0 auto;padding:18px var(--sv-gutter);border-radius:0;background:none;box-shadow:none;-webkit-backdrop-filter:none;backdrop-filter:none;border:0;animation:none;overflow:visible}
${S} .hs-header .hs-brand{padding-left:0;color:var(--sv-chrome-50);text-decoration:none}
${S} .sv-wordmark{display:block;font-family:var(--sv-font-display);font-stretch:var(--sv-stretch-display);font-weight:var(--sv-fw-heavy);text-transform:uppercase;letter-spacing:-.01em;line-height:.9;font-size:calc(112px / max(4.2, var(--sv-wm-len, 5) * .6));white-space:nowrap;color:var(--sv-chrome-50)}
${S} .hs-nav{-webkit-mask-image:none;mask-image:none}
${S} .hs-nav a,${S} .hs-nav-mega{display:inline-flex;align-items:center;gap:8px;${LABEL};letter-spacing:.14em;color:var(--sv-chrome-200);white-space:nowrap;transition:color var(--sv-dur-fast)}
${S} .hs-nav a::before{content:"";width:5px;height:5px;border-radius:9px;background:var(--sv-flare-500);opacity:0;transition:opacity var(--sv-dur-fast)}
${S} .hs-nav a:hover,${S} .hs-nav a[aria-current="page"]{color:var(--sv-chrome-50)}
${S} .hs-nav a:hover::before,${S} .hs-nav a[aria-current="page"]::before{opacity:1}
${S} .sv-head-phone{display:none;align-items:center;gap:8px;color:var(--sv-chrome-50);text-decoration:none;font-family:var(--sv-font-mono);font-size:11px;letter-spacing:.1em;white-space:nowrap}
${S} .hs-header-actions .hs-btn{display:inline-flex;align-items:center;min-height:38px;height:38px;padding:0 18px;font-family:var(--sv-font-display);font-stretch:var(--sv-stretch-display);font-weight:var(--sv-fw-bold);font-size:10.5px;letter-spacing:var(--sv-ls-button);text-transform:uppercase;white-space:nowrap;background:var(--sv-accent);color:var(--sv-action-primary-text);border:1px solid var(--sv-accent);box-shadow:none}
${S} .hs-header-actions .hs-btn:hover{background:var(--sv-accent-hover);border-color:var(--sv-accent-hover);color:var(--sv-action-primary-text);box-shadow:var(--sv-shadow-glow)}
@media (min-width:940px){${S} .hs-pill{grid-template-columns:auto minmax(0,1fr) auto;column-gap:32px}${S} .hs-nav{width:max-content;max-width:100%}
${S} .hs-nav{justify-self:end;padding:10px 22px;border-radius:var(--sv-radius-pill);border:var(--sv-border-hairline) solid var(--sv-border-subtle);background:linear-gradient(180deg,color-mix(in oklab,var(--sv-chrome-50) 5%,transparent),color-mix(in oklab,var(--sv-chrome-50) 1%,transparent));-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);box-shadow:inset 0 1px 0 color-mix(in oklab,var(--sv-chrome-50) 6%,transparent)}
${S} .hs-nav-track{gap:32px;padding:0}${S} .hs-nav a,${S} .hs-nav-mega{padding:0;background:none}${S} .hs-header-actions{gap:24px}}
@media (min-width:1100px){${S} .sv-head-phone{display:inline-flex}}
@media (max-width:939px){${S} .hs-nav{display:none}${S} .hs-pill{padding:14px var(--sv-gutter)}}
@media (max-width:760px){${S} .sv-hero-bg--photo::after{background:linear-gradient(180deg,color-mix(in oklab,var(--sv-ink-950) 55%,transparent) 0%,color-mix(in oklab,var(--sv-ink-950) 72%,transparent) 55%,var(--sv-ink-950) 100%)}${S} .sv-panel-top{flex-wrap:wrap;gap:6px}}
/* THE KIT'S FOOTER (Chrome.jsx SiteFooter): the closing line and button first, three columns, contact lines with their flare icons, the
   dim wordmark across the width, and the mono base line. */
${S} .hs-footer-top{max-width:var(--sv-container-max);margin:0 auto;padding:96px var(--sv-gutter) 56px;gap:48px;background:none;border:0}
${S} > div:has(> .hs-footer-top){position:relative;overflow:hidden;background:var(--sv-glow-sky,none),var(--sv-ink-950);border-top:var(--sv-border-hairline) solid var(--sv-border-subtle)}
${S} .sv-foot-band{margin:0;font-size:34px;line-height:1.05}
${S} .hs-footer-brand .hs-brand{display:none}
${S} .hs-footer-col a,${S} .sv-foot-line{display:inline-flex;align-items:center;gap:10px;font-size:15px;color:var(--sv-chrome-200)}
${S} .sv-foot-icon{display:inline-flex;color:var(--sv-flare-300)}
${S} .sv-foot-mark{position:relative;max-width:var(--sv-container-max);margin:0 auto;padding:0 var(--sv-gutter);font-family:var(--sv-font-display);font-stretch:var(--sv-stretch-display);font-weight:var(--sv-fw-heavy);text-transform:uppercase;line-height:.8;letter-spacing:-.01em;font-size:clamp(96px,22vw,320px);text-align:center;color:var(--sv-chrome-50);opacity:.07;user-select:none;overflow:hidden;white-space:nowrap}
${S} .hs-footer{max-width:var(--sv-container-max);margin:0 auto;padding:24px var(--sv-gutter);font-family:var(--sv-font-mono);font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--sv-text-muted);border-top:0;background:none}
@media (prefers-reduced-motion:reduce){${S} *{transition:none!important;animation:none!important}}
`;
