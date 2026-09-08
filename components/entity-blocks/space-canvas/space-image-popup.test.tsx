// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { AssetValue } from '@/lib/library/asset-ref'

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE ON-CANVAS PHOTO POPUP COMMITS THE REFERENCE (ADR-1253, HYG-029).
//
// This popup is where a Space operator sets a block photo on the live canvas, and it was the last
// of the three entity-block writers still calling onSelect(url): the Loom handed it { url, assetId }
// and it stored the url alone. The two assertions that matter are the pick (a chosen asset commits
// as { assetId, url }) and the NON-pick (opening the popup on a stored ref, editing only the alt
// text, and confirming must not downgrade the ref to its cached url — the quiet way an adoption
// leaks back out one field edit at a time).
//
// jsdom, because the popup renders through Dialog, which portals and therefore renders NOTHING on
// the server: a static-markup test of this file would assert on an empty string.
// ─────────────────────────────────────────────────────────────────────────────────────────────

type Pick = { url: string; assetId?: string; alt?: string | null }
const picker = vi.hoisted(() => ({ onSelectAsset: null as null | ((pick: Pick) => void) }))
vi.mock('@/components/loom/loom-picker', () => ({
  LoomPicker: (props: { onSelectAsset?: (pick: Pick) => void }) => {
    picker.onSelectAsset = props.onSelectAsset ?? null
    return null
  },
}))

const { SpaceImagePopup } = await import('./space-image-popup')

const REF = { assetId: 'a1b2c3d4-1111-4222-8333-444455556666', url: 'https://cdn.test/loom/a.jpg' }

let container: HTMLDivElement | null = null
let root: Root | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  container = null
  root = null
  picker.onSelectAsset = null
})

function mount(currentValue: AssetValue, currentAlt: string, onSelect: (v: AssetValue, alt: string) => void) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root?.render(
      <SpaceImagePopup
        open
        currentValue={currentValue}
        currentAlt={currentAlt}
        onClose={() => {}}
        onSelect={onSelect}
      />,
    )
  })
}

function clickButton(label: string) {
  const btn = Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.trim() === label)
  if (!btn) throw new Error(`no "${label}" button in the popup`)
  act(() => {
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

describe('the space canvas photo popup commits the reference (ADR-1253)', () => {
  it('a pick with a library row commits { assetId, url } and previews its cached url', () => {
    const onSelect = vi.fn()
    mount('', 'Old alt', onSelect)
    act(() => picker.onSelectAsset?.({ url: REF.url, assetId: REF.assetId }))
    expect(document.body.querySelector('img')?.getAttribute('src')).toBe(REF.url)
    clickButton('Use this photo')
    expect(onSelect).toHaveBeenCalledWith(REF, 'Old alt')
  })

  it('a pick with no library row (a house site icon) commits the plain url', () => {
    const onSelect = vi.fn()
    mount('', '', onSelect)
    act(() => picker.onSelectAsset?.({ url: 'https://cdn.test/icons/star.svg', alt: null }))
    clickButton('Use this photo')
    expect(onSelect).toHaveBeenCalledWith('https://cdn.test/icons/star.svg', '')
  })

  it('editing only the alt text keeps the stored ref whole, never its cached url', () => {
    const onSelect = vi.fn()
    mount(REF, 'A photo', onSelect)
    const alt = document.body.querySelector('textarea')
    if (!alt) throw new Error('no alt textarea')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
    act(() => {
      setter?.call(alt, 'A better description')
      alt.dispatchEvent(new Event('input', { bubbles: true }))
    })
    clickButton('Use this photo')
    expect(onSelect).toHaveBeenCalledWith(REF, 'A better description')
  })

  it('a ref whose cached url is not allowlisted is refused rather than committed', () => {
    const onSelect = vi.fn()
    mount('', '', onSelect)
    act(() => picker.onSelectAsset?.({ url: 'javascript:alert(1)', assetId: REF.assetId }))
    clickButton('Use this photo')
    expect(onSelect).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('That photo could not be used')
  })

  it('Remove photo still clears the slot', () => {
    const onSelect = vi.fn()
    mount(REF, 'A photo', onSelect)
    clickButton('Remove photo')
    expect(onSelect).toHaveBeenCalledWith('', '')
  })
})
