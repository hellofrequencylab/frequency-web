// THE DESIGNER BLOCK SHEET (Alli Rae Build + Design system). The look of the Designer block family
// (components/page-editor/blocks/designer.tsx): the full-bleed hero with its strip, the statement, the portfolio
// mosaic, the arch and its numbered steps, the dark service slab, testimonials, the founder split, the photo band,
// the questions, the gallery, the closing call and the inquiry form. Every rule is scoped under the Designer root
// and reads the --dz-* tokens (lib/theme/designer.ts) only: no raw colour, no raw motion, no raw radius.

const N = '[data-house-theme="designer"]'
const EASE = 'var(--dz-ease)'
const LABEL = 'font-family:var(--dz-sans);text-transform:uppercase;letter-spacing:var(--dz-tracking-label);font-weight:500'
const HAIR = '1px solid var(--dz-line)'

export const DESIGNER_BLOCKS_CSS = `
${N} .dz-sec{position:relative;isolation:isolate;overflow:clip;padding:var(--dz-section-y) 0;background:var(--dz-plaster);color:var(--dz-charcoal)}
${N} .dz-sec::before{content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;background:var(--dz-plaster-tex)}
${N} .dz-sec[data-tone="linen"]{background:var(--dz-linen)}
${N} .dz-sec[data-tone="warm"]{background:var(--dz-sand-soft)}
${N} .dz-sec[data-tone="deep"],${N} .dz-sec[data-tone="photo"]{color:var(--dz-on-dark)}
${N} .dz-sec[data-tone="deep"]{background:var(--dz-ink)}
${N} .dz-sec[data-tone="deep"]::before{background:var(--dz-glow)}
${N} .dz-sec[data-tone="deep"]::after{content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;opacity:.07;background-image:var(--dz-grain-light)}
${N} .dz-sec[data-slab]{margin:var(--dz-slab-gap);border-radius:var(--dz-r-section)}
${N} .dz-sec[data-tone="deep"][data-slab]{box-shadow:var(--dz-shadow-slab)}
${N} .dz-sec[data-tone="warm"][data-slab]{box-shadow:var(--dz-shadow-2)}
${N} .dz-wrap{position:relative;width:100%;max-width:var(--dz-container);margin:0 auto;padding:0 var(--dz-gutter)}
${N} .dz-eyebrow{display:flex;align-items:center;gap:14px;margin:0;${LABEL};font-size:var(--dz-size-label);color:var(--dz-ochre-deep)}
${N} .dz-eyebrow[data-rule]::before{content:"";flex:none;width:40px;height:1px;background:currentColor}
${N} [data-tone="deep"] .dz-eyebrow,${N} [data-tone="photo"] .dz-eyebrow,${N} .dz-hero .dz-eyebrow{color:var(--dz-sand)}
${N} .dz-eyebrow--center{justify-content:center}
${N} .dz-eyebrow--center[data-rule]::after{content:"";flex:none;width:40px;height:1px;background:currentColor}
${N} .dz-title{margin:0;font-family:var(--dz-display);font-weight:400;font-size:var(--dz-size-h1);line-height:1.06;letter-spacing:var(--dz-tracking-display);text-wrap:balance}
${N} .dz-title--xl{font-size:var(--dz-size-display-l);line-height:.98}
${N} .dz-title em,${N} .dz-display em{font-style:italic;color:var(--dz-walnut)}
${N} [data-tone="deep"] .dz-title em,${N} [data-tone="photo"] .dz-title em,${N} .dz-hero .dz-display em{color:var(--dz-sand)}
${N} .dz-title--italic{font-style:italic}
${N} .dz-lead{margin:0;max-width:36rem;font-weight:300;font-size:var(--dz-size-lead);line-height:1.6;color:var(--dz-stone);text-wrap:pretty}
${N} [data-tone="deep"] .dz-lead{color:var(--dz-on-dark-muted)}
${N} .dz-body{margin:0;font-size:var(--dz-size-body);line-height:var(--dz-leading-body);color:var(--dz-stone);text-wrap:pretty}
${N} .dz-actions{display:flex;flex-wrap:wrap;gap:14px;margin-top:40px}
${N} .dz-actions--center{justify-content:center}

/* Buttons (design: Button). md 17/30 at 13px, lg 21/38 at 14px; hover darkens and rises 1px, the arrow nudges 4px;
   pressed drops back to 0; disabled is 40%. Variants: primary, outline (secondary), inverse, light (outlineLight), warm, link. */
${N} .dz-btn{display:inline-flex;align-items:center;justify-content:center;gap:14px;padding:17px 30px;${LABEL};font-size:var(--dz-size-label);line-height:1;letter-spacing:var(--dz-tracking-button);text-decoration:none;white-space:nowrap;border-radius:var(--dz-r-1);border:1px solid transparent;cursor:pointer;transition:background var(--dz-dur-base) ${EASE},color var(--dz-dur-base),box-shadow var(--dz-dur-base),transform var(--dz-dur-fast) var(--dz-ease-out),border-color var(--dz-dur-base)}
${N} .dz-btn[data-size="sm"]{padding:12px 20px;font-size:var(--dz-size-micro)}
${N} .dz-btn[data-size="lg"]{padding:21px 38px;font-size:14px}
${N} .dz-btn:hover{transform:translateY(-1px)}
${N} .dz-btn:active{transform:none}
${N} .dz-btn:disabled,${N} .dz-btn[aria-disabled="true"]{opacity:.4;cursor:not-allowed;transform:none}
${N} .dz-btn-primary{background:var(--dz-charcoal);color:var(--dz-plaster);box-shadow:var(--dz-shadow-btn)}
${N} .dz-btn-primary:hover{background:var(--dz-ink);color:var(--dz-plaster)}
${N} .dz-btn-outline{background:var(--dz-fill-glass-35);color:var(--dz-charcoal);border-color:var(--dz-charcoal)}
${N} .dz-btn-outline:hover{background:var(--dz-charcoal);color:var(--dz-plaster);box-shadow:var(--dz-shadow-btn)}
${N} .dz-btn-inverse{background:var(--dz-plaster);color:var(--dz-charcoal);box-shadow:var(--dz-shadow-inverse)}
${N} .dz-btn-inverse:hover{background:var(--dz-paper);color:var(--dz-charcoal)}
${N} .dz-btn-light{background:var(--dz-fill-light);color:var(--dz-plaster);border-color:var(--dz-outline-light-70)}
${N} .dz-btn-light:hover{background:var(--dz-fill-light-hover);color:var(--dz-plaster)}
${N} .dz-btn-warm{background:var(--dz-terracotta);color:var(--dz-plaster);box-shadow:var(--dz-shadow-btn)}
${N} .dz-btn-warm:hover{background:var(--dz-terracotta-deep);color:var(--dz-plaster)}
${N} .dz-btn-link{gap:10px;padding:8px 0;border:0;border-bottom:1px solid var(--dz-charcoal);border-radius:0;background:linear-gradient(var(--dz-ochre),var(--dz-ochre)) 0 100% / 0% 1px no-repeat;color:var(--dz-charcoal);transition:background-size var(--dz-dur-base) ${EASE},color var(--dz-dur-base)}
${N} .dz-btn-link:hover{background-size:100% 1px;color:var(--dz-charcoal);transform:none}
${N} .dz-btn .dz-arrow{display:inline-block;transition:transform var(--dz-dur-base) var(--dz-ease-out)}
${N} .dz-btn:hover .dz-arrow{transform:translateX(4px)}

/* The hero: full-bleed photo, left-weighted scrim, centred copy, frosted strip on the bottom edge. */
${N} .dz-hero{position:relative;isolation:isolate;overflow:hidden;display:flex;flex-direction:column;justify-content:center;height:100vh;min-height:720px;background:var(--dz-ink);color:var(--dz-plaster)}
${N} .dz-hero--short{height:auto;min-height:min(72vh,40rem)}
${N} .dz-hero-photo{position:absolute;inset:0;z-index:-3;width:100%;height:100%;object-fit:cover;transform:scale(1.04)}
${N} .dz-hero::before{content:"";position:absolute;inset:0;z-index:-2;background:var(--dz-scrim-hero)}
${N} .dz-hero[data-size="page"]::before,${N} .dz-hero--short::before{background:var(--dz-scrim-hero-page)}
${N} .dz-hero::after{content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;opacity:.06;background-image:var(--dz-grain-light)}
${N} .dz-hero-copy{padding-top:126px;padding-bottom:140px}
${N} .dz-hero[data-size="full"] .dz-hero-copy,${N} .dz-hero[data-size="page"] .dz-hero-copy{height:100%;justify-content:center}
${N} .dz-hero-copy{display:flex;flex-direction:column}
${N} .dz-hero-copy .dz-eyebrow{margin-bottom:28px}
${N} .dz-hero[data-size="page"] .dz-display{font-size:clamp(48px,5.6vw,88px);max-width:900px;margin-top:0}
${N} .dz-hero[data-size="page"] .dz-lead{max-width:540px}
${N} .dz-display{margin:0;max-width:860px;font-family:var(--dz-display);font-weight:400;font-size:var(--dz-size-hero);line-height:1;letter-spacing:-.02em;text-wrap:balance;text-shadow:var(--dz-text-shadow-hero)}
${N} .dz-hero .dz-lead{margin-top:30px;max-width:520px;line-height:1.55;color:var(--dz-on-dark-lead)}
${N} .dz-hero .dz-actions{margin-top:40px}
${N} .dz-strip{position:absolute;left:0;right:0;bottom:0;border-top:1px solid var(--dz-rule-dark);background:var(--dz-glass-dark);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px)}
${N} .dz-strip-grid{display:grid;grid-template-columns:repeat(var(--dz-strip-cols,3),minmax(0,1fr)) auto}
${N} .dz-strip-scroll{display:flex;align-items:center;gap:12px;padding-left:24px;border-left:1px solid var(--dz-hairline-dark);${LABEL};font-size:11px;letter-spacing:.2em;color:var(--dz-on-dark-muted)}
${N} .dz-strip-scroll span{width:1px;height:28px;background:linear-gradient(var(--dz-sand),transparent)}
${N} .dz-strip-item{display:flex;align-items:center;gap:16px;min-width:0;padding:22px 24px;color:inherit;text-decoration:none;border-left:1px solid var(--dz-hairline-dark)}
${N} .dz-strip-item:first-child{padding-left:0;border-left:0}
${N} .dz-strip-thumb{flex:none;width:52px;height:52px;border-radius:var(--dz-r-pill);overflow:hidden;box-shadow:0 0 0 1px var(--dz-on-dark-muted)}
${N} .dz-strip-thumb img{width:100%;height:100%;object-fit:cover}
${N} .dz-strip-text{display:flex;flex-direction:column;gap:8px;min-width:0}
${N} .dz-strip-text[data-flip]{gap:6px}
${N} .dz-strip-text[data-flip] .dz-strip-label{order:2}
${N} .dz-strip-text[data-flip] .dz-strip-value{font-size:19px;line-height:1.15}
${N} .dz-strip-label{${LABEL};font-size:11px;letter-spacing:.18em;color:var(--dz-sand)}
${N} .dz-strip-value{font-family:var(--dz-display);font-size:20px;line-height:1.2}
@media (max-width:900px){${N} .dz-strip{display:none}${N} .dz-hero{height:auto;min-height:720px}${N} .dz-hero-copy{padding-bottom:var(--dz-section-y)}}

/* Statement: an open two-column block closed by a hairline. */
${N} .dz-statement{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,7fr);gap:clamp(32px,6vw,96px);align-items:start}
${N} .dz-statement-head{display:flex;flex-direction:column;gap:22px}
${N} .dz-statement-head .dz-title{font-style:italic;color:var(--dz-walnut)}
${N} .dz-statement-body{display:flex;flex-direction:column;gap:22px}
${N} .dz-statement-lead{margin:0;font-weight:300;font-size:clamp(21px,1.9vw,26px);line-height:1.6;color:var(--dz-charcoal);text-wrap:pretty}
${N} .dz-meta{margin:0;${LABEL};font-size:var(--dz-size-micro);letter-spacing:.16em;line-height:1.6;color:var(--dz-stone)}

/* Section head. */
${N} .dz-head{display:grid;grid-template-columns:minmax(0,7fr) minmax(0,5fr);gap:clamp(32px,6vw,96px);align-items:end;padding-bottom:var(--dz-section-head);margin-bottom:var(--dz-section-head);border-bottom:${HAIR}}
${N} .dz-head--plain{display:flex;flex-direction:column;gap:20px;border:0;padding:0;max-width:44rem}
${N} .dz-head .dz-title{margin-top:22px}
${N} .dz-head--center{align-items:center;text-align:center;margin-inline:auto}
${N} [data-tone="deep"] .dz-head{border-color:var(--dz-rule-dark)}

/* Portfolio mosaic: one large card left, two stacked right. */
${N} .dz-mosaic{display:grid;grid-template-columns:minmax(0,7fr) minmax(0,5fr);gap:clamp(16px,2vw,28px)}
${N} .dz-mosaic-stack{display:grid;grid-template-rows:1fr 1fr;gap:clamp(16px,2vw,28px)}
${N} .dz-project{position:relative;display:block;min-height:240px;overflow:hidden;border-radius:var(--dz-r-3);box-shadow:var(--dz-shadow-photo);color:var(--dz-plaster);text-decoration:none;background:var(--dz-ink);transition:box-shadow var(--dz-dur-slow) var(--dz-ease-out)}
${N} .dz-project[data-size="lg"]{aspect-ratio:6 / 5}
${N} .dz-project[data-size="wide"]{aspect-ratio:16 / 11}
${N} .dz-project:hover{box-shadow:var(--dz-shadow-3);color:var(--dz-plaster)}
${N} .dz-project img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:transform 1.2s var(--dz-ease-out)}
${N} .dz-project:hover img{transform:scale(1.04)}
${N} .dz-project::after{content:"";position:absolute;inset:0;background:var(--dz-scrim-card)}
${N} .dz-project-body{position:absolute;left:28px;right:28px;bottom:28px;z-index:1;display:block}
${N} .dz-project-body>span{display:flex;flex-direction:column;gap:12px}
${N} .dz-project-title{display:block;font-family:var(--dz-display);font-size:32px;line-height:1.1}
${N} .dz-project-meta{display:block;${LABEL};font-size:var(--dz-size-micro);letter-spacing:.18em;line-height:1.4;color:var(--dz-sand)}
${N} .dz-project-go{display:inline-flex;align-items:center;align-self:flex-start;margin-top:6px;padding:11px 16px;border-radius:var(--dz-r-pill);background:var(--dz-glass);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);color:var(--dz-charcoal);${LABEL};font-size:var(--dz-size-micro);letter-spacing:var(--dz-tracking-button);line-height:1}

/* The arch and its steps. */
${N} .dz-split{display:grid;gap:clamp(48px,8vw,128px);align-items:center}
${N} .dz-split--5-6{grid-template-columns:minmax(0,5fr) minmax(0,6fr)}
${N} .dz-split--6-5{grid-template-columns:minmax(0,6fr) minmax(0,5fr)}
${N} .dz-split--1-1{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
${N} .dz-arch{position:relative;margin:0}
${N} .dz-arch-frame{position:relative;overflow:hidden;border-radius:var(--dz-r-arch);aspect-ratio:4 / 5;box-shadow:var(--dz-shadow-photo);background:var(--dz-linen)}
${N} .dz-arch[data-ratio="portrait"] .dz-arch-frame{aspect-ratio:3 / 4}
${N} .dz-arch[data-frame]::before{content:"";position:absolute;inset:0;transform:translate(18px,-18px);border-radius:var(--dz-r-arch);border:1px solid var(--dz-ochre);opacity:.7;pointer-events:none}
${N} .dz-arch-frame::after{content:"";position:absolute;inset:0;border-radius:inherit;box-shadow:var(--dz-inset-ring);pointer-events:none}
${N} .dz-arch img{transition:transform 1.2s var(--dz-ease-out)}
${N} .dz-arch:hover img{transform:scale(1.03)}
${N} .dz-arch img{display:block;width:100%;height:100%;object-fit:cover}
${N} .dz-panel{padding:4px clamp(24px,3vw,40px);background:var(--dz-sheen),var(--dz-glass-warm);border-radius:var(--dz-r-3);box-shadow:var(--dz-shadow-2)}
${N} .dz-step{display:grid;grid-template-columns:52px minmax(0,1fr);gap:20px;padding:22px 0;border-top:${HAIR}}
${N} .dz-step:first-child{border-top:0}
${N} .dz-disc,${N} .dz-seal{display:grid;place-items:center;width:var(--dz-seal,48px);height:var(--dz-seal,48px);border-radius:var(--dz-r-pill);border:1px solid var(--dz-ochre);background:var(--dz-paper);font-family:var(--dz-display);font-style:italic;font-size:var(--dz-seal-fs,22px);line-height:1;color:var(--dz-ochre-deep)}
${N} .dz-seal{box-shadow:var(--dz-shadow-1);flex:none}
${N} .dz-seal[data-tone="accent"]{background:var(--color-primary-bg)}
${N} .dz-seal[data-tone="dark"]{border-color:var(--dz-disc-dark-edge);background:var(--dz-disc-dark);color:var(--dz-sand);box-shadow:none}
${N} .dz-seal-set{display:inline-flex;flex-direction:column;align-items:center;gap:12px}
${N} .dz-seal-label{font-family:var(--dz-sans);font-size:11px;font-weight:500;letter-spacing:var(--dz-tracking-label);text-transform:uppercase;color:var(--dz-ochre-deep)}
/* Ornament: a fading hairline with one centred mark. */
${N} .dz-orn{display:flex;align-items:center;gap:16px;width:var(--dz-orn-w,100%);max-width:100%;margin:0 auto;color:var(--color-primary)}
${N} .dz-orn-line{flex:1;height:1px;background:linear-gradient(90deg,transparent,var(--dz-line))}
${N} .dz-orn-line[data-end]{background:linear-gradient(270deg,transparent,var(--dz-line))}
${N} .dz-orn-mark{display:inline-flex;gap:10px;align-items:center;line-height:1}
${N} .dz-orn-mark>span{font-family:var(--dz-sans);font-weight:300;font-size:13px;line-height:.6}
${N} .dz-orn-mark>span[data-g="+"],${N} .dz-orn-mark>span[data-g="·"]{font-size:20px}
${N} .dz-orn-mark>span[data-g="●"]{font-size:7px}
${N} .dz-orn-label{padding:0 4px;font-size:var(--dz-size-micro);letter-spacing:var(--dz-tracking-label);text-transform:uppercase}
${N} .dz-step .dz-disc{width:52px;height:52px;box-shadow:var(--dz-shadow-1)}
${N} .dz-step>div{display:flex;flex-direction:column;gap:8px;min-width:0}
${N} .dz-step-title{margin:0;font-family:var(--dz-display);font-weight:400;font-size:var(--dz-size-h3);line-height:1.15}
${N} .dz-step-lead{margin:0;font-family:var(--dz-display);font-style:italic;font-size:var(--dz-size-h4);line-height:1.4;color:var(--dz-walnut)}
${N} .dz-step .dz-body{max-width:580px}
/* The steps section: the portrait stretches to the height of the heading and panel, so both columns align top and bottom. */
@media (min-width:901px){${N} .dz-sec[data-dz="steps"] .dz-split{align-items:stretch}${N} .dz-sec[data-dz="steps"] .dz-arch,${N} .dz-sec[data-dz="steps"] .dz-arch-frame{height:100%}${N} .dz-sec[data-dz="steps"] .dz-arch-frame{aspect-ratio:auto;min-height:420px}}

/* Service tiles on the dark slab. */
${N} .dz-bar{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:40px;margin-bottom:var(--dz-section-head)}
${N} .dz-bar-copy{display:flex;flex-direction:column;gap:20px;max-width:42rem}
${N} .dz-bar[data-split]{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:64px;align-items:end}
${N} .dz-bar-lead{margin:0;color:var(--dz-on-dark-muted)}
${N} .dz-services--light~.dz-closing{display:none}
${N} .dz-services{display:grid;grid-template-columns:repeat(var(--dz-cols,4),minmax(0,1fr));gap:16px;margin:0;padding:0;list-style:none}
${N} .dz-service{display:flex;flex-direction:column;justify-content:space-between;gap:32px;min-height:170px;padding:26px;border:0;border-radius:var(--dz-r-2);background:var(--dz-tile-dark);box-shadow:var(--dz-tile-dark-edge);font-family:var(--dz-display);font-size:24px;line-height:1.2;text-wrap:balance;transition:background var(--dz-dur-slow) var(--dz-ease-out),box-shadow var(--dz-dur-slow) var(--dz-ease-out),transform var(--dz-dur-slow) var(--dz-ease-out)}
${N} .dz-service:hover{background:var(--dz-tile-dark-hover);box-shadow:var(--dz-tile-dark-edge),var(--dz-tile-dark-lift);transform:translateY(-3px)}
${N} .dz-service b{display:grid;place-items:center;width:40px;height:40px;border-radius:var(--dz-r-pill);border:1px solid var(--dz-disc-dark-edge);background:var(--dz-disc-dark);font-family:var(--dz-display);font-style:italic;font-weight:400;font-size:18px;color:var(--dz-sand)}
${N} .dz-closing{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:32px;margin-top:var(--dz-section-head)}
${N} .dz-closing{align-items:center}
${N} .dz-closing p{margin:0;max-width:640px;font-family:var(--dz-display);font-style:italic;font-size:28px;line-height:1.35;color:var(--dz-sand)}
${N} .dz-services--light .dz-service{border-color:var(--dz-line);background:var(--dz-paper);font-size:20px;min-height:0}

/* Testimonials. */
${N} .dz-tbar{display:flex;align-items:center;justify-content:space-between;gap:24px;margin-bottom:var(--dz-section-head)}
${N} .dz-tctl{display:flex;align-items:center;gap:12px}
${N} .dz-dots{display:flex;gap:8px;margin-right:16px}
${N} .dz-dot{width:8px;height:8px;padding:0;border:0;border-radius:var(--dz-r-pill);background:var(--dz-line);cursor:pointer;transition:width var(--dz-dur-base) ${EASE},background var(--dz-dur-base) ${EASE}}
${N} .dz-dot[aria-current="true"]{width:28px;background:var(--dz-charcoal)}
${N} .dz-round{display:grid;place-items:center;width:52px;height:52px;padding:0;border:${HAIR};border-radius:var(--dz-r-pill);background:var(--dz-paper);box-shadow:var(--dz-shadow-1);cursor:pointer;font-size:18px;color:var(--dz-charcoal);transition:background var(--dz-dur-base) ${EASE},color var(--dz-dur-base) ${EASE}}
${N} .dz-quote-card{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,7fr);align-items:center}
${N} .dz-quote-card[data-solo]{grid-template-columns:minmax(0,1fr);max-width:820px}
${N} .dz-quote-photo{grid-column:1;grid-row:1}
${N} .dz-quote-text{position:relative;z-index:1;grid-column:2;grid-row:1;margin-left:-12%;display:flex;flex-direction:column;gap:28px;padding:clamp(36px,5vw,64px);overflow:hidden;border-radius:var(--dz-r-3);background:var(--dz-sheen),var(--dz-parchment);box-shadow:var(--dz-shadow-3)}
${N} .dz-quote-card[data-solo] .dz-quote-text{grid-column:1;margin-left:0}
${N} .dz-quote-text::before{content:"";position:absolute;inset:0;pointer-events:none;background:var(--dz-plaster-tex)}
${N} .dz-quote-text>*{position:relative}
${N} .dz-quote-mark{display:block;height:44px;font-family:var(--dz-display);font-size:120px;line-height:.5;color:var(--dz-ochre)}
${N} .dz-quote{margin:0;font-family:var(--dz-display);font-style:italic;font-size:clamp(28px,2.8vw,42px);line-height:1.22;text-wrap:pretty}
${N} .dz-quote-by{display:flex;align-items:center;gap:16px;${LABEL};font-size:var(--dz-size-label);color:var(--dz-charcoal)}
${N} .dz-quote-by[data-rule]::before{content:"";flex:none;width:32px;height:1px;background:var(--dz-ochre)}
${N} .dz-slide[hidden]{display:none}

/* Founder split. */
${N} .dz-founder-copy{display:flex;flex-direction:column;gap:22px}
${N} .dz-founder-lead{margin:8px 0;font-family:var(--dz-display);font-size:26px;line-height:1.4;color:var(--dz-walnut)}
${N} .dz-founder-lead em{font-style:italic;color:inherit}
${N} .dz-founder-photo{position:relative;padding-bottom:56px}
${N} .dz-float{position:absolute;left:-14%;bottom:0;max-width:20rem;display:flex;flex-direction:column;gap:12px;padding:24px 28px;border-radius:var(--dz-r-2);background:var(--dz-sheen),var(--dz-parchment);box-shadow:var(--dz-shadow-3)}
${N} .dz-float p{margin:0;font-family:var(--dz-display);font-style:italic;font-size:22px;line-height:1.3}

/* Photo band with three frosted cards. */
${N} .dz-band{margin:var(--dz-slab-gap);border-radius:var(--dz-r-section);box-shadow:var(--dz-shadow-slab-band)}
${N} .dz-band-photo{position:absolute;inset:0;z-index:-3;width:100%;height:100%;object-fit:cover}
${N} .dz-sec[data-tone="photo"]{background:var(--dz-ink)}
${N} .dz-sec[data-tone="photo"]::before{z-index:-2;background:var(--dz-scrim-band)}
${N} .dz-sec[data-tone="photo"]::after{content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;opacity:.06;background-image:var(--dz-grain-light)}
${N} .dz-band-head{display:flex;flex-direction:column;align-items:center;gap:20px;margin-bottom:var(--dz-section-head);text-align:center}
${N} .dz-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:clamp(16px,2vw,28px)}
${N} .dz-glass{padding:clamp(28px,3vw,44px);color:var(--dz-charcoal);background:var(--dz-sheen),var(--dz-glass-warm);-webkit-backdrop-filter:blur(18px) saturate(1.1);backdrop-filter:blur(18px) saturate(1.1);border-radius:var(--dz-r-3);box-shadow:var(--dz-card-edge)}
${N} .dz-cards .dz-glass:nth-child(2){margin-top:40px}
${N} .dz-glass h3{margin:22px 0 20px;font-family:var(--dz-display);font-style:italic;font-weight:400;font-size:44px;line-height:1}
${N} .dz-glass p{margin:0 0 10px;font-size:var(--dz-size-small);line-height:1.65;color:var(--dz-stone)}
${N} .dz-glass p:first-of-type{font-family:var(--dz-display);font-style:italic;font-size:21px;line-height:1.4;color:var(--dz-walnut)}
${N} .dz-band-cta{display:flex;justify-content:center;margin-top:var(--dz-section-head)}

/* Questions. */
${N} .dz-faq-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,2fr);gap:clamp(40px,6vw,96px);align-items:start}
${N} .dz-faq-side{position:sticky;top:140px;display:flex;flex-direction:column;gap:28px}
${N} .dz-card{display:flex;flex-direction:column;gap:14px;padding:28px;border-radius:var(--dz-r-2);background:var(--dz-sheen),var(--dz-parchment);box-shadow:var(--dz-shadow-2)}
${N} .dz-card-phone{font-family:var(--dz-display);font-size:28px;line-height:1.1;color:var(--dz-charcoal);text-decoration:none}
${N} .dz-card-mail{font-size:var(--dz-size-small);line-height:1.4;color:var(--dz-terracotta);text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:3px}
${N} .dz-card-mail:hover{color:var(--dz-terracotta-deep)}
${N} .dz-faq{padding:12px;border-radius:var(--dz-r-3);background:var(--dz-glass-warm);box-shadow:var(--dz-shadow-1)}
${N} .dz-faq-item{padding:0 clamp(20px,2.5vw,32px);border-bottom:${HAIR};border-radius:var(--dz-r-2);transition:background var(--dz-dur-base) ${EASE},box-shadow var(--dz-dur-base) ${EASE},margin var(--dz-dur-base) ${EASE}}
${N} .dz-faq-item:hover{background:var(--dz-wash)}
${N} .dz-faq-item[data-open]{margin:8px 0;border-bottom-color:transparent;background:var(--dz-sheen),var(--dz-paper);box-shadow:var(--dz-shadow-2)}
${N} .dz-faq-q{display:flex;width:100%;align-items:center;justify-content:space-between;gap:24px;padding:28px 0;border:0;background:none;cursor:pointer;text-align:left;color:var(--dz-charcoal);font-family:var(--dz-display);font-weight:400;font-size:clamp(22px,2vw,28px);line-height:1.25}
${N} .dz-plus{flex:none;display:grid;place-items:center;width:42px;height:42px;border:${HAIR};border-radius:var(--dz-r-pill);background:var(--dz-paper);box-shadow:var(--dz-shadow-1);font-family:var(--dz-sans);font-weight:300;font-size:22px;line-height:1;color:var(--dz-charcoal);transition:all var(--dz-dur-base) var(--dz-ease-out)}
${N} .dz-faq-item[data-open] .dz-plus{transform:rotate(45deg);border-color:var(--dz-charcoal);background:var(--dz-charcoal);color:var(--dz-plaster);box-shadow:var(--dz-shadow-btn)}
${N} .dz-faq-panel{display:grid;grid-template-rows:0fr;transition:grid-template-rows var(--dz-dur-base) ${EASE}}
${N} .dz-faq-item[data-open] .dz-faq-panel{grid-template-rows:1fr}
${N} .dz-faq-panel>div{overflow:hidden}
${N} .dz-faq-answer{max-width:760px;padding:0 66px 32px 0}
${N} .dz-rows{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:40px;margin:20px 0 0;padding:0;list-style:none}
${N} .dz-rows li{display:flex;align-items:center;gap:18px;padding:14px 0;border-top:${HAIR};font-family:var(--dz-display);font-size:22px;line-height:1.3}
${N} .dz-rows b{flex:none;display:grid;place-items:center;width:40px;height:40px;border:1px solid var(--dz-ochre);border-radius:var(--dz-r-pill);background:var(--dz-paper);font-family:var(--dz-display);font-style:italic;font-weight:400;font-size:18px;color:var(--dz-ochre-deep)}

/* Quote + arch. */
${N} .dz-big-quote{display:flex;flex-direction:column;gap:24px}
${N} .dz-big-quote .dz-title{font-style:italic;line-height:1.1}

/* Gallery. */
${N} .dz-gallery{display:grid;gap:28px;grid-template-columns:1fr}
${N} .dz-gallery[data-count="2"]{grid-template-columns:1.4fr 1fr}
${N} .dz-gallery[data-count="3"]{grid-template-columns:1.4fr 1fr}
${N} .dz-shot{margin:0;overflow:hidden;border-radius:var(--dz-r-3);box-shadow:var(--dz-shadow-photo);aspect-ratio:3 / 4}
${N} .dz-gallery[data-count="1"] .dz-shot{aspect-ratio:16 / 10}
${N} .dz-gallery[data-count="2"] .dz-shot:first-child{aspect-ratio:4 / 5}
${N} .dz-gallery[data-count="2"] .dz-shot:nth-child(2){margin-top:80px}
${N} .dz-gallery[data-count="3"] .dz-shot:first-child{grid-row:span 2;aspect-ratio:4 / 5}
${N} .dz-shot img{width:100%;height:100%;object-fit:cover}

/* Closing call + next. */
${N} .dz-sec[data-dz="closing"] .dz-split{gap:64px}
${N} .dz-next-copy{display:flex;flex-direction:column;align-items:flex-start;gap:28px}
${N} .dz-next-copy>.dz-orn{margin:0}
${N} .dz-orn-head{display:flex;justify-content:center;margin-bottom:clamp(24px,3vw,40px)}

/* Inquiry form. */
${N} .dz-inquiry{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,7fr);gap:clamp(40px,6vw,96px);align-items:start}
${N} .dz-inquiry-copy{position:sticky;top:150px;display:flex;flex-direction:column;gap:20px}
${N} .dz-inquiry-copy .dz-title{margin:4px 0 8px}
${N} .dz-inquiry-copy .dz-title em{color:inherit}
${N} .dz-inquiry-photo{margin-top:12px;overflow:hidden;border-radius:var(--dz-r-3);aspect-ratio:16 / 11;box-shadow:var(--dz-shadow-photo)}
${N} .dz-inquiry-photo img{width:100%;height:100%;object-fit:cover}
${N} .dz-form{position:relative;display:grid;grid-template-columns:1fr 1fr;gap:28px 24px;padding:clamp(32px,4vw,56px);border-radius:var(--dz-r-3);background:var(--dz-sheen),var(--dz-parchment);box-shadow:var(--dz-shadow-3)}
${N} .dz-form::before{content:"";position:absolute;inset:0;border-radius:inherit;background:var(--dz-plaster-tex);pointer-events:none}
${N} .dz-form-wide{grid-column:1 / -1}
${N} .dz-form-foot{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:20px}
${N} .dz-form-note{font-size:14px;line-height:1.4;color:var(--dz-stone)}
${N} .dz-form .field{display:flex;flex-direction:column;gap:10px}
${N} .dz-form .mu-label{${LABEL};font-size:var(--dz-size-micro);letter-spacing:.16em;line-height:1.2;color:var(--dz-charcoal)}
${N} .dz-req{color:var(--dz-terracotta)}
${N} .dz-form .mu-select{position:relative;display:block;width:100%}
${N} .dz-form .mu-select>svg{display:none}
${N} .dz-form .mu-select::after{content:"";position:absolute;right:16px;top:50%;width:8px;height:8px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:translateY(-70%) rotate(45deg);pointer-events:none;color:var(--dz-charcoal)}
${N} .dz-form .dz-input.dz-input{width:100%;min-height:0;padding:15px 16px;background:var(--dz-paper);border:${HAIR};border-radius:var(--dz-r-1);box-shadow:var(--dz-shadow-inset);font:400 var(--dz-size-body)/1.45 var(--dz-sans);color:var(--dz-charcoal);transition:border-color var(--dz-dur-base) ${EASE},box-shadow var(--dz-dur-base) ${EASE}}
${N} .dz-form select.dz-input.dz-input{padding-right:44px;appearance:none;-webkit-appearance:none;cursor:pointer}
${N} .dz-form textarea.dz-input.dz-input{resize:vertical}
${N} .dz-form .dz-input.dz-input:focus,${N} .dz-form .dz-input.dz-input:focus-visible{outline:0;border-color:var(--dz-ochre);box-shadow:var(--dz-ring)}
${N} .dz-chips{display:flex;flex-wrap:wrap;gap:10px;margin:0;padding:0;border:0}
${N} .dz-chip{display:inline-flex;align-items:center;gap:10px;min-height:44px;padding:12px 18px;border:${HAIR};border-radius:var(--dz-r-1);background:var(--dz-paper);box-shadow:var(--dz-shadow-1);cursor:pointer;font:400 15px/1 var(--dz-sans);color:var(--dz-charcoal);transition:all var(--dz-dur-fast) ${EASE}}
${N} .dz-box{display:grid;place-items:center;width:14px;height:14px;border:${HAIR};border-radius:2px;font:600 10px/1 var(--dz-sans);color:var(--dz-sand)}
${N} .dz-chip[aria-pressed="true"]{background:var(--dz-charcoal);border-color:var(--dz-charcoal);color:var(--dz-plaster);box-shadow:var(--dz-shadow-btn)}
${N} .dz-chip[aria-pressed="true"] .dz-box{border-color:var(--dz-sand)}
${N} .dz-legend{margin:0 0 14px;${LABEL};font-size:var(--dz-size-micro);letter-spacing:.16em;line-height:1.2;color:var(--dz-charcoal)}
${N} .dz-done{display:flex;flex-direction:column;justify-content:center;gap:16px;min-height:22rem;padding:clamp(32px,4vw,56px);border-radius:var(--dz-r-3);background:var(--dz-sheen),var(--dz-parchment);box-shadow:var(--dz-shadow-3)}
${N} .dz-done-mark{display:grid;place-items:center;width:52px;height:52px;border-radius:var(--dz-r-pill);background:var(--dz-sand);font:500 20px/1 var(--dz-sans);color:var(--dz-charcoal)}
${N} .dz-done h3{margin:0;font-family:var(--dz-display);font-style:italic;font-weight:400;font-size:44px;line-height:1.1}
${N} .dz-hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}

/* Newsletter (footer / letter band). */
${N} .dz-news{display:flex;flex-direction:column;gap:14px}
${N} .dz-news-row{display:flex;gap:10px;flex-wrap:wrap}

@media (max-width:900px){
${N} .dz-rows{grid-template-columns:minmax(0,1fr)}
${N} .dz-statement,${N} .dz-head,${N} .dz-mosaic,${N} .dz-split--5-6,${N} .dz-split--6-5,${N} .dz-split--1-1,${N} .dz-cards,${N} .dz-faq-grid,${N} .dz-inquiry,${N} .dz-quote-card{grid-template-columns:minmax(0,1fr)}
${N} .dz-statement,${N} .dz-head,${N} .dz-split,${N} .dz-faq-grid,${N} .dz-inquiry{row-gap:clamp(32px,6vw,48px)}
${N} .dz-services{--dz-cols:2}
${N} .dz-faq-side,${N} .dz-inquiry-copy{position:static}
${N} .dz-float{position:relative;left:auto;margin:-40px 0 0 16px;max-width:none}
${N} .dz-cards .dz-glass:nth-child(2){margin-top:0}
${N} .dz-gallery[data-count="2"],${N} .dz-gallery[data-count="3"]{grid-template-columns:minmax(0,1fr)}
${N} .dz-gallery[data-count="2"] .dz-shot:nth-child(2){margin-top:0}
${N} .dz-mosaic-stack{grid-template-rows:none}
}
@media (max-width:560px){${N} .dz-services{--dz-cols:1}${N} .dz-form{grid-template-columns:minmax(0,1fr)}${N} .dz-dots{display:none}}
@media (prefers-reduced-motion:reduce){${N} .dz-project,${N} .dz-project img,${N} .dz-btn,${N} .dz-service{transition:none}}
`
