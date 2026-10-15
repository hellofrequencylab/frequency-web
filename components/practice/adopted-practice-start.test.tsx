// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const { load, still, moving } = vi.hoisted(() => ({ load: vi.fn(), still: vi.fn(), moving: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/app/(main)/on-air/actions', () => ({ loadOnAirSession: load }))
vi.mock('@/app/(main)/on-air/timer-session-actions', () => ({ getActiveTimerSession: async () => ({ data: null }) }))
vi.mock('@/lib/fullscreen', () => ({ requestAppFullscreen: async () => {}, exitAppFullscreen: async () => {} }))
vi.mock('@/components/on-air/session', () => ({ OnAirSession: (p: unknown) => { still(p); return <div>Session</div> } }))
vi.mock('@/components/on-air/movement-session', () => ({ MovementSession: (p: unknown) => { moving(p); return <div>Movement</div> } }))
import { MindlessProvider } from '@/components/on-air/mindless'
import { AdoptedPracticeStart } from './adopted-practice-start'
import { Standing } from '@/components/frequency/members/feed/standing'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let root: Root
let host: HTMLDivElement
beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  load.mockReset(); still.mockClear(); moving.mockClear()
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals() })

describe('adopted practice direct launch', () => {
  it.each(['mindless', 'movement', 'none'])('loads the selected %s practice and forwards its authored context to its canonical engine', async (timerKind) => {
    const practice = { id: 'chosen', title: 'My practice', durationMin: 17, timerKind, mindlessMode: timerKind === 'none' ? 'log' : 'meditate', movementConfig: { mode: 'walk' } }
    load.mockResolvedValue({ data: { practices: [practice], defaultPracticeId: 'chosen', prefs: {} } })
    await act(async () => root.render(<MindlessProvider><AdoptedPracticeStart practiceId="chosen" title="My practice">17 min</AdoptedPracticeStart></MindlessProvider>))
    const button = host.querySelector('button')!
    expect(button.type).toBe('button')
    expect(button.getAttribute('aria-label')).toBe('Start My practice')
    expect(host.querySelector('a')).toBeNull()
    await act(async () => button.click())
    expect(load).toHaveBeenCalledWith('chosen')
    const engine = timerKind === 'movement' ? moving : still
    expect(engine).toHaveBeenCalled()
    expect(engine.mock.calls.at(-1)![0]).toMatchObject({ autoStart: true, defaultPracticeId: 'chosen', practices: [practice] })
    if (timerKind !== 'movement') expect(still.mock.calls.at(-1)![0]).toMatchObject({ explicitPracticeId: 'chosen' })
  })

  it.each([0, 1])('standing practice index%s, including done today, remains a direct start button', async (index) => {
    load.mockImplementation(() => new Promise(() => {}))
    await act(async () => root.render(<MindlessProvider><Standing streak={3} loggedToday atRisk={false} freezeTokens={0} nextMilestone={null} toNext={0} zaps={0} gems={0} rankLabel="Seed" ranks={[]} journeysFinished={0} nextRankLabel={null} journeysToNext={null} zapRows={[]} tuneOutHref="/practices" todayDow={4} practices={[{ id: 'a', title: 'Walk', href: '/practices/walk', meta: '17 min · daily', done: false }, { id: 'b', title: 'Reflect', href: '/practices/reflect', meta: 'daily', done: true }]} /></MindlessProvider>))
    const buttons = [...host.querySelectorAll<HTMLButtonElement>('button.fa-pchip')]
    expect(buttons).toHaveLength(2)
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['Start Walk', 'Start Reflect'])
    expect(buttons[1].textContent).toContain('Done today · Start again')
    await act(async () => buttons[index].click())
    expect(load).toHaveBeenCalledWith(index === 0 ? 'a' : 'b')
  })
})
