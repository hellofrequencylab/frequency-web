// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
const rail = vi.hoisted(() => ({ data: null as unknown }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/app/(main)/spaces/[slug]/settings/profile/actions', () => ({ saveSpaceGridLayout: vi.fn() }))
vi.mock('@/app/(main)/settings/profile/spotlight-actions', () => ({ saveMemberGridLayout: vi.fn() }))
vi.mock('@/app/(main)/spaces/[slug]/manage/rail-getters', () => ({ getSpaceLayoutRailData: vi.fn() }))
vi.mock('@/app/(main)/settings/rail-getters', () => ({ getMemberLayoutRailData: async () => rail.data }))
import { MemberPageBuilderSwitch } from './member-page-builder-switch'
import { NodeLayoutProvider } from './node-layout-store'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// E0 task 12b. The member rail mounts the node page builder only when the owner's data carries a node
// document (render_path_space_profile on); the choice rides the data.

let root: Root, container: HTMLDivElement
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove() })

describe('MemberPageBuilderSwitch', () => {
  it('mounts the node builder for a member node document', async () => {
    rail.data = {
      handle: 'ada', rows: [], hidden: [], content: {}, style: {}, customized: true,
      nodeLayout: { rows: [{ id: 'r1', columns: 1, cells: [[{ nid: 'nm1', type: 'text', content: { text: 'Hi' } }]] }], bench: [] },
    }
    await act(async () => {
      root.render(<NodeLayoutProvider save={async () => ({})}><MemberPageBuilderSwitch pageHandle="ada" /></NodeLayoutProvider>)
    })
    await act(async () => {})
    expect(container.querySelector('button[aria-label="Edit Text"]')).not.toBeNull()
  })
})
