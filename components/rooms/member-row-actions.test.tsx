// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const actions = vi.hoisted(() => ({ promoteRoomMember: vi.fn(), demoteRoomMember: vi.fn(), removeFromRoom: vi.fn() }))
vi.mock('@/app/(main)/messages/rooms/actions', () => actions)
import { MemberRowActions } from './member-row-actions'
let root: Root
let container: HTMLDivElement
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  for (const action of Object.values(actions)) action.mockResolvedValue(undefined)
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; vi.unstubAllGlobals() })
function mount(isAdmin = false) { act(() => root.render(<MemberRowActions roomId="room-A" memberId="member-B" memberName="Sam" isAdmin={isAdmin} />)) }
const trigger = () => container.querySelector<HTMLButtonElement>('[aria-label="Member actions for Sam"]')!
const button = (text: string) => [...container.querySelectorAll<HTMLButtonElement>('button')].find(e => e.textContent?.includes(text))!
function open() { trigger().focus(); act(() => trigger().click()) }
it('is visibly keyboard reachable, focuses its controls and Escape restores focus', () => {
  mount(); expect(trigger().type).toBe('button'); expect(trigger().className).not.toContain('opacity-0')
  open(); expect(trigger().getAttribute('aria-expanded')).toBe('true')
  expect(document.activeElement).toBe(button('Make admin'))
  act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  expect(trigger().getAttribute('aria-expanded')).toBe('false'); expect(document.activeElement).toBe(trigger())
})
it('an outside click closes controls', () => {
  mount(); open(); act(() => document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })))
  expect(container.querySelector('[role=group]')).toBeNull()
})
it.each([[false, 'Make admin', 'promoteRoomMember'], [true, 'Remove admin', 'demoteRoomMember'], [false, 'Remove from room', 'removeFromRoom']] as const)('runs the correct scoped member action %s/%s and closes on success', async (admin, label, key) => {
  mount(admin); open(); await act(async () => button(label).click())
  expect(actions[key]).toHaveBeenCalledExactlyOnceWith('room-A', 'member-B')
  expect(container.querySelector('[role=group]')).toBeNull()
})
it('announces a mutation failure without closing or claiming success', async () => {
  actions.promoteRoomMember.mockRejectedValue(new Error('Could not save this role.'))
  mount(); open(); await act(async () => button('Make admin').click())
  expect(container.querySelector('[role=alert]')?.textContent).toBe('Could not save this role.')
  expect(container.querySelector('[role=group]')).not.toBeNull(); expect(trigger().disabled).toBe(false)
})
it('disables controls while pending and prevents duplicate writes', async () => {
  let finish!: () => void
  actions.promoteRoomMember.mockImplementation(() => new Promise<void>(resolve => { finish = resolve }))
  mount(); open(); act(() => button('Make admin').click())
  expect(trigger().disabled).toBe(true); expect(button('Remove from room').disabled).toBe(true)
  act(() => button('Make admin').click()); expect(actions.promoteRoomMember).toHaveBeenCalledTimes(1)
  await act(async () => finish()); expect(trigger().disabled).toBe(false)
})
