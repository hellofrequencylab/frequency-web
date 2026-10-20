// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/app/(main)/spaces/[slug]/settings/profile/actions', () => ({ saveSpaceGridLayout: vi.fn() }))
import { NodeEmailCanvasEditor } from './email-canvas-editor'
import { NodeLayoutProvider, useNodeLayout } from '@/components/entity-blocks/node-layout-store'
import type { NodeLayout } from '@/lib/entity-blocks/node-tree'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// E0 task 12b. The email canvas editor on the node store: each email block is its own node, so a type can
// repeat, and add / move / remove land in the node document.

const seed: NodeLayout = {
  rows: [
    { id: 'r1', columns: 1, cells: [[{ nid: 'n1', type: 'text', content: { text: 'One' } }]] },
    { id: 'r2', columns: 1, cells: [[{ nid: 'n2', type: 'text', content: { text: 'Two' } }]] },
  ],
  bench: [],
} as NodeLayout

let root: Root, container: HTMLDivElement
let store: NonNullable<ReturnType<typeof useNodeLayout>>
function Probe() {
  const s = useNodeLayout()!
  useEffect(() => { store = s }, [s])
  useEffect(() => { s.seed(seed) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

beforeEach(async () => {
  Element.prototype.scrollIntoView = vi.fn()
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container)
  await act(async () => {
    root.render(
      <NodeLayoutProvider save={async () => ({})}>
        <Probe />
        <NodeEmailCanvasEditor />
      </NodeLayoutProvider>,
    )
  })
})
afterEach(async () => { await act(async () => root.unmount()); container.remove() })

const texts = () => store.layout!.rows.map((r) => (r.cells[0][0].content as { text?: string } | undefined)?.text)
const click = async (el: Element | null | undefined) => { await act(async () => (el as HTMLElement).click()) }
const byLabel = (prefix: string) => [...container.querySelectorAll<HTMLButtonElement>('button')].filter((b) => b.getAttribute('aria-label')?.startsWith(prefix))

describe('NodeEmailCanvasEditor', () => {
  it('lists a repeated type as two blocks', () => {
    expect(byLabel('Move Text up')).toHaveLength(2)
  })

  it('moves a block down', async () => {
    await click(byLabel('Move Text down')[0])
    expect(texts()).toEqual(['Two', 'One'])
  })

  it('adds a block as a new node row', async () => {
    const before = store.layout!.rows.length
    await click([...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Heading')))
    expect(store.layout!.rows.length).toBe(before + 1)
  })

  it('switches the preview between desktop and phone width', async () => {
    const canvas = () => container.querySelector('[data-fq-preview-device]')
    expect(canvas()?.getAttribute('data-fq-preview-device')).toBe('desktop')
    await click([...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Phone')))
    expect(canvas()?.getAttribute('data-fq-preview-device')).toBe('mobile')
    expect(container.querySelector('.max-w-\\[375px\\]')).not.toBeNull()
  })

  it('undoes the last move from the Undo button', async () => {
    await click(byLabel('Move Text down')[0])
    expect(texts()).toEqual(['Two', 'One'])
    await click(byLabel('Undo the last change')[0])
    expect(texts()).toEqual(['One', 'Two'])
  })
})
