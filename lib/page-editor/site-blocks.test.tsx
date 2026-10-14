import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Data } from '@/lib/page-editor/types'

// THE FREQUENCY WEBSITE SCOPE (components/page-editor/site-blocks.tsx). Under SITE_DESIGN 'frequency' the
// root render wraps a non-Space document in `[data-site-blocks]`, the attribute
// app/themes/frequency/site-blocks.css keys every rule on. A Space document keeps its own rhythm wrapper
// and never gets the website scope (space-page.css dresses it instead). DAWN's side of this contract is
// the frozen goldens in block-render.test.tsx, which run with the default design and stay byte-identical.

vi.mock('@/lib/theme/design', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/theme/design')>()
  return { ...actual, SITE_DESIGN: 'frequency' }
})

const { config } = await import('@/lib/page-editor/config')
const { BlockRender } = await import('./block-render')

const doc: Data = {
  root: { props: {} },
  content: [{ type: 'Statement', props: { id: 's1', text: 'Friendship happens in person.', accent: 'in person', tone: 'canvas' } }],
}

describe('Frequency website scope over a block document', () => {
  it('wraps a marketing document in the site-blocks scope, out of layout', () => {
    const html = renderToStaticMarkup(<BlockRender config={config} data={doc} />)
    expect(html.startsWith('<div data-site-blocks="" class="contents">')).toBe(true)
    // The block markup inside is the shared markup: the scope restyles it, it does not fork it.
    expect(html).toContain('Friendship happens')
    expect(html).toContain('<span class="text-primary-strong">in person</span>')
  })

  it('leaves a Space document to its own rhythm wrapper', () => {
    const html = renderToStaticMarkup(
      <BlockRender config={config} data={doc} metadata={{ space: { layoutPreset: 'stack' } }} />,
    )
    expect(html).not.toContain('data-site-blocks')
    expect(html.startsWith('<div class="space-y-12')).toBe(true)
  })
})
