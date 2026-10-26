// THE MIDNIGHT BLOCK SHEET (Midnight design system, "Web Theme"). The look of the Midnight block family
// (components/page-editor/blocks/midnight.tsx): the hero with the arch, the liveness strip, the numbered section
// heads, doors, rows, cards, tiers, the quote band, the letter, the questions and the closing call. Every rule is
// scoped under the Midnight root and reads the --mn-* tokens (lib/theme/midnight.ts) only: no raw colour, no raw
// motion, no raw radius, so a token round is a values-only change. Reduced motion is honoured in the token block.

const N = '[data-house-theme="midnight"]'
const EASE = 'var(--mn-ease)'
const LABEL = 'font-family:var(--mn-label);text-transform:uppercase;letter-spacing:var(--mn-tracking-eyebrow);font-weight:400'
const HAIR = '1px solid var(--mn-night-300)'

export const MIDNIGHT_BLOCKS_CSS = `
${N} .mn-section{position:relative;isolation:isolate;overflow:clip;padding:var(--mn-section-y) max(var(--mn-gutter),calc((100% - var(--mn-max)) / 2))}
${N} .mn-grain::after{content:"";position:absolute;inset:0;z-index:1;pointer-events:none;opacity:.09;mix-blend-mode:screen;background-image:var(--mn-grain)}
${N} .mn-mist,${N} .mn-smoke,${N} .mn-roots,${N} .mn-stardust,${N} .mn-vignette,${N} .mn-moonglow,${N} .mn-candle{position:absolute;inset:0;z-index:0;pointer-events:none}
${N} .mn-mist{inset:-8%;background-image:var(--mn-tex-cloud);background-size:cover;background-repeat:no-repeat;background-position:center;opacity:var(--mn-mist-opacity);mix-blend-mode:screen;-webkit-mask-image:radial-gradient(ellipse 55% 48% at var(--mist-x,72%) var(--mist-y,38%),var(--mn-night-0) 0%,color-mix(in srgb,var(--mn-night-0) 55%,transparent) 45%,transparent 72%);mask-image:radial-gradient(ellipse 55% 48% at var(--mist-x,72%) var(--mist-y,38%),var(--mn-night-0) 0%,color-mix(in srgb,var(--mn-night-0) 55%,transparent) 45%,transparent 72%);animation:mn-drift 48s var(--mn-ease-in-out) infinite alternate}
${N} .mn-mist--low{-webkit-mask-image:radial-gradient(ellipse 90% 45% at 50% 105%,var(--mn-night-0),transparent 75%);mask-image:radial-gradient(ellipse 90% 45% at 50% 105%,var(--mn-night-0),transparent 75%)}
${N} .mn-hero>.mn-mist,${N} .mn-hero .mn-mist:not(.mn-mist--low){--mist-x:20%;--mist-y:40%}
${N} .mn-mist--right{--mist-x:75%;--mist-y:45%}
${N} .mn-mist--left{--mist-x:8%;--mist-y:60%}
${N} .mn-mist--corner{--mist-x:92%;--mist-y:6%}
${N} .mn-mist--veil{-webkit-mask-image:none;mask-image:none;opacity:.14}
${N} .mn-mist--dense{opacity:.5}
${N} .mn-smoke{inset:-6%;background-image:var(--mn-tex-smoke);background-size:cover;background-repeat:no-repeat;opacity:.22;mix-blend-mode:screen;-webkit-mask-image:linear-gradient(180deg,transparent,var(--mn-night-0) 25%,var(--mn-night-0) 75%,transparent);mask-image:linear-gradient(180deg,transparent,var(--mn-night-0) 25%,var(--mn-night-0) 75%,transparent);animation:mn-drift 64s var(--mn-ease-in-out) infinite alternate-reverse}
${N} .mn-roots{background-image:var(--mn-tex-roots);background-size:700px 700px;opacity:.12;mix-blend-mode:screen}
${N} .mn-stardust{background-image:var(--mn-tex-stardust);background-size:420px 420px;opacity:.9}
${N} .mn-moonglow{background:radial-gradient(ellipse 45% 55% at var(--glow-x,78%) var(--glow-y,0%),color-mix(in srgb,var(--mn-bone-50) 16%,transparent),transparent 70%)}
${N} .mn-candle{background:radial-gradient(ellipse 40% 35% at var(--glow-x,20%) var(--glow-y,100%),color-mix(in srgb,var(--mn-violet-400) 16%,transparent),transparent 70%)}
${N} .mn-vignette{background:radial-gradient(ellipse 75% 70% at 50% 45%,transparent 40%,color-mix(in srgb,var(--mn-night-0) 85%,transparent) 100%)}
@keyframes mn-drift{from{transform:translate3d(-2.5%,0,0)}to{transform:translate3d(2.5%,-1%,0)}}
@media (prefers-reduced-motion:reduce){${N} .mn-mist,${N} .mn-smoke{animation:none}}
${N} .mn-eyebrow{display:flex;align-items:center;gap:14px;${LABEL};font-size:var(--mn-size-eyebrow);color:var(--mn-ash-200)}
${N} .mn-eyebrow--block{display:block;color:var(--mn-ash-300)}
${N} .mn-eyebrow--icon{gap:8px;font-size:var(--mn-size-eyebrow)}
${N} .mn-eyebrow--icon .mn-sigil{color:var(--color-accent)}
${N} .mn-index{display:inline-block;font-family:var(--mn-display);font-style:italic;font-size:15px;letter-spacing:.04em;text-transform:none;line-height:1;color:var(--color-accent);counter-increment:mn-index}
${N} .mn-index::before{content:counter(mn-index,upper-roman)}
${N} .mn-star{font-size:8px;opacity:.7}
${N} .mn-display{margin:0;font-family:var(--mn-display);font-weight:400;font-size:var(--mn-size-hero);line-height:var(--mn-leading-display);letter-spacing:var(--mn-tracking-display);color:var(--color-text);text-wrap:balance}
${N} .mn-display em,${N} .mn-title em{font-style:italic}
${N} .mn-display--h2{font-size:var(--mn-size-h2);line-height:1.05}
${N} .mn-display--h3{font-size:var(--mn-size-h3);line-height:1.1}
${N} .mn-lead{margin:0;max-width:35rem;font-size:var(--mn-size-lead);line-height:var(--mn-leading-body);color:var(--mn-ash-200)}
${N} .mn-muted{color:var(--mn-ash-200)}
${N} .mn-subtle{color:var(--mn-ash-300)}
${N} .mn-small{font-size:var(--mn-size-meta)}
${N} .mn-body-sm{margin:0;font-size:var(--mn-size-body-sm);line-height:1.6}
${N} .mn-mono{font-family:var(--mn-sans);font-size:var(--mn-size-body-sm);font-variant-numeric:tabular-nums lining-nums;color:var(--color-text)}
${N} .mn-accent-ink{display:flex;color:var(--color-accent)}
${N} .mn-sigil{flex:none;overflow:visible}
${N} .mn-actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:40px}
${N} .mn-actions--center{justify-content:center}

/* Buttons: bone fill, hairline outline, underline ghost. Marcellus caps. */
${N} .hs-btn{${LABEL};font-size:12px;letter-spacing:.14em;font-weight:400;min-height:44px;padding:0 22px;border-radius:var(--mn-r-control);white-space:nowrap;transition:background var(--mn-dur-fast) ${EASE},color var(--mn-dur-fast) ${EASE},border-color var(--mn-dur-fast) ${EASE}}
${N} .hs-btn-primary{background:var(--mn-solid);color:var(--mn-on-solid);border:1px solid var(--mn-solid);box-shadow:none}
${N} .hs-btn-primary:hover{background:var(--mn-solid-hover);color:var(--mn-on-solid)}
${N} .hs-btn-soft{background:transparent;color:var(--color-text);border:1px solid var(--mn-night-500)}
${N} .hs-btn-soft:hover{background:var(--mn-solid);color:var(--mn-on-solid);border-color:var(--mn-solid)}
${N} .hs-btn-ghost{min-height:0;padding:0 2px;background:transparent;color:var(--color-text);border:1px solid transparent;text-decoration:underline;text-underline-offset:.35em;text-decoration-color:var(--mn-rule)}
${N} .hs-btn-ghost:hover{color:var(--color-accent);text-decoration-color:currentColor}

/* The hero. */
${N} .mn-hero{overflow:hidden}
${N} .mn-hero.mn-section{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,20rem),1fr));gap:64px;align-items:center;min-height:min(78vh,45rem)}
${N} .mn-hero-copy{position:relative;z-index:2}
${N} .mn-hero-copy .mn-eyebrow{margin-bottom:24px}
${N} .mn-hero .mn-display{font-size:clamp(3rem,6.4vw,6.75rem);max-width:12em}
${N} .mn-hero .mn-lead{margin-top:28px}
${N} .mn-hero--photo{position:relative;display:flex;align-items:flex-end;min-height:min(84vh,47.5rem);padding:var(--mn-section-y) var(--mn-gutter) var(--mn-section-tight)}
${N} .mn-hero--photo .mn-hero-copy{width:100%;max-width:var(--mn-max);margin:0 auto}
${N} .mn-hero--photo .mn-eyebrow,${N} .mn-hero--photo .mn-display{color:var(--color-on-media)}
${N} .mn-hero--photo .mn-lead{color:var(--mn-bone-100)}
${N} .mn-hero--center{align-items:center;text-align:center}
${N} .mn-hero--center .mn-eyebrow,${N} .mn-hero--center .mn-actions{justify-content:center}
${N} .mn-hero--center .mn-display,${N} .mn-hero--center .mn-lead{margin-inline:auto}
${N} .mn-hero--banner{min-height:min(56vh,30rem)}
${N} .mn-hero--banner .mn-display{font-size:var(--mn-size-h1)}
${N} .mn-hero-photo{position:absolute;inset:0;z-index:0;width:100%;height:100%;object-fit:cover;filter:grayscale(1) contrast(1.08) brightness(.9)}
${N} .mn-protect{position:absolute;inset:0;z-index:0;background:var(--mn-media-protect)}

/* The arch: one rounded shape, with an offset hairline. */
${N} .mn-arch{position:relative;z-index:2;margin:0;width:100%;max-width:28.75rem;justify-self:end}
${N} .mn-arch--tall{max-width:21.25rem;justify-self:start;margin-top:48px}
${N} .mn-arch-frame{position:relative;aspect-ratio:4 / 5;overflow:hidden;border-radius:var(--mn-r-arch);outline:1px solid var(--mn-night-500);outline-offset:8px;background:var(--color-surface)}
${N} .mn-arch-frame img{display:block;width:100%;height:100%;object-fit:cover;filter:grayscale(1) contrast(1.08) brightness(.9)}

/* The liveness strip. */
${N} .mn-live{display:grid;grid-template-columns:repeat(auto-fit,minmax(13.75rem,1fr));border-bottom:${HAIR};border-top:${HAIR}}
${N} .mn-live-item{display:flex;align-items:center;gap:14px;padding:22px var(--mn-gutter);color:inherit;border-left:${HAIR}}
${N} .mn-live-item:first-child{border-left:0}
${N} .mn-live-item:is(a):hover{background:var(--color-surface-hover)}
${N} .mn-live-icon{display:flex;flex:none;color:var(--color-accent)}
${N} .mn-live-value{display:block;font-size:15px;color:var(--color-text)}

/* The section head. */
${N} .mn-head{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:24px;margin-bottom:56px}
${N} .mn-head-copy{max-width:46rem}
${N} .mn-head .mn-eyebrow{margin-bottom:20px}
${N} .mn-title{margin:0;font-family:var(--mn-display);font-weight:400;font-size:var(--mn-size-h2);line-height:1.02;letter-spacing:var(--mn-tracking-display);color:var(--color-text);text-wrap:balance}
${N} .mn-kicker{margin:18px 0 0;font-family:var(--mn-display);font-style:italic;font-size:var(--mn-size-lead);color:var(--mn-ash-200);text-wrap:pretty}
${N} .mn-card-title{display:block;font-family:var(--mn-display);font-weight:400;font-size:30px;line-height:1.1;letter-spacing:var(--mn-tracking-display);color:var(--color-text)}
${N} .mn-card-title--sm{font-size:24px;line-height:1.15}

/* Seals: a sigil held in a hairline ring. */
${N} .mn-bar{display:flex;align-items:center;justify-content:space-between;gap:var(--mn-gutter);min-height:36px;padding:0 var(--mn-gutter);background:var(--color-canvas);border-bottom:1px solid var(--mn-night-300);font-family:var(--mn-label);font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:var(--color-text-subtle)}
${N} .mn-bar-now{display:flex;align-items:center;gap:10px;margin:0;min-width:0}
${N} .mn-bar-now .mn-sigil{color:var(--color-accent)}
${N} .mn-bar-moon{color:var(--color-text)}
${N} .mn-bar-next{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
${N} .mn-bar-next::before{content:"\\00B7";margin-right:10px}
${N} .mn-bar-links{display:flex;gap:24px}
${N} .mn-bar-links a{color:var(--color-text-subtle)}
${N} .mn-bar-links a:hover{color:var(--color-text)}
@media (max-width:760px){${N} .mn-bar-links{display:none}${N} .mn-bar-next{display:none}}
${N} .hs-brand{overflow:visible}
${N} .mn-logo{display:inline-flex;align-items:center;gap:14px;text-align:left}
${N} .mn-logo-ring{display:inline-flex;border-radius:50%;box-shadow:var(--mn-glow)}
${N} .mn-logo-text{display:flex;flex-direction:column;gap:4px;min-width:0}
${N} .mn-logo-name{font-family:var(--mn-display);font-size:28px;line-height:1;letter-spacing:var(--mn-tracking-display);color:var(--color-text)}
${N} .mn-logo-tag{font-family:var(--mn-label);font-size:9px;line-height:1;text-transform:uppercase;letter-spacing:.28em;color:var(--color-text-subtle);max-width:22ch;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
${N} .mn-seal{position:relative;display:inline-flex;flex:none;align-items:center;justify-content:center;color:var(--color-text)}
${N} .mn-seal::before,${N} .mn-seal::after{content:"";position:absolute;border-radius:50%;border:1px solid var(--mn-night-500)}
${N} .mn-seal::before{inset:0;opacity:.35}
${N} .mn-seal::after{inset:10%}
${N} .mn-seal[data-tone="accent"]{color:var(--color-accent)}
${N} .mn-seal[data-tone="accent"]::before,${N} .mn-seal[data-tone="accent"]::after{border-color:var(--color-accent)}
${N} .mn-seal[data-tone="accent"]::after{box-shadow:0 0 22px -8px var(--color-accent)}
${N} .mn-seal .mn-sigil{position:relative}

/* Cells: a ruled grid of doors, tiers and resources. */
${N} .mn-cells{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,15rem),1fr));gap:1px;background:var(--mn-night-300);border:${HAIR}}
${N} .mn-cells--wide{grid-template-columns:repeat(auto-fit,minmax(min(100%,16.25rem),1fr))}
${N} .mn-cell{display:flex;flex-direction:column;gap:18px;padding:32px;background:var(--color-canvas);color:inherit}
${N} .mn-door{min-height:17.5rem}
${N} .mn-door .mn-muted{font-size:15px}
${N} .mn-open{margin-top:auto;color:var(--color-text)}
${N} a.mn-cell:hover{background:var(--color-surface-hover)}
${N} .mn-tier--lead{background:var(--color-surface)}
${N} .mn-tier-top{display:flex;align-items:center;justify-content:space-between}
${N} .mn-tier-price{margin-top:auto;font-size:15px}
${N} .mn-resource{min-height:12.5rem;padding:28px;gap:14px}
${N} .mn-cell-top{display:flex;justify-content:space-between}
${N} .mn-push{margin-top:auto}

/* Badges: a small caps pill. */
${N} .mn-badge{display:inline-flex;align-items:center;height:22px;padding:0 9px;${LABEL};font-size:10px;letter-spacing:.16em;white-space:nowrap;border-radius:var(--mn-r-pill);border:1px solid currentColor;color:var(--mn-ash-200)}
${N} .mn-badge--accent{color:var(--color-accent)}

/* Rows: offerings and events, ruled. */
${N} .mn-rows{border-top:${HAIR}}
${N} .mn-row{display:grid;grid-template-columns:3.5rem minmax(0,1fr) auto;gap:24px;align-items:center;padding:24px 0;border-bottom:${HAIR};color:inherit}
${N} a.mn-row:hover{background:var(--color-surface-hover)}
${N} .mn-row-title{display:block;font-family:var(--mn-display);font-size:28px;line-height:1.1;color:var(--color-text)}
${N} .mn-row-meta{display:block;margin-top:4px;font-size:14px}
${N} .mn-row-end{display:flex;align-items:center;gap:16px;color:var(--color-text)}
${N} .mn-rows--tight .mn-row{grid-template-columns:3rem minmax(0,1fr) auto;gap:16px;padding:14px 4px}
${N} .mn-row-main{display:flex;flex-direction:column;min-width:0;gap:2px}
${N} .mn-row-line{font-size:15px;color:var(--color-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
${N} .mn-stamp{display:flex;flex-direction:column;align-items:center;width:3rem;padding:6px 0 5px;text-align:center;border:${HAIR}}
${N} .mn-stamp b{${LABEL};font-size:9px;letter-spacing:.2em;color:var(--color-accent)}
${N} .mn-stamp span{font-family:var(--mn-display);font-size:22px;line-height:1.05;color:var(--color-text)}
${N} .mn-after{margin-top:24px}

/* Cards and tiles. */
${N} .mn-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,15rem),1fr));gap:24px}
${N} .mn-grid--wide{grid-template-columns:repeat(auto-fit,minmax(min(100%,18.75rem),1fr))}
${N} .mn-card{display:flex;flex-direction:column;background:var(--color-surface);border:${HAIR};border-radius:var(--mn-r-card);color:inherit;transition:border-color var(--mn-dur-base) ${EASE}}
${N} .mn-card:hover{border-color:var(--mn-ash-300)}
${N} .mn-cover{position:relative;aspect-ratio:16 / 9;overflow:hidden;background:var(--color-surface-elevated)}
${N} .mn-cover img{display:block;width:100%;height:100%;object-fit:cover;filter:grayscale(1) contrast(1.05) brightness(.82);transition:transform var(--mn-dur-slow) ${EASE},filter var(--mn-dur-slow) ${EASE}}
${N} .mn-card:hover .mn-cover img,${N} .mn-tile:hover .mn-cover img{transform:scale(1.03);filter:grayscale(1) contrast(1.05) brightness(.95)}
${N} .mn-card-body{display:flex;flex:1;flex-direction:column;gap:8px;padding:20px}
${N} .mn-card-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:auto;padding-top:14px;border-top:${HAIR}}
${N} .mn-tile{display:flex;flex-direction:column;gap:14px;color:inherit}
${N} .mn-cover--tile{aspect-ratio:4 / 5;border-radius:var(--mn-r-card)}
${N} .mn-tile-body{display:flex;flex-direction:column;gap:6px}
${N} .mn-tile-title{font-family:var(--mn-display);font-size:22px;line-height:1.15;color:var(--color-text)}
${N} .mn-tile-foot{display:flex;align-items:center;justify-content:space-between;gap:10px}

/* Gatherings and questions: a head beside a list. */
${N} .mn-split{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,20rem),1fr));gap:64px;align-items:end}
${N} .mn-split>.mn-head,${N} .mn-split-main .mn-head{margin-bottom:0}
${N} .mn-split-main .mn-head{margin-bottom:0}
${N} .mn-split--solo{align-items:start}

/* The quote band. */
${N} .mn-proof{overflow:hidden;background:var(--mn-night-0)}
${N} .mn-proof-inner{position:relative;z-index:2;max-width:61.25rem;margin:0 auto;text-align:center}
${N} .mn-ornament{display:flex;align-items:center;gap:18px;max-width:16.25rem;margin:0 auto 40px;color:var(--mn-ash-300)}
${N} .mn-ornament span{flex:1;height:1px;background:linear-gradient(90deg,transparent,var(--mn-night-500))}
${N} .mn-ornament span:last-child{background:linear-gradient(270deg,transparent,var(--mn-night-500))}
${N} .mn-ornament i{font-style:normal;font-size:9px}
${N} .mn-quote{margin:0;font-family:var(--mn-display);font-size:var(--mn-size-h2);line-height:1.1;letter-spacing:var(--mn-tracking-display);color:var(--color-text);text-wrap:balance}
${N} .mn-proof-by{justify-content:center;gap:12px;margin-top:28px}
${N} .mn-proof-by b{font-weight:400;color:var(--color-text)}
${N} .mn-proof-rating{display:flex;align-items:center;justify-content:center;gap:14px;margin-top:48px}
${N} .mn-stars{font-size:14px;letter-spacing:.2em;color:var(--color-accent)}

/* The letter. */
${N} .mn-letter{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,20rem),1fr));gap:48px;align-items:center;border-top:${HAIR};border-bottom:${HAIR}}
${N} .mn-letter-copy{display:flex;align-items:flex-start;gap:28px}
${N} .mn-letter-lead{margin:14px 0 0;max-width:46ch}
${N} .mn-letter-form{display:flex;align-items:flex-end;gap:16px;max-width:30rem}
${N} .mn-letter-field{flex:1}
${N} .mn-letter-error{margin:0;font-size:var(--mn-size-meta);color:var(--color-danger)}
${N} .mn-letter-done{margin:0;color:var(--mn-ash-200)}
${N} .mn-hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}

/* Questions. */
${N} .mn-faq{border-top:${HAIR}}
${N} .mn-faq details{border-bottom:${HAIR}}
${N} .mn-faq summary{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:22px 0;font-size:17px;color:var(--color-text);cursor:pointer;list-style:none}
${N} .mn-faq summary::-webkit-details-marker{display:none}
${N} .mn-faq summary svg{flex:none;transition:transform var(--mn-dur-fast) ${EASE}}
${N} .mn-faq details[open] summary svg{transform:rotate(180deg)}
${N} .mn-faq p{margin:0 0 22px;max-width:62ch;font-size:15px;color:var(--mn-ash-200)}

/* The closing call. */
${N} .mn-cta{overflow:hidden;text-align:center;border-top:${HAIR}}
${N} .mn-cta-inner{position:relative;z-index:2}

@media (max-width:640px){${N} .mn-row{grid-template-columns:3rem minmax(0,1fr);gap:16px}${N} .mn-row-end{grid-column:2}${N} .mn-letter-form{flex-direction:column;align-items:stretch}${N} .mn-arch{justify-self:center}${N} .mn-live-item{border-left:0;border-top:${HAIR}}${N} .mn-live-item:first-child{border-top:0}}
`
