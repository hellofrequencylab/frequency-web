// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StageNotice } from './live-stage'
import { Reveal } from './reveal'
import { RoomWash, endsAtLabel, useDoneBy } from './stage-room'
import type { RevealPayload } from '@/lib/on-air'

vi.mock('@/components/funnels/next-step-link', () => ({ FunnelNextStep: () => null }))
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let root: Root | undefined
let host: HTMLDivElement
function render(node: React.ReactNode) {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  act(() => root!.render(node))
}
afterEach(() => { act(() => root?.unmount()); host?.remove(); vi.useRealTimers(); vi.unstubAllGlobals() })

const payload: RevealPayload = {
  logged: true, zapsAwarded: 0, bonuses: [], welcomeBack: false, practiceTitle: 'Evening Walk',
  streak: { current: 3, longest: 9, freezeTokens: 0, nextMilestone: null, toNext: 0 },
  stats: { sessionSeconds: 600, sessionLabel: 'This walk', todaySeconds: 600, totalSeconds: 6000, lifetimeLogs: 4, nextDepthMark: null, amplitude: 10, amplitudeLevel: 1 },
  dispatch: { copy: 'Good walk.', actionHref: '/feed', actionLabel: 'Back to feed' },
}

describe('the Mindless room (LIVE-2395)', () => {
  it('lights a takeover from behind, under its content', () => {
    render(<RoomWash fill="var(--design-practice-orb)" />)
    const wash = host.querySelector<HTMLElement>('[data-room-wash]')!
    expect(wash.getAttribute('aria-hidden')).toBe('true')
    expect(wash.className).toContain('-z-10')
    expect(wash.className).toContain('pointer-events-none')
  })

  it('says when a session would land if it started now, and nothing for an open-ended one', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 10, 19, 18, 22, 0))
    function Probe({ sec }: { sec: number | null }) { return <p>{useDoneBy(sec) ?? 'none'}</p> }
    render(<Probe sec={20 * 60} />)
    act(() => { vi.advanceTimersByTime(1) })
    expect(host.textContent).toBe(endsAtLabel(new Date(2026, 10, 19, 18, 22, 0).getTime(), 20 * 60))
    act(() => root!.render(<Probe sec={null} />))
    expect(host.textContent).toBe('none')
  })

  it('shows the save as a status on the orb, with nothing to press', () => {
    render(<StageNotice mode="still" tone="working" title="Counting it up" body="Tuning back in." />)
    const notice = host.querySelector('[data-stage-notice="working"]')!
    expect(notice.getAttribute('role')).toBe('status')
    expect(notice.textContent).toContain('Counting it up')
    expect(host.querySelector('button')).toBeNull()
    expect(host.querySelector('[data-room-wash]')).not.toBeNull()
  })

  it('shows a failed save as an alert with the one way forward', () => {
    const again = vi.fn()
    render(<StageNotice mode="move" tone="problem" title="That did not save." body="Your movement still happened." action={{ label: 'Try again', onClick: again }} />)
    expect(host.querySelector('[data-stage-notice="problem"]')!.getAttribute('role')).toBe('alert')
    const b = host.querySelector('button')!
    expect(b.textContent).toBe('Try again')
    act(() => b.click())
    expect(again).toHaveBeenCalledTimes(1)
  })

  it('ends a walk in the move accent and a sit in the practice accent', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }))
    render(<Reveal payload={payload} mode="move" onClose={() => {}} />)
    expect(host.querySelector('[data-reveal="move"]')).not.toBeNull()
    expect(host.querySelector('.bg-move')).not.toBeNull()
    act(() => root!.render(<Reveal payload={payload} onClose={() => {}} />))
    expect(host.querySelector('[data-reveal="still"]')).not.toBeNull()
    expect(host.querySelector('.bg-move')).toBeNull()
  })
})
