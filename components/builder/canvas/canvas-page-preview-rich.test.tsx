import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BlockWords, type PreviewBlock } from './canvas-page-preview'

describe('the frame draws rich text as words (PROG-E5 item 4)', () => {
  it('decodes stored entities in a rich field and leaves plain fields as they were', () => {
    const block: PreviewBlock = {
      title: 'Callout',
      fields: [
        { key: 'title', label: 'Title', kind: 'text' },
        { key: 'body', label: 'Message', kind: 'textarea', rich: true },
      ],
      node: { content: { title: 'Open house', body: 'Tea &amp; talk<br><b>Sunday</b>' } },
    }
    const html = renderToStaticMarkup(<BlockWords block={block} device="desktop" />)
    expect(html).toContain('Tea &amp; talk')
    expect(html).not.toContain('&amp;amp;')
    expect(html).not.toContain('&lt;')
    expect(html).toContain('Sunday')
  })
})
