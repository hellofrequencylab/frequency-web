import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { Band, headingComponents } from '@/components/page-editor/blocks/kit'
import { NicheDoor } from '@/components/frequency/site/pages/funnel/niche/niche-door'
import { funnelSlugs, getFunnelConfig } from '@/lib/marketing/funnel-config'

// The shell's effect-only override context has no SSR markup. Keep the actual
// page, cards, samples, labels, links and all remaining child renderers intact.
vi.mock('@/components/frequency/site/shell/site-root', () => ({
  useSite: () => ({ setOverride: () => {} }),
}))

type CssRule = {
  selector: string
  parent: { type: string; name?: string; params?: string }
  nodes: { type: string; prop?: string; value?: string }[]
}
const requireFromHere = createRequire(import.meta.url)
// Resolve the same parser used by the installed canonical PostCSS pipeline.
const requireFromPipeline = createRequire(requireFromHere.resolve('@tailwindcss/postcss'))
const postcss = requireFromPipeline('postcss') as {
  parse: (css: string) => { walkRules: (visit: (rule: CssRule) => void) => void }
}
function rules(file: string) {
  const found: CssRule[] = []
  postcss.parse(readFileSync(file, 'utf8')).walkRules(rule => found.push(rule))
  return found
}
const declares = (rule: CssRule, prop: string, value: string) =>
  rule.nodes.some(node => node.type === 'decl' && node.prop === prop && node.value === value)

describe('Public copy geometry seams', () => {
  it('lets a heading-only continuation band paint glyphs without changing its requested gap', () => {
    const props = {
      ...headingComponents.Heading.defaultProps,
      eyebrow: '', title: 'A heading with descenders: growing together',
      titleAccent: '', kicker: '', tone: 'canvas',
      layout: { spaceTop: 'default', spaceBottom: 'none', visibility: 'all' },
    }
    const html = renderToStaticMarkup(headingComponents.Heading.render(props as never))
    expect(html).toMatch(/<section class="[^"]*\bpb-0\b[^"]*\bpe-heading-band\b/)
    expect(html).toContain('A heading with descenders: growing together')
    const headingRules = rules('app/themes/frequency/site-blocks.css')
      .filter(rule => rule.selector.includes('[data-site-blocks] section.pe-heading-band'))
    expect(headingRules.some(rule => declares(rule, 'overflow', 'visible'))).toBe(true)
  })

  it('preserves the ordinary Band renderer output byte for byte', () => {
    const html = renderToStaticMarkup(<Band tone="surface"><p>Ordinary Band</p></Band>)
    // Captured from the immutable pre-change actual renderer, not a hand-built twin.
    expect(html).toBe('<section class="px-6 py-16 sm:py-20 bg-surface "><div class="max-w-3xl mx-auto "><p>Ordinary Band</p></div></section>')
  })

  it('renders all actual niche step cards inside the grid that owns the mobile containment rule', () => {
    expect(funnelSlugs()).toHaveLength(6)
    for (const slug of funnelSlugs()) {
      const config = getFunnelConfig(slug)!
      const html = renderToStaticMarkup(<NicheDoor config={config} week={[]} />)
      const section = html.match(/<section[^>]*id="how-it-works"[\s\S]*?<\/section>/)?.[0]
      expect(section, slug).toBeTruthy()
      expect(section!.match(/class="pc nk-step"/g), slug).toHaveLength(3)
      expect(section, slug).toContain('class="g3"')
    }
  })

  it('gives the mobile grid a zero intrinsic track floor while retaining three desktop columns', () => {
    const css = rules('app/themes/frequency/site-niche.css')
    const grid = css.filter(rule => rule.selector.endsWith('#how-it-works .g3'))
    expect(grid.some(rule => rule.parent.type !== 'atrule' && declares(rule, 'grid-template-columns', 'repeat(3,minmax(0,1fr))'))).toBe(true)
    expect(grid.some(rule => rule.parent.type === 'atrule' && rule.parent.name === 'media' &&
      rule.parent.params === '(max-width:860px)' && declares(rule, 'grid-template-columns', 'minmax(0,1fr)'))).toBe(true)
    expect(css.some(rule => rule.selector.endsWith('#how-it-works .g3>.pop') && declares(rule, 'min-width', '0'))).toBe(true)
  })
})
