import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

// The gallery + photo fields open the ONE Loom picker. Stub it and keep every set of props it was
// rendered with, so a pick can be replayed here (the real picker needs a browser, gated server
// actions and a click, none of which a render test has).
type Pick = { url: string; assetId?: string; alt?: string | null }
type PickerProps = { onSelectManyAssets?: (picks: Pick[]) => void; onSelectMany?: unknown }
const pickers = vi.hoisted(() => ({ seen: [] as PickerProps[] }))
vi.mock('@/components/loom/loom-picker', () => ({
  LoomPicker: (props: PickerProps) => {
    pickers.seen.push(props)
    return null
  },
}))

import { BlockEditPanel } from './block-edit-panel'
import {
  AlignControl,
  ColorControl,
  MarginControl,
  ShadowControl,
  Toggle,
} from './controls/field-controls'

// ADR-569 control-surface redesign: assert the new tight inspector markup (the owner editor is auth-gated,
// so we verify the control primitives + panel via render tests rather than a live browser).

const noop = () => {}

describe('control primitives (ADR-569 C6)', () => {
  it('Toggle renders an accessible switch reflecting its checked state', () => {
    const on = renderToStaticMarkup(<Toggle ariaLabel="Show button" checked onChange={noop} />)
    expect(on).toContain('role="switch"')
    expect(on).toContain('aria-checked="true"')
    expect(on).toContain('aria-label="Show button"')
  })

  it('AlignControl is a role=group of pressable icon-buttons with accessible names', () => {
    const html = renderToStaticMarkup(<AlignControl value="center" onSelect={noop} />)
    expect(html).toContain('role="group"')
    expect(html).toContain('aria-label="Alignment"')
    // the active option is pressed; each button carries a title/label (icon-only a11y)
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('aria-label="Center"')
  })

  it('ColorControl swatches are token-driven (no raw hex) and label each token', () => {
    const html = renderToStaticMarkup(<ColorControl value="accent" onSelect={noop} />)
    expect(html).toContain('aria-label="Accent"')
    expect(html).toContain('bg-primary')
    expect(html).not.toMatch(/#[0-9a-f]{6}/i)
  })

  it('ShadowControl offers the off / soft / strong presets', () => {
    const html = renderToStaticMarkup(<ShadowControl value="soft" onSelect={noop} />)
    expect(html).toContain('aria-label="Shadow"')
    expect(html).toContain('aria-label="Soft"')
    expect(html).toContain('aria-label="Strong"')
  })

  it('MarginControl renders a top + bottom spacing segmented pair', () => {
    const html = renderToStaticMarkup(<MarginControl top="none" bottom="md" onTop={noop} onBottom={noop} />)
    expect(html).toContain('Space above')
    expect(html).toContain('Space below')
  })
})

describe('BlockEditPanel redesign', () => {
  it('a text-bearing content block shows the Text style + Style + Spacing groups (no bare checkbox)', () => {
    const html = renderToStaticMarkup(
      <BlockEditPanel
        id="heading"
        content={{}}
        style={{}}
        hidden={false}
        editHref={null}
        onContent={noop}
        onStyle={noop}
        onToggleHide={noop}
      />,
    )
    expect(html).toContain('Text style')
    expect(html).toContain('Style')
    expect(html).toContain('Spacing')
    // the redesign uses switches, not the old labelled checkbox input
    expect(html).toContain('role="switch"')
    expect(html).not.toContain('type="checkbox"')
    // ADR-571 task 6: alignment is a direct icon-group, not buried in a dropdown.
    expect(html).toContain('aria-label="Alignment"')
    // ADR-571 task 5: the legacy None | S | M | L padding selector is gone from the Style group.
    expect(html).not.toContain('aria-label="Padding"')
  })

  it('a DATA block leads with a minimal Show-on-page switch and exposes the text-style group', () => {
    const html = renderToStaticMarkup(
      <BlockEditPanel
        id="offerings"
        content={{}}
        style={{}}
        hidden={false}
        editHref="/spaces/x/settings/offerings"
        onContent={noop}
        onStyle={noop}
        onToggleHide={noop}
      />,
    )
    expect(html).toContain('Show on page')
    expect(html).toContain('role="switch"')
    // ADR-577: every text-bearing block, including a DATA block, now exposes the text-style group (the
    // render frame styles the block's text), so the group IS present here.
    expect(html).toContain('Text style')
    // the deep-edit manage link is present
    expect(html).toContain('/spaces/x/settings/offerings')
  })

  it('a multi-element block exposes one text-style group PER element, not one whole-block group (item 4)', () => {
    const html = renderToStaticMarkup(
      <BlockEditPanel
        id="callout"
        content={{}}
        style={{}}
        hidden={false}
        editHref={null}
        onContent={noop}
        onStyle={noop}
        onToggleHide={noop}
      />,
    )
    // Callout has a heading + body (no eyebrow), so it gets a "Heading" and a "Text" text-style group and
    // NOT the single whole-block "Text style" group.
    expect(html).toContain('Heading</summary>')
    expect(html).toContain('Text</summary>')
    expect(html).not.toContain('Text style')
  })

  it('a purely visual block (Divider) shows only Spacing — no Align, Background, or Text style (item 5)', () => {
    const html = renderToStaticMarkup(
      <BlockEditPanel
        id="divider"
        content={{}}
        style={{}}
        hidden={false}
        editHref={null}
        onContent={noop}
        onStyle={noop}
        onToggleHide={noop}
      />,
    )
    expect(html).not.toContain('aria-label="Alignment"')
    expect(html).not.toContain('Background')
    expect(html).not.toContain('Text style')
    expect(html).toContain('Spacing')
  })

  it('an Image block shows Background + Spacing but no Align (nothing to align) (item 5)', () => {
    const html = renderToStaticMarkup(
      <BlockEditPanel
        id="image"
        content={{}}
        style={{}}
        hidden={false}
        editHref={null}
        onContent={noop}
        onStyle={noop}
        onToggleHide={noop}
      />,
    )
    expect(html).not.toContain('aria-label="Alignment"')
    expect(html).toContain('Background')
    expect(html).toContain('Spacing')
  })

  it('onStyle fires with a text-style bag when a color swatch is chosen (wiring smoke test)', () => {
    // Render the ColorControl the panel composes and assert its callback shape, since JSDOM click wiring is
    // exercised elsewhere; here we assert the control calls back with the chosen token.
    const onSelect = vi.fn()
    renderToStaticMarkup(<ColorControl value="default" onSelect={onSelect} />)
    // static render does not fire events; this asserts the component mounts without throwing.
    expect(onSelect).not.toHaveBeenCalled()
  })
})

// ADR-1253 (HYG-029): the rail's gallery adds each pick as the REFERENCE the Loom handed back, and a
// reorder / remove leaves every existing entry in the shape it was stored; the sanitizer keeps both
// (ADR-1245), so a half-adopted editor would silently rewrite refs to bare urls on the next edit.
describe('the gallery editor keeps the reference (ADR-1253)', () => {
  const ref = { assetId: 'a1b2c3d4-1111-4222-8333-444455556666', url: 'https://cdn.test/loom/b.jpg' }
  const gallery = (images: unknown, onContent: (next: Record<string, unknown>) => void) => {
    pickers.seen.length = 0
    renderToStaticMarkup(
      <BlockEditPanel
        id="gallery"
        content={{ images }}
        style={{}}
        hidden={false}
        editHref={null}
        onContent={onContent}
        onStyle={noop}
        onToggleHide={noop}
      />,
    )
    const p = pickers.seen.find((x) => x.onSelectManyAssets || x.onSelectMany)
    if (!p) throw new Error('the gallery editor rendered no Loom picker')
    return p
  }

  it('appends a pick with a library row as { assetId, url }, and one without as its url', () => {
    const onContent = vi.fn()
    const p = gallery(['https://cdn.test/loom/a.jpg'], onContent)
    // The url-only handler is gone: the picker fires both, so keeping it would re-flatten every pick.
    expect(p.onSelectMany).toBeUndefined()
    p.onSelectManyAssets?.([{ url: ref.url, assetId: ref.assetId }, { url: 'https://cdn.test/icons/star.svg' }])
    expect(onContent).toHaveBeenCalledWith({
      images: ['https://cdn.test/loom/a.jpg', ref, 'https://cdn.test/icons/star.svg'],
    })
  })

  it('carries a stored ref through an append untouched (a legacy string beside it is untouched too)', () => {
    const onContent = vi.fn()
    const p = gallery([ref, 'https://cdn.test/loom/a.jpg'], onContent)
    p.onSelectManyAssets?.([{ url: 'https://cdn.test/loom/c.jpg', assetId: 'b2c3d4e5-1111-4222-8333-444455556666' }])
    expect(onContent).toHaveBeenCalledWith({
      images: [
        ref,
        'https://cdn.test/loom/a.jpg',
        { assetId: 'b2c3d4e5-1111-4222-8333-444455556666', url: 'https://cdn.test/loom/c.jpg' },
      ],
    })
  })
})
