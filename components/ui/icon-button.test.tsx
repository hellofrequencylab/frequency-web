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

describe('IconLink', () => {
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
