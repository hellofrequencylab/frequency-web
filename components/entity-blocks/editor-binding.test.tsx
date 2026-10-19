// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
vi.mock('next/navigation', () => ({ usePathname: () => '/spaces/alpha' }))
vi.mock('@/app/(main)/settings/profile/spotlight-actions', () => ({ saveMemberGridLayout: vi.fn() }))
vi.mock('@/app/(main)/spaces/[slug]/settings/profile/actions', () => ({ saveSpaceGridLayout: vi.fn() }))
import { EntityLayoutProvider, useEntityLayout } from './profile-layout-context'
import { NodeLayoutProvider, useNodeLayout } from './node-layout-store'
import { useEditorBinding, type EditorBinding } from './editor-binding'
import { upgradeLayout } from '@/lib/entity-blocks/node-tree'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root, container: HTMLDivElement
let binding: EditorBinding | null
let live: NonNullable<ReturnType<typeof useEntityLayout>>
let node: NonNullable<ReturnType<typeof useNodeLayout>>
function Probe() {
  const b = useEditorBinding(); const l = useEntityLayout(); const n = useNodeLayout()
  useEffect(() => { binding = b; if (l) live = l; if (n) node = n })
  return null
}
const save = vi.fn().mockResolvedValue({})
const doc = upgradeLayout({ rows: [{ id: 'r1', columns: 1, cells: [['text', 'text']] }] })!
beforeEach(() => {
  binding = null
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove() })

describe('editor binding', () => {
  it('is null with no store mounted', () => {
    act(() => root.render(<Probe />))
    expect(binding).toBeNull()
  })
  it('is the live store until a node document is seeded', () => {
    act(() => root.render(
      <EntityLayoutProvider kind="space" save={save}><NodeLayoutProvider save={save}><Probe /></NodeLayoutProvider></EntityLayoutProvider>,
    ))
    act(() => live.select('text'))
    expect(live.selectedId).toBe('text')
    expect(binding!.select).toBe(live.select)
  })
  it('is the node store once seeded, and selects by node id', () => {
    act(() => root.render(
      <EntityLayoutProvider kind="space" save={save}><NodeLayoutProvider save={save}><Probe /></NodeLayoutProvider></EntityLayoutProvider>,
    ))
    act(() => node.seed(doc))
    expect(binding!.select).toBe(node.select)
    const second = doc.rows[0].cells[0][1].nid
    act(() => binding!.select(second))
    expect(node.selectedNid).toBe(second)
    act(() => binding!.selectItem(2))
    expect(binding!.selectedItemIndex).toBe(2)
    act(() => binding!.select(doc.rows[0].cells[0][0].nid))
    expect(binding!.selectedItemIndex).toBeNull()
  })
})
