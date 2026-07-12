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
    // Heading as an <h2> with an inline font-size + the brand ink hex.
    expect(html).toContain('<h2')
    expect(html).toContain('Welcome aboard')
    expect(html).toContain('#3D352A')
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
  })
})
