// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Switch } from './switch'

// Locks the Action-control state set from docs/INTERACTION-STATES.md §2 for the toggle the
// settings surfaces are built out of: rest, hover, pressed, focus-visible, optimistic-pending,
// disabled. The pending look is `.dimmed` (§4 rule 2) and it doubles as the double-fire guard
// (§4 rule 4) — never a spinner, which would change the control's width.

let container: HTMLDivElement | null = null
let root: Root | null = null

afterEach(() => {
  if (root) act(() => root!.unmount())
  if (container) container.remove()
  root = null
  container = null
})

function mount(props: Partial<React.ComponentProps<typeof Switch>> = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() =>
    root!.render(
      <Switch checked={false} onCheckedChange={() => {}} aria-label="Notify me" {...props} />,
    ),
  )
  return container!.querySelector('button')!
}

describe('Switch rest + selected', () => {
  it('reports its state to assistive tech, not just in color', () => {
    expect(mount({ checked: true }).getAttribute('aria-checked')).toBe('true')
    expect(mount({ checked: false }).getAttribute('aria-checked')).toBe('false')
  })

  it('is primary when on and a neutral track when off', () => {
    expect(mount({ checked: true }).className).toContain('bg-primary')
    expect(mount({ checked: false }).className).toContain('bg-border-strong')
  })
})

describe('Switch hover', () => {
  it('has a hover step in BOTH positions, and they differ', () => {
    const on = mount({ checked: true }).className
    const off = mount({ checked: false }).className
    expect(on).toContain('hover:bg-primary-hover')
    expect(off).toContain('hover:bg-')
    expect(on).not.toBe(off)
  })

  it('does NOT light up under the pointer when it cannot be used', () => {
    expect(mount({ disabled: true }).className).not.toContain('hover:bg-')
    expect(mount({ pending: true }).className).not.toContain('hover:bg-')
  })
})

describe('Switch pressed + focus', () => {
  it('uses `.press` and an explicit focus ring', () => {
    const el = mount()
    expect(el.className).toContain('press')
    expect(el.className).toContain('focus-visible:ring-2')
    expect(el.className).toContain('motion-reduce:transition-none')
  })
})

describe('Switch disabled vs optimistic-pending', () => {
  it('disabled is unavailable: the flat fade, and the click is blocked', () => {
    const el = mount({ disabled: true })
    expect(el.disabled).toBe(true)
    expect(el.className).toContain('opacity-50')
    expect(el.className).not.toContain('dimmed')
    expect(el.getAttribute('aria-busy')).toBeNull()
  })

  it('pending is `.dimmed` + aria-busy — real but not settled, and not re-fireable', () => {
    const el = mount({ pending: true })
    expect(el.className).toContain('dimmed')
    expect(el.className).not.toContain('opacity-50')
    expect(el.getAttribute('aria-busy')).toBe('true')
    expect(el.disabled).toBe(true)
  })

  it('does not swap in a spinner (no layout shift while a write is in flight)', () => {
    const el = mount({ pending: true })
    expect(el.className).not.toContain('animate-spin')
    expect(el.querySelectorAll('svg').length).toBe(0)
  })

  it('is neither by default', () => {
    const el = mount()
    expect(el.disabled).toBe(false)
    expect(el.className).not.toContain('dimmed')
    expect(el.className).not.toContain('opacity-50')
  })
})
