// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Settings } from 'lucide-react'
import type { SettingsPanelModel } from '@/components/layout/settings-panel'
let shellModel: SettingsPanelModel
vi.mock('@/components/layout/settings-panel', () => ({ useSettingsPanel: () => shellModel, useIsDesktop: () => true }))
vi.mock('next/navigation', () => ({ usePathname: () => '/spaces/willow' }))
vi.mock('@/components/admin/modules/space-rail-data', () => ({ SpaceRailDataProvider: ({ children }: { children: ReactNode }) => children }))
vi.mock('@/components/admin/modules/entity-rail-data', () => ({ EntityRailDataProvider: ({ children }: { children: ReactNode }) => children }))
vi.mock('@/app/(main)/settings/rail-getters', () => ({ getProfileCompletenessRail: vi.fn() }))
vi.mock('./hub-rail', () => ({ HubRail: () => null }))
import { AdminBarBody } from './admin-bar-body'
import { AdminBar } from './admin-bar'

let cleanup: (() => void) | undefined
const scroll = vi.fn()
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, requestAnimationFrame: () => 1, cancelAnimationFrame: () => {} }); HTMLElement.prototype.scrollIntoView = scroll; scroll.mockClear(); localStorage.clear(); sessionStorage.clear() })
afterEach(() => { cleanup?.(); cleanup = undefined })
function mount(focusAppId: string, permitted = true, extra = false) {
  const model: SettingsPanelModel = {
    hasContent: true, pageGroup: null, searchApps: [], lockedApps: [], bank: [], hub: null,
    sections: [{ tier: extra ? 'extra' : 'standard', slot: 'layout', label: 'Profile', Icon: Settings, nodes: [
      { id: 'space.basics', label: 'Identity', node: <div>Identity</div> },
      ...(permitted ? [{ id: 'space.layout', label: 'Page', node: <div>Sidebar page builder</div> }] : []),
    ] }],
  }
  const node = document.createElement('div'); document.body.append(node); const root = createRoot(node)
  act(() => root.render(<AdminBarBody model={model} query="" onQueryChange={vi.fn()} focusAppId={focusAppId} />))
  cleanup = () => { act(() => root.unmount()); node.remove() }
  return node
}
it('focuses the existing Page app instead of merely opening the generic sidebar', () => {
  const node = mount('space.layout')
  expect(document.activeElement).toBe(node.querySelector('[data-admin-app="space.layout"]'))
  expect(scroll).toHaveBeenCalledWith({ block: 'start' })
})
it('cannot inject an app absent from the authorized model', () => {
  const node = mount('space.layout', false)
  expect(node.textContent).not.toContain('Sidebar page builder')
  expect(node.querySelector('[data-admin-app="space.layout"]')).toBeNull()
  expect(document.activeElement?.getAttribute('data-admin-app')).not.toBe('space.layout')
})
it('reveals an authorized app in the folded extra band before focusing it', () => {
  const node = mount('space.layout', true, true)
  expect(node.querySelector('details')?.open).toBe(true)
  expect(document.activeElement).toBe(node.querySelector('[data-admin-app="space.layout"]'))
})
it('keeps the typed Page focus and scroll after the real desktop shell opens', () => {
  shellModel = { hasContent: true, pageGroup: null, searchApps: [], lockedApps: [], bank: [], hub: null, sections: [
    { tier: 'standard', slot: 'layout', label: 'Profile', Icon: Settings, nodes: [{ id: 'space.layout', label: 'Page', node: <div>Sidebar page builder</div> }] },
  ] }
  const top = vi.fn(); HTMLElement.prototype.scrollTo = top
  const node = document.createElement('div'); document.body.append(node); const root = createRoot(node)
  cleanup = () => { act(() => root.unmount()); node.remove() }
  act(() => root.render(<AdminBar />))
  act(() => window.dispatchEvent(new CustomEvent('open-admin-bar', { detail: { appId: 'space.layout', scope: { kind: 'space', id: 'authorized-space' } } })))
  expect(document.activeElement).toBe(node.querySelector('[data-admin-app="space.layout"]'))
  expect(top).not.toHaveBeenCalled()
})
