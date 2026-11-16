import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  flag: vi.fn(), janitor: vi.fn(), caller: vi.fn(), access: vi.fn(), renderPath: vi.fn(), space: vi.fn(), write: vi.fn(), revalidate: vi.fn(),
}))
vi.mock('@/lib/env/string', async (orig) => ({ ...(await orig<typeof import('@/lib/env/string')>()), envFlag: mocks.flag }))
vi.mock('@/lib/page-editor/guard', () => ({ getJanitor: mocks.janitor }))
vi.mock('@/lib/auth', () => ({ getCallerProfile: mocks.caller }))
vi.mock('@/lib/spaces/entitlements', () => ({ resolveSpaceManageAccess: mocks.access }))
vi.mock('@/lib/platform-flags', () => ({ renderPathEnabled: mocks.renderPath }))
vi.mock('@/lib/spaces/store', () => ({ getSpaceById: mocks.space, writeSpacePreferencesAtRevision: mocks.write }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }))

import { CANVAS_DRAFT_KEY, CANVAS_REVISION_KEY, readCanvasDocument } from '@/lib/builder/canvas-document'
import { CANVAS_READ_ONLY, loadCanvasDocument } from '@/lib/builder/canvas-document-load'
import { getNode } from '@/lib/entity-blocks/node-ops'
import type { NodeLayout } from '@/lib/entity-blocks/node-tree'
import { saveCanvasNodeDraft } from './document-actions'

// PROG-E6B. A move in the layer tree, a spacing step and an insert are saved by the SAME action as a field edit:
// the same switch, staff check, Space rule, base and guarded write. These tests drive the real action, model and
// loader with only the data layer mocked.

const SPACE = '0f0e0d0c-0b0a-4908-8706-050403020100'
const CALLOUT = 'ncallout0001'
const EDITORIAL = 'neditorial01'
const published = () => ({
  rows: [
    { id: 'r1', columns: 1, cells: [[{ nid: CALLOUT, type: 'callout', content: { title: 'Come in', body: 'We are open' }, style: { align: 'center' } }, { nid: EDITORIAL, type: 'editorial', content: { title: 'First' } }]] },
    { id: 'r2', columns: 2, cells: [[], []] },
  ],
  bench: [],
})
let preferences: Record<string, unknown>
const base = () => readCanvasDocument(preferences).base
const send = (change: unknown, over: Record<string, unknown> = {}) => saveCanvasNodeDraft({ spaceId: SPACE, nid: CALLOUT, base: base(), values: {}, change, ...over })
const written = () => (mocks.write.mock.calls.at(-1)![1] as Record<string, unknown>)[CANVAS_DRAFT_KEY] as NodeLayout
const order = (layout: NodeLayout) => layout.rows.map((row) => row.cells.map((stack) => stack.map((node) => node.nid)))

beforeEach(() => {
  vi.resetAllMocks()
  preferences = { accent: 'sky', profileLayout: published(), [CANVAS_REVISION_KEY]: 3 }
  mocks.flag.mockImplementation((name: string) => name === 'EDITOR_CANVAS')
  mocks.janitor.mockResolvedValue({ profileId: 'staff' })
  mocks.caller.mockResolvedValue({ id: 'staff', webRole: 'janitor' })
  mocks.access.mockResolvedValue({ canManage: true, staffViewing: false })
  mocks.renderPath.mockImplementation(async (surface: string) => surface === 'space_profile')
  mocks.space.mockImplementation(async () => ({ id: SPACE, slug: 'calm', name: 'Calm Studio', preferences }))
  mocks.write.mockResolvedValue('written')
})

describe('a move in the layer tree is saved', () => {
  it('writes the new order to the DRAFT only, guarded on the revision, and hands the tab the page again', async () => {
    const result = await send({ kind: 'move', to: { rowId: 'r2', col: 1, index: 0 } })
    expect(mocks.write).toHaveBeenCalledTimes(1)
    const [spaceId, next, guard] = mocks.write.mock.calls[0]!
    expect(spaceId).toBe(SPACE)
    expect(guard).toEqual({ revisionKey: CANVAS_REVISION_KEY, expected: 3 })
    expect(order(written())).toEqual([[[EDITORIAL]], [[], [CALLOUT]]])
    // The moved block keeps its words and its style; the published page and the other keys are as they were.
    expect(getNode(written(), CALLOUT)).toMatchObject({ content: { title: 'Come in', body: 'We are open' }, style: { align: 'center' } })
    expect(next.profileLayout).toEqual(published())
    expect(next.accent).toBe('sky')
    expect(next[CANVAS_REVISION_KEY]).toBe(4)
    if (!result.ok) throw new Error(result.error)
    expect(result.base.revision).toBe(4)
    expect(result.view?.tree?.map((row) => row.columns.map((stack) => stack.map((layer) => layer.id)))).toEqual([[[EDITORIAL]], [[], [CALLOUT]]])
    expect(result.view?.layers.map((layer) => layer.id)).toEqual([EDITORIAL, CALLOUT])
  })

  it('survives a reload: the next read of the Space shows the saved order', async () => {
    await send({ kind: 'move', to: { rowId: 'r1', col: 0, index: 1 } })
    preferences = mocks.write.mock.calls[0]![1] as Record<string, unknown>
    const reloaded = await loadCanvasDocument(SPACE)
    expect(reloaded?.source).toBe('draft')
    expect(reloaded?.layers.map((layer) => layer.id)).toEqual([EDITORIAL, CALLOUT])
    expect(reloaded?.tree?.[0]?.columns[0]?.map((layer) => layer.label)).toEqual(['Editorial section', 'Callout'])
    expect(reloaded?.base.revision).toBe(4)
  })

  it('a stale tab cannot reorder a newer draft, in the plan or in the update', async () => {
    const old = base()
    preferences = { ...preferences, [CANVAS_REVISION_KEY]: 4 }
    expect(await send({ kind: 'move', to: { rowId: 'r2', col: 0, index: 0 } }, { base: old })).toMatchObject({ ok: false, conflict: true })
    expect(mocks.write).not.toHaveBeenCalled()
    mocks.write.mockResolvedValue('stale')
    expect(await send({ kind: 'move', to: { rowId: 'r2', col: 0, index: 0 } })).toMatchObject({ ok: false, conflict: true })
  })

  it('refuses a slot that is not on the page and writes nothing', async () => {
    expect(await send({ kind: 'move', to: { rowId: 'r9', col: 0, index: 0 } })).toMatchObject({ ok: false, conflict: false, error: expect.stringContaining('cannot go there') })
    expect(mocks.write).not.toHaveBeenCalled()
  })

  it('keeps the door: no switch, not staff, or a read-only preview saves no move', async () => {
    mocks.access.mockResolvedValue({ canManage: false, staffViewing: true })
    expect(await send({ kind: 'move', to: { rowId: 'r2', col: 0, index: 0 } })).toEqual({ ok: false, conflict: false, error: CANVAS_READ_ONLY })
    mocks.janitor.mockResolvedValue(null)
    expect(await send({ kind: 'move', to: { rowId: 'r2', col: 0, index: 0 } })).toMatchObject({ ok: false })
    mocks.flag.mockReturnValue(false)
    expect(await send({ kind: 'move', to: { rowId: 'r2', col: 0, index: 0 } })).toMatchObject({ ok: false })
    expect(mocks.write).not.toHaveBeenCalled()
  })
})

describe('a spacing handle saves a named step', () => {
  it('stores the step on the block style and leaves its content alone', async () => {
    const result = await send({ kind: 'spacing', edge: 'mt', step: 'lg' })
    expect(getNode(written(), CALLOUT)).toEqual({ nid: CALLOUT, type: 'callout', content: { title: 'Come in', body: 'We are open' }, style: { align: 'center', mt: 'lg' } })
    expect(result).toMatchObject({ ok: true, node: { nid: CALLOUT, style: { align: 'center', mt: 'lg' } } })
    // One block changed, so the page's shape is not sent again.
    expect(result.ok && result.view).toBeUndefined()
  })

  it('refuses anything that is not a named step, before it touches a Space: no length, no colour, no unknown edge', async () => {
    for (const change of [
      { kind: 'spacing', edge: 'mt', step: '24px' }, { kind: 'spacing', edge: 'mt', step: '2rem' }, { kind: 'spacing', edge: 'pad', step: 16 },
      { kind: 'spacing', edge: 'mt', step: '#ff0000' }, { kind: 'spacing', edge: 'margin', step: 'lg' }, { kind: 'resize', edge: 'mt', step: 'lg' },
      { kind: 'move', to: { rowId: '../r1', col: 0, index: 0 } }, { kind: 'move', to: { rowId: 'r1', col: 9, index: 0 } }, { kind: 'insert', source: 'preset', id: '<script>' },
    ]) {
      expect(await send(change), JSON.stringify(change)).toMatchObject({ ok: false, conflict: false })
    }
    expect(mocks.space).not.toHaveBeenCalled()
    expect(mocks.write).not.toHaveBeenCalled()
  })

  it('a padding step off the padding scale is parsed but stores nothing new', async () => {
    await send({ kind: 'spacing', edge: 'pad', step: 'xl' })
    expect(getNode(written(), CALLOUT)?.style).toEqual({ align: 'center' })
  })
})

describe('the inserter adds a preset before a blank block', () => {
  it('adds the preset under the selected block, with its starting words, and selects it', async () => {
    const result = await send({ kind: 'insert', source: 'preset', id: 'welcome' })
    if (!result.ok) throw new Error(result.error)
    const [first, added, last] = written().rows[0]!.cells[0]!
    expect([first!.nid, last!.nid]).toEqual([CALLOUT, EDITORIAL])
    expect(added).toMatchObject({ type: 'callout', content: { title: 'Welcome in', buttonLabel: 'See what is on' } })
    expect(result.node.nid).toBe(added!.nid)
    // The tab gets the new block's controls from its own contract, and the inserter again.
    const view = result.view!.nodes.find((node) => node.nid === added!.nid)
    expect(view?.title).toBe('Callout')
    expect(view?.fields.map((field) => field.key)).toContain('title')
    expect(result.view!.inserter?.presets[0]?.id).toBe('welcome')
  })

  it('adds a blank block with no content, and refuses an id it does not own', async () => {
    await send({ kind: 'insert', source: 'blank', id: 'prose' })
    expect(written().rows[0]!.cells[0]![1]).toMatchObject({ type: 'prose' })
    expect(written().rows[0]!.cells[0]![1]!.content).toBeUndefined()
    mocks.write.mockClear()
    for (const [source, id] of [['blank', 'offerings'], ['blank', 'welcome'], ['preset', 'prose'], ['preset', 'nope']]) {
      expect(await send({ kind: 'insert', source, id })).toMatchObject({ ok: false, conflict: false, error: 'That block is not one this page can add.' })
    }
    expect(mocks.write).not.toHaveBeenCalled()
  })

  it('says so when the page is at its limit for that block, and writes nothing', async () => {
    const full = published()
    full.rows[1]!.cells[0] = ['a', 'b', 'c'].map((n) => ({ nid: `nheading000${n}`, type: 'displayHeading', content: { text: n } })) as never
    preferences = { ...preferences, profileLayout: full }
    expect(await send({ kind: 'insert', source: 'preset', id: 'big-title' })).toMatchObject({ ok: false, conflict: false, error: expect.stringContaining('cannot take one more') })
    expect(mocks.write).not.toHaveBeenCalled()
  })
})

describe('a field edit is unchanged by all of this', () => {
  it('still saves only the fields the block contract names, and sends no page shape', async () => {
    const result = await saveCanvasNodeDraft({ spaceId: SPACE, nid: CALLOUT, base: base(), values: { desktop: { title: 'New title', body: 'We are open', nope: 'x' } } })
    expect(getNode(written(), CALLOUT)).toMatchObject({ content: { title: 'New title', body: 'We are open' }, style: { align: 'center' } })
    expect(getNode(written(), CALLOUT)?.content).not.toHaveProperty('nope')
    expect(order(written())).toEqual([[[CALLOUT, EDITORIAL]], [[], []]])
    expect(result.ok && result.view).toBeUndefined()
  })
})
