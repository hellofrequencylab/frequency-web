// The one image control's preview (CodeQL js/xss-through-dom on PR #2098). The value is an
// operator-stored string that lands in `<img src>`, and this control used to guard it with a private
// copy of the allowlist that returned a relative path verbatim. It now goes through the shared
// lib/safe-image-src.ts, which parses instead.
//
// Both halves are tested here, because the second one is the one that bites: a value this guard
// refuses renders the "Choose a photo" empty state, so refusing a legitimate photo reads to an
// operator as "my photo vanished".

import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { LoomImageField } from './loom-image-field'

const noop = () => {}

describe('the Loom image field paints only a guarded src', () => {
  it('shows the preview for a relative path, so a legitimate photo never reads as missing', () => {
    const html = renderToStaticMarkup(<LoomImageField label="Photo" value="/loom/a.jpg" onChange={noop} />)
    expect(html).toContain('src="/loom/a.jpg"')
    expect(html).toContain('aria-label="Change photo"')
  })

  it('shows the preview for an absolute Loom URL', () => {
    const html = renderToStaticMarkup(
      <LoomImageField label="Photo" value="https://cdn.test/loom/a.jpg?width=400" onChange={noop} />,
    )
    expect(html).toContain('src="https://cdn.test/loom/a.jpg?width=400"')
  })

  it('paints the parsed path, not the operator string it was given', () => {
    const html = renderToStaticMarkup(<LoomImageField label="Photo" value="/loom/../loom/a b.jpg" onChange={noop} />)
    expect(html).toContain('src="/loom/a%20b.jpg"')
    expect(html).not.toContain('/loom/../')
  })

  it('falls back to the empty state, with no src, for a value that cannot be trusted', () => {
    for (const value of ['javascript:alert(1)', '//evil.test/a.jpg', 'data:text/html,<script>alert(1)</script>']) {
      const html = renderToStaticMarkup(<LoomImageField label="Photo" value={value} onChange={noop} />)
      expect(html, value).not.toContain('<img')
      expect(html, value).toContain('Choose a photo')
    }
  })
})
