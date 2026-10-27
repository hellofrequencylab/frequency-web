// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ update: vi.fn(), remove: vi.fn(), refresh: vi.fn() }))
vi.mock('@/app/(main)/messages/rooms/actions', () => ({ updateRoom: mocks.update, deleteRoom: mocks.remove }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock('@/components/studio/studio-window', () => ({ StudioWindow: ({ children, footer }: { children: ReactNode; footer: ReactNode }) => <div role="dialog">{children}{footer}</div> }))
vi.mock('@/components/admin/danger-modal', () => ({ DangerModal: ({ open, onConfirm }: { open: boolean; onConfirm: () => void }) => open ? <button onClick={onConfirm}>Confirm deletion</button> : null }))
import { RoomSettings } from './room-settings'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let root: Root, host: HTMLDivElement
beforeEach(() => { vi.clearAllMocks(); host = document.createElement('div'); document.body.append(host); root = createRoot(host) })
afterEach(() => { act(() => root.unmount()); host.remove() })
function button(text: string) { return [...host.querySelectorAll('button')].find(b => b.textContent?.trim() === text)! }
function mount(visibility = 'circle', scopeId: string | null = 'scope-A') { act(() => root.render(<RoomSettings roomId="room-A" name="Our room" description={null} visibility={visibility} scopeId={scopeId} />)); act(() => button('Settings').click()) }
it.each(['circle', 'hub', 'nexus', 'outpost', 'channel'])('keeps %s settings scoped and does not submit a fabricated manual visibility', async visibility => {
  mocks.update.mockResolvedValue({ data: undefined }); mount(visibility)
  expect(host.querySelector('[aria-labelledby="room-visibility-label"]')).toBeNull()
  expect(host.textContent).toContain('managed by its community')
  await act(async () => button('Save changes').click())
  const [room, fd] = mocks.update.mock.calls[0]; expect(room).toBe('room-A'); expect(fd.get('name')).toBe('Our room'); expect(fd.has('visibility')).toBe(false)
  expect(mocks.refresh).toHaveBeenCalledTimes(1)
})
it('keeps real public/private controls available only for an unscoped manual room', async () => {
  mocks.update.mockResolvedValue({ data: undefined }); mount('public', null)
  expect(button('Anyone').getAttribute('aria-pressed')).toBe('true')
  act(() => button('Invite only').click()); expect(button('Invite only').getAttribute('aria-pressed')).toBe('true')
  await act(async () => button('Save changes').click())
  expect(mocks.update.mock.calls[0][1].get('visibility')).toBe('private')
})
it('recovers after a rejected save without exposing the private exception', async () => {
  mocks.update.mockRejectedValue(new Error('private connection credential')); mount()
  await act(async () => button('Save changes').click())
  expect(host.textContent).toContain('Could not save this room. Please try again.')
  expect(host.textContent).not.toContain('credential'); expect(button('Save changes').disabled).toBe(false); expect(mocks.refresh).not.toHaveBeenCalled()
})

it('recovers visibly from refused deletion without claiming success', async () => {
  mocks.remove.mockRejectedValue(new Error('private database credential')); mount()
  act(() => button('Delete this board').click())
  await act(async () => button('Confirm deletion').click())
  expect(host.textContent).toContain('Could not delete this room. Please try again.')
  expect(host.textContent).not.toContain('credential'); expect(button('Save changes').disabled).toBe(false); expect(mocks.refresh).not.toHaveBeenCalled()
})
