// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
  KeptDatesNotice,
  SERIES_CANCEL_ANCHOR_ID,
  keptDatesCopy,
  revealSeriesCancel,
} from './event-kept-dates-notice'
import { OPEN_ADMIN_BAR } from '@/components/admin/open-admin-bar'

// LIVE-279. A host who changes a repeat rule is told how many future dates survived the change
// because people are attached to them, and is pointed at the ONE existing series-cancel control.
// The assertions are the consequences: the number is on screen when it is above zero, nothing is
// on screen when it is zero, and the pointer reveals the Danger zone's block rather than owning a
// cancel of its own.

let container: HTMLDivElement | null = null
let root: Root | null = null

function mount(node: ReactNode) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(node))
  return container
}

afterEach(() => {
  if (root) act(() => root!.unmount())
  container?.remove()
  root = null
  container = null
  document.body.innerHTML = ''
  vi.useRealTimers()
})

describe('keptDatesCopy', () => {
  it('says nothing for zero, a negative, or a non-number', () => {
    expect(keptDatesCopy(0)).toBeNull()
    expect(keptDatesCopy(-2)).toBeNull()
    expect(keptDatesCopy(Number.NaN)).toBeNull()
  })

  it('names the number, in the plural and the singular, and keeps to the voice canon', () => {
    const three = keptDatesCopy(3)!
    expect(three.title).toBe('3 dates are still on the calendar')
    const one = keptDatesCopy(1)!
    expect(one.title).toBe('1 date is still on the calendar')
    // docs/CONTENT-VOICE.md §10: no em dashes, sentence case, one concrete number.
    for (const text of [three.title, three.body, one.title, one.body]) {
      expect(text).not.toContain('—')
      expect(text).not.toMatch(/occurrence|anchor/i) // internal nouns never reach a member (NAMING §Events)
    }
    expect(three.body).toContain('cancel the rest of the series')
  })
})

describe('KeptDatesNotice', () => {
  it('renders the line when dates were kept', () => {
    const el = mount(<KeptDatesNotice kept={3} onReveal={() => {}} />)
    expect(el.textContent).toContain('3 dates are still on the calendar')
    expect(el.querySelector('[data-kept-dates="3"]')).not.toBeNull()
    expect(el.querySelector('[role="status"]')).not.toBeNull()
    expect(el.querySelector('button')?.textContent).toBe('Cancel the rest of this series')
  })

  it('renders nothing for zero', () => {
    const el = mount(<KeptDatesNotice kept={0} onReveal={() => {}} />)
    expect(el.innerHTML).toBe('')
    expect(el.textContent).not.toContain('still on the calendar')
  })

  it('the pointer calls the reveal, never a cancel of its own', () => {
    const onReveal = vi.fn()
    const el = mount(<KeptDatesNotice kept={2} onReveal={onReveal} />)
    act(() => el.querySelector('button')!.click())
    expect(onReveal).toHaveBeenCalledTimes(1)
  })
})

describe('revealSeriesCancel', () => {
  it('opens every disclosure above the Danger zone block, scrolls to it, and focuses it', () => {
    const details = document.createElement('details')
    const target = document.createElement('div')
    target.id = SERIES_CANCEL_ANCHOR_ID
    target.tabIndex = -1
    target.scrollIntoView = vi.fn()
    details.appendChild(target)
    document.body.appendChild(details)
    const opened = vi.fn()
    window.addEventListener(OPEN_ADMIN_BAR, opened)

    revealSeriesCancel()

    expect(details.open).toBe(true)
    expect(target.scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'smooth' })
    expect(document.activeElement).toBe(target)
    // The block was already on the page, so the rail was not asked to open.
    expect(opened).not.toHaveBeenCalled()
    window.removeEventListener(OPEN_ADMIN_BAR, opened)
  })

  it('when the block is not mounted yet, opens the rail and keeps looking until it appears', () => {
    vi.useFakeTimers()
    const opened = vi.fn()
    window.addEventListener(OPEN_ADMIN_BAR, opened)

    revealSeriesCancel()
    expect(opened).toHaveBeenCalledTimes(1)

    // The rail mounts the Danger zone a moment later.
    vi.advanceTimersByTime(300)
    const target = document.createElement('div')
    target.id = SERIES_CANCEL_ANCHOR_ID
    target.tabIndex = -1
    target.scrollIntoView = vi.fn()
    document.body.appendChild(target)
    vi.advanceTimersByTime(300)

    expect(target.scrollIntoView).toHaveBeenCalled()
    window.removeEventListener(OPEN_ADMIN_BAR, opened)
  })
})
