// The DAWN front door's modules (ADR-1737, PERF-004). app/page.tsx's DAWN branch reads these through
// ./active. A build wearing DAWN points ./active here, so only that build's graph holds the block
// library, the marketing header and the marketing footer.
export { BlockRender } from '@/lib/page-editor/block-render'
export { BlockDocJsonLd } from '@/lib/page-editor/block-seo'
export { config } from '@/lib/page-editor/config'
export { getPublishedData } from '@/lib/page-editor/data'
export { getTemplate, isWellFormed } from '@/lib/page-editor/templates'
export { MarketingHeader } from '@/components/layout/marketing-header'
export { MarketingFooter } from '@/components/layout/marketing-footer'
export { getMenu, getMenuSettings } from '@/lib/menus/read'
