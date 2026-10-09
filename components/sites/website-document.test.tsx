import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { WebsiteTheme } from '@/lib/sites/editor/state'
import type { Data } from '@/lib/page-editor/types'
import { WebsiteDocument } from './website-document'

vi.mock('@/lib/page-editor/block-render', () => ({ BlockRender: ({ data }: { data: Data }) => <div>{data.content.map((block) => <div key={block.props.id}>{block.props.lead && <p>{block.props.lead}</p>}{(block.props.items ?? []).map((item: { title: string; href?: string }) => <a key={item.title} href={item.href}>{item.title}</a>)}</div>)}</div> }))
const live = { events: [], circles: [], journeys: [] }
const links = { origin: 'https://frequency.example', slug: 'hearts', siteBase: '', pages: ['home'], contactHref: null, bookHref: null, email: null }
const faqDoc = (props: Record<string, unknown> = {}): Data => ({ root: {}, content: [{ type: 'SpaceFAQ', props: { id: 'faq', heading: 'Real questions', ...props } }] })
const metadata = { space: { faqs: [{ id: 'question', question: 'Can I come alone?', answer: 'Yes, you can.' }] } }
const render = (doc: Data, editing = false, extraMetadata = {}, theme: WebsiteTheme = 'Menswork') => renderToStaticMarkup(<WebsiteDocument doc={doc} theme={theme} config={{ components: {} }} live={live} links={links} origin={links.origin} title="Home" metadata={{ ...metadata, ...extraMetadata }} wrapSection={editing ? (node) => node : undefined} />)

describe('shared website document live FAQs', () => {
  it('renders current Space questions in public and editor without copying live data into draft', () => {
    const doc = faqDoc()
    const original = structuredClone(doc)
    for (const editing of [false, true]) {
      const html = render(doc, editing)
      expect(html).toContain('Real questions')
      expect(html).toContain('Can I come alone?')
      expect(html).toContain('Yes, you can.')
    }
    expect(doc).toEqual(original)
    expect(doc.content[0].props.faqs).toBeUndefined()
  })
  it('preserves explicit owner-authored FAQ items', () => {
    const html = render(faqDoc({ faqs: [], items: [{ q: 'Custom question', a: 'Custom answer' }] }))
    expect(html).toContain('Custom question')
    expect(html).not.toContain('Can I come alone?')
  })
})

describe('shared website live features', () => {
  it('uses fresh Space feature rows across themes while preserving authored draft cards', () => {
    const doc: Data = { root: {}, content: [{ type: 'FeatureGrid', props: { id: 'offerings', source: 'offerings', items: [{ title: 'Authored draft card' }] } }] }
    const original = structuredClone(doc)
    const websiteFeatures = { offerings: [{ title: 'Real retreat', href: '/spaces/hearts' }] }
    for (const theme of ['Menswork', 'DAWN', 'Midnight'] as const) {
      const html = render(doc, false, { websiteFeatures }, theme)
      expect(html).toContain('Real retreat')
      expect(html).not.toContain('Authored draft card')
      expect(html).toContain('href="/"')
    }
    expect(doc).toEqual(original)
    expect(render(doc)).toContain('Authored draft card')
  })
  it('separates matching block IDs with different live sources and leaves custom cards alone', () => {
    const websiteFeatures = { same: [{ title: 'Wrong source' }], '["events","same"]': [{ title: 'Actual event' }] }
    const sourced: Data = { root: {}, content: [{ type: 'FeatureGrid', props: { id: 'same', source: 'events', items: [] } }] }
    expect(render(sourced, false, { websiteFeatures })).toContain('Actual event')
    expect(render(sourced, false, { websiteFeatures })).not.toContain('Wrong source')
    const changingSource = { same: [{ title: 'Old offering' }], '["offerings","same"]': [{ title: 'Old offering' }] }
    expect(render(sourced, false, { websiteFeatures: changingSource })).not.toContain('Old offering')
    const custom: Data = { root: {}, content: [{ type: 'FeatureGrid', props: { id: 'same', source: 'custom', items: [{ title: 'Owner card' }] } }] }
    expect(render(custom, false, { websiteFeatures })).toContain('Owner card')
    expect(render(custom, false, { websiteFeatures })).not.toContain('Wrong source')
  })

})

describe('Menswork rich text render continuity', () => {
  it('keeps inline formatting in the shared website and editor section render', () => {
    const doc: Data = { root: {}, content: [{ type: 'DisplayHeading', props: { id: 'heading', title: '**Stand together** with _courage_' } }, { type: 'Prose', props: { id: 'body', text: 'A **strong** and _honest_ introduction.' } }] }
    for (const editing of [false, true]) {
      const html = render(doc, editing)
      expect(html).toContain('<strong>Stand together</strong>')
      expect(html).toContain('<em>courage</em>')
      expect(html).toContain('<strong>strong</strong>')
      expect(html).toContain('<em>honest</em>')
    }
  })
})

describe('theme-independent authored editorial copy', () => {
  it('renders legacy editorial body copy in every theme without altering its source', () => {
    const doc: Data = { root: {}, content: [{ type: 'EditorialSection', props: { id: 'intro', title: 'Our story', body: 'Actual authored introduction.' } }] }
    const original = structuredClone(doc)
    for (const theme of ['Menswork', 'DAWN', 'Midnight'] as const) expect(render(doc, false, {}, theme)).toContain('Actual authored introduction.')
    expect(doc).toEqual(original)
  })
})

 it('renders persisted photo order and stacked typography without losing authored story', () => {
   const doc: Data = { root: { props: { websiteLayout: { story: { desktop: { columns: 1, bodySize: 24, bodyFont: 'body', textFont: 'display' } } } } }, content: [{ type: 'Zigzag', props: { id: 'story', title: 'Story', lead: 'Actual story', image: '/original.jpg', mediaSide: 'right' } }] }
   const html = render(doc)
   expect(html).toContain('mw-story-right')
   expect(html).toContain('Actual story')
   expect(html).toContain('grid-template-columns:repeat(1,minmax(0,1fr))')
   expect(html).toContain('order:initial!important')
   expect(html).toContain('font-size:24px!important')
   expect(html).toContain('font-family:var(--th-body-render)!important')
 })

 it('gives authored responsive heading sizes precedence over theme heading rules in every theme', () => {
   const doc: Data = { root: { props: { websiteLayout: { heading: { desktop: { textSize: 48 }, phone: { textSize: 32 } } } } }, content: [{ type: 'DisplayHeading', props: { id: 'heading', text: 'Authored heading' } }] }
   for (const theme of ['Menswork', 'DAWN', 'Midnight'] as const) {
     const html = render(doc, false, {}, theme)
     expect(html).toContain(':is(h1,h2,h3,h4,h5,h6){font-size:48px!important}')
     expect(html).toContain(':is(h1,h2,h3,h4,h5,h6){font-size:32px!important}')
   }
 })

it('uses the same saved element dimensions publicly and in the editor, with phone stacking reset', () => {
  const doc: Data = { root: { props: { websiteLayout: { resized: { desktop: { placements: { '0.1': { column: 3, span: 5, row: 2, height: 240 } } } } } } }, content: [{ type: 'Text', props: { id: 'resized', body: 'Authored content' } }] }
  for (const editing of [false, true]) {
    const html = render(doc, editing)
    expect(html).toContain('grid-column:3/span 5;grid-row:2;height:240px;min-height:0')
    expect(html).toContain('grid-column:auto;grid-row:auto;height:auto')
  }
})

it('resets tablet-only element geometry on phone even when desktop has no placements', () => {
  const doc: Data = { root: { props: { websiteLayout: { tablet: { tablet: { placements: { '0.1': { column: 4, span: 6, row: 2, height: 300 } } } } } } }, content: [{ type: 'Text', props: { id: 'tablet', body: 'Copy' } }] }
  const html = render(doc)
  expect(html).toContain('grid-column:4/span 6;grid-row:2;height:300px')
  expect(html).toContain('@media(max-width:600px)')
  expect(html).toContain('grid-column:auto;grid-row:auto;height:auto;min-height:0')
})
