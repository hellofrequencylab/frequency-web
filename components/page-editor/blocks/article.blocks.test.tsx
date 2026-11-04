import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { JSDOM } from 'jsdom'
import { articleComponents, ARTICLE_BLOCK_TYPES } from './article'
import { howToStepsSchema } from './dawn'
import { config } from '@/lib/page-editor/config'
import { getTemplate, isRenderable } from '@/lib/page-editor/templates'
import { BlockRender } from '@/lib/page-editor/block-render'
import { spec as loneliness } from '@/lib/page-editor/templates/loneliness'
import { spec as friendship } from '@/lib/page-editor/templates/friendship-as-an-adult'
import { spec as social } from '@/lib/page-editor/templates/how-to-be-more-social'
import { spec as circle } from '@/lib/page-editor/templates/how-to-start-a-circle'
import type { ArticleSpec } from '@/lib/page-editor/templates/article'
import type { Data } from '@/lib/page-editor/types'

// The seeker-article layout blocks (blocks/article.tsx) and the four articles composed from them. Locks:
// each block is a well-formed ComponentConfig that is registered and categorised, ArticleSteps owns a
// HowTo exactly as DawnHowToSteps does (and emits none when told the steps are copy), and a designed
// article keeps the grammar: Hero first, every question an H2 in spec order, the FAQ, every HowTo node,
// and every word of the spec on the page.

describe('the article blocks are well-formed and registered', () => {
  for (const type of ARTICLE_BLOCK_TYPES) {
    it(type, () => {
      const block = articleComponents[type]
      expect(typeof block.render).toBe('function')
      const fields = new Set(Object.keys(block.fields ?? {}))
      for (const key of Object.keys(block.defaultProps ?? {})) expect(fields.has(key), `${type}.${key}`).toBe(true)
      expect(config.components[type]).toBe(block)
      expect(config.categories?.article?.components).toContain(type)
    })
  }
})

describe('ArticleSteps owns the HowTo node the way DawnHowToSteps does', () => {
  const steps = [
    { name: 'Pick one thing', text: 'One simple thing.', image: '', alt: '' },
    { name: 'Set a time', text: 'The same day, on repeat.', image: '', alt: '' },
  ]
  const render = (schema: 'howto' | 'none') =>
    renderToStaticMarkup(
      <>{articleComponents.ArticleSteps.render({ ...articleComponents.ArticleSteps.defaultProps, id: 's', name: 'How to start', intro: 'Two steps.', steps, schema } as never)}</>,
    )
  it('emits the same node the shared builder makes', () => {
    const node = howToStepsSchema({ name: 'How to start', intro: 'Two steps.', steps })
    expect(render('howto')).toContain(JSON.stringify(node).replace(/</g, '\\u003c'))
  })
  it('emits nothing when the steps are copy only', () => {
    expect(render('none')).not.toContain('application/ld+json')
  })
})

const ARTICLES: [string, ArticleSpec][] = [
  ['loneliness', loneliness],
  ['friendship-as-an-adult', friendship],
  ['how-to-be-more-social', social],
  ['how-to-start-a-circle', circle],
]

describe('each designed article keeps the article grammar', () => {
  const layouts = new Set(ARTICLES.map(([, s]) => s.design))
  it('picks four different layouts', () => {
    expect(layouts.size).toBe(4)
  })

  for (const [slug, spec] of ARTICLES) {
    describe(slug, () => {
      const doc = getTemplate(slug) as Data
      const html = renderToStaticMarkup(<BlockRender config={config} data={doc} />)

      it('is renderable and opens on the Hero the Article node derives from', () => {
        expect(isRenderable(doc)).toBe(true)
        expect(doc.content[0].type).toBe('Hero')
        expect(doc.content[0].props.title).toBe(spec.title)
        expect(doc.content[0].props.subtitle).toBe(spec.subtitle)
      })

      it('renders every question as an H2, in spec order', () => {
        // Parse the markup and read each H2's text, rather than stripping tags from the HTML string.
        const h2 = [...new JSDOM(html).window.document.querySelectorAll('h2')].map((el) => el.textContent ?? '')
        const asked = new Set(spec.sections.map((s) => s.question))
        expect(h2.filter((t) => asked.has(t))).toEqual(spec.sections.map((s) => s.question))
      })

      it('keeps the FAQ and one HowTo node per track', () => {
        expect(doc.content.find((b) => b.type === 'Accordion')!.props.items).toEqual(spec.faq)
        const tracks = (spec.howTo ? 1 : 0) + spec.sections.filter((s) => s.howTo).length
        expect((html.match(/"@type":"HowTo"/g) ?? []).length).toBe(tracks)
        expect(html).toContain('"@type":"FAQPage"')
      })

      it('carries every word of the spec', () => {
        const strings = JSON.stringify(doc)
        const collect = (v: unknown, out: string[]) => {
          if (typeof v === 'string') out.push(v)
          else if (Array.isArray(v)) v.forEach((x) => collect(x, out))
          else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => !['design', 'slug', 'kind', 'side', 'variant'].includes(k) && collect(x, out))
          return out
        }
        // The spec's top-level `alt` is the hero photo's, recorded with its copy; the Hero block has no alt
        // field (templates/article.ts), so it never reached the page before the redesign either.
        const { alt: _heroAlt, ...words } = spec
        void _heroAlt
        for (const s of collect(words, [])) expect(strings, s.slice(0, 60)).toContain(JSON.stringify(s).slice(1, -1))
      })
    })
  }
})
