// THE NETWORK KIT INNER-PAGE SHEET, pass A (About, Services, Workshops, Journeys). Layered after the kit sheets, so
// it only ever reaches a stand-alone site render under [data-house-theme="network-kit"]: no member, console or admin
// surface wears it. Structure reads the contract tokens (--color-*, --radius-*, --space-*); the kit's own --nk-* are
// used only for decoration (leaf crop, depth, type scale). No raw colour or length for colour. The shapes are the
// design's AboutPage, ServicesPage, WorkshopsPage and JourneysPage (Network design system, ui_kits/site).

const N = '[data-house-theme="network-kit"]'
const COL = 'max(var(--space-gutter),calc((100% - var(--nk-column)) / 2))'

export const NETWORK_KIT_INNER_CSS = `
${N} .nk-cta-card{position:relative;overflow:hidden;display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:32px;box-sizing:border-box;padding:clamp(32px,5vw,64px);border-radius:var(--nk-radius-card);background:var(--color-surface-elevated)}
${N} .nk-cta-card>*{position:relative;z-index:2}
${N} .nk-cta-card .nk-eyebrow{margin-bottom:16px}
${N} .nk-cta-card .nk-cta-title{max-width:720px}
${N} .nk-band--sand .nk-cta-card{background:var(--color-surface)}
${N} .nki-story{grid-template-columns:minmax(0,1fr) minmax(0,1.3fr);column-gap:clamp(40px,5vw,64px);align-items:center}
${N} .nki-arch{margin:48px 0 0;max-width:300px}
${N} .nki-arch-frame{aspect-ratio:4/5;border-radius:var(--nk-radius-leaf);overflow:hidden;box-shadow:var(--nk-depth-md)}
${N} .nki-arch-frame img{display:block;width:100%;height:100%;object-fit:cover}
${N} .nki-arch figcaption{margin-top:14px}
${N} .nki-prose{display:flex;flex-direction:column;gap:20px;max-width:620px;font-size:18px;line-height:1.7;color:var(--color-text-muted)}
${N} .nki-prose p{margin:0}
${N} .nki-prose p[data-first]{color:var(--color-text)}
${N} .nki-team.nk-section{padding-top:0}
${N} .nki-ornament{width:min(360px,100%);margin-bottom:40px}
${N} .nki-ornament em{flex:none;font-style:normal;font-size:var(--nk-text-label);color:var(--color-text-muted);white-space:nowrap}
${N} .nki-people{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:16px;margin:0;padding:0;list-style:none}
${N} .nki-person{display:flex;align-items:center;gap:16px;padding:20px 24px}
${N} .nki-face{width:52px;height:52px}
${N} .nki-person-text{display:block;min-width:0}
${N} .nki-person-name{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
${N} .nki-person-name b{font-weight:var(--nk-weight-semibold)}
${N} .nki-person .nk-row-body{margin-top:2px}
${N} .nki-service{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));box-sizing:border-box;padding-inline:${COL};border-bottom:1px solid var(--color-border)}
${N} .nki-service-media{position:relative;order:1;min-height:480px;overflow:hidden;background:var(--color-surface-elevated)}
${N} .nki-service-media img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
${N} .nki-service[data-flip] .nki-service-media{order:2}
${N} .nki-service-copy{order:2;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:0;padding:var(--nk-space-16) clamp(24px,4vw,64px)}
${N} .nki-service[data-flip] .nki-service-copy{order:1}
${N} .nki-service-copy .nk-seal{margin-bottom:24px}
${N} .nki-service-copy .nk-eyebrow{display:flex;gap:14px}
${N} .nki-n{font-family:var(--font-display);font-weight:var(--nk-weight-semibold);font-size:15px;color:var(--color-accent-strong)}
${N} .nki-service-copy h2{margin:18px 0 0}
${N} .nki-summary{margin:16px 0 0;max-width:480px;font-size:16px;color:var(--color-text-muted)}
${N} .nki-includes{box-sizing:border-box;width:100%;max-width:480px;margin:28px 0 0;padding:0;list-style:none;border-top:1px solid var(--color-border)}
${N} .nki-includes li{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--color-border);font-size:15px}
${N} .nki-includes .nk-glyph{color:var(--color-text-subtle)}
${N} .nki-service-foot{display:flex;flex-wrap:wrap;align-items:center;gap:24px;margin-top:32px}
${N} .nki-service-foot .nk-mono{font-size:15px;color:var(--color-text-muted)}
${N} .nki-index.nk-section{padding-top:var(--nk-space-12)}
${N} .nki-bar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:16px;margin-bottom:32px}
${N} .nki-tabs{display:inline-flex;gap:4px;padding:4px;border-radius:var(--radius-pill);background:var(--color-surface-elevated)}
${N} .nki-tab{min-height:40px;padding:0 18px;border:0;border-radius:var(--radius-pill);background:transparent;color:var(--color-text-muted);font:inherit;font-size:15px;font-weight:var(--nk-weight-medium);cursor:pointer;transition:background var(--nk-motion-fast) var(--nk-ease-out),color var(--nk-motion-fast) var(--nk-ease-out)}
${N} .nki-tab:hover{color:var(--color-text)}
${N} .nki-tab[aria-pressed="true"]{background:var(--color-surface);color:var(--color-text);box-shadow:var(--nk-depth-sm)}
${N} .nki-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}
${N} .nki-figures{grid-template-columns:repeat(2,minmax(0,1fr));column-gap:var(--space-gutter)}
${N} .nki-figures[data-solo]{grid-template-columns:minmax(0,1fr)}
${N} .nki-figures-media{position:relative;min-height:420px;height:100%;border-radius:var(--nk-radius-leaf);overflow:hidden;box-shadow:var(--nk-depth-md)}
${N} .nki-figures-media img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
${N} .nki-figure-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:40px;align-content:center;margin:0;padding:var(--nk-space-16) 0}
${N} .nki-figure-grid dd{margin:0}
@media (max-width:900px){
${N} .nki-story{grid-template-columns:minmax(0,1fr)}
${N} .nki-service{grid-template-columns:minmax(0,1fr)}
${N} .nki-service-media,${N} .nki-service[data-flip] .nki-service-media{order:1;min-height:280px}
${N} .nki-service-copy,${N} .nki-service[data-flip] .nki-service-copy{order:2;padding-inline:0}
${N} .nki-figures{grid-template-columns:minmax(0,1fr)}
${N} .nki-figures-media{min-height:320px}
${N} .nki-figure-grid{padding:0}
}
@media (max-width:700px){
${N} .nki-cards{grid-template-columns:minmax(0,1fr)}
}
`
