// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const route = vi.hoisted(() => ({ path: '/spaces/willow', query: 'edit=page' }))
vi.mock('next/navigation', () => ({ usePathname: () => route.path, useSearchParams: () => new URLSearchParams(route.query) }))
const open = vi.hoisted(() => vi.fn())
vi.mock('@/components/admin/open-admin-bar', () => ({ openAdminBar: open }))
import { SpaceProfileEditorEntry } from './space-profile-editor-entry'
let cleanup: (() => void) | undefined
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); vi.useFakeTimers(); open.mockClear(); route.path = '/spaces/willow'; route.query = 'edit=page' })
function unmount() { cleanup?.(); cleanup = undefined }
afterEach(() => { unmount(); vi.useRealTimers() })
function mount() {
  const node = document.createElement('div'); document.body.append(node); const root = createRoot(node)
  act(() => root.render(<SpaceProfileEditorEntry slug="willow" spaceId="server-space-id" spaceType="business" />))
  cleanup = () => { act(() => root.unmount()); node.remove() }
}
it('opens the typed Page app using server scope and ignores injected scope and app query values', () => {
  route.query += '&scope=other-space&appId=space.danger'
  mount()
  expect(open).not.toHaveBeenCalled()
  act(() => vi.runAllTimers())
  expect(open).toHaveBeenCalledExactlyOnceWith({ scope: { kind: 'space', id: 'server-space-id' }, spaceType: 'business', moduleMenu: undefined, appId: 'space.layout' })
})
it.each(['/spaces/other', '/spaces/willow/about', '/spaces/willow/manage'])('does not open on unrelated page %s', (path) => {
  route.path = path; mount(); act(() => vi.runAllTimers()); expect(open).not.toHaveBeenCalled()
})
it('does not open for an unsupported editor query or after navigation unmounts the entry', () => {
  route.query = 'edit=other'; mount(); act(() => vi.runAllTimers()); expect(open).not.toHaveBeenCalled()
  unmount()
  route.query = 'edit=page'; mount(); unmount()
  act(() => vi.runAllTimers()); expect(open).not.toHaveBeenCalled()
})
