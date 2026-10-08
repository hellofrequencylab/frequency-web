import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { InlineText } from './inline-text'

describe('website inline text', () => {
  it('preserves bold, italic, links, and existing theme headline accents after render', () => {
    const html = renderToStaticMarkup(<InlineText text="**Stand together** with _courage_ and *fire*. [Join us](https://hearts.example/?a=1&b=2)" accentStars />)
    expect(html).toContain('<strong>Stand together</strong>')
    expect(html).toContain('<em>courage</em>')
    expect(html).toContain('<span class="mw-accent">fire</span>')
    expect(html).toContain('href="https://hearts.example/?a=1&amp;b=2"')
  })
  it('renders existing limited HTML with safe marks and rejects executable attributes', () => {
    const html = renderToStaticMarkup(<InlineText text={'<b onclick="attack()">Bold</b> <em>Italic</em> <a href="https://hearts.example">Visit</a><img src=x onerror="attack()"><a href="javascript:attack()">Unsafe</a>'} />)
    expect(html).toContain('<strong>Bold</strong>')
    expect(html).toContain('<em>Italic</em>')
    expect(html).toContain('<a href="https://hearts.example">Visit</a>')
    expect(html).not.toMatch(/onclick|onerror|javascript:|<img/)
    expect(html).toContain('Unsafe')
  })
})
