// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
vi.mock('@/app/(main)/spaces/[slug]/manage/rail-getters', () => ({ getSpaceLayoutRailData: vi.fn() }))
vi.mock('./node-page-builder', () => ({ NodePageBuilder: () => <div data-builder="node" /> }))
vi.mock('./profile-page-builder', () => ({
  SpacePageBuilder: () => <div data-builder="legacy" />,
  spaceBlockAdminHref: () => null,
}))
import { SpacePageBuilderSwitch } from './space-page-builder-switch'
import { getSpaceLayoutRailData } from '@/app/(main)/spaces/[slug]/manage/rail-getters'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// E0 task 12b. The rail mounts the node page builder only when its data carries a node document, which the
// server supplies only while render_path_space_profile is on.

const base = { matchId: 'acme', rows: [], hidden: [], customized: false }
let root: Root, container: HTMLDivElement
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container) })
afterEach(async () => { await act(async () => root.unmount()); container.remove() })
const which = () => container.querySelector('[data-builder]')?.getAttribute('data-builder')

describe('SpacePageBuilderSwitch', () => {
  it('mounts the type-keyed builder when the seed has no node document', async () => {
    await act(async () => root.render(<SpacePageBuilderSwitch slug="acme" seed={base} />))
    expect(which()).toBe('legacy')
  })

  it('mounts the node builder when the seed carries a node document', async () => {
    await act(async () => root.render(<SpacePageBuilderSwitch slug="acme" seed={{ ...base, nodeLayout: { rows: [], bench: [] } }} />))
    expect(which()).toBe('node')
  })

  it('fetches once itself when no seed was supplied, and follows the fetched data', async () => {
    vi.mocked(getSpaceLayoutRailData).mockResolvedValue({
      slug: 'acme', rows: [], hidden: [], content: {}, style: {}, customized: false, lockedIds: [], pickerData: {},
      nodeLayout: { rows: [], bench: [] },
    } as never)
    await act(async () => root.render(<SpacePageBuilderSwitch slug="acme" />))
    expect(which()).toBe('node')
  })
})
