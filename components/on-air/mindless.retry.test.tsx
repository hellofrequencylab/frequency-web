// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ load: vi.fn(), active: vi.fn(), refresh: vi.fn(), engines: [] as { kind: string; props: Record<string, unknown> }[] }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: m.refresh }) }))
vi.mock('@/app/(main)/on-air/actions', () => ({ loadOnAirSession: m.load }))
vi.mock('@/app/(main)/on-air/timer-session-actions', () => ({ getActiveTimerSession: m.active }))
vi.mock('@/lib/fullscreen', () => ({ requestAppFullscreen: async () => {}, exitAppFullscreen: async () => {} }))
vi.mock('next/dynamic', () => ({ default: (loader: () => unknown) => {
  const kind = String(loader).includes('movement-session') ? 'move' : 'still'
  return (props: Record<string, unknown>) => {
    m.engines.push({ kind, props })
    return <button data-testid="engine" onClick={() => { (props.onCompleted as () => void)(); (props.onExit as () => void)() }}>Finish leg</button>
  }
} }))

import { MindlessProvider, useMindless, type MindlessOpenOpts } from '@/components/on-air/mindless'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let root: Root
let host: HTMLDivElement
function Open({ opts }: { opts: MindlessOpenOpts }) { const timer = useMindless(); return <button onClick={() => timer.open(opts)}>Open selected</button> }
function result(id = 'run') { return { data: { practices: [{ id, timerKind: id.startsWith('still') ? 'mindless' : 'movement', title: id, movementConfig: { mode: 'walk' } }], defaultPracticeId: id, prefs: {}, practicedToday: false } } }
async function open(opts: MindlessOpenOpts) { await act(async () => root.render(<MindlessProvider><Open opts={opts} /></MindlessProvider>)); await act(async () => host.querySelector('button')!.click()) }
async function retry() { const b = [...host.querySelectorAll('button')].find(x => x.textContent === 'Try again')!; expect(b).toBeTruthy(); await act(async () => b.click()) }
beforeEach(() => { window.localStorage.clear(); m.engines.length=0; m.load.mockReset(); m.active.mockResolvedValue({ data: { session: null, expired: false } }); host=document.createElement('div');document.body.append(host);root=createRoot(host) })
afterEach(async () => { await act(async () => root.unmount());host.remove() })

describe('Mindless loading retry intent', () => {
  it.each(['returned', 'rejected'])('replays the original explicit resume after %s failure', async kind => {
    if (kind === 'returned') m.load.mockResolvedValueOnce({ error: 'Unavailable' }); else m.load.mockRejectedValueOnce(new Error('Network'))
    m.load.mockResolvedValue(result())
    await open({ practiceId: 'run', mode: 'walk', autoStart: true, resumeFromSec: 90, secondsTarget: 300, minutesOverride: 12, warmupMessage: 'This is the requested leg' })
    expect(host.textContent).toContain('That didn’t open')
    await retry()
    expect(m.load.mock.calls.map(c => c[0])).toEqual(['run', 'run'])
    expect(m.engines.at(-1)?.kind).toBe('move')
    expect(m.engines.at(-1)?.props).toMatchObject({ defaultMode: 'walk', resumeFromSec: 90, secondsTarget: 300, minutesOverride: 12, autoStart: true, warmupMessageOverride: 'This is the requested leg' })
  })
  it('retries the failed second queue leg and advances to the third once', async () => {
    let failed = false
    m.load.mockImplementation(async (id: string) => { if (id === 'run2' && !failed) { failed=true; return { error: 'Unavailable' } } return result(id) })
    await open({ queue: ['still1', 'run2', 'still3'], autoStart: true })
    await act(async () => host.querySelector<HTMLButtonElement>('[data-testid="engine"]')!.click())
    await retry()
    expect(m.engines.at(-1)?.props.queuePosition).toEqual({ index: 1, total: 3 })
    await act(async () => host.querySelector<HTMLButtonElement>('[data-testid="engine"]')!.click())
    expect(m.load.mock.calls.map(c => c[0])).toEqual(['still1', 'run2', 'run2', 'still3'])
    expect(m.engines.at(-1)?.props.queuePosition).toEqual({ index: 2, total: 3 })
  })
  it('keeps the recovered movement engine on retry', async () => {
    window.localStorage.setItem('fq_live_session_movement', JSON.stringify({ kind: 'movement', startedAt: Date.now()-60000, pausedAt: null, practiceId: 'run', resumeFromSec: 0, secondsTarget: 300, savedAt: Date.now(), setup: {} }))
    m.load.mockRejectedValueOnce(new Error('Network')).mockResolvedValue(result())
    await act(async () => root.render(<MindlessProvider><span>Page</span></MindlessProvider>))
    await retry()
    expect(m.engines.at(-1)?.kind).toBe('move')
  })
})
