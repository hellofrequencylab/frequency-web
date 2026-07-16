import { describe, it, expect } from 'vitest'
import { renderEmailLayout, applyMergeTags } from './render'
import { emailDocumentShell, compileEmailDoc } from './shell'
import type { EntityLayout } from '@/lib/entity-blocks/layout'
import { emailPalette, EMAIL_PALETTE_BLOCK_IDS } from '@/lib/entity-blocks/registry'

// A one-column email layout with three authored blocks (the single-column email stack).
function sampleLayout(): EntityLayout {
  return {
    rows: [{ id: 'r0', columns: 1, cells: [['heading', 'text', 'button']] }],
    content: {
      heading: { text: 'Welcome aboard' },
      text: { text: 'A short paragraph.\nWith a break.' },
      button: { label: 'Join now', url: 'https://example.com/join' },
    },
  }
}

describe('renderEmailLayout', () => {
  it('renders authored blocks as inline-styled, table-based HTML', () => {
    const { html, text } = renderEmailLayout(sampleLayout())
    // Heading as an <h2> with an inline font-size + the lifted-charcoal heading ink at the unified semibold.
    expect(html).toContain('<h2')
    expect(html).toContain('Welcome aboard')
    expect(html).toContain('#4A4234') // heading ink (a touch lighter than the #3D352A body ink)
    expect(html).toContain('font-weight:600') // unified heading-family semibold
    // Paragraph preserves the authored line break as <br>.
    expect(html).toContain('A short paragraph.<br>With a break.')
    // Button is a bulletproof inline-block link with the primary hex + the safe href.
    expect(html).toContain('href="https://example.com/join"')
    expect(html).toContain('#E2912F')
    // Table-based layout, no CSS classes, no next/image.
    expect(html).toContain('<table')
    expect(html).not.toContain('class=')
    expect(html).not.toContain('<Image')
    // Plain-text alternative carries the words.
    expect(text).toContain('Welcome aboard')
    expect(text).toContain('Join now')
  })

  it('maps a text-color token to concrete hex (accent -> primaryStrong)', () => {
    const layout: EntityLayout = {
      rows: [{ id: 'r0', columns: 1, cells: [['heading']] }],
      content: { heading: { text: 'Accent' } },
      style: { heading: { text: { color: 'accent' } } },
    }
    expect(renderEmailLayout(layout).html).toContain('#9A5E12')
  })

  it('applies a card background + padding from BlockStyle', () => {
    const layout: EntityLayout = {
      rows: [{ id: 'r0', columns: 1, cells: [['text']] }],
      content: { text: { text: 'boxed' } },
      style: { text: { background: true, pad: 'lg' } },
    }
    const html = renderEmailLayout(layout).html
    expect(html).toContain('padding:32px')
    expect(html).toContain('#FFFFFF')
    expect(html).toContain('border:1px solid #E9E1D4')
  })

  it('renders a quote and a divider from the email palette', () => {
    const layout: EntityLayout = {
      rows: [{ id: 'r0', columns: 1, cells: [['quote', 'divider']] }],
      content: { quote: { text: 'Be here now', by: 'Ram Dass' } },
    }
    const { html, text } = renderEmailLayout(layout)
    expect(html).toContain('<blockquote')
    expect(html).toContain('Be here now')
    expect(html).toContain('Ram Dass')
    expect(html).toContain('border-top:1px solid')
    expect(text).toContain('"Be here now" - Ram Dass')
  })

  it('renders a data-bound productCard from its resolved snapshot fields', () => {
    const layout: EntityLayout = {
      rows: [{ id: 'r0', columns: 1, cells: [['productCard']] }],
      content: {
        productCard: {
          product: { id: 'p1' },
          title: 'Cedar candle',
          price: '$24',
          image: 'https://img.example.com/candle.jpg',
          url: 'https://frequencylocal.com/market/p1',
          ctaLabel: 'Shop this',
        },
      },
    }
    const { html, text } = renderEmailLayout(layout)
    expect(html).toContain('Cedar candle')
    expect(html).toContain('$24')
    expect(html).toContain('href="https://frequencylocal.com/market/p1"')
    expect(html).toContain('Shop this')
    expect(html).toContain('<table')
    expect(html).not.toContain('class=')
    expect(text).toContain('Cedar candle')
    expect(text).toContain('$24')
  })

  it('renders nothing for an empty productCard (missing product, graceful fallback)', () => {
    const layout: EntityLayout = {
      rows: [{ id: 'r0', columns: 1, cells: [['productCard']] }],
      content: { productCard: { product: { id: 'gone' } } },
    }
    // No snapshot + no resolved fields → the card renders nothing rather than a broken shell.
    expect(renderEmailLayout(layout).html).toBe('')
  })

  it('drops non-palette blocks (a data block renders nothing)', () => {
    const layout: EntityLayout = {
      rows: [{ id: 'r0', columns: 1, cells: [['offerings', 'text']] }],
      content: { text: { text: 'kept' } },
    }
    const html = renderEmailLayout(layout).html
    expect(html).toContain('kept')
    // `offerings` is not in the email palette; resolveRows drops it (not an email kind), so it never renders.
    expect(html).not.toContain('offerings')
  })

  it('is safe on an empty layout', () => {
    const { html, text } = renderEmailLayout({})
    expect(typeof html).toBe('string')
    expect(typeof text).toBe('string')
    expect(html).toBe('')
  })

  it('escapes authored content (no HTML injection)', () => {
    const layout: EntityLayout = {
      rows: [{ id: 'r0', columns: 1, cells: [['heading']] }],
      content: { heading: { text: '<script>alert(1)</script>' } },
    }
    const html = renderEmailLayout(layout).html
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
})

describe('features block — multi-column email compilation', () => {
  function featuresLayout(layout: string, columns: string, n: number): EntityLayout {
    const items = Array.from({ length: n }, (_, i) => ({ title: `Feature ${i}`, text: `Blurb ${i}` }))
    return {
      rows: [{ id: 'r0', columns: 1, cells: [['features']] }],
      content: { features: { layout, columns, items } },
    }
  }

  it('renders a 3-column layout as a bulletproof table/inline-block grid (MSO ghost table + 3 columns)', () => {
    const html = renderEmailLayout(featuresLayout('columns', '3', 3)).html
    // An Outlook (MSO) conditional ghost table wraps the fluid inline-block columns.
    expect(html).toContain('<!--[if mso]>')
    expect(html).toContain('<table')
    // Three fluid columns, each capped at floor(520/3) = 173px, and the MSO td at round(100/3) = 33%.
    expect(html.split('max-width:173px').length - 1).toBe(3)
    expect(html).toContain('display:inline-block')
    expect(html).toContain('width="33%"')
    // No CSS grid/flex/classes reach the email.
    expect(html).not.toContain('display:grid')
    expect(html).not.toContain('display:flex')
    expect(html).not.toContain('class=')
    // Every feature still renders its content.
    expect(html).toContain('Feature 0')
    expect(html).toContain('Feature 2')
  })

  it('renders a 4-column layout with four columns capped at floor(520/4) = 130px and 25% MSO cells', () => {
    const html = renderEmailLayout(featuresLayout('columns', '4', 4)).html
    expect(html.split('max-width:130px').length - 1).toBe(4)
    expect(html).toContain('width="25%"')
    expect(html).toContain('<!--[if mso]>')
  })

  it('chunks into rows of N (7 items at 3 columns → 3 wrapper rows)', () => {
    const html = renderEmailLayout(featuresLayout('cards', '3', 7)).html
    // Seven column divs total (all items placed), across ceil(7/3) = 3 chunk rows.
    expect(html.split('max-width:173px').length - 1).toBe(7)
    expect(html.split('font-size:0;margin:0 0 8px 0;').length - 1).toBe(3)
  })

  it('keeps a list layout single-column (no inline-block grid), ignoring the columns count', () => {
    const html = renderEmailLayout(featuresLayout('list', '4', 3)).html
    expect(html).not.toContain('display:inline-block')
    expect(html).not.toContain('<!--[if mso]>')
    expect(html).toContain('Feature 0')
  })

  it('defaults a legacy features block (no layout key) to a single stacked column', () => {
    const layout: EntityLayout = {
      rows: [{ id: 'r0', columns: 1, cells: [['features']] }],
      content: { features: { items: [{ title: 'Solo', text: 'Only one' }] } },
    }
    const html = renderEmailLayout(layout).html
    expect(html).toContain('Solo')
    expect(html).not.toContain('display:inline-block')
  })
})

describe('applyMergeTags', () => {
  it('substitutes a provided variable', () => {
    expect(applyMergeTags('Hi {{contact.first_name}}', { 'contact.first_name': 'Alex' })).toBe('Hi Alex')
  })

  it('uses the inline fallback when the variable is blank / absent', () => {
    expect(applyMergeTags('Hi {{contact.first_name | "there"}}', {})).toBe('Hi there')
    expect(applyMergeTags('Hi {{contact.first_name | "there"}}', { 'contact.first_name': '  ' })).toBe('Hi there')
  })

  it('uses an opts fallback when no inline fallback is present', () => {
    expect(
      applyMergeTags('Hi {{contact.first_name}}', {}, { fallbacks: { 'contact.first_name': 'friend' } }),
    ).toBe('Hi friend')
  })

  it('escapes the substituted value by default', () => {
    expect(applyMergeTags('{{x}}', { x: '<b>' })).toBe('&lt;b&gt;')
    expect(applyMergeTags('{{x}}', { x: '<b>' }, { escape: false })).toBe('<b>')
  })

  it('leaves an unmatched token empty', () => {
    expect(applyMergeTags('Hi {{unknown}}!', {})).toBe('Hi !')
  })
})

describe('shell + compileEmailDoc', () => {
  it('wraps a body in a full themed document', () => {
    const html = emailDocumentShell({ body: '<p>hi</p>', preheader: 'A preview', unsubscribeUrl: 'https://x/u' })
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('<p>hi</p>')
    expect(html).toContain('A preview')
    expect(html).toContain('href="https://x/u"')
    expect(html).toContain('#FBF8F1') // canvas
  })

  it('compileEmailDoc composes render + shell + carries subject/preheader', () => {
    const doc = { layout: sampleLayout(), subject: 'Hello', preheader: 'Peek inside' }
    const out = compileEmailDoc(doc, { unsubscribeUrl: 'https://x/u' })
    expect(out.subject).toBe('Hello')
    expect(out.preheader).toBe('Peek inside')
    expect(out.html).toContain('<!DOCTYPE html>')
    expect(out.html).toContain('Welcome aboard')
    expect(out.text).toContain('Unsubscribe: https://x/u')
  })

  it('default header renders the Frequency TEXT wordmark (no raster logo)', () => {
    const html = emailDocumentShell({ body: '<p>hi</p>' })
    // The default shell is the text wordmark lockup, not an image.
    expect(html).toContain('>Frequency</a>')
    expect(html).toContain('font-weight:900')
    expect(html).not.toContain('frequency-logo.png')
    expect(html).not.toContain('<img')
  })

  it('a per-Space logoUrl brand swaps in its image logo', () => {
    const html = emailDocumentShell({ body: '<p>hi</p>', brand: { logoUrl: 'https://cdn.example.com/acme.png' } })
    expect(html).toContain('src="https://cdn.example.com/acme.png"')
    expect(html).toContain('width="168"')
  })

  it('a per-Space wordmark brand keeps its wordmark text (no Frequency logo stamped on it)', () => {
    const html = emailDocumentShell({ body: '<p>hi</p>', brand: { wordmark: 'Acme Studio' } })
    expect(html).toContain('Acme Studio')
    expect(html).not.toContain('frequency-logo.png')
  })

  it('renders a full CAN-SPAM legal footer (sender, address, copyright, real routes)', () => {
    const html = emailDocumentShell({ body: '<p>hi</p>', unsubscribeUrl: 'https://x/u' })
    // Sender identity + one-line description.
    expect(html).toContain('A place to be human')
    // Physical mailing-address line: the real CAN-SPAM postal address plus the legal org.
    expect(html).toContain('Frequency Labs Holdings')
    expect(html).toContain('802 Caminito Azul, Carlsbad, CA 92011')
    // Dated copyright.
    expect(html).toContain(`&copy; ${new Date().getFullYear()}`)
    // Links to the real routes.
    expect(html).toContain('href="https://frequencylocal.com/privacy"')
    expect(html).toContain('href="https://frequencylocal.com/terms"')
    expect(html).toContain('href="https://frequencylocal.com/help"')
  })

  it('always shows the unsubscribe control; links the token when the send injects it', () => {
    const withUrl = emailDocumentShell({ body: '<p>hi</p>', unsubscribeUrl: 'https://x/u' })
    // The exact one-click token URL is preserved, underlined, not the old prominent pill.
    expect(withUrl).toContain('href="https://x/u"')
    expect(withUrl).toContain('Unsubscribe')
    expect(withUrl).toContain('text-decoration:underline')
    expect(withUrl).not.toContain('border-radius:999px')
    // Present even in the composer preview (no unsubscribeUrl yet) so the operator can see it is there.
    const preview = emailDocumentShell({ body: '<p>hi</p>' })
    expect(preview).toContain('Unsubscribe')
  })

  it('the marketing/nav links are prominent (body ink, larger than the legal fine print)', () => {
    const html = emailDocumentShell({ body: '<p>hi</p>', unsubscribeUrl: 'https://x/u' })
    // The link row is 13px in the readable body-ink color; the legal cluster below it is 10px subtle.
    expect(html).toContain('font-size:13px')
  })

  it('a Space brand address overrides the default platform address', () => {
    const html = emailDocumentShell({
      body: '<p>hi</p>',
      brand: { address: 'Acme Studio, 1 Main St, Springfield' },
    })
    expect(html).toContain('Acme Studio, 1 Main St, Springfield')
    expect(html).not.toContain('802 Caminito Azul')
  })
})

describe('email palette contract', () => {
  it('emailPalette returns exactly the curated ids, all email-kind', () => {
    const ids = emailPalette().map((b) => b.id)
    expect(new Set(ids)).toEqual(new Set(EMAIL_PALETTE_BLOCK_IDS))
    // Curated exclusions are absent.
    expect(ids).not.toContain('embed')
    expect(ids).not.toContain('gallery')
    expect(ids).not.toContain('offerings')
    // The new Button is present.
    expect(ids).toContain('button')
    // The data-bound Product card is the sanctioned email product block (Phase 4).
    expect(ids).toContain('productCard')
  })
})
