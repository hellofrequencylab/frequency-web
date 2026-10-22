// THE TEMPLE BLOCK FAMILY'S SKIN (components/page-editor/blocks/temple.tsx), from the Royal Temple design
// system's Home (design/The Temple.html, the tt-* rules). Scoped under [data-house-theme="temple"] and layered
// after the house skin (components/sites/temple-css.ts). Reads `--tp-*` tokens only: no hex, no rgba, no raw
// size or shadow, nothing a token already names.

const N = '[data-house-theme="temple"]'
const EYEBROW = 'font-family:var(--tp-sans);font-size:var(--tp-size-2xs);font-weight:var(--tp-weight-medium);letter-spacing:var(--tp-tracking-eyebrow);text-transform:uppercase;line-height:1.4'
const LABEL = 'font-family:var(--tp-sans);font-size:var(--tp-size-2xs);font-weight:var(--tp-weight-medium);letter-spacing:var(--tp-tracking-label);text-transform:uppercase'
const EASE = 'var(--tp-dur-base) var(--tp-ease)'

export const TEMPLE_BLOCKS_CSS = `
/* The Temple's sections are full-bleed bands: the house page's own padding, gaps and footer margin step aside. */
${N} .mw-page:has([data-tt]){padding-bottom:0}
${N} [data-mw-own]>div:has([data-tt]){padding-block:0}
${N} [data-mw-own]>div:has([data-tt])>*{margin-top:0}
${N} main:has([data-tt="follow"])+.tp-footer-ground{margin-top:0}

/* Shared: the page width, the section head, the arch figure, the eyebrow, the quiet line. */
${N} .tt-wrap{max-width:var(--tp-container);margin:0 auto;position:relative}
${N} .tt-inner{max-width:var(--tp-container);margin:0 auto;position:relative}
${N} .tt-eyebrow{${EYEBROW};color:var(--tp-clay-600)}
${N} .tt-eyebrow--small{font-size:var(--tp-size-2xs)}
${N} .tt-muted{font-size:var(--tp-size-sm);color:var(--tp-muted);letter-spacing:.02em}
${N} .tt-price{font-family:var(--tp-serif);color:var(--tp-umber-900)}
${N} .tt-badge{padding:5px 10px 4px;border-radius:var(--tp-r-pill);border:var(--tp-b-hair) solid var(--tp-line);color:var(--tp-umber-600);${LABEL}}
${N} .tt-section{position:relative;padding:var(--tp-section-y) var(--tp-gutter);overflow:hidden}
${N} .tt-section--sunk{background-color:var(--tp-plaster-100);box-shadow:var(--tp-sunk-edge)}
${N} .tt-section--terracotta{background-image:var(--tp-wash-terracotta)}
${N} .tt-section--dawn{background-image:var(--tp-wash-dawn)}
${N} .tt-section--night{background-image:var(--tp-wash-night);color:var(--tp-on-ink)}
${N} .tt-sechead{display:flex;justify-content:space-between;align-items:flex-end;gap:var(--tp-s8);flex-wrap:wrap;margin-bottom:var(--tp-s12)}
${N} .tt-title{font-family:var(--tp-display);font-weight:var(--tp-weight-regular);font-size:var(--tp-size-4xl);line-height:var(--tp-leading-tight);letter-spacing:var(--tp-tracking-display);color:var(--tp-umber-900);margin:var(--tp-s3) 0 0}
${N} .tt-title em{font-family:var(--tp-quote);font-style:italic;font-weight:var(--tp-weight-light);color:var(--tp-clay-600)}
${N} .tt-sechead-lead{margin:var(--tp-s4) 0 0;max-width:var(--tp-measure-narrow);font-size:var(--tp-size-md);font-weight:var(--tp-weight-light);color:var(--tp-umber-600)}
${N} .tt-section--night .tt-eyebrow{color:var(--tp-saffron-400)}
${N} .tt-section--night .tt-title{color:var(--tp-plaster-50)}
${N} .tt-section--night .tt-sechead-lead{color:var(--tp-plaster-200)}
${N} .tt-arch{position:relative;margin:0;overflow:hidden;box-shadow:var(--tp-d3);transition:transform ${EASE},box-shadow ${EASE}}
${N} .tt-arch::after{content:"";position:absolute;inset:var(--tp-s2);border:var(--tp-b-line) solid var(--tp-frame-on-photo);border-radius:inherit;pointer-events:none}
${N} .tt-arch img{display:block;width:100%;height:100%;object-fit:cover;transition:transform var(--tp-dur-slow) var(--tp-ease)}
${N} .tt-arch--hero{aspect-ratio:4 / 4.6;border-radius:var(--tp-r-arch)}
${N} .tt-arch--card{aspect-ratio:4 / 4.4;border-radius:var(--tp-r-arch)}
${N} .tt-arch--tall{aspect-ratio:4 / 5;border-radius:var(--tp-r-arch)}
${N} .tt-arch--keyhole{aspect-ratio:4 / 5;border-radius:var(--tp-r-keyhole)}
${N} a:hover .tt-arch img,${N} .tt-arch:hover img{transform:scale(1.03)}

/* The date stamp (design .tt-stamp): the clay arch with the day in Branch. */
${N} .tt-stamp{flex:none;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;width:62px;height:74px;padding-bottom:10px;box-sizing:border-box;border-radius:var(--tp-r-arch);background:var(--tp-wash-clay);box-shadow:var(--tp-d2);color:var(--tp-on-clay)}
${N} .tt-stamp b{font-family:var(--tp-display);font-weight:var(--tp-weight-regular);font-size:var(--tp-size-xl);line-height:1}
${N} .tt-stamp span{${LABEL};margin-top:3px;font-size:var(--tp-size-2xs)}

/* Hero: two columns, the arch photo on the right with the ticket across its foot. */
${N} .tt-hero{position:relative;padding:var(--tp-s12) var(--tp-gutter) var(--tp-s20);background-image:var(--tp-wash-sun),var(--tp-wash-dawn);overflow:hidden}
${N} .tt-hero-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:var(--tp-s16);align-items:center}
${N} .tt-display{font-family:var(--tp-display);font-weight:var(--tp-weight-regular);font-size:var(--tp-size-6xl);line-height:var(--tp-leading-tight);letter-spacing:var(--tp-tracking-display);color:var(--tp-umber-900);margin:var(--tp-s6) 0}
${N} .tt-display em{font-family:var(--tp-quote);font-style:italic;font-weight:var(--tp-weight-light);color:var(--tp-clay-600)}
${N} .tt-lede{max-width:32ch;margin:0;font-size:var(--tp-size-md);font-weight:var(--tp-weight-light);color:var(--tp-umber-600)}
${N} .tt-actions{display:flex;gap:var(--tp-s4);margin-top:var(--tp-s8);flex-wrap:wrap}
${N} .tt-facts{display:flex;margin:var(--tp-s12) 0 0;padding:0;border-top:var(--tp-b-hair) solid var(--tp-rule);max-width:520px}
${N} .tt-facts>div{flex:1;padding:var(--tp-s5) var(--tp-s5) 0 0}
${N} .tt-facts>div+div{padding-left:var(--tp-s5);border-left:var(--tp-b-hair) solid var(--tp-line)}
${N} .tt-facts dt{font-family:var(--tp-display);font-weight:var(--tp-weight-regular);font-size:var(--tp-size-2xl);line-height:1;color:var(--tp-umber-900)}
${N} .tt-facts dd{margin:var(--tp-s2) 0 0;${LABEL};color:var(--tp-muted)}
${N} .tt-heroimg{position:relative;padding:0 0 var(--tp-s10) var(--tp-s10)}
${N} .tt-ticket{position:absolute;left:0;bottom:0;display:flex;gap:var(--tp-s5);align-items:center;max-width:340px;padding:var(--tp-s4) var(--tp-s6) var(--tp-s4) var(--tp-s4);background:var(--tp-card);border:var(--tp-b-hair) solid var(--tp-line);border-radius:var(--tp-r-lg);box-shadow:var(--tp-d3);color:inherit;text-decoration:none;transition:transform ${EASE}}
${N} a.tt-ticket:hover{transform:translateY(calc(var(--tp-lift) * -1))}
${N} .tt-ticket-title{font-family:var(--tp-serif);font-size:var(--tp-size-lg);line-height:1.2;color:var(--tp-umber-900);margin:var(--tp-s2) 0 var(--tp-s1)}

/* What's coming up: three arch-topped event cards with the stamp straddling the photo. */
${N} .tt-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--tp-s10)}
${N} .tt-ev{display:flex;flex-direction:column;color:inherit;text-decoration:none}
${N} .tt-ev-media{position:relative}
${N} .tt-ev-media .tt-stamp{position:absolute;left:var(--tp-s4);bottom:calc(var(--tp-s6) * -1);border:var(--tp-b-bold) solid var(--tp-plaster-100)}
${N} .tt-ev:hover .tt-ev-media .tt-arch{transform:translateY(calc(var(--tp-lift) * -1));box-shadow:var(--tp-d3)}
${N} .tt-ev-body{display:flex;flex-direction:column;gap:var(--tp-s2);flex:1;padding:var(--tp-s10) var(--tp-s1) 0}
${N} .tt-ev-title{font-family:var(--tp-serif);font-weight:var(--tp-weight-regular);font-size:var(--tp-size-xl);line-height:var(--tp-leading-display);color:var(--tp-umber-900);margin:var(--tp-s1) 0 0;transition:color var(--tp-dur-fast) var(--tp-ease)}
${N} .tt-ev:hover .tt-ev-title{color:var(--tp-clay-600)}
${N} .tt-ev-foot{display:flex;align-items:center;justify-content:space-between;gap:var(--tp-s3);margin-top:auto;padding-top:var(--tp-s5);border-top:var(--tp-b-hair) solid var(--tp-line)}
${N} .tt-ev-foot .tt-price{font-size:var(--tp-size-lg)}

/* The standing week: seven arch-topped day cards; an empty day is dashed, a held day is the night card. */
${N} .tt-week{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:var(--tp-s3)}
${N} .tt-day{display:flex;flex-direction:column;gap:var(--tp-s3);min-height:230px;padding:22px var(--tp-s4) var(--tp-s5);border-radius:var(--tp-r-arch) var(--tp-r-arch) var(--tp-r-md) var(--tp-r-md);background:var(--tp-card);border:var(--tp-b-hair) solid var(--tp-line);box-shadow:var(--tp-d1);text-align:center}
${N} .tt-day--note{background:transparent;border-style:dashed;box-shadow:none}
${N} .tt-day--hold{background:var(--tp-wash-night);border-color:transparent;color:var(--tp-on-ink);box-shadow:var(--tp-d2)}
${N} .tt-day-name{font-family:var(--tp-display);font-size:var(--tp-size-xl);line-height:1;color:var(--tp-umber-900)}
${N} .tt-day--hold .tt-day-name{color:var(--tp-plaster-50)}
${N} .tt-day-ev{font-family:var(--tp-serif);font-size:var(--tp-size-sm);line-height:1.25;color:var(--tp-umber-900)}
${N} .tt-day--hold .tt-day-ev{color:var(--tp-plaster-100)}
${N} .tt-day-t{font-size:var(--tp-size-2xs);color:var(--tp-muted);letter-spacing:.02em;margin-top:var(--tp-s1)}
${N} .tt-day-join{margin:calc(var(--tp-s1) * -.5) 0}
${N} .tt-day--hold .tt-day-t{color:var(--tp-plaster-300)}
${N} .tt-day-note{margin-top:auto;font-size:var(--tp-size-2xs);letter-spacing:var(--tp-tracking-eyebrow);text-transform:uppercase;color:var(--tp-clay-600)}
${N} .tt-day--hold .tt-day-note{color:var(--tp-saffron-400)}

/* Follow, belong, hold: three rungs on the night wash, Member the light lead. */
${N} .tt-tiers{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--tp-s6);align-items:stretch}
${N} .tt-tier{display:flex;flex-direction:column;gap:var(--tp-s4);padding:var(--tp-s8);border-radius:var(--tp-r-arch-soft) var(--tp-r-arch-soft) var(--tp-r-lg) var(--tp-r-lg);background:var(--tp-card);border:var(--tp-b-hair) solid var(--tp-line);box-shadow:var(--tp-d2);color:var(--tp-umber-800)}
${N} .tt-tier--ink{background:var(--tp-veil-ink);border-color:var(--tp-line-on-ink);box-shadow:none;color:var(--tp-plaster-200)}
${N} .tt-tier--lead{background:var(--tp-plaster-50);box-shadow:var(--tp-d3);color:var(--tp-umber-800)}
${N} .tt-tier h3{font-family:var(--tp-serif);font-weight:var(--tp-weight-regular);font-size:var(--tp-size-xl);margin:0;color:var(--tp-umber-900)}
${N} .tt-tier--ink h3{color:var(--tp-plaster-50)}
${N} .tt-tier--ink .tt-eyebrow{color:var(--tp-saffron-400)}
${N} .tt-tier--ink .tt-muted{color:var(--tp-plaster-300)}
${N} .tt-tier-price{font-family:var(--tp-display);font-size:var(--tp-size-3xl);line-height:1;color:var(--tp-umber-900)}
${N} .tt-tier--ink .tt-tier-price{color:var(--tp-plaster-50)}
${N} .tt-tier p{margin:0}
${N} .tt-tier ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:var(--tp-s2);font-size:var(--tp-size-sm);font-weight:var(--tp-weight-light)}
${N} .tt-tier li{position:relative;padding-left:var(--tp-s5)}
${N} .tt-tier li::before{content:"";position:absolute;left:0;top:.6em;width:var(--tp-s2);height:var(--tp-s2);border-radius:var(--tp-r-circle);background:var(--tp-clay-500)}
${N} .tt-tier .hs-btn{margin-top:auto;justify-content:center}
${N} .tt-tier--ink .hs-btn-soft{background:transparent;color:var(--tp-plaster-50);border-color:var(--tp-line-on-ink)}

/* Four seasonal events: tall arch photos under the turn of the year. */
${N} .tt-seasons{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:var(--tp-s8)}
${N} .tt-season{display:flex;flex-direction:column;gap:var(--tp-s2);color:inherit;text-decoration:none}
${N} .tt-season h3{font-family:var(--tp-serif);font-weight:var(--tp-weight-regular);font-size:var(--tp-size-lg);margin:var(--tp-s1) 0 0;color:var(--tp-umber-900)}
${N} .tt-season .tt-arch{margin-bottom:var(--tp-s3)}

/* Retreat and rental: the keyhole photo beside the heading, the capacity grid and the button. */
${N} .tt-split{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:var(--tp-s20);align-items:center}
${N} .tt-split .tt-sechead{margin-bottom:var(--tp-s8)}
${N} .tt-spaces{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 var(--tp-s8);margin-bottom:var(--tp-s10)}
${N} .tt-space{display:grid;grid-template-columns:var(--tp-s5) minmax(0,1fr) auto;gap:var(--tp-s3);align-items:center;padding:var(--tp-s4) var(--tp-s3);margin:0 calc(var(--tp-s3) * -1);border-bottom:var(--tp-b-hair) solid var(--tp-line);border-radius:var(--tp-r-md);transition:background-color ${EASE},box-shadow ${EASE}}
${N} .tt-space:hover{background:var(--tp-row-hover);box-shadow:var(--tp-d1)}
${N} .tt-space>span:nth-child(2){font-size:var(--tp-size-sm);color:var(--tp-umber-800)}
${N} .tt-space .tp-icon{width:var(--tp-s5);height:var(--tp-s5);opacity:.75}
${N} .tt-space b{font-family:var(--tp-serif);font-weight:var(--tp-weight-regular);font-size:var(--tp-size-md);color:var(--tp-umber-900)}
${N} .tt-space small{display:block;${LABEL};color:var(--tp-muted);text-align:right}

/* Questions: a hairline accordion, Marcellus questions, a clay plus. */
${N} .tt-faq{border-top:var(--tp-b-hair) solid var(--tp-line)}
${N} .tt-faq details{border-bottom:var(--tp-b-hair) solid var(--tp-line)}
${N} .tt-faq summary{display:flex;justify-content:space-between;align-items:center;gap:var(--tp-s6);padding:var(--tp-s6) 0;cursor:pointer;list-style:none;font-family:var(--tp-serif);font-size:var(--tp-size-lg);color:var(--tp-umber-900)}
${N} .tt-faq summary::-webkit-details-marker{display:none}
${N} .tt-faq summary::after{content:"+";font-family:var(--tp-sans);font-weight:var(--tp-weight-light);font-size:var(--tp-size-xl);color:var(--tp-clay-500)}
${N} .tt-faq details[open] summary::after{content:"\\2212"}
${N} .tt-faq p{margin:0;padding:0 var(--tp-s16) var(--tp-s6) 0;max-width:var(--tp-measure-body);font-size:var(--tp-size-base);font-weight:var(--tp-weight-light);color:var(--tp-umber-600)}

/* The follow band: clay wash, the headline left, the email field and button right. */
${N} .tt-follow{position:relative;padding:var(--tp-s20) var(--tp-gutter);background:var(--tp-wash-clay);color:var(--tp-on-clay);overflow:hidden}
${N} .tt-follow-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:var(--tp-s16);align-items:center}
${N} .tt-eyebrow--on-clay,${N} .tt-title--on-clay{color:var(--tp-on-clay)}
${N} .tt-title--on-clay em{color:var(--tp-on-clay)}
${N} .tt-follow-lead{margin:var(--tp-s4) 0 0;max-width:var(--tp-measure-narrow);font-size:var(--tp-size-md);font-weight:var(--tp-weight-light);color:var(--tp-on-clay)}
${N} .tt-follow-form{display:flex;gap:var(--tp-s3);flex-wrap:wrap;align-items:center}
${N} .tt-follow-field{flex:1;min-width:var(--tp-s40)}
${N} .tt-follow-form input[type="email"]{width:100%;padding:var(--tp-s4) var(--tp-s5);border:var(--tp-b-hair) solid var(--tp-line-on-ink);border-radius:var(--tp-r-md);background:var(--tp-plaster-50);color:var(--tp-umber-900);font-family:var(--tp-sans);font-size:var(--tp-size-base);font-weight:var(--tp-weight-light)}
${N} .tt-follow-form .tt-hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}
${N} .tt-follow-error{flex-basis:100%;margin:0;font-size:var(--tp-size-sm)}
${N} .tt-follow-done{margin:0;font-family:var(--tp-quote);font-style:italic;font-size:var(--tp-size-lg)}

@media (max-width:960px){
${N} .tt-hero-grid,${N} .tt-split,${N} .tt-follow-grid{grid-template-columns:minmax(0,1fr)}
${N} .tt-week{grid-template-columns:repeat(4,minmax(0,1fr))}
${N} .tt-tiers,${N} .tt-seasons{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
${N} .tt-cards{grid-template-columns:minmax(0,1fr) minmax(0,1fr);row-gap:var(--tp-s10)}
${N} .tt-spaces{grid-template-columns:minmax(0,1fr)}
}
@media (max-width:600px){
${N} .tt-week,${N} .tt-tiers,${N} .tt-seasons,${N} .tt-cards{grid-template-columns:minmax(0,1fr)}
${N} .tt-week{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
}
@media (prefers-reduced-motion:reduce){${N} .tt-arch,${N} .tt-arch img,${N} .tt-ticket,${N} .tt-space{transition:none}${N} a.tt-ticket:hover,${N} .tt-ev:hover .tt-ev-media .tt-arch{transform:none}${N} a:hover .tt-arch img,${N} .tt-arch:hover img{transform:none}}
`
