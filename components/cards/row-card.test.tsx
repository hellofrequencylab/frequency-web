// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { RowCard } from './row-card'

// Locks the Card state set from docs/INTERACTION-STATES.md §2 for the third card primitive:
// rest, and then hover · pressed · focus-visible WHEN IT NAVIGATES. RowCard has three shapes and
// only one of them navigates, so the interesting assertions here are as much about which shapes
// must NOT press as about the one that must.
//
// The ring's other half — whether the focus indicator survives the cascade at all — is
// components/cards/card-focus-ring.test.ts. A class name in this file is evidence the surface
// asks for the ring; that file is evidence the ring paints.

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

/** The row's outermost box, whatever element it turned out to be. */
const surface = (c: HTMLElement) => c.firstElementChild as HTMLElement

describe('RowCard rest + hover', () => {
  it('is a bordered surface that answers the pointer', () => {
    const c = mount(<RowCard href="/practices/1" title="Morning pages" />)
    expect(surface(c).className).toContain('border-border')
    expect(surface(c).className).toContain('hover:border-primary-bg')
  })
})

describe('RowCard pressed + focus-visible — the link row', () => {
  it('carries `.press`, the ONE sanctioned pressed state, on the surface that navigates', () => {
    const c = mount(<RowCard href="/practices/1" title="Morning pages" />)
    const el = surface(c)
    expect(el.tagName).toBe('A')
    expect(el.className.split(' ')).toContain('press')
  })

  it('rings the whole row, not just the text inside it', () => {
    const c = mount(<RowCard href="/practices/1" title="Morning pages" />)
    expect(surface(c).className.split(' ')).toContain('ring-focus')
  })

  it('can EASE the press: `transform` is in the transition list, and reduced motion is guarded', () => {
    // A `.press` on a `transition-colors` surface snaps to 0.99 with no travel. Naming the
    // property is what makes the pressed state read as a press.
    const cls = surface(mount(<RowCard href="/practices/1" title="Morning pages" />)).className
    expect(cls).toContain('transform')
    expect(cls).toContain('motion-reduce:transition-none')
  })
})

describe('RowCard pressed + focus-visible — the shapes that do NOT navigate', () => {
  it('a managed row (actions) neither presses nor rings: the surface is not a click target', () => {
    const c = mount(
      <RowCard href="/practices/1" title="Morning pages" actions={<button type="button">Edit</button>} />,
    )
    const el = surface(c)
    expect(el.tagName).toBe('DIV')
    expect(el.className.split(' ')).not.toContain('press')
    expect(el.className.split(' ')).not.toContain('ring-focus')
  })

  it('a managed row (footer) is the same: its controls carry their own states', () => {
    const c = mount(
      <RowCard href="/practices/1" title="Morning pages" footer={<button type="button">Delete</button>} />,
    )
    expect(surface(c).className.split(' ')).not.toContain('press')
  })

  it('a destination-less row does not promise a click it cannot land', () => {
    const c = mount(<RowCard title="Untitled draft" />)
    const el = surface(c)
    expect(el.tagName).toBe('DIV')
    expect(el.className.split(' ')).not.toContain('press')
    expect(el.className.split(' ')).not.toContain('ring-focus')
  })

  it('but the managed row still LINKS its title, so the row is reachable', () => {
    const c = mount(
      <RowCard href="/practices/1" title="Morning pages" actions={<button type="button">Edit</button>} />,
    )
    expect(c.querySelector('a')?.getAttribute('href')).toBe('/practices/1')
  })
})
