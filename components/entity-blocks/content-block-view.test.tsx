import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ContentBlockView } from './content-block-view'

// Fix 8 render gate for the Callout content block: the button ALWAYS renders once it has a label (a no-link
// button falls back to '#'), a per-block toggle turns it off, and a block with nothing to show returns null
// so its row collapses to zero height (no hollow box).

describe('ContentBlockView callout button (Fix 8)', () => {
  it('renders the button with a label but NO link (falls back to #)', () => {
    const html = renderToStaticMarkup(<ContentBlockView id="callout" props={{ title: 'Hi', buttonLabel: 'Book' }} />)
    expect(html).toContain('Book')
    expect(html).toContain('href="#"')
  })

  it('uses the real link when set', () => {
    const html = renderToStaticMarkup(
      <ContentBlockView id="callout" props={{ title: 'Hi', buttonLabel: 'Book', buttonUrl: 'https://x.com/book' }} />,
    )
    expect(html).toContain('href="https://x.com/book"')
  })

  it('the toggle off (buttonOn:false) hides the button', () => {
    const html = renderToStaticMarkup(
      <ContentBlockView id="callout" props={{ title: 'Hi', buttonLabel: 'Book', buttonOn: false }} />,
    )
    expect(html).not.toContain('Book')
    // The rest of the callout still renders (it has a title).
    expect(html).toContain('Hi')
  })

  it('collapses (returns null) when the ONLY content is a toggled-off button', () => {
    const node = ContentBlockView({ id: 'callout', props: { buttonLabel: 'Book', buttonOn: false } })
    expect(node).toBeNull()
  })

  it('collapses (returns null) for a fully empty callout', () => {
    expect(ContentBlockView({ id: 'callout', props: {} })).toBeNull()
  })
})
