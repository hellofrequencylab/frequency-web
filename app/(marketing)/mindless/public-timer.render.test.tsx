// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

// The rings animate on rAF and read matchMedia; neither matters to the clock under test.
vi.mock('@/components/on-air/visualizer', () => ({ BreathVisualizer: () => null }))
// A link's prefetch idle task is unrelated to the session interval being measured.
vi.mock('next/link', () => ({ default: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} /> }))

import { PublicTimer, PUBLIC_SESSION_SECONDS, SAME_TIME_TOMORROW_HREF } from './public-timer'
import { FrequencyMindlessTimer } from '@/components/frequency/site/pages/funnel/mindless-timer'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.useFakeTimers()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.useRealTimers()
})

const button = (label: string) =>
  [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(label)) as HTMLButtonElement

describe.each([['DAWN', PublicTimer], ['Frequency', FrequencyMindlessTimer]] as const)('%s public timer', (_design, Timer) => {
  it('runs five minutes, then offers same time tomorrow through a free account', () => {
    act(() => root.render(<Timer />))
    expect(PUBLIC_SESSION_SECONDS).toBe(300)
    expect(host.textContent).toContain('5:00')

    act(() => button('Start 5 minutes').click())
    act(() => vi.advanceTimersByTime(60_000))
    expect(host.textContent).toContain('4:00')

    act(() => vi.advanceTimersByTime(PUBLIC_SESSION_SECONDS * 1000))
    expect(host.textContent).toContain('Same time tomorrow?')
    expect(host.textContent).toContain('Five minutes, done')
    expect(vi.getTimerCount()).toBe(0)
    const link = host.querySelector(`a[href="${SAME_TIME_TOMORROW_HREF}"]`)
    expect(link?.textContent).toContain('same time tomorrow')
  })

  it('sits again from the start', () => {
    act(() => root.render(<Timer />))
    act(() => button('Start 5 minutes').click())
    act(() => button('End early').click())
    act(() => button('Sit again').click())
    expect(host.textContent).toContain('5:00')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('ends a partial session without claiming five minutes were completed', () => {
    act(() => root.render(<Timer />))
    act(() => button('Start 5 minutes').click())
    act(() => vi.advanceTimersByTime(12_000))
    act(() => button('End early').click())
    expect(host.textContent).toContain('Session ended')
    expect(host.textContent).not.toContain('Five minutes, done')
    expect(host.querySelector(`a[href="${SAME_TIME_TOMORROW_HREF}"]`)).not.toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('recognizes completion if the clock passes its deadline before the interval runs', () => {
    act(() => root.render(<Timer />))
    act(() => button('Start 5 minutes').click())
    vi.setSystemTime(Date.now() + PUBLIC_SESSION_SECONDS * 1000)
    act(() => button('End early').click())
    expect(host.textContent).toContain('Five minutes, done')
    expect(vi.getTimerCount()).toBe(0)
  })
})
