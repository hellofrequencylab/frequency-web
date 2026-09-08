import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { sanitizeContentMap } from '@/lib/entity-blocks/block-content'
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

// The <br> regression: a Heading / title / label authored with a line break used to render the LITERAL text
// `<BR>` on the published page (a plain `{text}` child escapes it) while the editor canvas showed a real break.
// Every operator-authored text field now paints through the inline-rich allowlist so published == editor: a
// <br> is a real line break, marks survive, and a genuinely-plain value round-trips unchanged (XSS-safe — only
// Bold / Italic / Link / <br> ever survive, everything else is escaped).
describe('ContentBlockView heading + inline fields honour <br> (published == editor canvas)', () => {
  it('renders a <br> in a Heading block as a real line break, not a literal <BR>', () => {
    const html = renderToStaticMarkup(<ContentBlockView id="heading" props={{ text: 'Line one<br>Line two' }} />)
    expect(html).toContain('<h2')
    expect(html).toContain('Line one<br>Line two')
    // The bug shape: the escaped tag surviving to the page.
    expect(html).not.toContain('&lt;br&gt;')
  })

  it('renders a Bold mark in a Heading block', () => {
    const html = renderToStaticMarkup(<ContentBlockView id="heading" props={{ text: 'Hello <strong>world</strong>' }} />)
    expect(html).toContain('<strong>world</strong>')
  })

  it('round-trips a plain Heading value unchanged (no stray markup)', () => {
    const html = renderToStaticMarkup(<ContentBlockView id="heading" props={{ text: 'Just a plain heading' }} />)
    expect(html).toContain('Just a plain heading')
    expect(html).not.toContain('<br>')
    expect(html).not.toContain('<strong>')
  })

  it('returns null for an empty Heading (row collapses, no hollow box)', () => {
    expect(ContentBlockView({ id: 'heading', props: {} })).toBeNull()
    expect(ContentBlockView({ id: 'heading', props: { text: '' } })).toBeNull()
  })

  it('renders a <br> in a Callout title and keeps a script inert', () => {
    const html = renderToStaticMarkup(
      <ContentBlockView id="callout" props={{ title: 'A<br>B <script>alert(1)</script>' }} />,
    )
    expect(html).toContain('A<br>B')
    expect(html).not.toContain('<script')
  })

  it('renders a <br> in a Features item title (rich, not escaped)', () => {
    const html = renderToStaticMarkup(
      <ContentBlockView id="features" props={{ items: [{ title: 'One<br>Two', text: 'body' }] }} />,
    )
    expect(html).toContain('One<br>Two')
    expect(html).not.toContain('&lt;br&gt;')
  })
})

// ADR-1245: a stored image value may be an AssetRef ({ assetId, url }); the view renders its cached url.
describe('ContentBlockView reads an AssetRef through its cached url (ADR-1245)', () => {
  const ref = { assetId: '0b6f6f2e-1111-4222-8333-444455556666', url: 'https://cdn.example.com/a.jpg' }

  it('image, callout, gallery, and a features item all render the ref, and a string still renders', () => {
    expect(renderToStaticMarkup(<ContentBlockView id="image" props={{ src: ref }} />)).toContain(`src="${ref.url}"`)
    expect(renderToStaticMarkup(<ContentBlockView id="callout" props={{ title: 'T', image: ref }} />)).toContain(
      `src="${ref.url}"`,
    )
    expect(
      renderToStaticMarkup(<ContentBlockView id="gallery" props={{ images: [ref, 'https://x/1.jpg'] }} />),
    ).toContain(`src="${ref.url}"`)
    expect(
      renderToStaticMarkup(<ContentBlockView id="features" props={{ items: [{ title: 'A', image: ref }] }} />),
    ).toContain(`src="${ref.url}"`)
    expect(renderToStaticMarkup(<ContentBlockView id="image" props={{ src: 'https://x/a.jpg' }} />)).toContain(
      'src="https://x/a.jpg"',
    )
  })

  it('a ref whose cached url is unsafe renders nothing, and a bare object is not a ref', () => {
    expect(
      renderToStaticMarkup(<ContentBlockView id="image" props={{ src: { assetId: ref.assetId, url: 'javascript:1' } }} />),
    ).toBe('')
    expect(renderToStaticMarkup(<ContentBlockView id="image" props={{ src: { url: ref.url } }} />)).toBe('')
  })
})

// ADR-1253 (HYG-029): the END-TO-END shape of the seam, the one thing neither the sanitizer's own pins nor
// the view's own pins can show. What the three entity-block writers now hand the save action is run through
// the REAL save-path sanitizer (sanitizeContentMap, what spaces/[slug]/settings/profile/actions.ts calls) and
// the survivor is rendered. A ref must come back out as a picture; a legacy string must be unchanged.
describe('a picked reference survives the save path and renders (ADR-1253)', () => {
  const ref = { assetId: 'a1b2c3d4-1111-4222-8333-444455556666', url: 'https://cdn.example.com/loom/a.jpg' }

  it('a ref stored by each of the writers renders its cached url after the save path', () => {
    const saved = sanitizeContentMap({
      image: { src: ref, alt: 'A photo' },
      gallery: { images: [ref, 'https://cdn.example.com/loom/b.jpg'] },
      callout: { title: 'T', image: ref },
      features: { items: [{ title: 'A', image: ref }] },
    })
    if (!saved) throw new Error('the save path dropped every block')
    // Same shape in, same shape out: the reference is still a reference in storage, not its cached url.
    expect(saved.image.src).toEqual(ref)
    expect(saved.gallery.images).toEqual([ref, 'https://cdn.example.com/loom/b.jpg'])
    for (const id of ['image', 'gallery', 'callout', 'features']) {
      const html = renderToStaticMarkup(<ContentBlockView id={id} props={saved[id]} />)
      expect(html, id).toContain(`src="${ref.url}"`)
    }
  })

  it('a bare string stored the old way still round-trips and renders', () => {
    const saved = sanitizeContentMap({ image: { src: 'https://cdn.example.com/loom/legacy.jpg', alt: 'A photo' } })
    expect(saved?.image.src).toBe('https://cdn.example.com/loom/legacy.jpg')
    expect(renderToStaticMarkup(<ContentBlockView id="image" props={saved?.image ?? {}} />)).toContain(
      'src="https://cdn.example.com/loom/legacy.jpg"',
    )
  })

  it('a ref whose cached url is unsafe is dropped on save, so nothing unsafe can reach the page', () => {
    const saved = sanitizeContentMap({ image: { src: { assetId: ref.assetId, url: 'javascript:1' }, alt: 'A' } })
    expect(saved?.image.src).toBeUndefined()
  })
})
