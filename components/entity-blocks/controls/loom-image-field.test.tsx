// The one image control's preview (CodeQL js/xss-through-dom on PR #2098). The value is an
// operator-stored string that lands in `<img src>`, and this control used to guard it with a private
// copy of the allowlist that returned a relative path verbatim. It now goes through the shared
// lib/safe-image-src.ts, which parses instead.
//
// Both halves are tested here, because the second one is the one that bites: a value this guard
// refuses renders the "Choose a photo" empty state, so refusing a legitimate photo reads to an
// operator as "my photo vanished".

import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { AssetValue } from '@/lib/library/asset-ref'
import { LoomImageField } from './loom-image-field'

const noop = () => {}

/** What the control hands the Loom. Captured from a stub picker so the pick can be replayed here: the real
 *  picker needs a browser, gated server actions and a click, none of which a render test has. */
type Pick = { url: string; assetId?: string; alt?: string | null }
const picker = vi.hoisted(() => ({ onSelectAsset: null as null | ((pick: Pick) => void), onSelect: undefined as unknown }))
vi.mock('@/components/loom/loom-picker', () => ({
  LoomPicker: (props: { onSelectAsset?: (pick: Pick) => void; onSelect?: unknown }) => {
    picker.onSelectAsset = props.onSelectAsset ?? null
    picker.onSelect = props.onSelect
    return null
  },
}))

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

// ADR-1253: the control adopted the picker's ASSET pick, so what it stores is the reference, not just the
// URL the reference happened to resolve to. Before this, three writers on this side called onSelect(url) and
// dropped the assetId at the last step, which is the whole of HYG-029.
describe('the Loom image field stores the reference it was handed (ADR-1253)', () => {
  it('a pick with a library row stores { assetId, url }, not the bare url', () => {
    const stored: Array<AssetValue | undefined> = []
    renderToStaticMarkup(<LoomImageField label="Photo" value="" onChange={(v) => stored.push(v)} />)
    picker.onSelectAsset?.({ url: 'https://cdn.test/loom/a.jpg', assetId: 'a1b2c3d4-1111-4222-8333-444455556666' })
    expect(stored).toEqual([{ assetId: 'a1b2c3d4-1111-4222-8333-444455556666', url: 'https://cdn.test/loom/a.jpg' }])
    // The url-only handler is GONE, not merely shadowed: the picker fires both, so a control that kept
    // onSelect would still write the bare url on every pick.
    expect(picker.onSelect).toBeUndefined()
  })

  it('a pick with NO library row (a house site icon) still stores the plain url', () => {
    const stored: Array<AssetValue | undefined> = []
    renderToStaticMarkup(<LoomImageField label="Photo" value="" onChange={(v) => stored.push(v)} />)
    picker.onSelectAsset?.({ url: 'https://cdn.test/icons/star.svg', alt: null })
    expect(stored).toEqual(['https://cdn.test/icons/star.svg'])
  })

  it('previews a stored ref through its cached url, so a reference never reads as a missing photo', () => {
    const html = renderToStaticMarkup(
      <LoomImageField
        label="Photo"
        value={{ assetId: 'a1b2c3d4-1111-4222-8333-444455556666', url: '/loom/a.jpg' }}
        onChange={noop}
      />,
    )
    expect(html).toContain('src="/loom/a.jpg"')
    expect(html).toContain('aria-label="Change photo"')
  })
})
