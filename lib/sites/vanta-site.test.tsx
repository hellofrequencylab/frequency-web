import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { servicesBlocks } from '@/components/page-editor/blocks/services'
import { validWebsiteSnapshot } from '@/lib/sites/editor/state'
import { readSiteStyle } from '@/lib/theme/site-style'
import { VANTA_ACCENT, VANTA_FOOTER, VANTA_MENU, vantaEditorState, vantaSitePages } from './vanta-site'

describe('the Vanta site (Services theme, the Vanta design system content)', () => {
  const state = vantaEditorState('2026-11-03T00:00:00.000Z')

  it('is a valid website that wears Services with the Tide accent', () => {
    expect(validWebsiteSnapshot(state.draft)).toBe(true)
    expect(state.draft.theme).toBe('Services')
    expect(state.draft.brand?.accent).toBe(VANTA_ACCENT)
    expect(state.published).toEqual(state.draft)
  })

  it('has the design record pages and only registered Services blocks', () => {
    expect(vantaSitePages().map((p) => p.slug)).toEqual(['home', 'services', 'about', 'quote'])
    for (const p of vantaSitePages()) for (const blk of p.blocks) expect(Object.keys(servicesBlocks), `${p.slug} ${blk.type}`).toContain(blk.type)
  })

  it('follows the content rules: no prices, no exclamation marks, no em dashes', () => {
    const all = JSON.stringify([vantaSitePages(), VANTA_FOOTER, VANTA_MENU])
    expect(all).not.toContain('!')
    expect(all).not.toContain('—')
    expect(all).not.toMatch(/\$\d/)
  })

  it('every menu and footer target is a page that exists', () => {
    const slugs = new Set(vantaSitePages().map((p) => p.slug))
    const ids = new Set(vantaSitePages().find((p) => p.slug === 'home')!.blocks.map((b) => b.type))
    for (const m of VANTA_MENU.items) {
      if (m.target.kind === 'auto') expect(slugs.has(m.target.key.replace('page:', ''))).toBe(true)
      // A section of Home: the block that carries that section id is on Home (ServicesSteps is #process, ServicesFaq is #faq).
      else expect(ids.has(m.target.href === '/#process' ? 'ServicesSteps' : m.target.href === '/#faq' ? 'ServicesFaq' : '')).toBe(true)
    }
    for (const c of VANTA_FOOTER.columns) for (const l of c.links) if (l.href.startsWith('/')) expect(slugs.has(l.href.slice(1))).toBe(true)
  })

  it('reads back as the services theme from the Space preferences the seed writes', () => {
    expect(readSiteStyle({ siteStyle: { theme: 'services', synced: true, spaceFonts: 'modern' } }).theme).toBe('services')
  })

  it('draws every page without an empty box or a stray undefined', () => {
    const links = { origin: 'https://govanta.pro', slug: 'vanta', siteBase: '', pages: ['home', 'services', 'about', 'quote'], contactHref: '/quote', bookHref: '/quote', email: null }
    for (const p of vantaSitePages()) for (const blk of p.blocks) {
      const c = servicesBlocks[blk.type]
      const html = renderToStaticMarkup(<>{(c.render as (x: Record<string, unknown>) => React.ReactNode)({ ...c.defaultProps, ...blk.props, puck: { metadata: { links } } })}</>)
      expect(html.length, `${p.slug} ${blk.type}`).toBeGreaterThan(60)
      expect(html, `${p.slug} ${blk.type}`).not.toContain('undefined')
    }
  })
})
