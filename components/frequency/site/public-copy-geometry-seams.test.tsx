import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'
import { Band, DisplayHeading, Eyebrow, Kicker, headingComponents } from '@/components/page-editor/blocks/kit'
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
  it('selects actual heading-only bands without changing their renderer or zero-gap rhythm', () => {
    const headingRules = rules('app/themes/frequency/site-blocks.css')
      .filter(rule => rule.selector.includes('section:has(> div.mx-auto:only-child'))
    expect(headingRules).toHaveLength(1)
    expect(declares(headingRules[0], 'overflow', 'visible')).toBe(true)
    const selector = headingRules[0].selector
    const scope = (html: string) => new JSDOM(`<div data-design="frequency"><main data-kit="site"><div data-site-blocks>${html}</div></main></div>`).window.document
    for (const eyebrow of ['', 'An invitation']) for (const kicker of ['', 'Choose a place to begin.']) {
      const props = {
        ...headingComponents.Heading.defaultProps,
        eyebrow, title: 'A heading with descenders: growing together', titleAccent: '', kicker, tone: 'canvas',
        layout: { spaceTop: 'default', spaceBottom: 'none', visibility: 'all' },
      }
      const html = renderToStaticMarkup(headingComponents.Heading.render(props as never))
      expect(html).toMatch(/<section class="[^"]*\bpb-0\b/)
      expect(html).not.toContain('pe-heading-band')
      expect(scope(html).querySelector(selector)).not.toBeNull()
    }
    for (const as of ['h1', 'h2', 'h3'] as const) {
      const html = renderToStaticMarkup(<Band><Eyebrow>Look here</Eyebrow><DisplayHeading as={as}>Growing together</DisplayHeading><Kicker>At your own pace.</Kicker></Band>)
      expect(scope(html).querySelector(selector)).not.toBeNull()
    }
    const ordinary = [
      <Band key="body"><p>Ordinary body copy.</p></Band>,
      <Band key="paragraph"><DisplayHeading>Content heading</DisplayHeading><p>Ordinary body paragraph.</p></Band>,
      // Native media is intentional: this control checks exclusion from the CSS selector.
      // eslint-disable-next-line @next/next/no-img-element
      <Band key="media"><DisplayHeading>Media heading</DisplayHeading><img src="/example.png" alt="A place" /></Band>,
      <Band key="nested"><div><DisplayHeading>Nested card heading</DisplayHeading></div></Band>,
      <Band key="artwork"><DisplayHeading>Heading with artwork</DisplayHeading><Kicker><svg aria-hidden="true" />An illustrated kicker.</Kicker></Band>,
    ]
    for (const block of ordinary) expect(scope(renderToStaticMarkup(block)).querySelector(selector)).toBeNull()
    const multipleWrappers = '<section><div class="mx-auto"><h2 class="font-display">One heading</h2></div><div class="mx-auto"><h2 class="font-display">Another heading</h2></div></section>'
    expect(scope(multipleWrappers).querySelector(selector)).toBeNull()
    const outsideScope = new JSDOM(renderToStaticMarkup(<Band><DisplayHeading>Other theme</DisplayHeading></Band>)).window.document
    expect(outsideScope.querySelector(selector)).toBeNull()
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
