// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { DirectorySearch } from './directory-search'

// Locks the states the directory search box owes (docs/INTERACTION-STATES.md §2 Field: rest,
// focus, disabled) plus the one §5 sweep item 9 added: LOADING.
//
// The gap it closes: this control writes the URL and the results come back from the server, so
// between the debounce firing and the new page committing there is a window where the list on
// screen still belongs to the previous query. Until the box said so, an empty result and a
// pending one were indistinguishable — the member typed a name, saw nothing, and had no way to
// know whether that was the answer or the wait.
//
// ⚠️ HOW THE PENDING WINDOW IS HELD OPEN HERE. In the app, `router.replace` inside a transition
// keeps `isPending` true until the new server content is ready to commit. There is no server in
// jsdom, so the mock router's `replace` returns a promise that never settles — React 19 keeps a
// transition pending on a returned thenable, which reproduces exactly that window and lets the
// assertions look at it. `replaceCalls` proves the navigation really was attempted, so the
// pending state cannot be an artifact of the component simply not navigating.

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const replaceCalls: string[] = []
let params = new URLSearchParams()

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: (href: string) => {
      replaceCalls.push(href)
      return new Promise<void>(() => {}) // in flight, and staying that way
    },
  }),
  usePathname: () => '/people',
  useSearchParams: () => params,
}))

let container: HTMLDivElement | null = null
let root: Root | null = null

beforeEach(() => {
  vi.useFakeTimers()
  replaceCalls.length = 0
  params = new URLSearchParams()
})

afterEach(() => {
  if (root) act(() => root!.unmount())
  if (container) container.remove()
  root = null
  container = null
  vi.useRealTimers()
})

function mount(props: Partial<React.ComponentProps<typeof DirectorySearch>> = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(<DirectorySearch {...props} />))
  return container!
}

const region = (c: HTMLElement) => c.firstElementChild as HTMLElement
const input = (c: HTMLElement) => c.querySelector('input')!

/** Type a query and run out the 250ms debounce, so the navigation actually starts. */
function search(c: HTMLElement, q: string) {
  const el = input(c)
  act(() => {
    // React attaches its listener at the root, so set the value the way React reads it back
    // and then fire the event it is listening for.
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, q)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
  act(() => {
    vi.advanceTimersByTime(300)
  })
}

describe('DirectorySearch rest', () => {
  it('is a labelled search field with a leading search glyph and nothing spinning', () => {
    const c = mount()
    expect(input(c).getAttribute('aria-label')).toBe('Search by name…')
    expect(region(c).getAttribute('aria-busy')).toBeNull()
    expect(c.querySelector('.animate-spin')).toBeNull()
  })

  it('says nothing to a screen reader while it is idle', () => {
    expect(mount().querySelector('[role="status"]')!.textContent).toBe('')
  })
})

describe('DirectorySearch disabled', () => {
  it('is a real disabled attribute on the field, not a live box that goes nowhere', () => {
    expect(input(mount({ disabled: true })).disabled).toBe(true)
  })
})

describe('DirectorySearch loading', () => {
  it('marks the region busy once the query is actually in flight', () => {
    const c = mount()
    search(c, 'ada')
    expect(replaceCalls).toEqual(['/people?q=ada'])
    expect(region(c).getAttribute('aria-busy')).toBe('true')
  })

  it('is announced, not just spun at: the status line speaks while the query is in flight', () => {
    const c = mount()
    search(c, 'ada')
    expect(c.querySelector('[role="status"]')!.textContent).toBe('Searching…')
  })

  it('shows the cue by SWAPPING the leading glyph, so the field cannot change width', () => {
    const c = mount()
    const before = input(c).getBoundingClientRect().width
    search(c, 'ada')
    const spinner = c.querySelector('.animate-spin')
    expect(spinner).not.toBeNull()
    // `getAttribute`, not `.className` — the spinner is an <svg>, whose className is an
    // SVGAnimatedString rather than a plain string.
    expect(spinner!.getAttribute('class')).toContain('absolute')
    expect(input(c).getBoundingClientRect().width).toBe(before)
  })

  it('guards the spin under prefers-reduced-motion (INTERACTION-STATES §3)', () => {
    const c = mount()
    search(c, 'ada')
    const spinner = c.querySelector('.animate-spin')!
    expect(spinner.getAttribute('class')).toContain('motion-reduce:animate-none')
  })

  it('stays typeable while it is busy — a search box that locks mid-query is worse', () => {
    const c = mount()
    search(c, 'ada')
    expect(input(c).disabled).toBe(false)
    expect(input(c).value).toBe('ada')
  })

  it('does not go busy on a keystroke alone — the debounce still owns the first 250ms', () => {
    const c = mount()
    const el = input(c)
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, 'a')
      el.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(replaceCalls).toEqual([])
    expect(region(c).getAttribute('aria-busy')).toBeNull()
  })
})
