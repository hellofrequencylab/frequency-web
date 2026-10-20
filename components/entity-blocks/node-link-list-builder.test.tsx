// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/app/(main)/spaces/[slug]/settings/profile/actions', () => ({ saveSpaceGridLayout: vi.fn() }))
vi.mock('@/app/(main)/settings/rail-getters', () => ({ getMemberLayoutRailData: vi.fn() }))
vi.mock('@/app/(main)/spaces/[slug]/manage/rail-getters', () => ({ getSpaceLayoutRailData: vi.fn() }))
import { NodeLinkListBuilder } from './node-link-list-builder'
import { NodeLayoutProvider, useNodeLayout } from './node-layout-store'
import type { BuilderRailData } from './profile-page-builder'
import { SPACE_SPOTLIGHT_BLOCK_IDS } from '@/lib/spaces/spotlight'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// E0 task 12b. The Spotlight's one-column list on the node store: strips by node id, a row per node,
// up/down, hide, and "Add a block" for a new or a benched node.

const seed: BuilderRailData = {
  matchId: 'acme',
  rows: [
    { id: 'r0', columns: 1, cells: [['heading']] },
    { id: 'r1', columns: 1, cells: [['heading']] },
    { id: 'r2', columns: 1, cells: [['links']] },
  ],
  hidden: [],
  content: {},
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
        <NodeLinkListBuilder pageId={pageId} loadRailData={load} paletteBlockIds={SPACE_SPOTLIGHT_BLOCK_IDS} />
      </NodeLayoutProvider>,
    )
  })
}
const types = () => store.layout!.rows.flatMap((r) => r.cells.flat()).map((n) => n.type)
const click = async (el: Element | undefined | null) => { await act(async () => (el as HTMLElement).click()) }
const withText = (text: string) => [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)

describe('NodeLinkListBuilder', () => {
  it('lists each node as its own strip and selects by node id', async () => {
    await mount()
    expect(container.querySelectorAll('button[aria-label="Edit Heading"]')).toHaveLength(2)
    const [, second] = store.layout!.rows.flatMap((r) => r.cells.flat())
    await click(container.querySelectorAll('button[aria-label="Edit Heading"]')[1])
    expect(store.selectedNid).toBe(second.nid)
  })

  it('moves a node down by moving its row', async () => {
    await mount()
    const first = store.layout!.rows[0].cells[0][0].nid
    await click(container.querySelector('button[aria-label="Move Heading down"]'))
    expect(store.layout!.rows[1].cells[0][0].nid).toBe(first)
  })

  it('adds a new block as a new one-column row', async () => {
    await mount()
    const before = store.layout!.rows.length
    await click(withText('Booking'))
    expect(store.layout!.rows).toHaveLength(before + 1)
    expect(types().at(-1)).toBe('booking')
    expect(store.layout!.rows.at(-1)!.columns).toBe(1)
  })

  it('benching a node leaves no empty row and offers it back under Add a block', async () => {
    await mount()
    await click(container.querySelector('button[aria-label="Block menu for Links"]') ?? container.querySelectorAll('button[aria-label*="menu"]')[2])
    await click(withText('Move to Blocks') ?? [...container.querySelectorAll('button')].find((b) => /bench|Blocks/i.test(b.textContent ?? '')))
    expect(types()).not.toContain('links')
    expect(store.layout!.rows.every((r) => r.cells[0].length === 1)).toBe(true)
    expect(store.layout!.bench.map((n) => n.type)).toContain('links')
    await click(withText('Links'))
    expect(types()).toContain('links')
    expect(store.layout!.bench.map((n) => n.type)).not.toContain('links')
  })

  it('renders nothing for a page the viewer does not own', async () => {
    await mount('someone-else')
    expect(container.querySelector('section')).toBeNull()
  })
})
