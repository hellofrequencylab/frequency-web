// THE NETWORK KIT INNER-PAGE SHEET, pass B (Book, Shop, Resources). Layered after the pass A sheet, so it only ever
// reaches a stand-alone site render under [data-house-theme="network-kit"]: no member, console or admin surface wears
// it. Structure reads the contract tokens (--color-*, --radius-*, --space-*); the kit's own --nk-* are used only for
// decoration (radii of the cards, type scale). No raw colour. The shapes are the design's BookPage, ShopPage and
// ResourcesPage (Network design system, ui_kits/site). The tabs and their bar are pass A's (.nki-bar, .nki-tabs).

const N = '[data-house-theme="network-kit"]'

export const NETWORK_KIT_INNER_B_CSS = `
${N} .nki-catalog.nk-section{padding-top:var(--nk-space-12)}
${N} .nki-search{width:min(100%,280px);min-height:44px}
${N} .nki-tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,250px),1fr));gap:48px 24px}
${N} .nki-cell{min-width:0}
${N} .nki-rows{border-top:1px solid var(--color-border)}
${N} .nki-lib{grid-template-columns:48px 32px minmax(0,1fr) minmax(0,180px) 72px 128px;gap:20px;padding:20px 0}
${N} .nki-lib-n{font-size:14px;color:var(--color-text-subtle)}
${N} .nki-lib-title{font-size:21px;line-height:1.2}
${N} .nki-lib-meta{color:var(--color-text-muted)}
${N} .nki-lib-go{display:flex;justify-content:flex-end}
${N} .nki-book{align-items:start}
${N} .nki-book-lead{margin-top:20px;max-width:480px}
${N} .nki-stepper{display:flex;flex-wrap:wrap;gap:12px 28px;margin:32px 0 0;padding:0;list-style:none}
${N} .nki-stepper li{display:flex;align-items:center;gap:10px;color:var(--color-text-subtle)}
${N} .nki-stepper li[data-first]{color:var(--color-text)}
${N} .nki-stepper span{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;width:24px;height:24px;border:1px solid var(--color-border-strong);border-radius:var(--radius-pill);font-size:13px;letter-spacing:0}
${N} .nki-stepper li[data-first] span{border-color:var(--color-accent)}
${N} .nki-aside{display:flex;flex-direction:column;gap:18px;padding:28px}
${N} .nki-aside-head{display:flex;align-items:center;gap:16px}
${N} .nki-aside-title{font-size:24px;line-height:1.15}
${N} .nki-aside-body{margin:0;font-size:15px;color:var(--color-text-muted)}
${N} .nki-facts{display:flex;flex-direction:column;gap:12px;margin:0;padding:0;list-style:none}
${N} .nki-facts li{display:flex;align-items:center;gap:12px;font-size:15px}
${N} .nki-facts .nk-glyph{flex:none;color:var(--color-text-subtle)}
${N} .nki-policy{margin:0;padding-top:16px;border-top:1px solid var(--color-border);font-size:14px;color:var(--color-text-subtle)}
${N} .nki-aside-foot{display:flex}
@media (max-width:900px){
${N} .nki-lib{grid-template-columns:28px minmax(0,1fr) auto;gap:6px 14px;padding:18px 0}
${N} .nki-lib-n{display:none}
${N} .nki-lib-title{grid-column:2}
${N} .nki-lib-meta{grid-column:2;grid-row:2}
${N} .nki-lib-price{grid-column:3;grid-row:1}
${N} .nki-lib-go{grid-column:2 / -1;justify-content:flex-start;margin-top:8px}
${N} .nki-search{width:100%}
${N} .nki-tabs{max-width:100%;overflow-x:auto}
}
`
