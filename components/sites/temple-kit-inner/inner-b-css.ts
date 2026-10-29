// THE TEMPLE KIT INNER-PAGE SHEET, group B (Membership and Gatherings). Same rules as the group A sheet
// (inner-css.ts): scoped under [data-house-theme="temple-kit"], every value a kit token, no raw colour. The site
// skin concatenates it after TEMPLE_KIT_INNER_CSS.

const N = '[data-house-theme="temple-kit"]'

export const TEMPLE_KIT_INNER_B_CSS = `
${N} .tki-tiers-section,${N} .tki-gatherings,${N} .tki-faq{max-width:none}
${N} .tki-tiers-caption{margin-bottom:var(--space-6)}
${N} .tki-tabs{display:inline-flex;padding:var(--space-1);border:1px solid var(--color-border);border-radius:var(--radius-pill);background:var(--surface-card);margin-bottom:var(--space-8)}
${N} .tki-tab{border:0;background:transparent;padding:var(--space-2) var(--space-5);border-radius:var(--radius-pill);font:inherit;color:var(--color-text-muted);cursor:pointer}
${N} .tki-tab[aria-pressed="true"]{background:var(--mn-solid);color:var(--mn-on-solid)}
${N} .tki-tab:focus-visible{box-shadow:var(--ring-focus);outline:none}
${N} .tki-tier-grid{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:var(--space-6);align-items:stretch}
${N} .tki-tier{position:relative;display:flex;flex-direction:column;gap:var(--space-4);padding:var(--space-8);background:var(--surface-card);border:1px solid var(--color-border);border-radius:var(--radius-card);box-shadow:var(--shadow-card)}
${N} .tki-tier--featured{border-color:var(--kit-accent-text)}
${N} .tki-tier-top{display:flex;justify-content:space-between;align-items:flex-start}
${N} .tki-tier-sigil{display:grid;place-items:center;width:56px;height:56px;border-radius:var(--radius-card);background:var(--kit-accent-bg);color:var(--kit-accent-text)}
${N} .tki-badge{padding:var(--space-1) var(--space-3);border-radius:var(--radius-sm);background:var(--kit-accent-text);color:var(--color-on-media);font-family:var(--font-label);font-size:var(--text-eyebrow);text-transform:uppercase;letter-spacing:var(--label-tracking)}
${N} .tki-badge--soft{background:var(--kit-accent-bg);color:var(--kit-accent-text)}
${N} .tki-tier-name{margin:0;font-family:var(--font-display);font-size:var(--text-display-h3);line-height:var(--leading-tight);color:var(--color-heading)}
${N} .tki-tier-summary{margin:0;color:var(--color-text-muted)}
${N} .tki-tier-price{display:flex;align-items:baseline;gap:var(--space-2)}
${N} .tki-tier-amount{font-family:var(--font-display);font-size:var(--text-stat);line-height:var(--leading-tight);color:var(--color-heading)}
${N} .tki-tier-note{font-size:var(--text-body-sm);color:var(--kit-accent-text)}
${N} .tki-tier .tki-points{margin-top:var(--space-2)}
${N} .tki-tier-cta{margin-top:auto;justify-content:center}
${N} .tki-footnote{margin:var(--space-6) 0 0;font-size:var(--text-body-sm);color:var(--color-text-subtle)}
${N} .tki-gatherings-count{margin-bottom:var(--space-6)}
${N} .tki-cards{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--space-6)}
${N} .tki-card{display:flex;flex-direction:column;overflow:hidden;background:var(--surface-card);border:1px solid var(--color-border);border-radius:var(--radius-card);box-shadow:var(--shadow-card)}
${N} .tki-card-media{aspect-ratio:16/9;background:var(--wash-sun) center/cover}
${N} .tki-card-media--bare{display:none}
${N} .tki-card-body{display:flex;flex-direction:column;gap:var(--space-2);padding:var(--space-5)}
${N} .tki-card-title{margin:0;font-family:var(--font-display);font-size:var(--text-display-h3);line-height:var(--leading-tight);color:var(--color-heading)}
${N} .tki-card-title a{color:inherit;text-decoration:none}
${N} .tki-card-title a:hover{color:var(--kit-accent-text)}
${N} .tki-card-place{font-size:var(--text-body-sm);color:var(--color-text-subtle)}
${N} .tki-card-summary{margin:0;color:var(--color-text-muted)}
${N} .tki-card-foot{display:flex;justify-content:space-between;align-items:center;margin-top:var(--space-2);padding-top:var(--space-4);border-top:1px solid var(--line-rule);color:var(--color-text-muted)}
@media (max-width:860px){
${N} .tki-cards{grid-template-columns:minmax(0,1fr)}
${N} .tki-tier{padding:var(--space-6)}
}
`
