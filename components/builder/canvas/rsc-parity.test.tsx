// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, expect, it, vi } from 'vitest'
vi.mock('@/app/(main)/spaces/[slug]/settings/profile/actions', () => ({ saveSpaceGridLayout: vi.fn() }))
import { LiveNodeGrid } from '@/components/entity-blocks/live-node-grid'
import { upgradeLayout } from '@/lib/entity-blocks/node-tree'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// PROG-E4D. The canvas draws a document on the client; a visitor gets it from the server. The editor must never show
// a page the visitor does not get, so the same node document is rendered both ways and the markup is compared.

const nodes = { text: <p key="text" data-block="text">Alpha</p>, quote: <blockquote key="quote">Beta</blockquote> }
const docs = {
  'one text block': { rows: [{ id: 'r1', columns: 1, cells: [['text']] }], content: {} },
  'two blocks in two columns': { rows: [{ id: 'r1', columns: 2, cells: [['text'], ['quote']] }], content: {} },
  'a hidden block': { rows: [{ id: 'r1', columns: 1, cells: [['text', 'quote']] }], content: {}, hidden: ['quote'] },
}

const mounted: HTMLElement[] = []
afterEach(() => { for (const el of mounted.splice(0)) el.remove() })

for (const [name, raw] of Object.entries(docs)) {
  it(`the canvas draws ${name} exactly as the server does`, async () => {
    const layout = upgradeLayout(raw)!
    const server = renderToStaticMarkup(<LiveNodeGrid nodes={nodes} initialLayout={layout} />)
    const el = document.createElement('div')
    document.body.appendChild(el)
    mounted.push(el)
    const root = createRoot(el)
    await act(async () => root.render(<LiveNodeGrid nodes={nodes} initialLayout={layout} />))
    expect(el.innerHTML).toBe(server)
    expect(server).toContain('Alpha')
    if (name === 'a hidden block') expect(server).not.toContain('Beta')
    await act(async () => root.unmount())
  })
}
