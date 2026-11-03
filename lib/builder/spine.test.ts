import { describe, expect, it } from 'vitest'
import { config } from '@/lib/page-editor/config'
import { applyKit } from '@/lib/sites/kits/apply'
import { KIT_INDEX, loadKit, NEW_WORLD_KIT_INDEX } from '@/lib/sites/kits/registry'
import { setSectionVisibility } from '@/lib/sites/editor/state'
import type { Data } from '@/lib/page-editor/types'
import { moveSection, spineItems, stepSection } from './spine'

// The corpus: every page of every kit an owner can start from, as the kit applies it (real block shapes).
async function corpus(): Promise<Data[]> {
  const docs: Data[] = []
  for (const { id, theme } of [...KIT_INDEX, ...NEW_WORLD_KIT_INDEX]) {
    const kit = await loadKit(id)
    if (!kit) continue
    const r = applyKit({ theme, pages: [] } as never, kit, 'replace', (type) => config.components[type]?.defaultProps)
    if (r.ok) for (const p of r.snapshot.pages) if (p.doc.content.length > 1) docs.push(p.doc)
  }
  return docs
}

const ids = (doc: Data) => doc.content.map((s) => s.props.id)

describe('reorder (BLD-103)', () => {
  it('a drag and the keyboard produce the same document, and moving back restores it exactly, over the kit corpus', async () => {
    const docs = await corpus()
    expect(docs.length).toBeGreaterThan(20)
    let checked = 0
    for (const doc of docs) {
      const snapshot = JSON.stringify(doc)
      const n = doc.content.length
      for (let from = 0; from < n; from++) {
        for (const to of [0, n - 1, Math.floor(n / 2)]) {
          const id = String(doc.content[from].props.id)
          const dragged = moveSection(doc, id, to)
          let keyed = doc
          for (let i = from; i !== to; i += to > from ? 1 : -1) keyed = stepSection(keyed, id, to > from ? 1 : -1)
          expect(keyed).toEqual(dragged)
          // Zero loss: the same blocks, byte for byte, only in a new order; and moving back is the original.
          expect([...dragged.content].map((s) => JSON.stringify(s)).sort()).toEqual([...doc.content].map((s) => JSON.stringify(s)).sort())
          expect(dragged.root).toBe(doc.root)
          expect(JSON.stringify(moveSection(dragged, id, from))).toBe(snapshot)
          checked++
        }
      }
      expect(JSON.stringify(doc)).toBe(snapshot)
    }
    expect(checked).toBeGreaterThan(100)
  })

  it('stays put at the ends and ignores an unknown id', () => {
    const doc = { root: { props: {} }, content: [{ type: 'A', props: { id: 'a' } }, { type: 'B', props: { id: 'b' } }] } as Data
    expect(ids(stepSection(doc, 'a', -1))).toEqual(['a', 'b'])
    expect(ids(stepSection(doc, 'b', 1))).toEqual(['a', 'b'])
    expect(moveSection(doc, 'nope', 0)).toBe(doc)
  })
})

describe('spineItems', () => {
  it('names a section by its block and its own heading, and dims it where it is hidden', () => {
    const doc = setSectionVisibility({ root: { props: {} }, content: [
      { type: 'ServicesStory', props: { id: 's', title: 'This might be *you*' } },
      { type: 'ServicesTrust', props: { id: 't', items: [] } },
    ] } as Data, 't', 'phone', false)
    const phone = spineItems(doc, config, 'phone')
    expect(phone[0]).toEqual({ id: 's', type: 'ServicesStory', name: 'Services story', title: 'This might be you', hidden: false })
    expect(phone[1].hidden).toBe(true)
    expect(spineItems(doc, config, 'desktop')[1].hidden).toBe(false)
  })
})
