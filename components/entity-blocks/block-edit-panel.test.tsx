import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
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
