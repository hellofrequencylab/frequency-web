import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Data } from '@/lib/page-editor/types'
import { config } from '@/lib/page-editor/config'
import { DesktopEditor } from './desktop-editor'

// ─────────────────────────────────────────────────────────────────────────────
// EDITOR SANITY — the in-house DesktopEditor mounts with a valid Data doc and its
// centre pane renders the document through <BlockRender> (the same path the public
// page ships). It uses only render-time hooks (useState/useMemo/useContext), so it
// renders cleanly under renderToStaticMarkup in the node test env (no jsdom needed),
// matching the block-render parity gate. The document ops themselves (add / remove /
// reorder / duplicate / move / edit, incl. into slots) are unit-tested in
// components/page-editor/mobile/data-ops.test.ts.
// ─────────────────────────────────────────────────────────────────────────────

function item(type: string, id: string, overrides: Record<string, unknown> = {}) {
  const defaults = (config.components as Record<string, { defaultProps?: Record<string, unknown> }>)[type]
    ?.defaultProps
  return { type, props: { id, ...defaults, ...overrides } }
}

describe('DesktopEditor mounts and previews through BlockRender', () => {
  it('renders the outline + a faithful BlockRender preview for a valid doc (incl. a slot)', () => {
    const data: Data = {
      root: {},
      content: [
        item('Heading', 'h1', { title: 'Editor mounts fine' }),
        item('Container', 'c1', {
          content: [item('Text', 't1', { body: 'Nested body in a slot.' })],
        }),
      ],
    }

    const html = renderToStaticMarkup(<DesktopEditor config={config} data={data} headerTitle="Editing: Test" />)

    // Chrome mounted.
    expect(html).toContain('Editing: Test')
    expect(html).toContain('Add block')
    // Outline lists the blocks by their config label.
    expect(html).toContain('Heading')
    expect(html).toContain('Container')
    // Centre pane rendered the document THROUGH BlockRender (the block content appears).
    expect(html).toContain('Editor mounts fine')
    expect(html).toContain('Nested body in a slot.')
  })

  it('mounts an empty doc without throwing (shows the empty-state hint)', () => {
    const html = renderToStaticMarkup(<DesktopEditor config={config} data={{ root: {}, content: [] }} />)
    expect(html).toContain('Nothing here yet')
  })
})
