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

// Email-builder parity: a `textarea` slot authored on the WYSIWYG space canvas stores allowlisted inline HTML
// (Bold / Italic / Link), which the live render re-sanitises and paints. Plain text round-trips unchanged, and
// any disallowed markup is escaped as inert text (defence in depth — the render is a trust boundary).
describe('ContentBlockView inline rich text', () => {
  it('renders Bold / Italic marks in a Text block', () => {
    const html = renderToStaticMarkup(
      <ContentBlockView id="text" props={{ text: 'Hello <strong>world</strong> and <em>more</em>' }} />,
    )
    expect(html).toContain('<strong>world</strong>')
    expect(html).toContain('<em>more</em>')
  })

  it('renders a safe Link in a Text block', () => {
    const html = renderToStaticMarkup(
      <ContentBlockView id="text" props={{ text: 'See <a href="https://x.com">this</a>' }} />,
    )
    expect(html).toContain('href="https://x.com"')
    expect(html).toContain('rel="noopener noreferrer"')
  })

  it('escapes disallowed markup as inert text (no script tag reaches the page)', () => {
    const html = renderToStaticMarkup(
      <ContentBlockView id="text" props={{ text: 'safe <script>alert(1)</script>' }} />,
    )
    expect(html).not.toContain('<script')
    expect(html).toContain('safe')
  })

  it('drops a javascript: link (unsafe href) but keeps the text', () => {
    const unsafe = 'x <a href="' + 'javascript:' + 'alert(1)">nope</a>'
    const html = renderToStaticMarkup(<ContentBlockView id="text" props={{ text: unsafe }} />)
    expect(html).not.toContain('javascript:')
    expect(html).toContain('nope')
  })

  it('renders Italic marks in a Quote block', () => {
    const html = renderToStaticMarkup(
      <ContentBlockView id="quote" props={{ text: 'A <em>bold</em> claim', by: 'Someone' }} />,
    )
    expect(html).toContain('<em>bold</em>')
    expect(html).toContain('Someone')
  })

  it('round-trips plain text unchanged', () => {
    const html = renderToStaticMarkup(<ContentBlockView id="text" props={{ text: 'just plain words' }} />)
    expect(html).toContain('just plain words')
  })
})
