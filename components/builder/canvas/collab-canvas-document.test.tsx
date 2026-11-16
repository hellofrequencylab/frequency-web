import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/app/(main)/pages/canvas/document-actions', () => ({ saveCanvasNodeDraft: vi.fn() }))
vi.mock('@/app/(main)/pages/canvas/actions', () => ({ askVeraAboutCanvasBlock: vi.fn() }))

import type { CanvasDocumentView } from '@/lib/builder/canvas-document'
import { canvasInspectorFor } from '@/lib/builder/canvas-inspector'
import { ResponsiveInspector } from '@/components/builder/inspector/responsive-inspector'
import { CollabCanvas } from './collab-canvas'

// PROG-E5B. The inspector on a real document: its fields come from the selected node's own block contract
// (here a Callout and a Text block, neither of them the demo Banner), and the canvas says which draft it is on.

const CALLOUT = 'ncallout0001'
const TEXT = 'ntext0000001'
const callout = canvasInspectorFor('callout')
const text = canvasInspectorFor('text')

const view = (over: Partial<CanvasDocumentView> = {}): CanvasDocumentView => ({
  spaceId: '0f0e0d0c-0b0a-4908-8706-050403020100',
  spaceName: 'Calm Studio',
  source: 'draft',
  canSave: true,
  notice: null,
  base: { revision: 2, fingerprint: 'abc' },
  layers: [{ id: CALLOUT, label: 'Callout' }, { id: TEXT, label: 'Text' }],
  nodes: [
    { nid: CALLOUT, ...callout, node: { nid: CALLOUT, type: 'callout', content: { title: 'Come in', body: '<strong>Open</strong> all week' }, responsive: { phone: { title: 'Hi' } } } },
    { nid: TEXT, ...text, node: { nid: TEXT, type: 'text', content: { text: 'First' } } },
  ],
  ...over,
})

const BANNER = { title: 'Banner', fields: [{ key: 'title', label: 'Headline', kind: 'textarea' as const }], elsewhere: 0, initial: { title: 'Come as you are' } }
const fieldHtml = (html: string, key: string) => html.split(`data-field="${key}"`)[1]?.split('</li>')[0] ?? ''

describe('the inspector on a block that is not the Banner', () => {
  it('derives a Callout from its contract: its own labels, a toggle, a choice, and provenance per device', () => {
    expect(callout.fields.map((f) => f.key)).toEqual(expect.arrayContaining(['title', 'body', 'buttonOn', 'aspect']))
    const html = renderToStaticMarkup(
      <ResponsiveInspector title={callout.title} fields={callout.fields} elsewhere={callout.elsewhere} device="phone" values={{ desktop: { title: 'Come in', body: 'Open all week' }, phone: { title: 'Hi' } }} onChange={vi.fn()} />,
    )
    expect(html).toContain('Callout on phone')
    expect(html).not.toContain('Headline')
    expect(fieldHtml(html, 'title')).toContain('Set for phone')
    expect(fieldHtml(html, 'title')).toContain('aria-label="Reset Title to desktop"')
    expect(fieldHtml(html, 'body')).toContain('Inherited from desktop')
    expect(fieldHtml(html, 'body')).toContain('Message')
    expect(fieldHtml(html, 'buttonOn')).toContain('role="switch"')
    expect(fieldHtml(html, 'aspect')).toContain('<select')
  })
})

describe('the canvas on a real document', () => {
  it('shows the first node of the document in the inspector, not the demo Banner, and says which draft it is on', () => {
    const html = renderToStaticMarkup(<CollabCanvas inspector={BANNER} document={view()} />)
    expect(html).toContain('Callout on desktop')
    expect(html).not.toContain('Banner on desktop')
    expect(html).not.toContain('Come as you are')
    expect(html).toContain('Editing the draft of Calm Studio.')
    expect(html).toContain('Nothing here publishes.')
    expect(html).toContain('data-save-state="saved"')
    expect(fieldHtml(html, 'title')).toContain('Come in')
  })

  it('lets the layer list pick the node: one Edit button per layer, the selected one pressed', () => {
    const html = renderToStaticMarkup(<CollabCanvas document={view()} />)
    expect(html).toMatch(/aria-pressed="true"[^>]*aria-label="Edit Callout"/)
    expect(html).toMatch(/aria-pressed="false"[^>]*aria-label="Edit Text"/)
    expect(html).toContain('Moving a layer here is not saved yet.')
  })

  it('is plainly read only when the viewer cannot save, and says a published page is not yet a draft', () => {
    const html = renderToStaticMarkup(<CollabCanvas document={view({ canSave: false, source: 'published', notice: 'You can look at this page here, but only an editor of the Space can save it.' })} />)
    expect(html).toContain('data-save-state="read-only"')
    expect(html).toContain('Read only. You can look at this page here')
    expect(html).toContain('Showing the published page of Calm Studio.')
  })

  it('says so when the selected block has no fields the inspector can edit', () => {
    const none = view()
    none.nodes[0] = { nid: CALLOUT, title: 'Block', fields: [], elsewhere: 0, node: { nid: CALLOUT, type: 'mystery' } }
    const html = renderToStaticMarkup(<CollabCanvas document={none} />)
    expect(html).toContain('has no fields this inspector can edit yet')
    expect(html).not.toContain('aria-label="Block inspector"')
  })

  it('keeps the demo Banner, with no Edit buttons and no draft line, when there is no document', () => {
    const html = renderToStaticMarkup(<CollabCanvas inspector={BANNER} />)
    expect(html).toContain('Banner on desktop')
    expect(html).not.toContain('aria-label="Edit ')
    expect(html).not.toContain('data-canvas-document')
  })
})
