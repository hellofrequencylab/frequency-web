import { describe, expect, it } from 'vitest'
import { emailPalette } from '@/lib/entity-blocks/registry'
import { addNode, canPlaceType } from '@/lib/entity-blocks/node-ops'
import { addNodeRow } from '@/lib/entity-blocks/node-row-ops'
import type { NodeLayout } from '@/lib/entity-blocks/node-tree'

// EMAIL-037. On the node document an email block is its own node, so any block type in the email palette can be
// dropped in twice (two buttons, two images). The type-keyed legacy store is the only place a type is single.

function place(layout: NodeLayout, type: string): NodeLayout {
  const withRow = addNodeRow(layout)
  const out = addNode(withRow, type, withRow.rows[withRow.rows.length - 1].id, 0)
  expect(out.nid).toBeTruthy()
  return out.layout
}

describe('repeatable email blocks', () => {
  it('lets every email block type be placed twice', () => {
    const palette = emailPalette()
    expect(palette.length).toBeGreaterThan(10)
    for (const { id } of palette) {
      let layout: NodeLayout = { rows: [], bench: [] } as NodeLayout
      layout = place(layout, id)
      expect(canPlaceType(layout, id), `${id} can be placed a second time`).toBe(true)
      layout = place(layout, id)
      expect(layout.rows.length).toBe(2)
    }
  })
})
