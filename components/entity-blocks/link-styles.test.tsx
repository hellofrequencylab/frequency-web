import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ContentBlockView } from './content-block-view'

// LIVE-2454: a Links block draws each link in its own style, else the block's.
const html = (props: Record<string, unknown>) => renderToStaticMarkup(<ContentBlockView id="links" props={props} />)

describe('link styles', () => {
  it('keeps the button row as the default look', () => {
    const out = html({ items: [{ label: 'Site', url: 'https://example.com' }] })
    expect(out).toContain('rounded-control border')
  })
  it('draws the main pick filled, a card with its address, and text links together on one line', () => {
    const out = html({
      linkStyle: 'card',
      items: [
        { label: 'Launch', url: 'https://frequencylocal.com/a', style: 'main' },
        { label: 'Site', url: 'https://www.example.com' },
        { label: 'IG', url: 'https://instagram.com/x', style: 'text' },
        { label: 'TT', url: 'https://tiktok.com/@x', style: 'text' },
      ],
    })
    expect(out).toMatch(/bg-primary[^"]*text-on-primary[^>]*>Launch</)
    expect(out).toContain('example.com</span>')
    expect(out.match(/<li/g)).toHaveLength(3)
    expect(out).toMatch(/underline[^>]*>IG<\/a><a[^>]*underline[^>]*>TT</)
  })
})
