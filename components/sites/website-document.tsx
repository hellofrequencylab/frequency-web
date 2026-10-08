import type { ReactNode, CSSProperties } from 'react'
import type { Config, Data, Metadata } from '@/lib/page-editor/types'
import { BlockRender } from '@/lib/page-editor/block-render'
import { planMensworkPage } from '@/lib/sites/menswork-page'
import type { MwLive } from '@/lib/sites/menswork-data'
import type { SiteLinkMap } from '@/lib/sites/house-theme'
import type { WebsiteTheme } from '@/lib/sites/editor/state'
import { safeDataAttributes } from '@/lib/sites/editor/layout'
import { MensworkPage } from './menswork-page'

// Shared by the website and its editor iframe. The renderer never imports editor
// UI, history, actions, or collaboration code. Editing wraps the SAME section tree.
export function WebsiteDocument({ doc, theme, config, metadata, live, links, origin, title, wrapSection }: {
  doc: Data; theme: WebsiteTheme; config: Config; metadata?: Metadata
  live: MwLive; links: SiteLinkMap; origin: string; title: string
  wrapSection?: (node: ReactNode, indexes: number[]) => ReactNode
}) {
  const wrap = (node: ReactNode, indexes: number[]) => {
    const id = doc.content[indexes[0]]?.props.id ?? String(indexes[0])
    const layout = doc.root.props?.websiteLayout?.[id] ?? {}
    const vars: Record<string, string> = {}
    let customRules = ''
    const sectionClass = `site-layout-${indexes[0]}`
    for (const d of ['desktop', 'tablet', 'phone'] as const) {
      const v = { ...layout.desktop, ...(d === 'desktop' ? {} : layout[d]) }
      vars[`--site-pad-${d}`] = typeof v.padding === 'number' ? `${Math.min(160, Math.max(0, v.padding))}px` : '0px'
      vars[`--site-display-${d}`] = v.hidden === true ? 'none' : 'block'
      if (typeof v.gap === 'number') vars[`--site-gap-${d}`] = `${Math.min(96, Math.max(0, v.gap))}px`
      if (typeof v.columns === 'number') vars[`--site-columns-${d}`] = String(Math.min(4, Math.max(1, v.columns)))
      if (typeof v.textSize === 'number' && v.textSize > 0) vars[`--site-text-size-${d}`] = `${Math.min(120, v.textSize)}px`
      const grid = [typeof v.gap === 'number' ? `gap:${Math.min(96, Math.max(0, v.gap))}px` : '', typeof v.columns === 'number' ? `grid-template-columns:repeat(${Math.min(4, Math.max(1, v.columns))},minmax(0,1fr))` : ''].filter(Boolean).join(';')
      const heading = typeof v.textSize === 'number' && v.textSize > 0 ? `.${sectionClass}.${sectionClass} :is(h1,h2){font-size:${Math.min(120, v.textSize)}px}` : ''
      const align = ['left', 'center', 'right'].includes(v.align) ? `.${sectionClass}{text-align:${v.align}}` : ''
      let placements = ''
      if (d === 'phone') {
        for (const path of Object.keys(layout.desktop?.placements ?? {})) {
          if (!/^\d+(?:\.\d+)*$/.test(path)) continue
          const indexes = path.split('.').map(Number)
          const selector = `.${sectionClass}${indexes.map((n) => `>:nth-child(${n + 1})`).join('')}`
          const parent = `.${sectionClass}${indexes.slice(0, -1).map((n) => `>:nth-child(${n + 1})`).join('')}`
          placements += `${parent}{grid-template-columns:minmax(0,1fr)}${selector}{grid-column:auto;grid-row:auto}`
        }
      }
      for (const [path, raw] of Object.entries((d === 'phone' ? layout.phone?.placements : v.placements) ?? {})) {
        if (!/^\d+(?:\.\d+)*$/.test(path)) continue
        const placement = raw as { column: number; span: number; row: number }
        const indexes = path.split('.').map(Number)
        const selector = `.${sectionClass}${indexes.map((n) => `>:nth-child(${n + 1})`).join('')}`
        const parent = `.${sectionClass}${indexes.slice(0, -1).map((n) => `>:nth-child(${n + 1})`).join('')}`
        const column = Math.min(12, Math.max(1, Number(placement.column) || 1)), span = Math.min(13 - column, Math.max(1, Number(placement.span) || 1)), row = Math.min(100, Math.max(1, Number(placement.row) || 1))
        placements += `${parent}{display:grid;grid-template-columns:repeat(12,minmax(0,1fr))}${selector}{grid-column:${column}/span ${span};grid-row:${row}}`
      }
      const rules = `.${sectionClass}.${sectionClass} :is(.mw-story,.mw-hero-inner,.mw-head,.mw-grid,.mw-photos,.mw-lists){${grid}}${heading}${align}${placements}`
      customRules += d === 'desktop' ? rules : `@media(max-width:${d === 'tablet' ? 1024 : 600}px){${rules}}`
    }
    const custom = typeof layout.desktop?.className === 'string' ? layout.desktop.className.replace(/[^a-zA-Z0-9_ -]/g, '') : ''
    const animation = ['fade', 'rise'].includes(layout.desktop?.animation) ? layout.desktop.animation : 'none'
    const section = <div key={id} className={`site-doc-section ${sectionClass} ${custom}`} data-site-animation={animation} {...safeDataAttributes(layout.desktop?.attributes)} style={vars as CSSProperties}><style>{customRules}</style>{node}</div>
    return wrapSection ? wrapSection(section, indexes) : section
  }
  return <>
    <style>{`.site-doc-section{display:var(--site-display-desktop);padding-block:var(--site-pad-desktop)}
      @media(max-width:1024px){.site-doc-section{display:var(--site-display-tablet);padding-block:var(--site-pad-tablet)}}
      @media(max-width:600px){.site-doc-section{display:var(--site-display-phone);padding-block:var(--site-pad-phone)}}
      @supports(animation-timeline:view()){.site-doc-section[data-site-animation=fade]{animation:site-fade linear both;animation-timeline:view();animation-range:entry 0% entry 100%}.site-doc-section[data-site-animation=rise]{animation:site-rise linear both;animation-timeline:view();animation-range:entry 0% entry 100%}}
      @keyframes site-fade{from{opacity:0}to{opacity:1}}@keyframes site-rise{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
      @media(prefers-reduced-motion:reduce){.site-doc-section[data-site-animation]{animation:none}}`}</style>
    {theme === 'Menswork' ? <MensworkPage blocks={doc.content} plan={planMensworkPage(doc.content)} live={live} links={links} origin={origin} pageTitle={title}
      renderOther={(block) => <BlockRender config={config} data={{ root: {}, content: [block] }} metadata={metadata} isEditing={!!wrapSection} />}
      wrapSection={wrap} /> : doc.content.map((block, i) => wrap(<BlockRender config={config} data={{ root: {}, content: [block] }} metadata={metadata} isEditing={!!wrapSection} />, [i]))}
  </>
}
