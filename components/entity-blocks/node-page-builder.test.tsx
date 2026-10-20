// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/app/(main)/spaces/[slug]/settings/profile/actions', () => ({ saveSpaceGridLayout: vi.fn() }))
vi.mock('@/app/(main)/settings/rail-getters', () => ({ getMemberLayoutRailData: vi.fn() }))
vi.mock('@/app/(main)/spaces/[slug]/manage/rail-getters', () => ({ getSpaceLayoutRailData: vi.fn() }))
import { NodePageBuilder } from './node-page-builder'
import { NodeLayoutProvider, useNodeLayout } from './node-layout-store'
import type { BuilderRailData } from './profile-page-builder'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// E0 task 12b. The node page builder arranges a Space page by node id: two Text blocks are two pills, each
// selects and hides on its own, and a row operation lands in the node store.

const seed: BuilderRailData = {
  matchId: 'acme',
  rows: [{ id: 'r1', columns: 1, cells: [['text', 'text']] }],
  hidden: [],
  content: { text: { text: 'Words' } },
  customized: true,
}

let root: Root, container: HTMLDivElement
let store: NonNullable<ReturnType<typeof useNodeLayout>>
function Probe() { const s = useNodeLayout()!; useEffect(() => { store = s }, [s]); return null }
const load = async () => seed

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove() })

async function mount(pageId = 'acme') {
  await act(async () => {
    root.render(
      <NodeLayoutProvider save={async () => ({})}>
        <Probe />
        <NodePageBuilder pageId={pageId} loadRailData={load} />
      </NodeLayoutProvider>,
    )
  })
}
const button = (name: string) => container.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)

describe('NodePageBuilder', () => {
  it('shows two Text blocks as two pills and selects them by node id', async () => {
    await mount()
    expect(container.querySelectorAll('button[aria-label="Edit Text"]')).toHaveLength(2)
    const [a, b] = store.layout!.rows[0].cells[0]
    await act(async () => container.querySelectorAll<HTMLButtonElement>('button[aria-label="Edit Text"]')[1].click())
    expect(store.selectedNid).toBe(b.nid)
    expect(store.selectedNid).not.toBe(a.nid)
  })

  it('adds a row to the node document', async () => {
    await mount()
    const before = store.layout!.rows.length
    await act(async () => { [...container.querySelectorAll('button')].find((x) => x.textContent?.includes('Add row'))!.click() })
    expect(store.layout!.rows.length).toBe(before + 1)
  })

  it('renders nothing for a page the viewer does not own', async () => {
    await mount('someone-else')
    expect(container.querySelector('section')).toBeNull()
  })

  it('moves a block to the stored bench with its words', async () => {
    await mount()
    await act(async () => button('Text menu')!.click())
    await act(async () => { [...container.querySelectorAll('button')].find((x) => x.textContent?.includes('Move to Blocks'))!.click() })
    expect(store.layout!.bench).toHaveLength(1)
    expect(store.layout!.bench[0].content).toEqual({ text: 'Words' })
  })
})
