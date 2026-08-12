// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Button, buttonClasses } from './button'

// Locks the Action-control state set from docs/INTERACTION-STATES.md §2: rest, hover,
// pressed, focus-visible, loading, disabled. Button is the highest-reach control in the
// app (~40 files used to hand-roll it), so a state that regresses here regresses everywhere.

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

function btn(c: HTMLElement) {
  return c.querySelector('button')!
}

describe('Button rest + hover', () => {
  it('renders the variant tokens at rest and a hover step for each variant', () => {
    for (const variant of ['primary', 'secondary', 'ghost', 'danger'] as const) {
      expect(buttonClasses(variant)).toContain('hover:')
    }
  })
})

describe('Button pressed', () => {
  it('carries `.press` — the ONE sanctioned pressed state, not a bespoke scale', () => {
    const c = mount(<Button>Save</Button>)
    expect(btn(c).className).toContain('press')
    // The press must be able to ease, so `transform` is in the transition property list.
    expect(btn(c).className).toContain('transform')
  })

  it('collapses its transition under prefers-reduced-motion', () => {
    const c = mount(<Button>Save</Button>)
    expect(btn(c).className).toContain('motion-reduce:transition-none')
  })
})

describe('Button disabled', () => {
  it('is a real `disabled` attribute, not a no-op handler, and reads as unavailable', () => {
    const c = mount(<Button disabled>Save</Button>)
    expect(btn(c).disabled).toBe(true)
    expect(btn(c).className).toContain('disabled:opacity-50')
    expect(btn(c).className).toContain('disabled:cursor-not-allowed')
  })
})

describe('Button loading', () => {
  it('marks itself busy and blocks the double-fire', () => {
    const c = mount(<Button loading>Save</Button>)
    expect(btn(c).getAttribute('aria-busy')).toBe('true')
    expect(btn(c).disabled).toBe(true)
  })

  it('leaves the LABEL alone, so the control cannot change width mid-flight', () => {
    const c = mount(<Button loading>Save changes</Button>)
    expect(btn(c).textContent).toBe('Save changes')
    expect(btn(c).textContent).not.toContain('…')
  })

  it('is absent by default — a plain button is never busy', () => {
    const c = mount(<Button>Save</Button>)
    expect(btn(c).getAttribute('aria-busy')).toBeNull()
    expect(btn(c).disabled).toBe(false)
  })

  it('guards an asChild link too, which has no `disabled` attribute', () => {
    const c = mount(
      <Button asChild loading>
        {/* A BARE `<a>` IS THE POINT OF THIS TEST, so it is not a `<Link>`. The assertion is that
            `asChild` guards a child that has no `disabled` attribute, which is the anchor branch of
            `buttonClasses`; swapping in `next/link` would test Link's prop forwarding instead, and
            would need a router context this jsdom `createRoot` mount does not have. `/somewhere` is
            a placeholder that only looks like a route to the lint rule because
            `app/(main)/@wizard/[...catchAll]` makes every one-segment path resolve as a page. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/somewhere">Go</a>
      </Button>,
    )
    const a = c.querySelector('a')!
    expect(a.getAttribute('aria-busy')).toBe('true')
    expect(a.getAttribute('aria-disabled')).toBe('true')
    expect(a.className).toContain('pointer-events-none')
  })
})
