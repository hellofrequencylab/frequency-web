import type { ReactNode, CSSProperties } from 'react'
import type { Config, Data, Metadata, ContentItem } from '@/lib/page-editor/types'
import { BlockRender } from '@/lib/page-editor/block-render'
import { planMensworkPage } from '@/lib/sites/menswork-page'
import type { MwLive } from '@/lib/sites/menswork-data'
import { siteLocalHref, type SiteLinkMap } from '@/lib/sites/house-theme'
import type { WebsiteTheme } from '@/lib/sites/editor/state'
import { normalizeWebsiteFields } from '@/lib/sites/website-fields'
import { safeDataAttributes } from '@/lib/sites/editor/layout'
import { MensworkPage } from './menswork-page'

// Shared by the website and its editor iframe. The renderer never imports editor
// UI, history, actions, or collaboration code. Editing wraps the SAME section tree.
export function WebsiteDocument({ doc, theme, config, metadata, live, links, origin, title, wrapSection }: {
  doc: Data; theme: WebsiteTheme; config: Config; metadata?: Metadata
  live: MwLive; links: SiteLinkMap; origin: string; title: string
  wrapSection?: (node: ReactNode, indexes: number[]) => ReactNode
}) {
  // SpaceFAQ is a live block: resolve its rows at render time so fresh Space
  // questions appear in both the website and canvas without entering the draft.
  function resolveBlock(block: ContentItem, depth = 0): ContentItem {
    if (depth > 20) return block
    const props = { ...normalizeWebsiteFields(block).props }
    for (const [key, field] of Object.entries(config.components[block.type]?.fields ?? {})) {
      if (field.type === 'slot' && Array.isArray(props[key])) props[key] = props[key].map((child: ContentItem) => resolveBlock(child, depth + 1))
    }
    if (block.type === 'FeatureGrid' && typeof props.id === 'string' && ['offerings', 'events', 'memberships', 'tickets'].includes(String(props.source))) {
      const featureMap = metadata?.websiteFeatures ?? {}
      const hasSourceAlias = ['offerings', 'events', 'memberships', 'tickets'].some((source) => Object.prototype.hasOwnProperty.call(featureMap, JSON.stringify([source, props.id])))
      const features = featureMap[JSON.stringify([props.source, props.id])] ?? (hasSourceAlias ? [] : featureMap[props.id])
      if (Array.isArray(features)) props.items = features.map((item: { href?: string }) => ({ ...item, href: siteLocalHref(item.href, links)?.href ?? '' }))
    }
    if (block.type === 'SpaceFAQ') {
      const faqs = Array.isArray(props.faqs) && props.faqs.length > 0 ? props.faqs
        : Array.isArray(props.items) && props.items.length > 0 ? props.items
        : Array.isArray(metadata?.space?.faqs) ? metadata.space.faqs : props.faqs
      props.title = props.title || props.heading
      if (faqs) props.faqs = faqs
    }
    return { ...block, props }
  }
  const blocks = doc.content.map((block) => resolveBlock(block))
  const wrap = (node: ReactNode, indexes: number[]) => {
    const id = doc.content[indexes[0]]?.props.id ?? String(indexes[0])
    const layout = doc.root.props?.websiteLayout?.[id] ?? {}
    const vars: Record<string, string> = {}
    let customRules = ''
    const sectionClass = `site-layout-${indexes[0]}`
    for (const d of ['desktop', 'tablet', 'phone'] as const) {
      const v = { ...layout.desktop, ...(d === 'desktop' ? {} : layout[d]), ...(d === 'phone' && typeof layout.desktop?.columns === 'number' ? { columns: layout.phone?.columns ?? 1 } : {}) }
      vars[`--site-pad-${d}`] = typeof v.padding === 'number' ? `${Math.min(160, Math.max(0, v.padding))}px` : '0px'
      vars[`--site-display-${d}`] = v.hidden === true && !wrapSection ? 'none' : 'block'
      if (typeof v.gap === 'number') vars[`--site-gap-${d}`] = `${Math.min(96, Math.max(0, v.gap))}px`
      if (typeof v.columns === 'number') vars[`--site-columns-${d}`] = String(Math.min(4, Math.max(1, v.columns)))
      if (typeof v.textSize === 'number' && v.textSize > 0) vars[`--site-text-size-${d}`] = `${Math.min(120, v.textSize)}px`
      const grid = [typeof v.gap === 'number' ? `gap:${Math.min(96, Math.max(0, v.gap))}px` : '', typeof v.columns === 'number' ? `grid-template-columns:repeat(${Math.min(4, Math.max(1, v.columns))},minmax(0,1fr))` : ''].filter(Boolean).join(';')
      const textFont = ['display', 'body', 'mono'].includes(v.textFont ?? '') ? `.${sectionClass}.${sectionClass} :is(h1,h2,h3,h4,h5,h6){font-family:var(--th-${v.textFont}-render)!important}` : ''
      const bodyType = `${['display', 'body', 'mono'].includes(v.bodyFont ?? '') ? `font-family:var(--th-${v.bodyFont}-render)!important;` : ''}${typeof v.bodySize === 'number' && v.bodySize > 0 ? `font-size:${Math.min(120, v.bodySize)}px!important;` : ''}`
      const bodyRules = bodyType ? `.${sectionClass}.${sectionClass} :is(p,blockquote,li,a,button,dt,dd,label,summary,figcaption,small,.mw-kicker,.mw-label){${bodyType}}` : ''
      const stacking = v.columns === 1 ? `.${sectionClass}.${sectionClass} :is(.mw-story,.grid)>*{order:initial!important;grid-column:auto;grid-row:auto}` : ''
      const heading = typeof v.textSize === 'number' && v.textSize > 0 ? `.${sectionClass}.${sectionClass} :is(h1,h2,h3,h4,h5,h6){font-size:${Math.min(120, v.textSize)}px!important}` : ''
      const align = ['left', 'center', 'right'].includes(v.align) ? `.${sectionClass}{text-align:${v.align}}` : ''
      const motion = `.${sectionClass}{animation-name:${v.animation === 'fade' ? 'site-fade' : v.animation === 'rise' ? 'site-rise' : 'none'}}`
      let placements = ''
      if (d === 'phone') {
        for (const path of new Set([...Object.keys(layout.desktop?.placements ?? {}), ...Object.keys(layout.tablet?.placements ?? {})])) {
          if (!/^\d+(?:\.\d+)*$/.test(path)) continue
          const indexes = path.split('.').map(Number)
          const selector = `.${sectionClass}${indexes.map((n) => `>:nth-child(${n + 1})`).join('')}`
          const parent = `.${sectionClass}${indexes.slice(0, -1).map((n) => `>:nth-child(${n + 1})`).join('')}`
          placements += `${parent}{grid-template-columns:minmax(0,1fr)}${selector}{grid-column:auto;grid-row:auto;height:auto;min-height:0}${selector}:is(p,h1,h2,h3,h4,h5,h6,li,blockquote),${selector}:has(p,h1,h2,h3,h4,h5,h6,li,blockquote),${selector}:not(img,video,picture):not(:has(img,video,picture)){height:auto;min-height:0}${selector}>img,${selector}>picture,${selector}>picture>img{height:auto}`
        }
      }
      for (const [path, raw] of Object.entries((d === 'phone' ? layout.phone?.placements : v.placements) ?? {})) {
        if (!/^\d+(?:\.\d+)*$/.test(path)) continue
        const placement = raw as { column: number; span: number; row: number; height?: number }
        const indexes = path.split('.').map(Number)
        const selector = `.${sectionClass}${indexes.map((n) => `>:nth-child(${n + 1})`).join('')}`
        const parent = `.${sectionClass}${indexes.slice(0, -1).map((n) => `>:nth-child(${n + 1})`).join('')}`
        const column = Math.min(12, Math.max(1, Number(placement.column) || 1)), span = Math.min(13 - column, Math.max(1, Number(placement.span) || 1)), row = Math.min(100, Math.max(1, Number(placement.row) || 1))
        const height = typeof placement.height === 'number' && Number.isFinite(placement.height) ? `height:${Math.min(1600, Math.max(40, placement.height))}px;min-height:0` : ''
        placements += `${parent}{display:grid;grid-template-columns:repeat(12,minmax(0,1fr))}${selector}{grid-column:${column}/span ${span};grid-row:${row};${height}}${height ? `${selector}:is(p,h1,h2,h3,h4,h5,h6,li,blockquote),${selector}:has(p,h1,h2,h3,h4,h5,h6,li,blockquote),${selector}:not(img,video,picture):not(:has(img,video,picture)){height:auto;min-height:${Math.min(1600, Math.max(40, placement.height!))}px}${selector}>img,${selector}>picture,${selector}>picture>img{height:100%;width:100%;object-fit:cover}` : ''}`
      }
      const rules = `.${sectionClass}.${sectionClass} :is(.mw-story,.mw-hero-inner,.mw-head,.mw-grid,.mw-photos,.mw-lists,.hs-split,.hs-hero-grid,.hs-steps,.hs-facts,.hs-stats-grid,.hs-cards,.hs-band-grid,.grid){${grid}}${heading}${textFont}${bodyRules}${align}${stacking}${placements}${motion}`
      customRules += d === 'desktop' ? rules : `@media(max-width:${d === 'tablet' ? 1024 : 600}px){${rules}}`
    }
    const custom = typeof layout.desktop?.className === 'string' ? layout.desktop.className.replace(/[^a-zA-Z0-9_ -]/g, '') : ''
    const animation = ['fade', 'rise'].includes(layout.desktop?.animation) ? layout.desktop.animation : 'none'
    const contentKey = `${id}:${JSON.stringify(indexes.map((index) => doc.content[index]))}`
    const section = <div key={contentKey} className={`site-doc-section ${sectionClass} ${custom}`} data-site-animation={animation} {...safeDataAttributes(layout.desktop?.attributes)} style={vars as CSSProperties}><style>{customRules}</style>{node}</div>
    return wrapSection ? wrapSection(section, indexes) : section
  }
  return <>
    <style>{`.site-doc-section{display:var(--site-display-desktop);padding-block:var(--site-pad-desktop)}
      @media(max-width:1024px){.site-doc-section{display:var(--site-display-tablet);padding-block:var(--site-pad-tablet)}}
      @media(max-width:600px){.site-doc-section{display:var(--site-display-phone);padding-block:var(--site-pad-phone)}}
      @supports(animation-timeline:view()){.site-doc-section{animation-duration:1s;animation-timing-function:linear;animation-fill-mode:both;animation-timeline:view();animation-range:entry 0% entry 100%}}
      @keyframes site-fade{from{opacity:0}to{opacity:1}}@keyframes site-rise{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
      @media(prefers-reduced-motion:reduce){.site-doc-section[data-site-animation]{animation:none!important}}`}</style>
    {theme === 'Menswork' ? <MensworkPage blocks={blocks} plan={planMensworkPage(blocks)} live={live} links={links} origin={origin} pageTitle={title}
      renderOther={(block) => <BlockRender config={config} data={{ root: {}, content: [block] }} metadata={metadata} isEditing={!!wrapSection} />}
      wrapSection={wrap} /> : blocks.map((block, i) => wrap(<BlockRender config={config} data={{ root: {}, content: [block] }} metadata={metadata} isEditing={!!wrapSection} />, [i]))}
  </>
}
