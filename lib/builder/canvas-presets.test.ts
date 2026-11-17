import { describe, expect, it } from 'vitest'
import { applyCanvasChange, CANVAS_DRAFT_KEY, CANVAS_REVISION_KEY, canvasNodes, planCanvasDraftWrite, readCanvasDocument } from './canvas-document'
import { canvasInserterView, resolveCanvasInsert } from './canvas-presets'
import { getNode, sanitizeNodeLayout } from '@/lib/entity-blocks/node-ops'
import type { NodeLayout } from '@/lib/entity-blocks/node-tree'
import { profilePaletteForKind } from '@/lib/entity-blocks/registry'

// PROG-E6B. What the canvas can add (presets first), and the three structural changes on the stored document.

const CALLOUT = 'ncallout0001'
const TEXT = 'ntext0000001'
const page = (): NodeLayout => ({
  rows: [
    { id: 'r1', columns: 1, cells: [[{ nid: CALLOUT, type: 'callout', content: { title: 'Come in' }, style: { align: 'center' } }, { nid: TEXT, type: 'text', content: { text: 'First' } }]] },
    { id: 'r2', columns: 2, cells: [[], []] },
  ],
  bench: [{ nid: 'nbenched0001', type: 'quote', content: { text: 'Kept aside' } }],
})
const order = (layout: NodeLayout) => layout.rows.map((row) => row.cells.map((stack) => stack.map((node) => node.nid)))

describe('the inserter', () => {
  const view = canvasInserterView(page())

  it('offers presets first, each a block the Space page builder already offers, then the blank palette', () => {
    expect(Object.keys(view)).toEqual(['presets', 'blanks'])
    expect(view.presets.length).toBeGreaterThanOrEqual(4)
    const palette = profilePaletteForKind('space')
    expect(view.blanks.length).toBeGreaterThanOrEqual(5)
    for (const blank of view.blanks) {
      const block = palette.find((candidate) => candidate.id === blank.id)
      // Never a second list, and never a live data section the Space may not be able to place.
      expect(block, blank.id).toMatchObject({ category: 'content', label: blank.label })
      expect(block?.requiresFunction, blank.id).toBeUndefined()
    }
    const blanks = new Set(view.blanks.map((blank) => blank.id))
    for (const preset of view.presets) {
      const block = resolveCanvasInsert('preset', preset.id)
      expect(block, preset.id).not.toBeNull()
      expect(blanks.has(block!.type), preset.id).toBe(true)
      expect(preset.label && preset.say).toBeTruthy()
      // House style: no em dash in words a person reads.
      expect(`${preset.label} ${preset.say} ${JSON.stringify(block!.content)}`).not.toMatch(/—/)
    }
  })

  it('gives every preset starting words that survive the write guard untouched', () => {
    for (const preset of view.presets) {
      const block = resolveCanvasInsert('preset', preset.id)!
      const added = applyCanvasChange(page(), TEXT, { kind: 'insert', ...block })
      if (typeof added === 'string') throw new Error(`${preset.id}: ${added}`)
      const stored = getNode(sanitizeNodeLayout(added.layout, 'space')!, added.nid)
      expect(stored?.type, preset.id).toBe(block.type)
      expect(stored?.content, preset.id).toEqual(block.content)
    }
  })

  it('resolves only ids it owns: a blank block from the palette, never a made-up type', () => {
    expect(resolveCanvasInsert('blank', 'callout')).toEqual({ type: 'callout' })
    expect(resolveCanvasInsert('blank', 'welcome')).toBeNull()
    expect(resolveCanvasInsert('preset', 'callout')).toBeNull()
    // A live data section, and a block the Space palette leaves out, are not the canvas's to add.
    expect(resolveCanvasInsert('blank', 'offerings')).toBeNull()
    expect(resolveCanvasInsert('blank', 'text')).toBeNull()
    expect(resolveCanvasInsert('blank', '__proto__')).toBeNull()
    expect(resolveCanvasInsert('preset', 'constructor')).toBeNull()
  })

  it('keeps a block at its per-page limit on the list, switched off, with the reason', () => {
    // A page holds at most three Display headings (lib/entity-blocks/block-limits.ts).
    let layout = page()
    for (let i = 0; i < 3; i++) {
      const added = applyCanvasChange(layout, TEXT, { kind: 'insert', type: 'displayHeading' })
      if (typeof added === 'string') throw new Error(`insert ${i + 1}: ${added}`)
      layout = added.layout
    }
    expect(applyCanvasChange(layout, TEXT, { kind: 'insert', type: 'displayHeading' })).toBe('refused')
    const full = canvasInserterView(layout)
    expect(full.blanks.find((blank) => blank.id === 'displayHeading')).toMatchObject({ disabled: true, reason: expect.stringContaining('as many') })
    expect(full.presets.find((preset) => preset.id === 'big-title')).toMatchObject({ disabled: true, reason: expect.stringContaining('as many') })
    expect(full.presets.find((preset) => preset.id === 'welcome')?.disabled).toBeUndefined()
    expect(view.blanks.find((blank) => blank.id === 'displayHeading')?.disabled).toBeUndefined()
  })
})

describe('a structural change on the stored document', () => {
  it('moves a block to a slot and keeps every block and every bag', () => {
    const moved = applyCanvasChange(page(), CALLOUT, { kind: 'move', to: { rowId: 'r2', col: 1, index: 0 } })
    if (typeof moved === 'string') throw new Error(moved)
    expect(order(moved.layout)).toEqual([[[TEXT]], [[], [CALLOUT]]])
    expect(getNode(moved.layout, CALLOUT)).toMatchObject({ content: { title: 'Come in' }, style: { align: 'center' } })
    expect(moved.layout.bench).toHaveLength(1)
  })

  it('refuses a slot that is not there, and never drops a block to make room', () => {
    expect(applyCanvasChange(page(), CALLOUT, { kind: 'move', to: { rowId: 'r9', col: 0, index: 0 } })).toBe('refused')
    expect(applyCanvasChange(page(), CALLOUT, { kind: 'move', to: { rowId: 'r2', col: 2, index: 0 } })).toBe('refused')
    const full = page()
    full.rows[1]!.cells[0] = Array.from({ length: 12 }, (_, i) => ({ nid: `nfill${String(i).padStart(7, '0')}`, type: 'text' }))
    expect(applyCanvasChange(full, CALLOUT, { kind: 'move', to: { rowId: 'r2', col: 0, index: 0 } })).toBe('refused')
    expect(applyCanvasChange(full, full.rows[1]!.cells[0]![0]!.nid, { kind: 'insert', type: 'text' })).toBe('refused')
  })

  it('does not act on a block that is not placed on the page', () => {
    expect(applyCanvasChange(page(), 'nbenched0001', { kind: 'spacing', edge: 'mt', step: 'lg' })).toBe('no-node')
    expect(applyCanvasChange(page(), 'nmissing0001', { kind: 'move', to: { rowId: 'r1', col: 0, index: 0 } })).toBe('no-node')
  })

  it('sets one spacing step and leaves the rest of the style alone', () => {
    const spaced = applyCanvasChange(page(), CALLOUT, { kind: 'spacing', edge: 'pad', step: 'md' })
    if (typeof spaced === 'string') throw new Error(spaced)
    expect(getNode(spaced.layout, CALLOUT)?.style).toEqual({ align: 'center', pad: 'md' })
    const back = applyCanvasChange(spaced.layout, CALLOUT, { kind: 'spacing', edge: 'pad', step: 'default' })
    expect(typeof back !== 'string' && getNode(back.layout, CALLOUT)?.style).toEqual({ align: 'center' })
  })

  it('adds a block right under the one it was added from, and reports the new block', () => {
    const added = applyCanvasChange(page(), CALLOUT, { kind: 'insert', type: 'heading', content: { text: 'What we do together' } })
    if (typeof added === 'string') throw new Error(added)
    expect(order(added.layout)[0]![0]).toEqual([CALLOUT, added.nid, TEXT])
    expect(getNode(added.layout, added.nid)).toMatchObject({ type: 'heading', content: { text: 'What we do together' } })
    expect(canvasNodes(added.layout)).toHaveLength(3)
    expect(applyCanvasChange(page(), CALLOUT, { kind: 'insert', type: 'notABlock' })).toBe('refused')
  })
})

describe('the draft plan carries a structural change through the same guard', () => {
  const preferences = () => ({ accent: 'sky', profileLayout: page(), [CANVAS_REVISION_KEY]: 4 })
  const base = () => readCanvasDocument(preferences()).base
  const plan = (change: Parameters<typeof planCanvasDraftWrite>[0]['change'], over: Partial<Parameters<typeof planCanvasDraftWrite>[0]> = {}) =>
    planCanvasDraftWrite({ preferences: preferences(), nid: CALLOUT, values: {}, fieldKeys: [], base: base(), change, ...over })

  it('writes the moved page to the draft key, moves the revision on, and keeps every other key', () => {
    const ready = plan({ kind: 'move', to: { rowId: 'r1', col: 0, index: 1 } })
    if (ready.status !== 'ready') throw new Error(ready.status)
    expect(order(ready.preferences[CANVAS_DRAFT_KEY] as NodeLayout)[0]![0]).toEqual([TEXT, CALLOUT])
    expect(ready.preferences[CANVAS_REVISION_KEY]).toBe(5)
    expect(ready.preferences.accent).toBe('sky')
    // The published page is not the plan's to change.
    expect(ready.preferences.profileLayout).toEqual(page())
    expect(ready.base.revision).toBe(5)
    // The content of the moved block is exactly what was stored: a move is not a field edit.
    expect(ready.node).toMatchObject({ nid: CALLOUT, content: { title: 'Come in' } })
  })

  it('refuses a stale base before it plans a move, an insert or a spacing step', () => {
    const stale = { revision: 3, fingerprint: base().fingerprint }
    for (const change of [{ kind: 'move', to: { rowId: 'r2', col: 0, index: 0 } }, { kind: 'insert', type: 'text' }, { kind: 'spacing', edge: 'mt', step: 'lg' }] as const) {
      expect(plan(change, { base: stale })).toEqual({ status: 'conflict', current: base() })
    }
  })

  it('reports a change the page cannot take without planning a write', () => {
    expect(plan({ kind: 'move', to: { rowId: 'r9', col: 0, index: 0 } })).toEqual({ status: 'refused' })
    expect(plan({ kind: 'spacing', edge: 'mt', step: 'lg' }, { nid: 'nbenched0001' })).toEqual({ status: 'no-node' })
  })

  it('hands back the new block for an insert, with its preset words stored', () => {
    const ready = plan({ kind: 'insert', ...resolveCanvasInsert('preset', 'big-title')! })
    if (ready.status !== 'ready') throw new Error(ready.status)
    expect(ready.node.nid).not.toBe(CALLOUT)
    expect(ready.node).toMatchObject({ type: 'displayHeading', content: { text: 'What we do together' } })
    expect(order(ready.layout)[0]![0]).toEqual([CALLOUT, ready.node.nid, TEXT])
  })

  it('stores a spacing step only as one of the named steps', () => {
    const ready = plan({ kind: 'spacing', edge: 'mb', step: 'xl' })
    expect(ready.status === 'ready' && ready.node.style).toEqual({ align: 'center', mb: 'xl' })
    const odd = plan({ kind: 'spacing', edge: 'pad', step: '48px' as never })
    expect(odd.status === 'ready' && odd.node.style).toEqual({ align: 'center' })
  })
})

describe('live sections (PROG-E6F)', () => {
  it('lists only the live sections the caller allows, in palette order, with what each shows', () => {
    const view = canvasInserterView(page(), ['events', 'about', 'callout'])
    expect(view.live?.map((section) => section.id)).toEqual(['about', 'events'])
    expect(view.live?.every((section) => typeof section.say === 'string' && section.say.length > 0)).toBe(true)
  })
  it('resolves a live insert only for an allowed live section', () => {
    expect(resolveCanvasInsert('live', 'events', ['events'])).toEqual({ type: 'events' })
    expect(resolveCanvasInsert('live', 'offerings', ['events'])).toBeNull()
    expect(resolveCanvasInsert('live', 'callout', ['callout'])).toBeNull()
    expect(resolveCanvasInsert('blank', 'events', ['events'])).toBeNull()
  })
})
