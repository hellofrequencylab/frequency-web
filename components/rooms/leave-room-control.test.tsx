// @vitest-environment jsdom
import { act, Component, type ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const s = vi.hoisted(() => ({ leave: vi.fn(), replace: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', async () => { const actual = await vi.importActual<typeof import('next/navigation')>('next/navigation'); return { ...actual, useRouter: () => ({ replace: s.replace, refresh: s.refresh }) } })
vi.mock('@/app/(main)/messages/rooms/leave-feedback', () => ({ leaveRoomWithFeedback: s.leave }))
import { LeaveRoomControl } from './leave-room-control'
let root: Root, host: HTMLDivElement
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); host = document.createElement('div'); document.body.append(host); root = createRoot(host); act(() => root.render(<LeaveRoomControl roomId="room-A" />)) })
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; vi.unstubAllGlobals() })
const button = () => host.querySelector<HTMLButtonElement>('button')!
it('shows the last-admin reason accessibly and stays in the current room', async () => {
  s.leave.mockResolvedValue({ error: 'Make someone else an admin before you leave this room.' })
  await act(async () => button().click())
  expect(s.leave).toHaveBeenCalledExactlyOnceWith('room-A')
  const error = host.querySelector('[role="alert"]')!
  expect(error.textContent).toContain('Make someone else an admin')
  expect(button().getAttribute('aria-describedby')).toBe(error.id); expect(button().disabled).toBe(false)
  expect(s.replace).not.toHaveBeenCalled(); expect(s.refresh).not.toHaveBeenCalled()
})
it('disables duplicate pending requests and returns to refreshed inbox only after success', async () => {
  let resolve!: (r: { data: undefined }) => void
  s.leave.mockReturnValue(new Promise(r => { resolve = r }))
  act(() => { button().click(); button().click() })
  expect(s.leave).toHaveBeenCalledTimes(1); expect(button().disabled).toBe(true); expect(button().textContent).toBe('Leaving…')
  expect(s.replace).not.toHaveBeenCalled()
  await act(async () => resolve({ data: undefined }))
  expect(s.replace).toHaveBeenCalledExactlyOnceWith('/messages'); expect(s.refresh).toHaveBeenCalledOnce()
})
it('hides masked/raw transport details and allows a clean retry', async () => {
  s.leave.mockRejectedValueOnce(new Error('private server detail'))
  await act(async () => button().click())
  expect(host.querySelector('[role="alert"]')?.textContent).toBe('Could not leave this room. Please try again.')
  expect(host.textContent).not.toContain('private'); expect(s.replace).not.toHaveBeenCalled()
  s.leave.mockResolvedValueOnce({ data: undefined }); await act(async () => button().click())
  expect(host.querySelector('[role="alert"]')).toBeNull(); expect(s.replace).toHaveBeenCalledExactlyOnceWith('/messages')
})

class RedirectBoundary extends Component<{ children: ReactNode }, { digest: string | null }> {
  state = { digest: null as string | null }
  static getDerivedStateFromError(error: { digest: string }) { return { digest: error.digest } }
  render() { return this.state.digest ? <p data-redirect-digest={this.state.digest}>Framework redirect</p> : this.props.children }
}
it('rethrows a real Next redirect signal from the client catch instead of showing a generic refusal', async () => {
  let signal: unknown
  try { redirect('/sign-in') } catch (error) { signal = error }
  s.leave.mockRejectedValue(signal)
  const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    act(() => root.render(<RedirectBoundary><LeaveRoomControl roomId="room-A" /></RedirectBoundary>))
    await act(async () => button().click())
    expect(host.querySelector('[data-redirect-digest]')?.getAttribute('data-redirect-digest')).toContain('NEXT_REDIRECT')
    expect(host.querySelector('[data-redirect-digest]')?.getAttribute('data-redirect-digest')).toContain('/sign-in')
    expect(host.textContent).not.toContain('Could not leave'); expect(s.replace).not.toHaveBeenCalled()
  } finally { logged.mockRestore() }
})
