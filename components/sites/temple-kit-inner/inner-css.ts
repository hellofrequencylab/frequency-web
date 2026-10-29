// THE TEMPLE KIT INNER-PAGE SHEET, group A (About, Ceremonies and hire, Contact). Scoped under
// [data-house-theme="temple-kit"], so it can only ever dress the stand-alone site render, and every value reads the
// kit's token block (lib/theme/temple-kit.ts): no raw colour lives here. Classes are tki-*, one family for every
// inner page block (components/page-editor/blocks/temple-kit-inner.tsx). The site skin concatenates this sheet.

const N = '[data-house-theme="temple-kit"]'

export const TEMPLE_KIT_INNER_CSS = `
${N} .tki-eyebrow{display:flex;gap:var(--space-3);align-items:center;font-family:var(--font-label);font-size:var(--text-eyebrow);font-weight:var(--weight-medium);text-transform:uppercase;letter-spacing:var(--label-tracking);color:var(--kit-accent-text)}
${N} .tki-eyebrow--on-media{color:var(--color-on-media)}
${N} .tki-index{font-family:var(--font-display);letter-spacing:var(--tracking-wide)}
${N} .tki-index::after{content:"\\00B7";margin-left:var(--space-3)}
${N} .tki-title{margin:var(--space-3) 0 0;font-size:var(--text-display-h2);color:var(--color-heading)}
${N} .tki-title em,${N} .tki-hero-title em{font-style:var(--display-em-style);color:var(--display-em-color)}
${N} .tki-section{padding:var(--space-section) var(--space-gutter);max-width:var(--width-max);margin:0 auto}
${N} .tki-hero{position:relative;display:flex;align-items:flex-end;min-height:clamp(260px,30vw,420px);overflow:hidden;color:var(--color-on-media);background:var(--wash-night)}
${N} .tki-hero--tall{min-height:clamp(320px,38vw,540px)}
${N} .tki-hero-media{position:absolute;inset:0;background-size:cover;background-position:center}
${N} .tki-hero-veil{position:absolute;inset:0;background:var(--veil-bottom);pointer-events:none}
${N} .tki-hero-copy{position:relative;z-index:1;width:100%;padding:var(--space-12) var(--space-gutter)}
${N} .tki-hero-title{margin:var(--space-3) 0 0;font-family:var(--font-hero);font-weight:400;font-size:var(--text-display-h1);line-height:var(--leading-tight);letter-spacing:var(--tracking-display);color:var(--color-on-media)}
${N} .tki-hero-title em{color:var(--tk-saffron-400)}
${N} .tki-hero-lead{margin:var(--space-4) 0 0;max-width:var(--measure-body);font-size:var(--text-lead);color:var(--color-on-media)}
${N} .tki-story{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.3fr);gap:var(--space-16);align-items:start}
${N} .tki-arch{margin:var(--space-12) 0 0;max-width:300px}
${N} .tki-arch-frame{aspect-ratio:3/4;border-radius:var(--radius-arch);overflow:hidden;background:var(--wash-sun);box-shadow:var(--shadow-card)}
${N} .tki-arch-img{width:100%;height:100%;background-size:cover;background-position:center}
${N} .tki-arch figcaption{margin-top:var(--space-4);text-align:center;font-family:var(--font-label);font-size:var(--text-eyebrow);text-transform:uppercase;letter-spacing:var(--label-tracking);color:var(--kit-accent-text)}
${N} .tki-prose{display:flex;flex-direction:column;gap:var(--space-5);max-width:var(--measure-body);font-size:var(--text-lead);line-height:var(--leading-relaxed);color:var(--color-text-muted)}
${N} .tki-prose p{margin:0}
${N} .tki-prose .tki-prose-first{color:var(--color-text)}
${N} .tki-ornament{display:flex;align-items:center;gap:var(--space-4);margin-bottom:var(--space-10);font-family:var(--font-label);font-size:var(--text-eyebrow);text-transform:uppercase;letter-spacing:var(--label-tracking);color:var(--kit-accent-text)}
${N} .tki-ornament::before,${N} .tki-ornament::after{content:"";flex:1;height:1px;background:var(--line-rule)}
${N} .tki-ornament span::before{content:"\\2726";margin-right:var(--space-3);color:var(--tk-saffron-500)}
${N} .tki-team{padding-top:0}
${N} .tki-people{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:var(--space-4)}
${N} .tki-person{display:flex;gap:var(--space-4);align-items:center;padding:var(--space-4);background:var(--surface-card);border:1px solid var(--color-border);border-radius:var(--radius-card);box-shadow:var(--shadow-card)}
${N} .tki-person strong{display:block;font-weight:var(--weight-medium);color:var(--color-text)}
${N} .tki-person-line{display:block;font-size:var(--text-body-sm);color:var(--color-text-muted)}
${N} .tki-avatar{flex:none;width:48px;height:48px;border-radius:var(--radius-circle);display:grid;place-items:center;overflow:hidden;background:var(--kit-accent-bg);color:var(--kit-accent-text);font-family:var(--font-display)}
${N} .tki-avatar span{display:block;width:100%;height:100%;background-size:cover;background-position:center}
${N} .tki-stats{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);border-top:1px solid var(--color-border)}
${N} .tki-stats-media{min-height:420px;background:var(--wash-sun) center/cover}
${N} .tki-stats-grid{margin:0;padding:var(--space-16) var(--space-gutter);display:grid;grid-template-columns:1fr 1fr;gap:var(--space-10);align-content:center}
${N} .tki-stat-value{margin:0;font-family:var(--font-display);font-size:var(--text-stat);line-height:var(--leading-tight);color:var(--color-heading)}
${N} .tki-stat-label{margin:var(--space-2) 0 0;font-family:var(--font-label);font-size:var(--text-eyebrow);text-transform:uppercase;letter-spacing:var(--label-tracking);color:var(--color-text-subtle)}
${N} .tki-service{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);min-height:420px;border-top:1px solid var(--color-border)}
${N} .tki-service-media{min-height:320px;background:var(--wash-sun) center/cover}
${N} .tki-service--flip .tki-service-media{order:2}
${N} .tki-service-copy{padding:var(--space-16) var(--space-gutter);display:flex;flex-direction:column;justify-content:center;gap:var(--space-4);max-width:calc(var(--measure-body) + var(--space-gutter) * 2)}
${N} .tki-sigil{display:grid;place-items:center;width:56px;height:56px;border-radius:var(--radius-card);background:var(--surface-card);border:1px solid var(--color-border);box-shadow:var(--shadow-card);color:var(--kit-accent-text)}
${N} .tki-service-title{margin:0;font-size:var(--text-display-h3);color:var(--color-heading)}
${N} .tki-service-lead{margin:0;color:var(--color-text-muted)}
${N} .tki-points{list-style:none;margin:var(--space-2) 0;padding:0;display:flex;flex-direction:column}
${N} .tki-points li{display:flex;gap:var(--space-3);align-items:center;padding:var(--space-3) 0;border-top:1px solid var(--line-rule);font-size:var(--text-body-sm);color:var(--color-text-muted)}
${N} .tki-points li:last-child{border-bottom:1px solid var(--line-rule)}
${N} .tki-points svg{flex:none;color:var(--color-success)}
${N} .tki-service-foot{display:flex;flex-wrap:wrap;gap:var(--space-4);align-items:center;margin-top:var(--space-2)}
${N} .tki-note{font-size:var(--text-body-sm);color:var(--color-text-subtle)}
${N} .tki-faq{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.6fr);gap:var(--space-16);align-items:start}
${N} .tki-faq-list details{border-bottom:1px solid var(--line-rule)}
${N} .tki-faq-list details:first-child{border-top:1px solid var(--line-rule)}
${N} .tki-faq-list summary{display:flex;justify-content:space-between;gap:var(--space-4);align-items:center;padding:var(--space-5) 0;cursor:pointer;list-style:none;color:var(--color-text)}
${N} .tki-faq-list summary::-webkit-details-marker{display:none}
${N} .tki-faq-list summary::after{content:"+";color:var(--color-text-subtle)}
${N} .tki-faq-list details[open] summary::after{content:"\\2212"}
${N} .tki-faq-list p{margin:0 0 var(--space-5);color:var(--color-text-muted);max-width:var(--measure-body)}
${N} .tki-contact{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);min-height:min(80vh,720px)}
${N} .tki-contact-media{position:relative;display:flex;align-items:flex-end;padding:var(--space-12) var(--space-gutter);background:var(--wash-night) center/cover;color:var(--color-on-media);overflow:hidden}
${N} .tki-contact-copy{position:relative;z-index:1}
${N} .tki-contact-lines{list-style:none;margin:var(--space-6) 0 0;padding:0;display:flex;flex-direction:column;gap:var(--space-3);color:var(--color-on-media)}
${N} .tki-contact-lines li{display:flex;gap:var(--space-3);align-items:center}
${N} .tki-contact-form{padding:var(--space-16) var(--space-gutter);display:flex;flex-direction:column;justify-content:center}
${N} .tki-form{display:flex;flex-direction:column;gap:var(--space-6);max-width:520px}
${N} .tki-form-intro{margin:0;color:var(--color-text-muted)}
${N} .tki-form-pair{display:grid;grid-template-columns:1fr 1fr;gap:var(--space-6)}
${N} .tki-form-error{margin:0;color:var(--color-danger)}
${N} .tki-hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}
${N} .tki-contact-done-title{margin:0;font-family:var(--font-display);font-size:var(--text-display-h2);line-height:var(--leading-tight);color:var(--color-heading)}
${N} .tki-contact-done-title em{font-style:var(--display-em-style);color:var(--display-em-color)}
${N} .tki-switch{display:inline-flex;gap:var(--space-3);align-items:center;cursor:pointer;color:var(--color-text-muted)}
${N} .tki-switch input{position:absolute;opacity:0;width:1px;height:1px}
${N} .tki-switch-track{position:relative;width:44px;height:24px;border-radius:var(--radius-pill);background:var(--color-border-strong);transition:background-color var(--motion-fast) var(--ease-out)}
${N} .tki-switch-track::after{content:"";position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:var(--radius-circle);background:var(--surface-card);box-shadow:var(--shadow-card);transition:transform var(--motion-fast) var(--ease-out)}
${N} .tki-switch input:checked + .tki-switch-track{background:var(--mn-solid)}
${N} .tki-switch input:checked + .tki-switch-track::after{transform:translateX(20px)}
${N} .tki-switch input:focus-visible + .tki-switch-track{box-shadow:var(--ring-focus)}
@media (max-width:860px){
${N} .tki-story,${N} .tki-stats,${N} .tki-service,${N} .tki-contact,${N} .tki-faq{grid-template-columns:minmax(0,1fr)}
${N} .tki-story{gap:var(--space-10)}
${N} .tki-arch{margin-top:var(--space-8)}
${N} .tki-service--flip .tki-service-media{order:0}
${N} .tki-bare{display:none}
${N} .tki-service-copy,${N} .tki-stats-grid,${N} .tki-contact-form{padding:var(--space-12) var(--space-gutter)}
${N} .tki-contact-media{min-height:320px}
${N} .tki-form-pair{grid-template-columns:1fr}
}
`
