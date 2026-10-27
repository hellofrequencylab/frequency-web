// @vitest-environment jsdom
import { act, type ComponentType } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { OPEN_ADMIN_BAR, type OpenAdminBarDetail } from '@/components/admin/open-admin-bar'

const lazy = vi.hoisted(() => ({ mounts: 0, props: null as null | { onListening?: () => void } }))
vi.mock('next/dynamic', () => ({ default: () => ((props: { onListening?: () => void }) => {
  lazy.mounts++
  lazy.props = props
  return null
}) as ComponentType }))
import { LazyAdminBar } from './lazy-admin-bar'

let root: Root
let node: HTMLDivElement
let desktop: boolean
let resize: (() => void) | undefined
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  localStorage.clear()
  lazy.mounts = 0
  lazy.props = null
  desktop = true
  resize = undefined
  window.matchMedia = vi.fn().mockImplementation(() => ({ get matches() { return desktop }, addEventListener: (_: string, fn: () => void) => { resize = fn }, removeEventListener: vi.fn() }))
  node = document.createElement('div')
  document.body.append(node)
  root = createRoot(node)
})
afterEach(() => { act(() => root.unmount()); node.remove(); vi.restoreAllMocks() })
function mount() { act(() => root.render(<LazyAdminBar />)) }
function open(detail: OpenAdminBarDetail) { act(() => window.dispatchEvent(new CustomEvent(OPEN_ADMIN_BAR, { detail }))) }
it('does not mount the dynamic admin chunk for a closed shell', () => {
  mount()
  expect(lazy.mounts).toBe(0)
})
it('retains the first scoped request until the delayed chunk installs its listener', () => {
  mount()
  const detail = { appId: 'space.layout', scope: { kind: 'space' as const, id: 'space-a' } }
  open(detail)
  expect(lazy.mounts).toBe(1)
  const delivered: unknown[] = []
  const listener = (e: Event) => delivered.push((e as CustomEvent).detail)
  window.addEventListener(OPEN_ADMIN_BAR, listener)
  act(() => lazy.props?.onListening?.())
  expect(delivered).toEqual([detail])
  // Repeated readiness (including Strict Mode effects) cannot replay stale scope.
  act(() => lazy.props?.onListening?.())
  expect(delivered).toEqual([detail])
  open({ appId: 'other' })
  expect(delivered).toEqual([detail, { appId: 'other' }])
  window.removeEventListener(OPEN_ADMIN_BAR, listener)
})
it('the most recent request wins while the chunk is loading', () => {
  mount()
  open({ appId: 'old' })
  open({ appId: 'latest' })
  const listener = vi.fn()
  window.addEventListener(OPEN_ADMIN_BAR, listener)
  act(() => lazy.props?.onListening?.())
  expect(listener).toHaveBeenCalledTimes(1)
  expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual({ appId: 'latest' })
  window.removeEventListener(OPEN_ADMIN_BAR, listener)
})
it('loads a persisted desktop rail so the actual admin bar can restore its scope and width', () => {
  localStorage.setItem('freq-settings-open', '1')
  mount()
  expect(lazy.mounts).toBe(1)
})
it('does not restore a desktop rail on mobile, but handles a later desktop resize', () => {
  desktop = false
  localStorage.setItem('freq-settings-open', '1')
  mount()
  expect(lazy.mounts).toBe(0)
  desktop = true
  act(() => resize?.())
  expect(lazy.mounts).toBe(1)
})
it('storage denial still allows the typed open trigger', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
  mount()
  expect(lazy.mounts).toBe(0)
  open({})
  expect(lazy.mounts).toBe(1)
})
