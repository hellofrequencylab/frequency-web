// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { DispatchTicker, type TickerItem } from './dispatch-ticker'
import { Dialog } from '@/components/ui/dialog'

// ── THE BAR HOLDS STILL UNDER A MODAL (LIVE-482) ─────────────────────────────────────────────
//
// dispatch-ticker.test.ts beside this file pins the PAUSE CONTRACT as source invariants, and says
// why: what it guards is a browser fact about `:focus-visible` under two input modalities, which
// jsdom does not model. This file is the other half, and it is the half that can be MEASURED,
// because what it measures is the DOM.
//
// The fourth blink report ("still happening every 8 seconds or so, more of a consistent blink than
// a glitch") was diagnosed by mounting the real calendar console and sampling the whole document
// across thirty seconds of fake time. Everything inside the console was byte-identical throughout.
// The only thing in the document that moved was this bar, on its 5000ms rotation, under an overlay
// that is `bg-ink/60 backdrop-blur-sm` across the entire viewport and that no pointer or Tab can
// reach through. So the assertions here are node identity and byte-identical innerHTML sampled
// across the event, which is the standard LIVE-477 set for this class of bug.
//
// The Dialog below is the REAL one, not a stand-in, because the point of the test is that the
// publisher and the subscriber agree. A fake overlay would pass while the app still blinked.

const items: TickerItem[] = [
  { id: 'a', title: 'Short one', authorName: 'Ana', timeLabel: '2h ago', linked: false },
  { id: 'b', title: 'A considerably longer headline, of the kind that wraps', authorName: 'Bo', timeLabel: '3h ago', linked: true },
  { id: 'c', title: 'Third', authorName: null, timeLabel: '1d ago', linked: false },
]

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={String(href)} {...rest}>{children}</a>
  ),
}))

let container: HTMLDivElement | null = null
let root: Root | null = null

afterEach(() => {
  if (root) act(() => root!.unmount())
  if (container) container.remove()
  root = null
  container = null
  document.body.style.overflow = ''
  vi.useRealTimers()
})

function stubMatchMedia(reduce: boolean) {
  ;(window as unknown as { matchMedia: (q: string) => MediaQueryList }).matchMedia = ((q: string) => ({
    matches: reduce,
    media: q,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  })) as unknown as (q: string) => MediaQueryList
}

/** The bar, and the exact bytes it is painting right now. */
function bar(): HTMLElement {
  const el = container!.querySelector('[data-testid="ticker-host"]')!.firstElementChild as HTMLElement
  expect(el).not.toBeNull()
  return el
}

async function mount(node: React.ReactNode) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => { root!.render(node) })
}

/** The page as the member meets it: the ambient bar, and a modal that may be over it. */
function Surface({ startOpen }: { startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen)
  return (
    <>
      <div data-testid="ticker-host"><DispatchTicker items={items} /></div>
      <button type="button" data-testid="toggle" onClick={() => setOpen((o) => !o)}>toggle</button>
      <Dialog open={open} onClose={() => setOpen(false)} ariaLabel="Console" align="overlay">
        <div>The console</div>
      </Dialog>
    </>
  )
}

describe('the rotation, with nothing over it', () => {
  it('advances on the 5s timer and keeps the same bar node while it does', async () => {
    stubMatchMedia(false)
    vi.useFakeTimers()
    await mount(<Surface startOpen={false} />)

    const first = bar()
    const before = first.innerHTML
    expect(first.className).toContain('h-10')
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })

    // This is the CONTROL. Without it, a test that asserts "nothing changed" under a modal would
    // also pass on a bar that never rotates at all.
    expect(bar()).toBe(first)
    expect(bar().innerHTML).not.toBe(before)
  })

  it('never changes its own height, so it cannot reflow the page it sits above', async () => {
    // The first theory of the fourth report was that a rotation could change the rendered row's
    // height when one headline wraps and another does not. It cannot: the bar is a fixed `h-10`
    // and the headline is `truncate`, which is `white-space: nowrap`. Measured across a full cycle
    // with a short item and a long one, the height-bearing classes are byte-identical.
    stubMatchMedia(false)
    vi.useFakeTimers()
    await mount(<Surface startOpen={false} />)

    const seen = new Set<string>()
    const titleClasses = new Set<string>()
    for (let i = 0; i < items.length + 1; i++) {
      seen.add(bar().className)
      titleClasses.add((bar().querySelector('span.truncate') as HTMLElement).className)
      await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    }
    expect([...seen]).toHaveLength(1)
    expect([...seen][0]).toContain('h-10')
    expect([...titleClasses]).toHaveLength(1)
    expect([...titleClasses][0]).toContain('truncate')
  })
})

describe('the rotation, under a modal overlay', () => {
  it('holds still for thirty seconds: same node, byte-identical innerHTML at every second', async () => {
    stubMatchMedia(false)
    vi.useFakeTimers()
    await mount(<Surface startOpen />)

    const node = bar()
    const html = node.innerHTML
    for (let ms = 1000; ms <= 30_000; ms += 1000) {
      await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
      expect(bar(), `bar node replaced at ${ms}ms`).toBe(node)
      expect(bar().innerHTML, `bar repainted at ${ms}ms`).toBe(html)
    }
  })

  it('holds still when the modal opens while it is already rotating', async () => {
    stubMatchMedia(false)
    vi.useFakeTimers()
    await mount(<Surface startOpen={false} />)
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })

    const node = bar()
    await act(async () => {
      container!.querySelector<HTMLButtonElement>('[data-testid="toggle"]')!.click()
    })
    const html = bar().innerHTML
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000) })
    expect(bar()).toBe(node)
    expect(bar().innerHTML).toBe(html)
  })

  it('resumes the moment the modal closes, so the pause is a pause and not a stop', async () => {
    stubMatchMedia(false)
    vi.useFakeTimers()
    await mount(<Surface startOpen />)
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000) })

    const node = bar()
    const frozen = bar().innerHTML
    await act(async () => {
      container!.querySelector<HTMLButtonElement>('[data-testid="toggle"]')!.click()
    })
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(bar()).toBe(node)
    expect(bar().innerHTML).not.toBe(frozen)
  })
})

describe('a headline flip updates the icon nodes and replaces none (LIVE-483)', () => {
  // The items above alternate: a is plain, b is linked, c is plain. One 5s tick crosses the flip
  // in each direction, and the assertion is the LIVE-477 set: the headline link's child nodes are
  // the SAME nodes after the flip, and what changed is a class. Before this fix the icon position
  // held a ternary between two component types, and the svg read as a new node on every crossing.
  it('keeps every child node of the headline link across a linked → plain → linked rotation', async () => {
    stubMatchMedia(false)
    vi.useFakeTimers()
    await mount(<Surface startOpen={false} />)

    const link = () => bar().querySelector<HTMLAnchorElement>('a[aria-live="polite"]')!
    const icons = () => [...link().querySelectorAll('svg')]
    const visible = () => icons().filter((svg) => !svg.classList.contains('hidden'))

    const linkNode = link()
    const before = icons()
    expect(before, 'two icon positions, one per kind').toHaveLength(2)
    expect(visible(), 'exactly one icon is shown').toHaveLength(1)
    const shownAtStart = visible()[0]

    for (let tick = 1; tick <= items.length; tick++) {
      await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
      expect(link(), `link replaced at tick ${tick}`).toBe(linkNode)
      const now = icons()
      expect(now, `icon nodes replaced at tick ${tick}`).toHaveLength(2)
      now.forEach((svg, i) => expect(svg, `icon ${i} replaced at tick ${tick}`).toBe(before[i]))
      expect(visible(), `one icon shown at tick ${tick}`).toHaveLength(1)
      // The CONTROL: the flip actually happens. a→b is plain→linked, so the shown icon changes.
      if (tick === 1) expect(visible()[0]).not.toBe(shownAtStart)
    }
  })

  it('shows Zap for a linked headline and Megaphone for a plain one, never both', async () => {
    stubMatchMedia(false)
    vi.useFakeTimers()
    await mount(<Surface startOpen={false} />)
    const link = () => bar().querySelector<HTMLAnchorElement>('a[aria-live="polite"]')!
    const shown = () => [...link().querySelectorAll('svg')].filter((svg) => !svg.classList.contains('hidden'))
    // Item a is plain: the subtle Megaphone shows, the primary Zap is hidden.
    expect(shown()).toHaveLength(1)
    expect(shown()[0].getAttribute('class')).toContain('text-subtle')
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    // Item b is linked: the primary Zap shows.
    expect(shown()).toHaveLength(1)
    expect(shown()[0].getAttribute('class')).toContain('text-primary')
  })
})
