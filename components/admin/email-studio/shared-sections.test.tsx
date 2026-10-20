// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/app/(main)/spaces/[slug]/settings/profile/actions', () => ({ saveSpaceGridLayout: vi.fn() }))
import { NodeEmailCanvasEditor } from './email-canvas-editor'
import { NodeLayoutProvider, useNodeLayout } from '@/components/entity-blocks/node-layout-store'
import type { NodeLayout } from '@/lib/entity-blocks/node-tree'
import type { SavedLibrary, SavedSection } from '@/lib/email-studio/saved-sections'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// EMAIL-042. With a shared library the editor lists what the library holds and routes save and delete through it,
// not through this browser's storage.

const seed: NodeLayout = {
  rows: [{ id: 'r1', columns: 1, cells: [[{ nid: 'n1', type: 'text', content: { text: 'One' } }]] }],
  bench: [],
} as NodeLayout
function Probe() {
  const s = useNodeLayout()!
  useEffect(() => { s.seed(seed) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

let root: Root, container: HTMLDivElement
let held: SavedSection[]
const library: SavedLibrary = {
  list: vi.fn(async () => held),
  save: vi.fn(async (input, fallback) => {
    held = [{ id: 's2', name: input.name || fallback, type: input.type, content: input.content }, ...held]
    return held
  }),
  remove: vi.fn(async (id) => {
    held = held.filter((s) => s.id !== id)
    return held
  }),
}

beforeEach(async () => {
  held = [{ id: 's1', name: 'Team sign-off', type: 'text', content: { text: 'See you soon' } }]
  window.localStorage.clear()
  Element.prototype.scrollIntoView = vi.fn()
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container)
  await act(async () => {
    root.render(
      <NodeLayoutProvider save={async () => ({})}>
        <Probe />
        <NodeEmailCanvasEditor library={library} />
      </NodeLayoutProvider>,
    )
  })
})
afterEach(async () => { await act(async () => root.unmount()); container.remove() })

describe('shared saved sections', () => {
  it('lists the sections the shared library holds and deletes through it', async () => {
    expect([...container.querySelectorAll('button')].some((b) => b.textContent?.includes('Team sign-off'))).toBe(true)
    const del = container.querySelector<HTMLButtonElement>('button[aria-label="Delete saved section Team sign-off"]')!
    await act(async () => del.click())
    expect(library.remove).toHaveBeenCalledWith('s1')
    expect([...container.querySelectorAll('button')].some((b) => b.textContent?.includes('Team sign-off'))).toBe(false)
    expect(window.localStorage.getItem('fq-email-saved-sections')).toBeNull()
  })
})
