// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { IconButton, IconLink, type IconButtonVariant, type IconButtonTone } from './icon-button'

// Locks the Action-control state set from docs/INTERACTION-STATES.md §2 for the icon-only control:
// rest, hover, pressed (`.press`), focus-visible and disabled — for EVERY variant, because a
// variant that drops one of them is how a control ends up unreachable by keyboard or untappable on
// a phone. Also locks the two floors the primitive exists to own: the 32px density floor and the
// coarse-pointer tap target (`tap-target` resolves to 44px under `pointer: coarse`).

let container: HTMLDivElement | null = null
let root: Root | null = null

afterEach(() => {
  if (root) act(() => root!.unmount())
  if (container) container.remove()
  root = null
  container = null
})

function mount(node: React.ReactNode) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(node))
  return container!
}

const VARIANTS: IconButtonVariant[] = ['plain', 'bordered', 'filled', 'tinted']
const TONES: IconButtonTone[] = ['default', 'danger', 'warning', 'success']

const btn = (variant?: IconButtonVariant, tone?: IconButtonTone) =>
  mount(
    <IconButton label="Pick" variant={variant} tone={tone}>
      <svg />
    </IconButton>,
  ).querySelector('button')!

describe('IconButton required states, every variant', () => {
  for (const variant of VARIANTS) {
    it(`${variant} carries rest, hover, pressed, focus-visible and disabled`, () => {
      const classes = btn(variant).className
      expect(classes).toContain('h-8')
      expect(classes).toContain('w-8')
      expect(classes).toContain('tap-target')
      expect(classes).toContain('press')
      expect(classes).toContain('focus-visible:ring-2')
      expect(classes).toContain('disabled:opacity-50')
      expect(classes).toMatch(/hover:/)
    })
  }

  it('the disabled state is the real attribute plus a legible fade', () => {
    const el = mount(
      <IconButton label="Pick" disabled>
        <svg />
      </IconButton>,
    ).querySelector('button')!
    expect(el.disabled).toBe(true)
    expect(el.className).toContain('disabled:pointer-events-none')
  })

  it('an icon-only control is still named, for a screen reader and for the tooltip', () => {
    const el = btn()
    expect(el.getAttribute('aria-label')).toBe('Pick')
    expect(el.getAttribute('title')).toBe('Pick')
  })
})

// ── tinted: the selected cell of a picker grid ────────────────────────────────
// `filled` is the loud answer (send, the selected half of a segmented toggle). `tinted` is the
// quiet one: sixty icons in a grid, one of them chosen. Both existing sites drew this exact pair by
// hand — `bg-primary-bg text-primary-strong` — because the kit had no variant for it.

describe('IconButton variant="tinted"', () => {
  it('is loud at rest but quieter than filled: a tint, not a slab', () => {
    const classes = btn('tinted').className
    expect(classes).toContain('bg-primary-bg')
    expect(classes).toContain('text-primary-strong')
    expect(classes).not.toContain('bg-primary ')
    expect(classes).not.toContain('text-on-primary')
  })

  it('marks the selection with a ring, which survives a gap-1 grid', () => {
    expect(btn('tinted').className).toContain('ring-2 ring-primary')
  })

  it('still answers the pointer — a selected control that goes inert reads as disabled', () => {
    expect(btn('tinted').className).toContain('hover:bg-primary-bg/70')
  })

  for (const tone of TONES) {
    it(`tone="${tone}" tints fill, foreground and ring from one semantic family`, () => {
      const family = tone === 'default' ? 'primary' : tone
      const classes = btn('tinted', tone).className
      expect(classes).toContain(`bg-${family}-bg`)
      expect(classes).toContain(`ring-${family}`)
    })
  }

  it('emits exactly one fill, so no call site has to out-guess the stylesheet order', () => {
    for (const variant of VARIANTS) {
      const fills = btn(variant).className.split(' ').filter((c) => /^bg-/.test(c))
      expect(fills.length).toBeLessThanOrEqual(1)
    }
  })
})

// ── loading: the state icon-only controls need most ──────────────────────────
// A tap on a text button at least leaves a pressed label behind. A tap on a bare glyph leaves no
// evidence at all that it landed, which is why INTERACTION-STATES §5 sweep item 7 put `loading`
// on this primitive right after Button's. Same contract as Button's: `aria-busy`, the double-fire
// blocked, and nothing swapped in.

describe('IconButton loading', () => {
  it('marks itself busy and blocks the double-fire', () => {
    const el = mount(
      <IconButton label="Delete" loading>
        <svg />
      </IconButton>,
    ).querySelector('button')!
    expect(el.getAttribute('aria-busy')).toBe('true')
    expect(el.disabled).toBe(true)
  })

  it('a second tap while the first is in flight does not fire the handler again', () => {
    // The consequence, not the prop. `loading` exists to stop one delete becoming two.
    let fired = 0
    const el = mount(
      <IconButton label="Delete" loading onClick={() => { fired += 1 }}>
        <svg />
      </IconButton>,
    ).querySelector('button')!
    act(() => { el.click() })
    act(() => { el.click() })
    expect(fired).toBe(0)
  })

  it('the same control DOES fire when it is not loading — the guard is not just a dead handler', () => {
    // The control for the assertion above: without this, a component that never fires its
    // onClick at all would pass the double-fire test perfectly.
    let fired = 0
    const el = mount(
      <IconButton label="Delete" onClick={() => { fired += 1 }}>
        <svg />
      </IconButton>,
    ).querySelector('button')!
    act(() => { el.click() })
    expect(fired).toBe(1)
  })

  it('swaps NOTHING in: at 32px a spinner is not a detail, it is the whole control', () => {
    const el = mount(
      <IconButton label="Delete" loading>
        <svg data-testid="glyph" />
      </IconButton>,
    ).querySelector('button')!
    expect(el.querySelector('[data-testid="glyph"]')).not.toBeNull()
    expect(el.className).not.toContain('animate-spin')
    // The fade from the shared base is the cue, and it is a `disabled:` variant — so the busy
    // control reads at 50% without a second pending vocabulary being invented for it.
    expect(el.className).toContain('disabled:opacity-50')
  })

  it('is absent by default — a plain icon button is never busy', () => {
    const el = mount(
      <IconButton label="Delete">
        <svg />
      </IconButton>,
    ).querySelector('button')!
    expect(el.getAttribute('aria-busy')).toBeNull()
    expect(el.disabled).toBe(false)
  })
})

describe('IconLink', () => {
  it('a loading icon-link is busy and unclickable, but keeps its place in the tab order', () => {
    // An anchor has no `disabled`, so the guard is the ARIA pair the shared base turns into
    // `pointer-events-none` + the fade — the same branch Button's `asChild` takes. It does NOT
    // take tabIndex={-1}: pulling focus out from under a keyboard user mid-navigation is a worse
    // bug than the one being fixed.
    const el = mount(
      <IconLink label="Next" href="/x" loading>
        <svg />
      </IconLink>,
    ).querySelector('a')!
    expect(el.getAttribute('aria-busy')).toBe('true')
    expect(el.getAttribute('aria-disabled')).toBe('true')
    expect(el.getAttribute('tabindex')).toBeNull()
    expect(el.className).toContain('aria-disabled:pointer-events-none')
  })


  it('a disabled icon-link leaves the tab order and says so to assistive tech', () => {
    const el = mount(
      <IconLink label="Back" href="/x" disabled>
        <svg />
      </IconLink>,
    ).querySelector('a')!
    expect(el.getAttribute('aria-disabled')).toBe('true')
    expect(el.getAttribute('tabindex')).toBe('-1')
    expect(el.className).toContain('aria-disabled:pointer-events-none')
  })

  it('shares the icon density with IconButton, tinted included', () => {
    const el = mount(
      <IconLink label="Back" href="/x" variant="tinted">
        <svg />
      </IconLink>,
    ).querySelector('a')!
    expect(el.className).toContain('tap-target')
    expect(el.className).toContain('bg-primary-bg')
  })
})
