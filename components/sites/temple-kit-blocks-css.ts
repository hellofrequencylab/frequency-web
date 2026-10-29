// THE TEMPLE KIT BLOCK SHEET (Temple Theme Kit design system, "Web Theme", ui_kits/site/TempleBlocks.jsx). The look of
// the Temple Kit block family (components/page-editor/blocks/temple-kit.tsx): the hero with the next-gathering card, the
// frosted live band, gatherings, rooms, offerings, steps, gallery, journeys, proof, membership, questions, the letter and
// the closing call, with the design's washes, tile patterns and watermark
// motifs. Every rule is scoped under the Temple Kit root and reads the kit's tokens (lib/theme/temple-kit.ts) only: no
// raw colour, no raw motion, no raw radius, so a token round is a values-only change. Translucent colours are
// color-mix of a token. Reduced motion is honoured in the skin (components/sites/temple-kit-css.ts).
//
// Rhythm (design tokens): the gutter is clamp(20px,5vw,72px) on both sides, a section's padding is
// clamp(64px,9vw,160px) top and bottom, and the content is at most 1320px, centred.

const N = '[data-house-theme="temple-kit"]'
const EASE = 'var(--ease-out)'
const HAIR = '1px solid var(--line-hairline)'
const mix = (token: string, pct: number) => `color-mix(in srgb,var(${token}) ${pct}%,transparent)`
/** The block's own links (design buttons): colour from the parent, regular weight, normal leading. One rule each. */
const LINKS = ['room', 'gather-feature', 'gather-row', 'live-item', 'hero-card', 'journey'].map((c) => `${N} a.tk-${c}{color:inherit;font-weight:var(--weight-regular);line-height:normal}`).join('\n')

export const TEMPLE_KIT_BLOCKS_CSS = `
${N} .mw-page{counter-reset:tk-index}
${N} [data-mw-own]>div{padding:0;margin:0}
${N} [data-tk]{position:relative}

${N} .tk-eyebrow{font-family:var(--font-label);font-size:var(--text-eyebrow);font-weight:var(--weight-medium);text-transform:uppercase;letter-spacing:var(--label-tracking);color:var(--text-accent)}
${N} .tk-eyebrow--light{color:var(--tk-saffron-400)}
${N} .tk-eyebrow--sm{font-size:10.5px}
${N} .tk-display{margin:0;font-family:var(--font-display);font-weight:var(--weight-display);line-height:var(--leading-display);letter-spacing:var(--tracking-display);color:var(--color-heading);text-wrap:balance}
${N} .tk-display-hero{margin:0;font-family:var(--font-hero);font-weight:400;line-height:var(--leading-tight);letter-spacing:var(--tracking-display);text-wrap:balance}
${N} .tk-display em,${N} .tk-display-hero em{font-style:var(--display-em-style);color:var(--display-em-color,var(--color-accent))}
${N} .tk-quote{margin:0;font-family:var(--font-quote);font-style:italic;font-weight:var(--weight-light);font-size:var(--text-quote);line-height:1.28;color:var(--tk-umber-800)}
${N} .tk-h2{font-size:var(--text-display-h2)}
${N} .tk-h3{font-size:var(--text-display-h3);margin:14px 0 0}
${N} .tk-spark{color:var(--tk-saffron-500);font-size:11px}
${N} .tk-empty{margin:56px 0 0;color:var(--color-text-muted);text-align:center}

${N} .tk-sec{position:relative;padding:var(--space-section) var(--space-gutter)}
${N} .tk-inner{position:relative;z-index:1;max-width:1320px;margin:0 auto}
${LINKS}
${N} div.tk-room{font-weight:var(--weight-regular);line-height:normal}
${N} div.tk-gather-row{font-weight:var(--weight-regular);line-height:normal}
${N} div.tk-live-item{font-weight:var(--weight-regular);line-height:normal}
${N} div.tk-hero-card{font-weight:var(--weight-regular);line-height:normal}
${N} div.tk-gather-feature{font-weight:var(--weight-regular);line-height:normal}
${N} div.tk-room,${N} div.tk-gather-row,${N} div.tk-live-item,${N} div.tk-journey{font-weight:var(--weight-regular);line-height:normal}

${N} .tk-head{display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:32px}
${N} .tk-head--center{flex-direction:column;align-items:center;text-align:center}
${N} .tk-head-copy{max-width:640px}
${N} .tk-head--center .tk-head-copy{margin:0 auto}
${N} .tk-head-eyebrow{display:flex;gap:12px;margin-bottom:18px}
${N} .tk-head--center .tk-head-eyebrow{justify-content:center}
${N} .tk-index{display:inline-block;font-family:var(--font-display);letter-spacing:.04em;text-transform:none;counter-increment:tk-index}
${N} .tk-index::before{content:counter(tk-index,upper-roman)}
${N} .tk-star{color:var(--tk-saffron-500)}
${N} .tk-kicker{margin:18px 0 0;max-width:52ch;font-size:var(--text-lead);font-weight:var(--weight-light);color:var(--color-text-muted)}
${N} .tk-head--center .tk-kicker{margin-inline:auto}
${N} .tk-head--light .tk-h2{color:var(--color-on-ink)}
${N} .tk-head--light .tk-eyebrow{color:var(--tk-saffron-400)}
${N} .tk-head--light .tk-kicker{color:var(--tk-plaster-300)}
${N} .tk-head--light .tk-display em{color:var(--tk-saffron-400)}

${N} .tk-btn{position:relative;overflow:hidden;display:inline-flex;align-items:center;justify-content:center;gap:10px;box-sizing:border-box;border:1px solid transparent;border-radius:var(--radius-control);font-family:var(--font-sans);font-weight:var(--weight-medium);letter-spacing:.02em;line-height:1;text-transform:none;text-decoration:none;white-space:nowrap;cursor:pointer;transition:color var(--motion-fast) ${EASE},background-color var(--motion-fast) ${EASE},border-color var(--motion-fast) ${EASE},box-shadow var(--motion-fast) ${EASE},transform var(--motion-fast) ${EASE}}
${N} .tk-btn>*{position:relative}
${N} .tk-btn.tk-btn--sm{height:40px;padding:0 20px;font-size:14px}
${N} .tk-btn.tk-btn--md{height:50px;padding:0 30px;font-size:16px}
${N} .tk-btn.tk-btn--lg{height:60px;padding:0 38px;font-size:18px}
${N} .tk-btn.tk-btn--primary{background:var(--mn-solid);color:var(--kit-on-solid);box-shadow:var(--shadow-button)}
${N} .tk-btn.tk-btn--primary::before{content:"";position:absolute;inset:0;pointer-events:none;background-image:var(--texture-grit);background-size:300px;opacity:.14;mix-blend-mode:soft-light}
${N} .tk-btn.tk-btn--primary:hover{background:var(--mn-solid-hover);color:var(--kit-on-solid);box-shadow:var(--shadow-button-hover);transform:translateY(-1px)}
${N} .tk-btn.tk-btn--primary:active{background:var(--tk-clay-700);box-shadow:var(--shadow-inset-deep);transform:scale(var(--press-scale))}
${N} .tk-btn.tk-btn--secondary{background:${mix('--surface-card', 50)};color:var(--tk-umber-900);border-color:var(--line-rule);box-shadow:0 1px 2px ${mix('--tk-clay-700', 10)}}
${N} .tk-btn.tk-btn--secondary:hover{background:${mix('--surface-card', 85)};color:var(--tk-umber-900);border-color:var(--line-strong);box-shadow:0 3px 8px -2px ${mix('--tk-clay-700', 16)};transform:translateY(-1px)}
${N} .tk-btn.tk-btn--secondary:active{transform:scale(var(--press-scale))}
${N} .tk-btn.tk-btn--ghost{padding:0 10px;background:transparent;color:var(--text-accent)}
${N} .tk-btn.tk-btn--ghost:hover{background:var(--surface-veil);color:var(--tk-clay-700)}
${N} .tk-btn.tk-btn--glass{background:${mix('--tk-plaster-50', 14)};color:var(--tk-plaster-50);border-color:${mix('--tk-plaster-50', 45)};backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
${N} .tk-btn.tk-btn--glass:hover{background:${mix('--tk-plaster-50', 24)};color:var(--tk-plaster-50);transform:translateY(-1px)}
${N} .tk-btn.tk-btn--ink{background:var(--tk-umber-900);color:var(--text-on-ink)}
${N} .tk-btn.tk-btn--ink:hover{background:var(--tk-umber-800);color:var(--text-on-ink);transform:translateY(-1px)}
${N} .tk-actions{display:flex;flex-wrap:wrap;gap:12px}
${N} .tk-badge{display:inline-flex;align-items:center;box-sizing:border-box;padding:5px 10px 4px;border-radius:var(--radius-xs);background:var(--tk-plaster-200);color:var(--tk-umber-700);font-family:var(--font-sans);font-size:11px;font-weight:var(--weight-medium);letter-spacing:var(--tracking-label);line-height:1.2;text-transform:uppercase;white-space:nowrap}
${N} .tk-badge--accent{background:var(--color-accent-bg);color:var(--color-accent-deep)}

${N} .tk-glass{background-color:var(--glass-plaster);background-image:var(--texture-sand);background-size:200px;background-blend-mode:multiply;backdrop-filter:var(--blur-glass);-webkit-backdrop-filter:var(--blur-glass)}

${N} .tk-pic{position:relative;overflow:hidden;background:var(--surface-sunk);border-radius:var(--radius-media)}
${N} .tk-pic--arch{border-radius:var(--radius-arch)}
${N} .tk-pic--soft{border-radius:var(--radius-arch-soft)}
${N} .tk-pic--tall{border-radius:var(--radius-arch-tall)}
${N} .tk-pic--xl{border-radius:var(--radius-xl)}
${N} .tk-pic--md{border-radius:var(--radius-md)}
${N} .tk-pic>img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center;transition:transform var(--motion-veil) var(--ease-drift)}
${N} .tk-pic:hover>img{transform:scale(1.03)}
${N} .tk-frame{position:absolute;inset:8px;z-index:2;border:1.5px solid ${mix('--tk-plaster-50', 50)};border-radius:inherit;pointer-events:none}
${N} .tk-ratio-3-4{aspect-ratio:3/4}
${N} .tk-ratio-4-3{aspect-ratio:4/3}
${N} .tk-ratio-4-5{aspect-ratio:4/5}
${N} .tk-ratio-1-1{aspect-ratio:1/1}

${N} .tk-wash,${N} .tk-pattern{position:relative;isolation:isolate}
${N} .tk-wash::before,${N} .tk-pattern::before{content:"";position:absolute;inset:0;z-index:-1;pointer-events:none}
${N} .tk-wash--stucco{background:var(--surface-sunk)}
${N} .tk-wash--stucco::before{background-image:var(--texture-stucco);background-size:cover;opacity:var(--texture-opacity-stucco);mix-blend-mode:multiply}
${N} .tk-wash--linen{background:var(--surface-sunk)}
${N} .tk-wash--linen::before{background-image:var(--texture-linen);background-size:24px;opacity:var(--texture-opacity-tile)}
${N} .tk-wash--grit::before{background-image:var(--texture-grit);background-size:300px;opacity:var(--texture-opacity-grit);mix-blend-mode:overlay}
${N} .tk-wash--grit-ink::before{background-size:220px;opacity:calc(var(--texture-opacity-grit) * 0.85);mix-blend-mode:soft-light}
${N} .tk-pattern--archrow::before{background-image:var(--pattern-arch-row);background-size:72px 96px;opacity:var(--texture-opacity-tile)}
${N} .tk-pattern--star::before{background-image:var(--pattern-star);background-size:80px;opacity:var(--texture-opacity-tile)}
${N} .tk-pattern--scallop::before{background-image:var(--pattern-scallop);background-size:96px 48px;background-repeat:repeat-x;background-position:top center;opacity:var(--texture-opacity-line)}
${N} .tk-edge-top::before{inset:0 0 auto 0;height:96px}
${N} .tk-motif{position:relative;overflow:hidden;isolation:isolate}
${N} .tk-motif::after{content:"";position:absolute;top:-8%;right:-6%;z-index:-1;width:42%;height:116%;background-image:var(--motif-palm);background-repeat:no-repeat;background-position:top right;background-size:contain;opacity:var(--motif-opacity);mix-blend-mode:multiply;pointer-events:none}
${N} .tk-motif--left::after{right:auto;left:-6%;background-position:top left;transform:scaleX(-1)}
${N} .tk-motif--fan::after{top:auto;bottom:-24%;width:48%;height:120%;background-image:var(--motif-palm-fan);background-position:bottom right}
${N} .tk-motif--olive::after{background-image:var(--motif-olive)}
${N} .tk-motif--agave::after{top:auto;bottom:-16%;width:46%;height:78%;background-image:var(--motif-agave);background-position:bottom right}
${N} .tk-motif--rays::after{top:auto;bottom:-26%;right:50%;width:56%;height:46%;transform:translateX(50%);background-image:var(--motif-rays);background-position:bottom center}
${N} .tk-motif--sun::after{top:-14%;right:50%;width:76%;height:62%;transform:translateX(50%);background-image:var(--motif-sun-arc);background-position:top center}
${N} .tk-motif--on-ink::after{opacity:var(--motif-opacity-ink);mix-blend-mode:screen;filter:brightness(0) invert(1)}

${N} .tk-hero{position:relative;display:flex;align-items:flex-end;min-height:min(92vh,860px);overflow:hidden}
${N} .tk-hero-photo{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center 55%}
${N} .tk-hero-veil{position:absolute;inset:0;background:linear-gradient(90deg,${mix('--tk-umber-900', 62)} 0%,${mix('--tk-umber-900', 28)} 45%,transparent 70%),var(--veil-bottom)}
${N} .tk-hero-sun{position:absolute;inset:0;opacity:.6}
${N} .tk-hero-inner{position:relative;z-index:1;display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:40px;box-sizing:border-box;width:100%;max-width:1320px;margin:0 auto;padding:clamp(120px,14vw,180px) var(--space-gutter) clamp(150px,15vw,200px)}
${N} .tk-hero-copy{max-width:680px}
${N} .tk-hero-eyebrow{margin-bottom:22px}
${N} .tk-hero-title{font-size:var(--text-display-hero);color:var(--tk-plaster-50)}
${N} .tk-hero-lead{margin:26px 0 36px;max-width:520px;font-size:var(--text-lead);font-weight:var(--weight-light);color:var(--tk-plaster-200)}
${N} .tk-hero-card{display:flex;align-items:center;gap:16px;box-sizing:border-box;max-width:360px;padding:12px 22px 12px 12px;border:1px solid ${mix('--tk-plaster-50', 50)};border-radius:var(--radius-xl);box-shadow:var(--tk-depth-lg);text-align:left;text-decoration:none;transition:transform var(--motion-base) ${EASE},box-shadow var(--motion-base) ${EASE}}
${N} a.tk-hero-card:hover{transform:translateY(var(--lift-hover));box-shadow:var(--tk-depth-xl)}
${N} .tk-hero-thumb{flex:none;width:76px;height:92px}
${N} .tk-hero-card-text{display:flex;flex-direction:column;gap:4px;min-width:0}
${N} .tk-hero-card-title{font-size:21px}
${N} .tk-hero-card-line{font-size:13px;color:var(--color-text-muted)}

${N} .tk-live{position:relative;z-index:3;margin-top:-150px}
${N} .tk-live-band{background-color:${mix('--tk-plaster-50', 74)};background-image:var(--texture-sand);background-size:200px;background-blend-mode:multiply;backdrop-filter:saturate(120%) blur(18px);-webkit-backdrop-filter:saturate(120%) blur(18px);border-top:1px solid ${mix('--tk-plaster-50', 70)};border-bottom:${HAIR};box-shadow:0 -24px 48px -24px ${mix('--tk-umber-900', 25)}}
${N} .tk-live-inner{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));max-width:1320px;margin:0 auto;padding:0 var(--space-gutter)}
${N} .tk-live-item{display:flex;align-items:center;gap:14px;min-width:0;padding:20px 14px;text-align:left;text-decoration:none}
${N} .tk-live-item:nth-child(2n+1){padding-left:0}
${N} .tk-live-item:nth-child(2n){border-left:${HAIR}}
${N} .tk-live-item:nth-child(n+3){border-top:${HAIR}}
${N} .tk-live-icon{display:none;flex:none;box-sizing:border-box;align-items:center;justify-content:center;width:40px;height:46px;padding-top:4px;border-radius:var(--radius-arch-soft);background:var(--tk-clay-100);color:var(--tk-clay-600)}
${N} .tk-live-text{min-width:0}
${N} .tk-live-label,${N} .tk-live-value{display:block;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
${N} .tk-live-value{font-size:15px;color:var(--color-heading)}
@media (min-width:900px){
${N} .tk-live{margin-top:-104px}
${N} .tk-live-inner{grid-template-columns:repeat(var(--tk-live-cols,4),minmax(0,1fr))}
${N} .tk-live-item{padding:28px clamp(12px,1.6vw,28px)}
${N} .tk-live-item:nth-child(2n){border-left:0}
${N} .tk-live-item:nth-child(n+3){border-top:0}
${N} .tk-live-item:nth-child(2n+1){padding-left:clamp(12px,1.6vw,28px)}
${N} .tk-live-item:first-child{padding-left:0}
${N} .tk-live-item:nth-child(n+2){border-left:${HAIR}}
}
@media (min-width:1120px){${N} .tk-live-icon{display:flex}}

${N} .tk-gatherings{padding-top:clamp(72px,7vw,112px);z-index:2;background-color:var(--surface-page);background-image:var(--wash-sun),var(--texture-sand);background-size:auto,200px;background-blend-mode:normal,multiply;background-attachment:scroll,fixed}
${N} .tk-gather-grid{display:grid;grid-template-columns:1fr;align-items:center;gap:clamp(32px,5vw,80px);margin-top:56px}
${N} .tk-gather-feature{position:relative;display:block;text-align:left;text-decoration:none}
${N} .tk-gather-feature .tk-gather-photo{border-radius:var(--radius-xl);aspect-ratio:4/3}
${N} .tk-gather-veil{position:absolute;inset:auto 0 0 0;height:55%;background:var(--veil-bottom)}
${N} .tk-gather-copy{position:absolute;left:28px;right:28px;bottom:28px;z-index:3;display:block;color:var(--tk-plaster-50)}
${N} .tk-gather-copy .tk-eyebrow{display:block}
${N} .tk-gather-title{display:block;margin-top:10px;font-size:var(--text-display-h3);color:var(--tk-plaster-50)}
${N} .tk-gather-meta{display:block;margin-top:8px;font-size:15px;color:var(--tk-plaster-200)}
${N} .tk-seal{position:absolute;top:20px;right:20px;z-index:4;display:flex;flex-direction:column;align-items:center;justify-content:center;box-sizing:border-box;width:76px;height:88px;padding-top:8px;border-radius:var(--radius-arch-soft);background:var(--surface-card);box-shadow:var(--tk-depth-md)}
${N} .tk-seal-day{font-size:30px;line-height:1}
${N} .tk-seal-month{font-size:10px}
${N} .tk-gather-list{display:flex;flex-direction:column}
${N} .tk-gather-row{display:grid;grid-template-columns:88px minmax(0,1fr) auto;align-items:center;gap:24px;padding:20px 0;text-align:left;text-decoration:none}
${N} .tk-gather-row+.tk-gather-row{border-top:${HAIR}}
${N} .tk-gather-thumb{width:88px}
${N} .tk-gather-row-main{display:block;min-width:0}
${N} .tk-gather-row-main .tk-eyebrow{display:block}
${N} .tk-gather-row-title{display:block;margin-top:6px;font-size:24px}
${N} .tk-gather-row-place{display:block;margin-top:4px;font-size:14px;color:var(--color-text-subtle)}
${N} .tk-gather-row-end{display:flex;flex-direction:column;align-items:flex-end;gap:8px}
${N} .tk-gather-row-price{font-size:20px}
${N} .tk-gather-row-seats{font-size:12px;color:var(--color-text-subtle)}
${N} .tk-gather-note{margin:28px 0 0;padding-top:24px;border-top:1px solid var(--line-rule);font-size:22px}
@media (min-width:860px){
${N} .tk-gather-grid{grid-template-columns:minmax(0,5fr) minmax(0,7fr)}
${N} .tk-gather-feature .tk-gather-photo{border-radius:var(--radius-arch);aspect-ratio:3/4}
${N} .tk-seal{top:30%;right:-24px}
}

${N} .tk-rooms{display:grid;grid-template-columns:minmax(0,1fr);gap:clamp(28px,3vw,44px) clamp(16px,2vw,28px);max-width:1080px;margin:56px auto 0}
${N} .tk-room{display:block;text-align:left;text-decoration:none}
${N} .tk-room-name{display:block;margin-top:16px;font-size:22px;text-align:center}
${N} .tk-room-capacity{display:block;margin-top:2px;font-size:13px;color:var(--color-text-subtle);text-align:center}
@media (min-width:560px){${N} .tk-rooms{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (min-width:900px){${N} .tk-rooms{grid-template-columns:repeat(3,minmax(0,1fr))}}

${N} .tk-services{display:flex;flex-direction:column;gap:clamp(48px,7vw,96px);margin-top:clamp(48px,6vw,80px)}
${N} .tk-service{display:grid;grid-template-columns:minmax(0,1fr);align-items:center}
${N} .tk-service .tk-service-photo{aspect-ratio:3/2}
${N} .tk-service-card{position:relative;z-index:2;margin:-40px 16px 0;padding:clamp(28px,3vw,44px);background:var(--surface-card);border:${HAIR};border-radius:var(--radius-card);box-shadow:var(--tk-depth-lg)}
${N} .tk-service-eyebrow{display:flex;gap:12px;font-size:11px}
${N} .tk-numeral{font-family:var(--font-display);letter-spacing:.04em}
${N} .tk-service-summary{margin:12px 0 0;font-size:16px;font-weight:var(--weight-light);color:var(--color-text-muted)}
${N} .tk-includes{display:flex;flex-direction:column;gap:8px;margin:20px 0 0;padding:18px 0 0;border-top:${HAIR};list-style:none}
${N} .tk-includes li{display:flex;align-items:baseline;gap:12px;font-size:14.5px}
${N} .tk-service-foot{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:16px;margin-top:24px}
${N} .tk-service-price{font-size:14px;color:var(--color-text-subtle)}
@media (min-width:860px){
${N} .tk-service{grid-template-columns:minmax(0,7fr) minmax(0,5fr)}
${N} .tk-service .tk-service-photo{aspect-ratio:4/3}
${N} .tk-service-card{margin:0 0 0 -72px}
${N} .tk-service--flip{grid-template-columns:minmax(0,5fr) minmax(0,7fr)}
${N} .tk-service--flip .tk-service-photo{order:2}
${N} .tk-service--flip .tk-service-card{order:1;margin:0 -72px 0 0}
}

${N} .tk-steps-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:56px;max-width:1080px;margin:64px auto 0;padding:0;list-style:none}
${N} .tk-step{display:flex;flex-direction:column;align-items:flex-start;text-align:left}
${N} .tk-step-photo{position:relative;width:100%;max-width:300px}
${N} .tk-step-seal{position:absolute;left:50%;bottom:-28px;z-index:3;display:flex;align-items:center;justify-content:center;box-sizing:border-box;width:56px;height:56px;transform:translateX(-50%);border:${HAIR};border-radius:50%;background:var(--surface-card);box-shadow:var(--tk-depth-sm);font-size:24px;color:var(--tk-clay-600)}
${N} .tk-step-title{margin:48px 0 0;font-size:24px}
${N} .tk-step-body{margin:10px 0 0;max-width:30ch;font-size:15px;font-weight:var(--weight-light);color:var(--color-text-muted)}
@media (min-width:820px){${N} .tk-steps-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:clamp(24px,4vw,56px)}}
${N} .tk-gallery{padding-top:0}
${N} .tk-gallery-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
${N} .tk-gallery-photo{aspect-ratio:3/4}
${N} .tk-gallery .tk-gallery-photo--3{border-radius:var(--radius-media)}
${N} .tk-gallery-note{grid-column:1 / -1;display:flex;flex-direction:column;justify-content:center;box-sizing:border-box;padding:clamp(24px,3vw,40px);background:var(--surface-card);border:${HAIR};border-radius:var(--radius-media);box-shadow:var(--tk-depth-sm);text-align:center}
${N} .tk-gallery-note .tk-eyebrow{margin-bottom:14px}
${N} .tk-gallery-quote{margin:0 auto;max-width:30ch;font-size:clamp(22px,2vw,30px)}
${N} .tk-gallery-body{margin:14px 0 0;font-size:13px;color:var(--color-text-subtle)}
@media (min-width:760px){
${N} .tk-gallery-grid{grid-template-columns:repeat(4,minmax(0,1fr));grid-template-rows:repeat(2,clamp(200px,21vw,300px))}
${N} .tk-gallery-photo{aspect-ratio:auto}
${N} .tk-gallery-photo--1{grid-area:1 / 1 / 3 / 2}
${N} .tk-gallery-photo--2{grid-area:1 / 2 / 2 / 4}
${N} .tk-gallery-photo--3{grid-area:1 / 4 / 3 / 5}
${N} .tk-gallery .tk-gallery-photo--3{border-radius:var(--radius-arch-tall)}
${N} .tk-gallery-note{grid-area:2 / 2 / 3 / 4}
}

${N} .tk-journeys{background-image:var(--wash-grove)}
${N} .tk-journey-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:24px;margin-top:56px}
${N} .tk-journey{display:flex;flex-direction:column;box-sizing:border-box;padding:10px;background:var(--surface-card);border:${HAIR};border-radius:var(--radius-card);box-shadow:var(--tk-depth-sm);text-align:left;text-decoration:none}
${N} .tk-journey-tag{position:absolute;top:18px;left:50%;z-index:3;transform:translateX(-50%);padding:6px 12px;border-radius:var(--radius-pill);font-size:11px;font-weight:var(--weight-medium);letter-spacing:.16em;text-transform:uppercase;white-space:nowrap;color:var(--color-text)}
${N} .tk-journey-body{display:flex;flex:1;flex-direction:column;gap:8px;padding:18px 12px 12px}
${N} .tk-journey-title{display:block;font-size:23px}
${N} .tk-journey-outcome{display:block;font-size:14px;font-weight:var(--weight-light);color:var(--color-text-muted)}
${N} .tk-journey-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:auto;padding-top:14px;border-top:${HAIR}}
${N} .tk-journey-host{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--color-text-subtle)}
${N} .tk-avatar{display:inline-flex;flex:none;align-items:center;justify-content:center;box-sizing:border-box;width:24px;height:24px;border:${HAIR};border-radius:var(--radius-circle);background:var(--tk-clay-100);font-size:9px;font-weight:var(--weight-medium);letter-spacing:.04em;color:var(--tk-clay-700)}
${N} .tk-journey-price{display:block;font-size:17px}
@media (min-width:620px){${N} .tk-journey-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (min-width:1180px){${N} .tk-journey-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}

${N} .tk-proof{background:var(--wash-night);color:var(--color-on-ink)}
${N} .tk-proof-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));align-items:center;gap:clamp(40px,6vw,96px)}
${N} .tk-proof-photo{width:100%;max-width:440px;justify-self:center}
${N} .tk-proof-quote{margin:22px 0 0;font-size:clamp(30px,3vw,46px);color:var(--tk-plaster-50)}
${N} .tk-proof-by{display:flex;flex-wrap:wrap;align-items:center;gap:14px;margin-top:22px}
${N} .tk-proof-who{color:var(--tk-plaster-300)}
${N} .tk-sparks{display:inline-flex;gap:2px;color:var(--tk-saffron-400)}
${N} .tk-sparks svg{fill:none;stroke:currentColor;stroke-width:1.5;stroke-linejoin:round}
${N} .tk-sparks .tk-spark-off{opacity:.25}
${N} .tk-proof-more{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:20px;margin-top:48px;padding-top:32px;border-top:1px solid var(--line-on-ink)}
${N} .tk-proof-small{margin:0}
${N} .tk-proof-small blockquote{margin:0;font-family:var(--font-sans);font-style:normal;font-size:15px;font-weight:var(--weight-light);line-height:var(--leading-relaxed);color:var(--tk-plaster-200)}
${N} .tk-proof-small figcaption{margin-top:12px}

${N} .tk-tiers{display:grid;grid-template-columns:minmax(0,1fr);align-items:stretch;gap:20px;max-width:460px;margin:64px auto 0}
${N} .tk-tier{position:relative;display:flex;flex-direction:column;align-items:flex-start;box-sizing:border-box;overflow:hidden;padding:clamp(28px,3vw,40px);background:var(--surface-card);border:${HAIR};border-radius:var(--radius-xl);box-shadow:var(--tk-depth-sm);text-align:left}
${N} .tk-tier-frame{position:absolute;inset:8px;border:1.5px solid var(--line-hairline);border-radius:inherit;pointer-events:none}
${N} .tk-tier-top{display:flex;align-items:center;justify-content:space-between;gap:12px;align-self:stretch;min-height:24px}
${N} .tk-tier-eyebrow{font-size:11px;white-space:nowrap}
${N} .tk-tier-name{margin-top:18px;font-size:28px}
${N} .tk-tier-price{display:flex;align-items:baseline;gap:6px;margin:12px 0 4px}
${N} .tk-tier-amount{font-size:48px}
${N} .tk-tier-unit{font-size:14px;opacity:.8}
${N} .tk-tier-summary{margin:6px 0 0;min-height:4.8em;font-size:15px;font-weight:var(--weight-light);color:var(--color-text-muted)}
${N} .tk-tier-perks{display:flex;flex-direction:column;align-self:stretch;gap:9px;margin:22px 0 28px;padding:20px 0 0;border-top:${HAIR};list-style:none;font-size:14px}
${N} .tk-tier-perks li{display:flex;gap:10px}
${N} .tk-tier-spark{color:var(--tk-saffron-500)}
${N} .tk-tier-button{width:100%;margin-top:auto}
${N} .tk-btn.tk-btn--light{background:var(--tk-plaster-50);color:var(--tk-umber-900);border-color:transparent}
${N} .tk-btn.tk-btn--light:hover{background:var(--tk-plaster-100);color:var(--tk-umber-900);transform:translateY(-1px)}
${N} .tk-tier--featured{border:0;background:var(--wash-clay);color:var(--kit-on-solid);box-shadow:var(--tk-depth-xl)}
${N} .tk-tier--featured .tk-tier-frame{border-color:${mix('--tk-plaster-50', 30)}}
${N} .tk-tier--featured .tk-tier-eyebrow{color:var(--tk-saffron-200)}
${N} .tk-tier--featured .tk-tier-badge{background:var(--tk-saffron-200);color:var(--tk-umber-900);font-size:10px;letter-spacing:.12em}
${N} .tk-tier--featured .tk-display{color:var(--tk-plaster-50)}
${N} .tk-tier--featured .tk-tier-summary{color:var(--tk-clay-100)}
${N} .tk-tier--featured .tk-tier-perks{border-top-color:${mix('--tk-plaster-50', 25)}}
${N} .tk-tier--featured .tk-tier-spark{color:var(--tk-saffron-200)}
@media (min-width:900px){
${N} .tk-tiers{grid-template-columns:repeat(3,minmax(0,1fr));max-width:1120px}
${N} .tk-tier--featured{transform:translateY(-16px)}
}

${N} .tk-faq{background-color:var(--surface-sunk)}
${N} .tk-faq-grid{display:grid;grid-template-columns:minmax(0,1fr);align-items:center;gap:40px;max-width:1120px}
${N} .tk-faq-aside{display:flex;flex-direction:column;align-items:center;text-align:center}
${N} .tk-faq-aside .tk-head-eyebrow{justify-content:center}
${N} .tk-faq-photo{width:100%;max-width:340px;margin-top:36px}
${N} .tk-faq-card{box-sizing:border-box;padding:8px clamp(20px,3vw,36px);background:var(--surface-card);border:${HAIR};border-radius:var(--radius-card);box-shadow:var(--tk-depth-sm)}
${N} .tk-faq-item{border-bottom:1px solid var(--color-border)}
${N} .tk-faq-item:first-child{border-top:1px solid var(--color-border)}
${N} .tk-faq-q{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:22px 0;font-family:var(--font-sans);font-size:17px;font-weight:var(--weight-regular);color:var(--color-text);cursor:pointer;list-style:none}
${N} .tk-faq-q::-webkit-details-marker{display:none}
${N} .tk-faq-chev{flex:none;transition:transform var(--motion-fast) ${EASE}}
${N} .tk-faq-item[open] .tk-faq-chev{transform:rotate(180deg)}
${N} .tk-faq-a{margin:0 0 22px;max-width:62ch;font-size:15px;color:var(--color-text-muted)}
@media (min-width:900px){
${N} .tk-faq-grid{grid-template-columns:minmax(0,5fr) minmax(0,7fr);gap:clamp(48px,6vw,88px)}
${N} .tk-faq-aside{align-items:flex-start;text-align:left}
${N} .tk-faq-aside .tk-head-eyebrow{justify-content:flex-start}
}

${N} .tk-letter-sec{padding-top:0}
${N} .tk-ltr-band{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));align-items:center;background:var(--wash-clay);color:var(--kit-on-solid);border-radius:var(--radius-2xl);box-shadow:var(--tk-depth-lg)}
${N} .tk-ltr-copy{padding:clamp(36px,5vw,72px)}
${N} .tk-ltr-eyebrow{color:var(--tk-saffron-200)}
${N} .tk-ltr-title{margin-top:16px;color:var(--tk-plaster-50)}
${N} .tk-ltr-title em{color:var(--tk-saffron-200)}
${N} .tk-ltr-body{margin:16px 0 28px;max-width:44ch;font-weight:var(--weight-light);color:var(--tk-clay-100)}
${N} .tk-ltr-band .tk-letter-form{flex-wrap:wrap;max-width:480px;margin-top:0}
${N} .tk-ltr-band .tk-letter-field{flex:1 1 220px}
${N} .tk-ltr-band .tk-btn{height:52px}
${N} .tk-letter-done--banner{margin:0;font-size:16px;color:var(--tk-plaster-50)}
${N} .tk-ltr-photo{display:flex;align-self:stretch;padding:clamp(16px,2vw,24px)}
${N} .tk-ltr-photo .tk-pic{flex:1;min-height:320px}
${N} .tk-sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}

${N} .tk-cta{position:relative;display:flex;align-items:center;justify-content:center;box-sizing:border-box;min-height:520px;overflow:hidden;padding:var(--space-section) var(--space-gutter);text-align:center}
${N} .tk-cta-photo{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
${N} .tk-cta-veil{position:absolute;inset:0;background:radial-gradient(ellipse 60% 55% at 50% 50%,${mix('--tk-umber-900', 55)},${mix('--tk-umber-900', 25)} 75%),var(--veil-full)}
${N} .tk-cta-fade{position:absolute;inset:-1px 0 auto 0;height:120px;background:linear-gradient(to bottom,var(--surface-page),transparent)}
${N} .tk-cta-inner{position:relative;z-index:2;max-width:820px}
${N} .tk-cta-star{font-size:18px;color:var(--tk-saffron-400)}
${N} .tk-cta-title{margin:14px 0 0;font-size:var(--text-display-h1);color:var(--tk-plaster-50)}
${N} .tk-cta-title em{color:var(--tk-saffron-400)}
${N} .tk-cta-actions{justify-content:center;margin-top:36px}
`
