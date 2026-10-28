// THE NETWORK KIT BLOCK SHEET (components/page-editor/blocks/network-kit.tsx). Scoped under
// [data-house-theme="network-kit"] and added to the kit skin (components/sites/network-kit-css.ts), so it only ever
// reaches a stand-alone site render. Tokens only: every colour is a --color-* / --nk-* variable, never a literal.
// The shapes are the design's HomePage.jsx, block by block: 28px cards, 18px tiles, pill controls, the leaf crop
// on the hero photo, hairlines in --color-border, labels in sentence case with one accent dot.

const N = '[data-house-theme="network-kit"]'

export const NETWORK_KIT_BLOCKS_CSS = `
/* Shared pieces: the head, the seal, the date tile, rows, the accent ink. */
${N} .nk-head{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:24px}
${N} .nk-head[data-center]{justify-content:center;text-align:center}
${N} .nk-head-copy .nk-eyebrow{margin-bottom:20px}
${N} .nk-head[data-center] .nk-eyebrow{justify-content:center}
${N} .nk-display--h2{margin:0;font-size:var(--nk-text-display-h2);line-height:1.04}
${N} .nk-display--h3{margin:0;font-size:var(--nk-text-display-h3);line-height:1.05}
${N} .nk-head-lead{margin:18px 0 0;max-width:38rem}
${N} .nk-glyph{flex:none;display:block}
${N} .nk-seal{flex:none;display:inline-flex;align-items:center;justify-content:center;width:var(--nk-seal);height:var(--nk-seal);border-radius:calc(var(--nk-seal) * .32);background:var(--color-surface);color:var(--color-text);box-shadow:var(--nk-shadow-sm)}
${N} .nk-seal[data-tone="accent"]{background:var(--color-accent);color:var(--color-text-on-accent);box-shadow:var(--nk-shadow-button)}
${N} .nk-chip{display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;margin-bottom:14px;border-radius:14px;background:var(--color-surface);color:var(--color-accent-strong);box-shadow:var(--nk-shadow-sm)}
${N} .nk-date{flex:none;display:inline-flex;flex-direction:column;align-items:center;justify-content:center;width:58px;height:58px;border-radius:var(--nk-radius-tile);background:var(--color-surface);color:var(--color-accent-strong);line-height:1}
${N} .nk-date[data-solid]{background:var(--color-accent);color:var(--color-text-on-accent)}
${N} .nk-date[data-tint]{background:var(--color-accent-bg);color:var(--color-accent-strong)}
${N} .nk-date b{font-size:12px;font-weight:var(--nk-weight-semibold)}
${N} .nk-date span{margin-top:3px;font-family:var(--nk-display);font-size:24px;font-weight:var(--nk-weight-display);letter-spacing:var(--nk-tracking-display)}
${N} .nk-mono{font-family:var(--nk-sans);font-variant-numeric:tabular-nums lining-nums;letter-spacing:0;font-size:var(--nk-text-body-sm)}
${N} .nk-meta{font-size:var(--nk-text-meta);color:var(--color-text-subtle)}
${N} .nk-accent-ink{display:inline-flex;color:var(--color-accent-strong)}
${N} .nk-between{display:flex;align-items:center;justify-content:space-between;gap:12px}
${N} .nk-baseline{display:flex;align-items:baseline;justify-content:space-between;gap:16px}
${N} .nk-nowrap{white-space:nowrap}
${N} .nk-center{text-align:center}
${N} .nk-push{margin-top:auto}
${N} .nk-after{display:flex;margin-top:28px}
${N} .nk-grid-cards--after{margin-top:48px}
${N} .nk-grid-cards:has(> :first-child:last-child){grid-template-columns:minmax(0,420px)}
${N} .nk-section--lead{padding-top:var(--nk-space-8);padding-bottom:0}
${N} .nk-section--ruled{border-top:1px solid var(--color-border);border-bottom:1px solid var(--color-border)}
${N} .nk-section--rail{padding-right:0;overflow:hidden}
${N} .nk-rail-head{padding-right:var(--nk-space-gutter)}
${N} .nk-split--top{align-items:start}
${N} .nk-split--stretch{align-items:stretch}
${N} .nk-sticky{position:sticky;top:120px}
${N} .nk-actions{display:flex;flex-wrap:wrap;gap:12px}
${N} .nk-actions[data-center]{justify-content:center}
${N} .nk-actions--end{justify-content:flex-end}
${N} .nk-eyebrow .nk-glyph,${N} .nk-open .nk-glyph{opacity:.9}
${N} .nk-open{display:flex;align-items:center;gap:8px;margin-top:auto;color:var(--color-text)}
${N} .nk-card-title{margin:0;font-size:30px;line-height:1.1}
${N} .nk-entity .nk-card-title{font-size:var(--nk-text-display-card)}
${N} .nk-card-title--sm{font-size:var(--nk-text-display-card);line-height:1.15}
${N} .nk-card-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:auto;padding-top:16px}
${N} .nk-empty{margin-top:24px}
${N} a.nk-live-tile,${N} a.nk-door,${N} a.nk-list-row,${N} a.nk-tile,${N} a.nk-spot-row,${N} a.nk-resource,${N} a.nk-entity,${N} a.nk-offer-card{color:inherit;text-decoration:none}
${N} a.nk-event-card,${N} a.nk-feature-main{color:var(--color-on-media);text-decoration:none}

/* The hairline lists: offerings, ways in, meetups, library, membership table. */
${N} .nk-list{display:block}
${N} .nk-list--ruled{border-top:1px solid var(--color-border)}
${N} .nk-list--strong{border-top:1px solid var(--color-border-strong)}
${N} .nk-list-row{display:grid;align-items:center;gap:24px;padding:24px 0;border-bottom:1px solid var(--color-border);color:inherit;text-align:left}
${N} a.nk-list-row{transition:background var(--nk-motion-fast) var(--nk-ease-out)}
${N} .nk-list-row--stack{display:flex;flex-direction:column;align-items:stretch;gap:8px;padding:26px 0}
${N} .nk-row-title{display:block;font-size:28px;line-height:1.1}
${N} .nk-row-title--lg{font-size:30px}
${N} .nk-row-body{display:block;margin-top:6px;font-size:15px;color:var(--color-text-muted)}
${N} .nk-row-end{display:flex;align-items:center;gap:16px}
${N} .nk-offer-row{grid-template-columns:56px minmax(0,1fr) auto}
${N} .nk-door-row{grid-template-columns:48px minmax(0,1fr) auto;padding:28px 0}
${N} .nk-door-row .nk-row-title{font-size:34px;line-height:1.05}
${N} .nk-voice-num{font-family:var(--nk-accent-face);font-style:italic;font-weight:var(--nk-weight-regular);font-size:28px;color:var(--color-accent-strong)}
${N} .nk-feature-row{grid-template-columns:minmax(0,1fr) auto;gap:20px}
${N} .nk-lib-row{grid-template-columns:28px minmax(0,1fr) auto;gap:20px;padding:22px 0}
${N} .nk-lib-row .nk-row-title{font-size:26px;line-height:1.15}
${N} .nk-step-label{display:block;margin-bottom:10px}

/* Hero: split with the leaf photo, or a full-colour photo with the words on it. */
${N} .nk-hero{position:relative}
${N} .nk-hero-split{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));align-items:stretch;column-gap:clamp(40px,5vw,88px);row-gap:40px;box-sizing:border-box;width:min(var(--nk-column),calc(100% - 2 * var(--nk-space-gutter)));margin:0 auto;padding:clamp(24px,3vw,48px) 0 clamp(48px,6vw,96px)}
${N} .nk-hero-copy{position:relative;z-index:2;display:flex;flex-direction:column;justify-content:center;container-type:inline-size;padding-block:clamp(12px,4cqi,48px)}
${N} .nk-hero-copy[data-flip]{order:2}
${N} .nk-hero-copy .nk-eyebrow{margin-bottom:24px;align-self:flex-start}
${N} .nk-hero-title{margin:0;color:var(--color-text);font-size:clamp(2.5rem,calc(var(--nk-hero-scale,11) * 1cqi),7.5rem);line-height:.98;letter-spacing:var(--nk-tracking-display)}
${N} .nk-hero-lead{margin:clamp(20px,3cqi,36px) 0 clamp(28px,4cqi,48px);max-width:34em;font-size:clamp(1.15rem,2.5cqi,1.6rem);line-height:1.45;color:var(--color-text-muted)}
${N} .nk-hero-note{margin:36px 0 0;font-size:16px;font-weight:var(--nk-weight-medium);color:var(--color-text-muted)}
${N} .nk-hero-media{position:relative;order:1;width:100%;height:100%;min-height:clamp(360px,40vw,520px);border-radius:36px 220px 36px 36px;overflow:hidden;box-shadow:var(--nk-shadow-md)}
${N} .nk-hero-media[data-flip]{order:0;border-radius:220px 36px 36px 36px}
${N} .nk-hero-media img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
${N} .nk-hero-event{position:absolute;z-index:2;left:clamp(14px,2vw,20px);right:clamp(14px,2vw,20px);bottom:clamp(14px,2vw,20px);display:flex;align-items:center;gap:16px;padding:14px 14px 14px 16px;border-radius:26px;background:color-mix(in srgb,var(--color-surface) 92%,transparent);box-shadow:var(--nk-shadow-md);-webkit-backdrop-filter:blur(16px) saturate(1.1);backdrop-filter:blur(16px) saturate(1.1)}
${N} .nk-hero-event .nk-date[data-solid]{background:var(--color-accent);color:var(--color-text-on-accent)}
${N} .nk-hero-event-text{flex:1;min-width:0;display:flex;flex-direction:column}
${N} .nk-hero-event-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:18px;font-weight:var(--nk-weight-medium);color:var(--color-text)}
${N} .nk-hero-event-meta{font-size:15px;color:var(--color-text-muted)}
${N} .nk-hero--photo{display:flex;align-items:flex-end;justify-content:center;box-sizing:border-box;height:min(80vh,720px);min-height:520px;margin:var(--nk-space-4) max(var(--nk-space-gutter),calc((100% - var(--nk-column)) / 2)) 0;overflow:hidden;color:var(--color-on-media)}
${N} .nk-hero--photo[data-variant="center"],${N} .nk-hero--photo[data-variant="left"]{align-items:center}
${N} .nk-hero--photo[data-variant="center"]{text-align:center}
${N} .nk-hero-photo{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
${N} .nk-hero-scrim{position:absolute;inset:0;z-index:1;background:linear-gradient(to top,color-mix(in srgb,var(--color-ink) 80%,transparent) 0%,color-mix(in srgb,var(--color-ink) 45%,transparent) 45%,color-mix(in srgb,var(--color-ink) 18%,transparent) 100%)}
${N} .nk-hero--photo[data-variant="left"] .nk-hero-scrim{background:linear-gradient(90deg,color-mix(in srgb,var(--color-ink) 72%,transparent) 0%,color-mix(in srgb,var(--color-ink) 35%,transparent) 55%,color-mix(in srgb,var(--color-ink) 10%,transparent) 100%)}
${N} .nk-hero--photo[data-variant="center"] .nk-hero-scrim{background:linear-gradient(color-mix(in srgb,var(--color-ink) 45%,transparent),color-mix(in srgb,var(--color-ink) 55%,transparent))}
${N} .nk-hero-inner{position:relative;z-index:2;box-sizing:border-box;width:100%;padding:0 var(--nk-space-gutter) var(--nk-space-16)}
${N} .nk-hero--photo[data-variant="center"] .nk-hero-inner,${N} .nk-hero--photo[data-variant="left"] .nk-hero-inner{padding-bottom:0}
${N} .nk-hero--photo .nk-hero-title{max-width:11em;color:var(--color-on-media);font-size:var(--nk-text-display-hero)}
${N} .nk-hero--photo[data-variant="center"] .nk-hero-title{margin-inline:auto}
${N} .nk-hero--photo .nk-hero-lead{max-width:560px;font-size:var(--nk-text-lead);color:color-mix(in srgb,var(--color-on-media) 90%,transparent)}
${N} .nk-hero--photo[data-variant="center"] .nk-hero-lead{margin-inline:auto}
${N} .nk-hero--photo .nk-hero-copy{padding:0}
${N} .nk-hero--photo .nk-eyebrow{margin-bottom:24px}

/* The liveness strip. */
${N} .nk-live-tile{display:flex;flex-direction:column;gap:4px;box-sizing:border-box;padding:24px 26px;border-radius:var(--nk-radius-card);background:var(--color-surface-elevated);color:inherit;text-align:left;transition:transform var(--nk-motion-base) var(--nk-ease-out),box-shadow var(--nk-motion-base) var(--nk-ease-out)}
${N} .nk-live-tile:hover{transform:translateY(-3px);box-shadow:var(--nk-shadow-md)}
${N} .nk-live-label{font-size:15px;font-weight:var(--nk-weight-medium);color:var(--color-text-muted)}
${N} .nk-live-value{font-size:18px;font-weight:var(--nk-weight-medium);color:var(--color-text)}

/* Steps. */
${N} .nk-steps-grid{list-style:none;margin:48px 0 0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr));gap:20px}
${N} .nk-step-card{display:flex;flex-direction:column;gap:16px;padding:32px}
${N} .nk-step-top{display:flex;align-items:center;justify-content:space-between}
${N} .nk-step-num{font-size:44px;line-height:1;color:var(--color-text-subtle)}
${N} .nk-step-title{display:block;font-size:28px;line-height:1.1}
${N} .nk-step-body{display:block;font-size:15px;color:var(--color-text-muted)}
${N} .nk-timeline{list-style:none;margin:0;padding:0;position:relative}
${N} .nk-timeline::before{content:"";position:absolute;left:27px;top:28px;bottom:28px;width:1px;background:var(--color-border)}
${N} .nk-timeline li{position:relative;display:grid;grid-template-columns:56px minmax(0,1fr);gap:28px;padding:28px 0;border-bottom:1px solid var(--color-border)}
${N} .nk-timeline li:last-child{border-bottom:0}
${N} .nk-timeline .nk-seal{border-radius:var(--nk-radius-card);position:relative}
${N} .nk-timeline .nk-step-title{font-size:32px}
${N} .nk-timeline .nk-step-body{margin-top:10px;max-width:48ch}
${N} .nk-steps-strip{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr));gap:48px;align-items:start}
${N} .nk-strip-step{display:flex;flex-direction:column;gap:14px;padding-left:24px;border-left:1px solid var(--color-border-strong)}
${N} .nk-strip-num{font-family:var(--nk-accent-face);font-style:italic;font-weight:var(--nk-weight-regular);font-size:64px;line-height:.9;color:var(--color-text-subtle)}
${N} .nk-strip-step[data-first] .nk-strip-num{color:var(--color-accent-strong)}
${N} .nk-strip-step .nk-step-title{font-size:26px}

/* Ways in, offerings, programs: the card shapes. */
${N} .nk-door{display:flex;flex-direction:column;gap:18px;box-sizing:border-box;padding:32px;color:inherit;text-align:left}
${N} .nk-door-body{font-size:15px;color:var(--color-text-muted)}
${N} .nk-door--tile{min-height:300px;position:relative;overflow:hidden;gap:14px;justify-content:flex-end;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--nk-radius-card)}
${N} .nk-door--tile:first-child{background:var(--color-ink);color:var(--color-on-ink)}
${N} .nk-door--tile:first-child .nk-door-body{color:var(--color-on-ink-muted)}
${N} .nk-door--tile .nk-seal{position:relative}
${N} .nk-ghost-num{position:absolute;right:20px;top:12px;font-family:var(--nk-accent-face);font-style:italic;font-weight:var(--nk-weight-regular);font-size:120px;line-height:1;opacity:.12}
${N} .nk-offer-card{display:flex;flex-direction:column;gap:16px;padding:32px;color:inherit;text-align:left}
${N} .nk-offer-card .nk-card-foot{border-top:1px solid var(--color-border)}
${N} .nk-entity{display:flex;flex-direction:column;overflow:hidden;padding:0}
${N} .nk-entity-cover{aspect-ratio:16/9}
${N} .nk-entity-body{display:flex;flex-direction:column;gap:6px;flex:1;padding:20px 22px 24px}
${N} .nk-entity-eyebrow{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:var(--nk-weight-medium);color:var(--color-accent-strong)}
${N} .nk-entity-text{margin:0;font-size:16px;line-height:1.55;color:var(--color-text-muted)}
${N} .nk-feature{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:48px;margin-top:48px;align-items:start}
${N} .nk-feature .nk-list{margin:0}
${N} .nk-feature[data-solo]{grid-template-columns:minmax(0,720px)}
${N} .nk-feature-main{position:relative;overflow:hidden;display:flex;align-items:flex-end;aspect-ratio:4/3;border-radius:var(--nk-radius-media);background:var(--color-ink);color:var(--color-on-media)}
${N} .nk-feature-main img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
${N} .nk-feature-text{position:relative;z-index:2;display:flex;flex-direction:column;align-items:flex-start;gap:12px;box-sizing:border-box;width:100%;padding:36px}
${N} .nk-feature-meta{font-size:15px;color:var(--color-on-media)}

/* Meetups. */
${N} .nk-gather-main{display:flex;flex-direction:column;gap:40px}
${N} .nk-gather-photo{flex:1;min-height:280px;border-radius:28px 160px 28px 28px;box-shadow:var(--nk-shadow-md)}
${N} .nk-gather-photo img{position:absolute;inset:0}
${N} .nk-gather-list{display:flex;flex-direction:column;justify-content:center;gap:28px}
${N} .nk-event-row{grid-template-columns:auto minmax(0,1fr) auto;gap:16px;padding:14px 12px;border-radius:min(20px,var(--nk-radius-card))}
${N} a.nk-event-row:hover{background:var(--color-surface);box-shadow:var(--nk-shadow-sm)}
${N} .nk-event-row-main{min-width:0}
${N} .nk-event-row-title{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:var(--nk-text-ui);font-weight:var(--nk-weight-medium);color:var(--color-text)}
${N} .nk-event-row .nk-row-body{margin-top:2px}
${N} .nk-cal-row{grid-template-columns:120px minmax(0,1fr) minmax(0,.6fr) auto;gap:32px;padding:28px 0}
${N} .nk-cal-date{display:flex;align-items:baseline;gap:10px}
${N} .nk-cal-day{font-size:56px;line-height:.9;color:var(--color-text)}
${N} .nk-cal-day[data-first]{color:var(--color-accent-strong)}
${N} .nk-cal-note{margin-top:0}
${N} .nk-event-card{position:relative;overflow:hidden;display:flex;align-items:flex-end;box-sizing:border-box;aspect-ratio:3/4;border-radius:var(--nk-radius-card);background:var(--color-ink);box-shadow:var(--nk-shadow-sm);color:var(--color-on-media);transition:transform var(--nk-motion-base) var(--nk-ease-out),box-shadow var(--nk-motion-base) var(--nk-ease-out)}
${N} .nk-event-card:hover{transform:translateY(-3px);box-shadow:var(--nk-shadow-md)}
${N} .nk-event-card img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
${N} .nk-event-card::after{z-index:1}
${N} .nk-event-card .nk-date{position:absolute;z-index:2;top:16px;left:16px}
${N} .nk-event-card-text{position:relative;z-index:2;display:flex;flex-direction:column;gap:8px;box-sizing:border-box;width:100%;padding:24px}
${N} .nk-event-card .nk-card-title{font-size:26px}
${N} .nk-event-card-meta{font-size:15px;color:color-mix(in srgb,var(--color-on-media) 88%,transparent)}

/* Membership. */
${N} .nk-tier{display:flex;flex-direction:column;gap:16px;padding:28px}
${N} .nk-tier[data-lead]{padding:36px 32px;box-shadow:0 0 0 1.5px var(--color-accent),var(--nk-shadow-lg)}
${N} .nk-tier-price{margin-top:auto}
${N} .nk-price{font-size:40px}
${N} .nk-price[data-lead]{font-size:48px}
${N} .nk-price--lg{font-size:44px}
${N} .nk-period{font-size:16px;color:var(--color-text-muted)}
${N} .nk-table-row{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.4fr) auto auto;align-items:center;gap:32px;padding:28px 0;border-bottom:1px solid var(--color-border)}
${N} .nk-table-row[data-lead]{padding-inline:24px;border-radius:var(--nk-radius-card);background:var(--color-surface);box-shadow:0 0 0 1.5px var(--color-accent),var(--nk-shadow-md)}
${N} .nk-table-name{display:flex;align-items:center;gap:16px}
${N} .nk-table-row .nk-row-body{margin-top:0}
${N} .nk-table-row .nk-badge{margin-left:12px}
${N} .nk-spotlight{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}
${N} .nk-tier-spot{position:relative;overflow:hidden;display:flex;flex-direction:column;gap:18px;padding:40px;box-shadow:0 0 0 1.5px var(--color-accent),var(--nk-shadow-lg)}
${N} .nk-spot-blurb{max-width:40ch;font-size:17px;color:var(--color-text-muted)}
${N} .nk-spot-foot{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:16px;margin-top:auto}
${N} .nk-spot-rest{display:grid;grid-template-rows:repeat(2,minmax(0,1fr));gap:20px}
${N} .nk-spot-row{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:20px;padding:32px;text-align:left;color:inherit}
${N} .nk-spot-row .nk-row-title{font-size:26px}

/* Proof. */
${N} .nk-proof-quote,${N} .nk-proof-wall{position:relative;overflow:hidden}
${N} .nk-proof-in,${N} .nk-proof-wall-in{position:relative;z-index:2}
${N} .nk-proof-in{max-width:980px;margin:0 auto;text-align:center}
${N} .nk-proof-quote .nk-mist{--mist-x:75%;--mist-y:45%}
${N} .nk-ornament{display:flex;align-items:center;gap:16px;width:min(260px,100%);margin:0 auto 40px;color:var(--color-accent)}
${N} .nk-ornament span{flex:1;height:1px;background:var(--color-border)}
${N} .nk-ornament i{width:8px;height:8px;border-radius:50%;background:currentColor}
${N} .nk-proof-wall .nk-ornament{width:min(200px,100%);margin-bottom:0}
${N} .nk-big-quote{margin:0;line-height:1.1}
${N} .nk-proof-by{display:flex;justify-content:center;gap:10px;margin-top:28px;color:var(--color-text-muted)}
${N} .nk-proof-by b{font-weight:var(--nk-weight-medium);color:var(--color-text)}
${N} .nk-proof-rating{display:flex;align-items:center;justify-content:center;gap:14px;margin-top:48px}
${N} .nk-stars{font-size:14px;letter-spacing:2px;color:var(--color-accent-strong)}
${N} .nk-wall-eyebrow{justify-content:center;margin-top:24px}
${N} .nk-quote-card{display:flex;flex-direction:column;gap:24px;margin:0;padding:32px}
${N} .nk-quote-card blockquote{flex:1;margin:0;font-size:24px;line-height:1.25}
${N} .nk-quote-card .nk-proof-by{justify-content:flex-start;margin-top:0}
${N} .nk-voice-quote{margin:20px 0 0;font-family:var(--nk-accent-face);font-style:italic;font-size:clamp(1.75rem,1.3rem + 1.6vw,2.6rem);line-height:1.15}
${N} [data-variant="stats"] .nk-proof-by{justify-content:flex-start}
${N} .nk-split[data-solo]{grid-template-columns:minmax(0,1fr);max-width:var(--nk-width-read)}
${N} .nk-stat-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}
${N} .nk-stat{padding:28px}
${N} .nk-stat-value{font-size:var(--nk-text-stat);line-height:1;font-variant-numeric:lining-nums}
${N} .nk-stat-label{margin-top:10px;font-size:var(--nk-size-sm);color:var(--color-text-muted)}

/* Shop and library. */
${N} .nk-tile{display:flex;flex-direction:column;gap:12px;color:inherit}
${N} .nk-tile-cover{position:relative;aspect-ratio:4/5;display:flex;align-items:center;justify-content:center;border:1px solid var(--color-border);border-radius:var(--nk-radius-tile);background:var(--color-surface-elevated)}
${N} .nk-tile-cover img{position:absolute;inset:0;transition:transform var(--nk-motion-slow) var(--nk-ease-out)}
${N} .nk-tile:hover .nk-tile-cover img{transform:scale(1.03)}
${N} .nk-tile-icon{display:flex;align-items:center;justify-content:center;width:64px;height:64px;color:var(--color-accent-strong)}
${N} .nk-tile-kind{position:absolute;z-index:2;top:12px;left:12px;background:var(--color-surface)}
${N} .nk-tile-body{display:flex;align-items:baseline;justify-content:space-between;gap:12px}
${N} .nk-tile-title{font-size:22px;line-height:1.15}
${N} .nk-rail{display:flex;gap:24px;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:8px;scrollbar-width:none}
${N} .nk-rail::-webkit-scrollbar{display:none}
${N} .nk-rail-item{flex:0 0 min(72vw,300px);scroll-snap-align:start}
${N} .nk-resource .nk-between{min-height:28px}
${N} .nk-resource{display:flex;flex-direction:column;gap:14px;padding:28px;color:inherit;text-align:left}

/* The letter. */
${N} .nk-letter-copy{display:flex;align-items:flex-start;gap:28px}
${N} .nk-letter-title{line-height:1.1}
${N} .nk-letter-lead{margin:14px 0 0;max-width:46ch}
${N} .nk-letter-form{display:flex;align-items:flex-end;gap:16px;width:100%;max-width:480px}
${N} .nk-letter-form .nk-input{flex:1;min-width:0}
${N} .nk-letter-done{margin:0;color:var(--color-text-muted)}
${N} .nk-letter-error{margin:8px 0 0;font-size:var(--nk-text-body-sm);color:var(--color-danger)}
${N} .nk-hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none}
${N} .nk-letter-card{position:relative;overflow:hidden;display:flex;flex-direction:column;align-items:center;gap:20px;box-sizing:border-box;max-width:760px;margin:0 auto;padding:var(--nk-space-12) var(--nk-space-8);border-radius:var(--nk-radius-card);background:var(--color-surface-elevated);text-align:center}
${N} .nk-letter-card .nk-letter-lead{margin:0}
${N} .nk-band--sand .nk-letter-card,${N} .nk-band--sand .nk-cta-split{background:var(--color-surface)}
${N} .nk-letter-form-wrap{display:flex;justify-content:center;width:100%;margin-top:8px}

/* Questions. */
${N} .nk-faq{display:flex;flex-direction:column;gap:12px}
${N} .nk-faq details{padding:0 24px;border-radius:24px;background:var(--color-surface-elevated);transition:background var(--nk-motion-fast) var(--nk-ease-out)}
${N} .nk-faq details[open]{background:var(--color-surface);box-shadow:var(--nk-shadow-sm)}
${N} .nk-faq summary{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:20px 0;list-style:none;cursor:pointer;font-size:18px;font-weight:var(--nk-weight-medium);color:var(--color-text)}
${N} .nk-faq summary::-webkit-details-marker{display:none}
${N} .nk-faq-toggle{flex:none;display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;background:var(--color-surface);color:var(--color-text);transition:transform var(--nk-motion-fast) var(--nk-ease-out)}
${N} .nk-faq details[open] .nk-faq-toggle{background:var(--color-accent);color:var(--color-text-on-accent);transform:rotate(180deg)}
${N} .nk-faq p{margin:0 0 22px;max-width:62ch;font-size:17px;color:var(--color-text-muted)}
${N} .nk-faq-side{margin:20px 0 0;max-width:30em}
${N} .nk-faq-stack{max-width:760px;margin:0 auto}

/* The closing call. */
${N} .nk-cta-title{line-height:1.05}
${N} .nk-cta-center{position:relative;overflow:hidden;text-align:center}
${N} .nk-cta-center .nk-actions{margin-top:40px}
${N} .nk-cta-split-wrap,${N} .nk-cta-band-wrap{padding:var(--nk-space-section-tight) max(var(--nk-space-gutter),calc((100% - var(--nk-column)) / 2))}
${N} .nk-cta-split{position:relative;overflow:hidden;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));align-items:center;gap:clamp(24px,4vw,64px);box-sizing:border-box;padding:var(--nk-space-section) clamp(24px,5vw,64px);border-radius:var(--nk-radius-card);background:var(--color-surface-elevated)}
${N} .nk-cta-split>*{position:relative;z-index:2}
${N} .nk-cta-band{position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;box-sizing:border-box;min-height:min(60vh,560px);padding:var(--nk-space-section) var(--nk-space-gutter);text-align:center;color:var(--color-on-media)}
${N} .nk-cta-band img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
${N} .nk-cta-band .nk-hero-scrim{background:linear-gradient(color-mix(in srgb,var(--color-ink) 35%,transparent),color-mix(in srgb,var(--color-ink) 55%,transparent))}
${N} .nk-cta-band-in{position:relative;z-index:2}
${N} .nk-cta-band-in .nk-actions{margin-top:40px}
${N} .nk-cta-band .nk-cta-title{color:var(--color-on-media)}

@media (max-width:1100px){
${N} .nk-cal-row{grid-template-columns:96px minmax(0,1fr) auto;gap:20px}
${N} .nk-cal-note{display:none}
}
@media (max-width:900px){
${N} .nk-hero-split{grid-template-columns:minmax(0,1fr);row-gap:32px}
${N} .nk-hero-copy[data-flip],${N} .nk-hero-media[data-flip]{order:initial}
${N} .nk-hero-media[data-flip]{border-radius:36px 36px 36px 220px}
${N} .nk-hero-media{border-radius:36px 36px 36px 36px;min-height:clamp(320px,70vw,440px)}
${N} .nk-sticky{position:static}
${N} .nk-feature,${N} .nk-spotlight,${N} .nk-cta-split{grid-template-columns:minmax(0,1fr)}
${N} .nk-actions--end{justify-content:flex-start}
${N} .nk-table-row{grid-template-columns:minmax(0,1fr) auto;gap:16px 20px}
${N} .nk-table-row .nk-row-body{grid-column:1 / -1;order:3}
${N} .nk-letter-copy{flex-direction:column;gap:20px}
${N} .nk-letter-form{max-width:none}
}
@media (max-width:640px){
${N} .nk-hero-event{flex-wrap:wrap;gap:12px}
${N} .nk-hero--photo{min-height:480px;margin-inline:var(--nk-space-gutter)}
${N} .nk-hero-inner{padding-bottom:var(--nk-space-8)}
${N} .nk-door-row,${N} .nk-offer-row{grid-template-columns:auto minmax(0,1fr)}
${N} .nk-door-row .nk-row-title{font-size:26px}
${N} .nk-door-row>svg,${N} .nk-offer-row .nk-row-end{grid-column:2}
${N} .nk-timeline li{gap:20px}
${N} .nk-feature-row{grid-template-columns:minmax(0,1fr)}
${N} .nk-cal-row{grid-template-columns:72px minmax(0,1fr) auto;gap:14px}
${N} .nk-cal-day{font-size:40px}
${N} .nk-letter-form{flex-direction:column;align-items:stretch}
${N} .nk-stat-grid{grid-template-columns:minmax(0,1fr)}
${N} .nk-tier-spot{padding:28px}
${N} .nk-spot-row{grid-template-columns:auto minmax(0,1fr);padding:24px}
${N} .nk-spot-row .nk-nowrap{grid-column:2}
}
`
