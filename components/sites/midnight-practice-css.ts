// THE MIDNIGHT PRACTICE SHEET (House of Fates design, the Hypnotist kit). The look of the practice sections
// (components/page-editor/blocks/midnight-practice.tsx): the page hero, the jump bar, the welcome, the host, the
// pillars, a service with its priced options, the recording panel and grid, a program, event rows, the closing
// band, the letter archive and the contact page. Same rules as the block sheet (midnight-blocks-css.ts): every
// rule is scoped under the Midnight root and reads the --mn-* tokens only, so a token round is a values-only
// change. Reduced motion is honoured in the token block.

const N = '[data-house-theme="midnight"]'
const EASE = 'var(--mn-ease)'
const LABEL = 'font-family:var(--mn-label);text-transform:uppercase;font-weight:400'
const HAIR = '1px solid var(--mn-night-300)'

export const MIDNIGHT_PRACTICE_CSS = `
/* Photo tone: Midnight keeps its photos black and white; a block set to the soft tone keeps its colour. */
${N} [data-tone="soft"] img{filter:var(--mn-tone-soft)}
${N} .hs-btn--sm{min-height:32px;padding:0 14px;font-size:11px}
${N} .hs-btn--lg{min-height:56px;padding:0 32px;font-size:13px}
${N} .hs-btn:disabled{opacity:.4;cursor:not-allowed}
html:has([data-house-theme="midnight"]){scroll-behavior:smooth}
@media (prefers-reduced-motion:reduce){html:has([data-house-theme="midnight"]){scroll-behavior:auto}}
${N} [id]{scroll-margin-top:96px}

/* Type the practice sections share. */
${N} .mn-display--h1{font-size:var(--mn-size-h1);line-height:var(--mn-leading-display)}
${N} .mn-display--sm{font-size:28px;line-height:1.1}
${N} .mn-display--xs{font-size:22px;line-height:1.15}
${N} .mn-price{font-size:26px;line-height:1;white-space:nowrap}
${N} .mn-price--lg{font-size:32px}
${N} .mn-prose{margin:0;max-width:62ch;font-size:17px;line-height:1.7;color:var(--mn-ash-200);text-wrap:pretty}
${N} .mn-prose--lead{margin:28px auto 0;font-size:19px}
${N} .mn-prose--strong{color:var(--color-text)}
${N} .mn-prose--statement{margin:0 auto;max-width:62ch;font-size:20px;color:var(--color-text);text-align:center}
${N} .mn-section--tight{padding-top:var(--mn-section-tight);padding-bottom:var(--mn-section-tight)}
${N} .mn-actions--tight{margin-top:0}
${N} .mn-numeral{font-family:var(--mn-display);font-style:italic;font-size:14px;letter-spacing:0;text-transform:none;color:var(--color-accent)}
${N} .mn-badges{display:flex;flex-wrap:wrap;gap:8px}
${N} .mn-arch-caption{margin-top:22px;text-align:center;${LABEL};font-size:var(--mn-size-eyebrow);letter-spacing:var(--mn-tracking-eyebrow);color:var(--mn-ash-200)}
${N} .mn-pair{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,20rem),1fr));gap:64px;align-items:center}
${N} .mn-pair-copy{display:flex;flex-direction:column;gap:20px}
${N} .mn-pair .mn-arch{justify-self:center;max-width:26.25rem}
${N} .mn-ornament--wide{max-width:none;margin:72px 0}
${N} .mn-ornament b{font-weight:400;padding:0 4px;color:inherit}

/* The page hero: a photo darkened to 60%, with the title bottom left. */
${N} .mn-pagehero{position:relative;isolation:isolate;display:flex;align-items:flex-end;overflow:hidden;border-bottom:${HAIR}}
${N} .mn-pagehero .mn-pagehero-photo{position:absolute;inset:0;z-index:0;width:100%;height:100%;object-fit:cover;filter:brightness(.6)}
${N} .mn-pagehero-copy{position:relative;z-index:2;max-width:900px;padding:4rem var(--mn-gutter) 3rem}
${N} .mn-pagehero .mn-eyebrow{margin-bottom:20px;color:var(--color-on-media)}
${N} .mn-pagehero .mn-display{color:var(--color-on-media)}
${N} .mn-pagehero-lead{margin:20px 0 0;max-width:620px;color:var(--mn-bone-100);text-wrap:pretty}

/* The jump bar: one cell per link, divided by hairlines. */
${N} .mn-jump{display:flex;flex-wrap:wrap;gap:1px;background:var(--color-border);border-bottom:${HAIR}}
${N} .mn-jump-item{flex:1 1 180px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:20px var(--mn-gutter);background:var(--color-canvas);${LABEL};font-size:11px;letter-spacing:.18em;color:var(--color-text);transition:background var(--mn-dur-fast) ${EASE}}
${N} .mn-jump-item:hover{background:var(--color-surface-hover);color:var(--color-text)}

/* The welcome. */
${N} .mn-welcome-head{max-width:860px;margin:0 auto;text-align:center}
${N} .mn-welcome-head .mn-eyebrow{justify-content:center;margin-bottom:20px}
${N} img.mn-welcome-logo{display:block;width:min(240px,60%);margin:0 auto 36px;filter:invert(1)}
${N} .mn-welcome-head .mn-prose{margin-inline:auto}

/* The host. */
${N} .mn-host{border-top:${HAIR}}

/* The pillars. */
${N} .mn-pillars{overflow:hidden;border-top:${HAIR}}
${N} .mn-pillars-inner{position:relative;z-index:2}
${N} .mn-pillars-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,15rem),1fr));gap:48px;margin-top:56px}
${N} .mn-pillars .mn-head{margin-bottom:0}
${N} .mn-pillar{display:flex;flex-direction:column;gap:16px}

/* A service: a photo beside the words, the options ruled underneath. */
${N} .mn-service{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,26.25rem),1fr));border-bottom:${HAIR}}
${N} .mn-service-photo{position:relative;min-height:520px;overflow:hidden;background:var(--color-surface)}
${N} .mn-service-photo img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
${N} .mn-service--flip .mn-service-photo{order:2}
${N} .mn-service-copy{display:flex;flex-direction:column;gap:20px;padding:4rem var(--mn-gutter)}
${N} .mn-service--flip .mn-service-copy{order:1}
${N} .mn-service-copy .mn-seal{align-self:flex-start}
${N} .mn-service-copy .mn-eyebrow{gap:14px}
${N} .mn-pull{margin:0;max-width:36ch;font-size:22px;line-height:1.35}
${N} .mn-options{margin-top:8px;border-top:${HAIR}}
${N} .mn-option{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:20px;align-items:center;padding:20px 0;border-bottom:${HAIR}}
${N} .mn-option-line{display:flex;flex-wrap:wrap;align-items:baseline;gap:12px}
${N} .mn-option-line .mn-display--sm{font-size:24px}
${N} .mn-option-text{margin:8px 0 0;max-width:52ch}
${N} .mn-option-end{display:flex;flex-direction:column;align-items:flex-end;gap:10px}
${N} .mn-panel-slot{margin-top:16px}

/* The recording panel: a framed row with a seal, the words and the one button. */
${N} .mn-panel{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,18.75rem),1fr));gap:40px;align-items:center;padding:40px;background:var(--color-surface);border:1px solid var(--mn-night-500)}
${N} .mn-panel-head{display:flex;align-items:flex-start;gap:24px}
${N} .mn-panel-title{margin:10px 0 0}
${N} .mn-panel-body{display:flex;flex-direction:column;gap:20px}
${N} .mn-panel-text{font-size:15px}
${N} .mn-panel-buy{display:flex;flex-wrap:wrap;align-items:center;gap:20px}
${N} .mn-panel-buy .mn-price{font-size:28px}

/* The recording grid. */
${N} .mn-recs{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,20rem),1fr));gap:1px;background:var(--color-border);border:${HAIR}}
${N} .mn-rec{display:flex;flex-direction:column;gap:16px;padding:32px;background:var(--color-canvas)}
${N} .mn-rec-top{display:flex;align-items:flex-start;justify-content:space-between}
${N} .mn-rec-title{font-size:28px;line-height:1.1}
${N} .mn-points{margin:0;padding:0;list-style:none;border-top:${HAIR}}
${N} .mn-points li{display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:${HAIR};font-size:14px}
${N} .mn-points .mn-accent-ink{margin-top:4px}
${N} .mn-rec-foot{display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin-top:auto;padding-top:8px}

/* A program. */
${N} .mn-program{border-bottom:${HAIR}}
${N} .mn-program-head{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,21.25rem),1fr));gap:64px;align-items:start}
${N} .mn-program-head .mn-arch{justify-self:center;max-width:23.75rem}
${N} .mn-tag-b{display:inline}
${N} .mn-includes{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,14.375rem),1fr));gap:1px;margin-top:56px;background:var(--color-border);border:${HAIR}}
${N} .mn-include{display:flex;flex-direction:column;gap:12px;padding:28px;background:var(--color-canvas)}
${N} .mn-addon{display:flex;flex-wrap:wrap;align-items:center;gap:20px;margin-top:32px;padding:28px;background:var(--color-surface);border:1px solid var(--mn-night-500)}
${N} .mn-addon>div{flex:1 1 320px}
${N} .mn-addon-text{margin:6px 0 0;font-size:15px}
${N} .mn-program-actions{display:flex;flex-wrap:wrap;align-items:center;gap:16px;margin-top:32px}

/* Event rows. */
${N} .mn-erows{border-top:${HAIR}}
${N} .mn-erow{display:grid;grid-template-columns:88px minmax(0,1fr) auto;gap:32px;align-items:center;padding:32px 0;border-bottom:${HAIR}}
${N} .mn-stamp--lg{width:auto;padding:12px 0;border-color:var(--mn-night-500)}
${N} .mn-stamp--lg b{color:var(--mn-ash-200);letter-spacing:var(--mn-tracking-eyebrow);font-size:var(--mn-size-eyebrow)}
${N} .mn-stamp--lg span{font-size:40px;line-height:1}
${N} .mn-erow-main{display:flex;flex-direction:column;gap:8px;min-width:0}
${N} .mn-erow-title{margin:0;font-size:32px;line-height:1.1}
${N} .mn-erow-main .mn-body-sm{font-size:15px}
${N} .mn-erow-meta{display:flex;flex-wrap:wrap;gap:20px;font-size:13px;color:var(--mn-ash-300)}
${N} .mn-erow-meta span{display:flex;align-items:center;gap:8px}
${N} .mn-erow-end{display:flex;flex-direction:column;align-items:flex-end;gap:10px}
${N} .mn-erow-end .mn-price{font-size:28px}

/* The closing band: bone ground, dark type. */
${N} .mn-band{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:32px;padding:var(--mn-section-tight) var(--mn-gutter);background:var(--color-ink);color:var(--color-on-ink)}
${N} .mn-band .mn-display{max-width:760px;color:var(--color-on-ink);font-size:var(--mn-size-h2);line-height:1.05}
${N} .mn-band .hs-btn-primary{background:var(--color-on-ink);color:var(--color-ink);border-color:var(--color-on-ink)}
${N} .mn-band .hs-btn-primary:hover{background:var(--color-on-ink-muted);color:var(--color-ink)}

/* The sign-up band, the archive and the reader. */
${N} .mn-letter--band .mn-letter-form{flex-wrap:wrap;max-width:32.5rem}
${N} .mn-letter--band .mn-letter-field{flex:1 1 10rem}
${N} .mn-hero--left .mn-hero-copy{max-width:44rem;margin-inline:0}
${N} .mn-footer-subscribe{margin-top:1.5rem}
${N} .mn-footer-subscribe-title{font-family:var(--hs-font-display);font-size:1.125rem;margin:0 0 .75rem}
${N} .mn-letter--band .mn-letter-field--wide{flex:2 1 13.75rem}
${N} .mn-letter--band .mn-display{line-height:1.1}
${N} .mn-archive-eyebrow{margin-bottom:24px}
${N} .mn-archive{border-top:${HAIR}}
${N} .mn-archive-row{display:grid;grid-template-columns:72px minmax(0,1fr) auto;gap:24px;align-items:center;width:100%;padding:28px 0;background:none;border:0;border-bottom:${HAIR};color:inherit;text-align:left;cursor:pointer}
${N} .mn-archive-row:hover .mn-archive-title{color:var(--color-accent)}
${N} .mn-archive-no{font-family:var(--mn-sans);font-size:12px;color:var(--mn-ash-300)}
${N} .mn-archive-main{min-width:0}
${N} .mn-archive-title{display:block;font-family:var(--mn-display);font-size:28px;line-height:1.15;color:var(--color-text);transition:color var(--mn-dur-fast) ${EASE}}
${N} .mn-archive-excerpt{display:block;margin-top:6px;overflow:hidden;font-size:14px;color:var(--mn-ash-200);text-overflow:ellipsis;white-space:nowrap}
${N} .mn-archive-date{gap:10px;white-space:nowrap}
${N} .mn-letter-reader{padding-top:3rem}
${N} .mn-back{display:inline-flex;align-items:center;gap:8px;padding:0;background:none;border:0;${LABEL};font-size:11px;letter-spacing:.18em;color:var(--mn-ash-200);cursor:pointer}
${N} .mn-back:hover{color:var(--color-text)}
${N} .mn-letter-article{max-width:680px;margin:48px auto 0}
${N} .mn-letter-article .mn-display--h2{margin:16px 0 40px;line-height:1.05}
${N} .mn-letter-body{display:flex;flex-direction:column;gap:20px}
${N} .mn-letter-body p{margin:0;max-width:62ch;font-size:19px;line-height:1.7;color:var(--mn-ash-200);text-wrap:pretty}
${N} .mn-letter-body p[data-last]{color:var(--color-text);font-style:italic}
${N} .mn-letter-next{margin-top:64px;padding-top:32px;border-top:${HAIR}}
${N} .mn-letter-next .mn-display{margin-bottom:20px}

/* The contact page: a photo beside the form. */
${N} .mn-contact{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,26.25rem),1fr));min-height:calc(100vh - 68px)}
${N} .mn-contact-photo{position:relative;isolation:isolate;display:flex;align-items:flex-end;min-height:420px;padding:3rem var(--mn-gutter);overflow:hidden;background:var(--color-surface)}
${N} .mn-contact-photo>img{position:absolute;inset:0;z-index:0;width:100%;height:100%;object-fit:cover}
${N} .mn-contact-title{position:relative;z-index:2;color:var(--color-on-media)}
${N} .mn-contact-side{display:flex;flex-direction:column;justify-content:center;padding:4rem var(--mn-gutter)}
${N} .mn-contact-copy{display:flex;flex-direction:column;gap:24px;max-width:540px}
${N} .mn-contact-lead{margin:0;font-size:19px;color:var(--color-text)}
${N} .mn-contact-form{display:flex;flex-direction:column;gap:24px}
${N} .mn-contact-pair{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,12.5rem),1fr));gap:24px}
${N} .mn-display--sent{font-size:40px;line-height:1.1}

@media (max-width:760px){
${N} .mn-erow{grid-template-columns:72px minmax(0,1fr);gap:20px}
${N} .mn-erow-end{grid-column:1 / -1;flex-direction:row;align-items:center;justify-content:space-between}
${N} .mn-archive-row{grid-template-columns:minmax(0,1fr) auto}
${N} .mn-archive-no{display:none}
${N} .mn-panel{padding:28px}
${N} .mn-ornament--wide{margin:48px 0}
}
`
