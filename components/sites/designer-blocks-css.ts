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
${N} .dz-eyebrow[data-rule]::before{content:"";flex:none;width:36px;height:1px;background:currentColor}
${N} [data-tone="deep"] .dz-eyebrow,${N} [data-tone="photo"] .dz-eyebrow,${N} .dz-hero .dz-eyebrow{color:var(--dz-sand)}
${N} .dz-eyebrow--center{justify-content:center}
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

/* Buttons: charcoal fill, outline, light-on-dark, underline link. Jost caps. */
${N} .dz-btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:48px;padding:0 26px;${LABEL};font-size:var(--dz-size-label);letter-spacing:var(--dz-tracking-button);text-decoration:none;border-radius:var(--dz-r-1);border:1px solid transparent;transition:background var(--dz-dur-base) ${EASE},color var(--dz-dur-base) ${EASE},border-color var(--dz-dur-base) ${EASE},transform var(--dz-dur-base) ${EASE}}
${N} .dz-btn[data-size="lg"]{min-height:56px;padding:0 32px}
${N} .dz-btn-primary{background:var(--dz-charcoal);color:var(--dz-plaster);border-color:var(--dz-charcoal);box-shadow:var(--dz-shadow-btn)}
${N} .dz-btn-primary:hover{background:var(--dz-ink);color:var(--dz-plaster);transform:translateY(-1px)}
${N} .dz-btn-outline{background:transparent;color:var(--dz-charcoal);border-color:var(--dz-charcoal)}
${N} .dz-btn-outline:hover{background:var(--dz-charcoal);color:var(--dz-plaster)}
${N} .dz-btn-inverse{background:var(--dz-plaster);color:var(--dz-charcoal);border-color:var(--dz-plaster)}
${N} .dz-btn-inverse:hover{background:var(--dz-sand);border-color:var(--dz-sand);color:var(--dz-charcoal)}
${N} .dz-btn-light{background:transparent;color:var(--dz-plaster);border-color:var(--dz-on-dark-muted)}
${N} .dz-btn-light:hover{background:var(--dz-plaster);color:var(--dz-charcoal)}
${N} .dz-btn-link{min-height:0;padding:0;background:none;color:var(--dz-terracotta);text-decoration:underline;text-underline-offset:.35em;text-decoration-thickness:1px}
${N} .dz-btn-link:hover{color:var(--dz-terracotta-deep)}
${N} .dz-btn .dz-arrow{transition:transform var(--dz-dur-base) ${EASE}}
${N} .dz-btn:hover .dz-arrow{transform:translateX(4px)}

/* The hero: full-bleed photo, left-weighted scrim, centred copy, frosted strip on the bottom edge. */
${N} .dz-hero{position:relative;isolation:isolate;overflow:hidden;display:flex;flex-direction:column;justify-content:center;min-height:min(100vh,56rem);background:var(--dz-ink);color:var(--dz-plaster)}
${N} .dz-hero--short{min-height:min(72vh,40rem)}
${N} .dz-hero-photo{position:absolute;inset:0;z-index:-3;width:100%;height:100%;object-fit:cover;transform:scale(1.04)}
${N} .dz-hero::before{content:"";position:absolute;inset:0;z-index:-2;background:var(--dz-scrim-hero)}
${N} .dz-hero::after{content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;opacity:.06;background-image:var(--dz-grain-light)}
${N} .dz-hero-copy{padding-top:calc(var(--dz-header-h) + 42px);padding-bottom:calc(var(--dz-section-y) + 40px)}
${N} .dz-hero-copy .dz-eyebrow{margin-bottom:28px}
${N} .dz-display{margin:0;max-width:54rem;font-family:var(--dz-display);font-weight:400;font-size:var(--dz-size-hero);line-height:1;letter-spacing:-.02em;text-wrap:balance}
${N} .dz-hero .dz-lead{margin-top:30px;max-width:32rem;color:var(--dz-on-dark-muted)}
${N} .dz-hero .dz-actions{margin-top:40px}
${N} .dz-strip{position:absolute;left:0;right:0;bottom:0;border-top:1px solid var(--dz-rule-dark);background:var(--dz-glass-dark);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px)}
${N} .dz-strip-grid{display:grid;grid-template-columns:repeat(var(--dz-strip-cols,3),minmax(0,1fr))}
${N} .dz-strip-item{display:flex;align-items:center;gap:16px;min-width:0;padding:20px 24px;color:inherit;text-decoration:none;border-left:1px solid var(--dz-rule-dark)}
${N} .dz-strip-item:first-child{padding-left:0;border-left:0}
${N} .dz-strip-thumb{flex:none;width:52px;height:52px;border-radius:var(--dz-r-pill);overflow:hidden;box-shadow:0 0 0 1px var(--dz-on-dark-muted)}
${N} .dz-strip-thumb img{width:100%;height:100%;object-fit:cover}
${N} .dz-strip-text{display:flex;flex-direction:column;gap:8px;min-width:0}
${N} .dz-strip-label{${LABEL};font-size:11px;letter-spacing:.18em;color:var(--dz-sand)}
${N} .dz-strip-value{font-family:var(--dz-display);font-size:20px;line-height:1.2}
@media (max-width:900px){${N} .dz-strip{display:none}${N} .dz-hero-copy{padding-bottom:var(--dz-section-y)}}

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
${N} .dz-project{position:relative;display:block;min-height:18rem;overflow:hidden;border-radius:var(--dz-r-3);box-shadow:var(--dz-shadow-photo);color:var(--dz-plaster);text-decoration:none;background:var(--dz-ink);transition:transform var(--dz-dur-slow) ${EASE},box-shadow var(--dz-dur-slow) ${EASE}}
${N} .dz-project[data-size="lg"]{aspect-ratio:6 / 5}
${N} .dz-project:hover{transform:translateY(-4px);box-shadow:var(--dz-shadow-3);color:var(--dz-plaster)}
${N} .dz-project img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:transform 1.2s ${EASE}}
${N} .dz-project:hover img{transform:scale(1.04)}
${N} .dz-project::after{content:"";position:absolute;inset:0;background:var(--dz-scrim-card)}
${N} .dz-project-body{position:absolute;left:0;right:0;bottom:0;z-index:1;display:block;padding:clamp(20px,2.4vw,32px)}
${N} .dz-project-title{display:block;font-family:var(--dz-display);font-size:clamp(24px,2.4vw,32px);line-height:1.1}
${N} .dz-project-meta{display:block;margin-bottom:8px;${LABEL};font-size:11px;letter-spacing:.16em;color:var(--dz-sand)}
${N} .dz-project-go{display:inline-flex;align-items:center;margin-top:14px;padding:8px 14px;border-radius:var(--dz-r-pill);background:var(--dz-glass-warm);color:var(--dz-charcoal);${LABEL};font-size:10px;letter-spacing:.14em;transition:background var(--dz-dur-base) ${EASE},color var(--dz-dur-base) ${EASE}}
${N} .dz-project:hover .dz-project-go{background:var(--dz-charcoal);color:var(--dz-plaster)}

/* The arch and its steps. */
${N} .dz-split{display:grid;gap:clamp(48px,8vw,128px);align-items:center}
${N} .dz-split--5-6{grid-template-columns:minmax(0,5fr) minmax(0,6fr)}
${N} .dz-split--6-5{grid-template-columns:minmax(0,6fr) minmax(0,5fr)}
${N} .dz-split--1-1{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
${N} .dz-arch{position:relative;margin:0}
${N} .dz-arch-frame{position:relative;overflow:hidden;border-radius:var(--dz-r-arch);aspect-ratio:4 / 5;box-shadow:var(--dz-shadow-photo);background:var(--dz-linen)}
${N} .dz-arch[data-ratio="portrait"] .dz-arch-frame{aspect-ratio:3 / 4}
${N} .dz-arch[data-frame]::before{content:"";position:absolute;inset:0;transform:translate(14px,14px);border-radius:var(--dz-r-arch);border:1px solid var(--dz-ochre);pointer-events:none}
${N} .dz-arch img{display:block;width:100%;height:100%;object-fit:cover}
${N} .dz-panel{padding:4px clamp(24px,3vw,40px);background:var(--dz-sheen),var(--dz-glass-warm);border-radius:var(--dz-r-3);box-shadow:var(--dz-shadow-2)}
${N} .dz-step{display:grid;grid-template-columns:48px minmax(0,1fr);gap:20px;padding:28px 0;border-top:${HAIR}}
${N} .dz-step:first-child{border-top:0}
${N} .dz-disc{display:grid;place-items:center;width:48px;height:48px;border-radius:var(--dz-r-pill);border:1px solid var(--dz-ochre);background:var(--dz-paper);font-family:var(--dz-display);font-style:italic;font-size:22px;line-height:1;color:var(--dz-ochre-deep)}
${N} .dz-step-title{margin:0;font-family:var(--dz-display);font-weight:400;font-size:28px;line-height:1.15}
${N} .dz-step-lead{margin:6px 0 10px;font-family:var(--dz-display);font-style:italic;font-size:21px;line-height:1.4;color:var(--dz-walnut)}
${N} .dz-step .dz-body{font-size:var(--dz-size-small)}

/* Service tiles on the dark slab. */
${N} .dz-bar{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:40px;margin-bottom:var(--dz-section-head)}
${N} .dz-bar-copy{display:flex;flex-direction:column;gap:24px;max-width:42rem}
${N} .dz-services{display:grid;grid-template-columns:repeat(var(--dz-cols,4),minmax(0,1fr));gap:clamp(12px,1.4vw,20px);margin:0;padding:0;list-style:none}
${N} .dz-service{display:flex;flex-direction:column;gap:18px;min-height:10rem;padding:clamp(20px,2vw,28px);border:1px solid var(--dz-rule-dark);border-radius:var(--dz-r-2);background:var(--dz-glass-dark);font-family:var(--dz-display);font-size:24px;line-height:1.2;transition:border-color var(--dz-dur-base) ${EASE},transform var(--dz-dur-base) ${EASE}}
${N} .dz-service:hover{border-color:var(--dz-ochre);transform:translateY(-2px)}
${N} .dz-service b{display:grid;place-items:center;width:36px;height:36px;border-radius:var(--dz-r-pill);border:1px solid var(--dz-ochre);font-family:var(--dz-display);font-style:italic;font-weight:400;font-size:17px;color:var(--dz-sand)}
${N} .dz-closing{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:32px;margin-top:var(--dz-section-head)}
${N} .dz-closing p{margin:0;max-width:40rem;font-family:var(--dz-display);font-style:italic;font-size:28px;line-height:1.35;color:var(--dz-sand)}
${N} .dz-services--light .dz-service{border-color:var(--dz-line);background:var(--dz-paper);font-size:20px;min-height:0}

/* Testimonials. */
${N} .dz-tbar{display:flex;align-items:center;justify-content:space-between;gap:24px;margin-bottom:var(--dz-section-head)}
${N} .dz-tctl{display:flex;align-items:center;gap:12px}
${N} .dz-dots{display:flex;gap:8px;margin-right:16px}
${N} .dz-dot{width:8px;height:8px;padding:0;border:0;border-radius:var(--dz-r-pill);background:var(--dz-line);cursor:pointer;transition:width var(--dz-dur-base) ${EASE},background var(--dz-dur-base) ${EASE}}
${N} .dz-dot[aria-current="true"]{width:28px;background:var(--dz-charcoal)}
${N} .dz-round{display:grid;place-items:center;width:52px;height:52px;padding:0;border:${HAIR};border-radius:var(--dz-r-pill);background:var(--dz-paper);box-shadow:var(--dz-shadow-1);cursor:pointer;font-size:18px;color:var(--dz-charcoal);transition:background var(--dz-dur-base) ${EASE},color var(--dz-dur-base) ${EASE}}
${N} .dz-round:hover{background:var(--dz-charcoal);color:var(--dz-plaster)}
${N} .dz-quote-card{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,6fr);align-items:stretch;overflow:hidden;border-radius:var(--dz-r-3);background:var(--dz-sheen),var(--dz-parchment);box-shadow:var(--dz-shadow-3)}
${N} .dz-quote-card[data-solo]{grid-template-columns:minmax(0,1fr)}
${N} .dz-quote-photo{min-height:22rem}
${N} .dz-quote-photo img{width:100%;height:100%;object-fit:cover}
${N} .dz-quote-text{display:flex;flex-direction:column;justify-content:center;gap:24px;padding:clamp(32px,5vw,72px)}
${N} .dz-quote-mark{height:44px;font-family:var(--dz-display);font-size:120px;line-height:.5;color:var(--dz-ochre)}
${N} .dz-quote{margin:0;font-family:var(--dz-display);font-style:italic;font-size:clamp(28px,3vw,42px);line-height:1.25;text-wrap:balance}
${N} .dz-quote-by{${LABEL};font-size:var(--dz-size-label);letter-spacing:.18em;color:var(--dz-stone)}
${N} .dz-slide[hidden]{display:none}

/* Founder split. */
${N} .dz-founder-copy{display:flex;flex-direction:column;gap:22px}
${N} .dz-founder-lead{margin:8px 0;font-family:var(--dz-display);font-size:26px;line-height:1.4;color:var(--dz-walnut)}
${N} .dz-founder-photo{position:relative;padding-bottom:56px}
${N} .dz-float{position:absolute;left:-14%;bottom:0;max-width:20rem;display:flex;flex-direction:column;gap:12px;padding:24px 28px;border-radius:var(--dz-r-2);background:var(--dz-sheen),var(--dz-parchment);box-shadow:var(--dz-shadow-3)}
${N} .dz-float p{margin:0;font-family:var(--dz-display);font-style:italic;font-size:22px;line-height:1.3}

/* Photo band with three frosted cards. */
${N} .dz-band{margin:var(--dz-slab-gap);border-radius:var(--dz-r-section);box-shadow:var(--dz-shadow-slab)}
${N} .dz-band-photo{position:absolute;inset:0;z-index:-3;width:100%;height:100%;object-fit:cover}
${N} .dz-sec[data-tone="photo"]{background:var(--dz-ink)}
${N} .dz-sec[data-tone="photo"]::before{z-index:-2;background:var(--dz-scrim-band)}
${N} .dz-sec[data-tone="photo"]::after{content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;opacity:.06;background-image:var(--dz-grain-light)}
${N} .dz-band-head{display:flex;flex-direction:column;align-items:center;gap:20px;margin-bottom:var(--dz-section-head);text-align:center}
${N} .dz-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:clamp(16px,2vw,28px)}
${N} .dz-glass{padding:clamp(28px,3vw,44px);color:var(--dz-charcoal);background:var(--dz-sheen),var(--dz-glass-warm);-webkit-backdrop-filter:blur(18px) saturate(1.1);backdrop-filter:blur(18px) saturate(1.1);border-radius:var(--dz-r-3);box-shadow:var(--dz-shadow-3)}
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
${N} .dz-faq{padding:12px;border-radius:var(--dz-r-3);background:var(--dz-glass-warm);box-shadow:var(--dz-shadow-1)}
${N} .dz-faq details{border-top:${HAIR};border-radius:var(--dz-r-2);transition:background var(--dz-dur-base) ${EASE},box-shadow var(--dz-dur-base) ${EASE}}
${N} .dz-faq details:first-child{border-top:0}
${N} .dz-faq details[open]{background:var(--dz-paper);box-shadow:var(--dz-shadow-2)}
${N} .dz-faq summary{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:22px 24px;cursor:pointer;list-style:none;font-family:var(--dz-display);font-size:24px;line-height:1.25}
${N} .dz-faq summary::-webkit-details-marker{display:none}
${N} .dz-faq summary::after{content:"+";flex:none;font-family:var(--dz-sans);font-weight:300;font-size:28px;line-height:1;color:var(--dz-ochre-deep);transition:transform var(--dz-dur-base) ${EASE}}
${N} .dz-faq details[open] summary::after{transform:rotate(45deg)}
${N} .dz-faq-answer{padding:0 24px 24px}

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
${N} .dz-next-copy{display:flex;flex-direction:column;align-items:flex-start;gap:28px}

/* Inquiry form. */
${N} .dz-inquiry{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,7fr);gap:clamp(40px,6vw,96px);align-items:start}
${N} .dz-inquiry-copy{position:sticky;top:150px;display:flex;flex-direction:column;gap:20px}
${N} .dz-inquiry-copy .dz-title{margin:4px 0 8px}
${N} .dz-inquiry-photo{margin-top:12px;overflow:hidden;border-radius:var(--dz-r-3);aspect-ratio:16 / 11}
${N} .dz-inquiry-photo img{width:100%;height:100%;object-fit:cover}
${N} .dz-form{position:relative;display:grid;grid-template-columns:1fr 1fr;gap:28px 24px;padding:clamp(32px,4vw,56px);border-radius:var(--dz-r-3);background:var(--dz-sheen),var(--dz-parchment);box-shadow:var(--dz-shadow-3)}
${N} .dz-form-wide{grid-column:1 / -1}
${N} .dz-form-foot{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:20px}
${N} .dz-form-note{font-size:14px;line-height:1.4;color:var(--dz-stone)}
${N} .dz-form .input,${N} .dz-form select,${N} .dz-form textarea{background:var(--dz-paper);border:${HAIR};border-radius:var(--dz-r-1);box-shadow:var(--dz-shadow-inset)}
${N} .dz-form .input:focus-visible,${N} .dz-form select:focus-visible,${N} .dz-form textarea:focus-visible{outline:2px solid var(--dz-ochre);box-shadow:var(--dz-ring)}
${N} .dz-chips{display:flex;flex-wrap:wrap;gap:10px;margin:0;padding:0;border:0}
${N} .dz-chip{display:inline-flex;align-items:center;min-height:44px;padding:0 18px;border:${HAIR};border-radius:var(--dz-r-pill);background:var(--dz-paper);cursor:pointer;font-size:var(--dz-size-small);color:var(--dz-charcoal);transition:background var(--dz-dur-fast) ${EASE},color var(--dz-dur-fast) ${EASE},border-color var(--dz-dur-fast) ${EASE}}
${N} .dz-chip[aria-pressed="true"]{background:var(--dz-charcoal);border-color:var(--dz-charcoal);color:var(--dz-plaster)}
${N} .dz-legend{margin-bottom:12px;${LABEL};font-size:var(--dz-size-label);color:var(--dz-stone)}
${N} .dz-done{display:flex;flex-direction:column;justify-content:center;gap:16px;min-height:22rem;padding:clamp(32px,4vw,56px);border-radius:var(--dz-r-3);background:var(--dz-sheen),var(--dz-parchment);box-shadow:var(--dz-shadow-3)}
${N} .dz-done h3{margin:0;font-family:var(--dz-display);font-style:italic;font-weight:400;font-size:44px;line-height:1.1}
${N} .dz-hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}

/* Newsletter (footer / letter band). */
${N} .dz-news{display:flex;flex-direction:column;gap:14px}
${N} .dz-news-row{display:flex;gap:10px;flex-wrap:wrap}

@media (max-width:900px){
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
