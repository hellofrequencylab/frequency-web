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
import type { NodeLayout } from '@/lib/entity-blocks/node-tree'
import { saveCanvasNodeDraft } from './document-actions'

// PROG-E6D. Row changes (add, remove, move, re-split) ride the SAME action as every other canvas change. The real
// action, model and loader run; only the data layer is mocked, and the mocked write stores what it is given.

const SPACE = '0f0e0d0c-0b0a-4908-8706-050403020100'
const CALLOUT = 'ncallout0001'
const EDITORIAL = 'neditorial01'
const published = () => ({
  rows: [
    { id: 'r1', columns: 1, cells: [[
      { nid: CALLOUT, type: 'callout', content: { title: 'Come in', body: 'We are open' }, style: { align: 'center', mt: 'lg' }, responsive: { phone: { title: 'Hi' } } },
    ]] },
    { id: 'r2', columns: 2, cells: [[{ nid: EDITORIAL, type: 'editorial', content: { title: 'First' } }], []] },
  ],
  bench: [],
})
let preferences: Record<string, unknown>
const send = (change: unknown, nid = CALLOUT) => saveCanvasNodeDraft({ spaceId: SPACE, nid, base: readCanvasDocument(preferences).base, values: {}, change })
const draft = () => preferences[CANVAS_DRAFT_KEY] as NodeLayout
const placed = () => draft().rows.flatMap((row) => row.cells.flat())

beforeEach(() => {
  vi.resetAllMocks()
  preferences = { profileLayout: published(), [CANVAS_REVISION_KEY]: 3 }
  mocks.flag.mockImplementation((name: string) => name === 'EDITOR_CANVAS')
  mocks.janitor.mockResolvedValue({ profileId: 'staff' })
  mocks.caller.mockResolvedValue({ id: 'staff', webRole: 'janitor' })
  mocks.access.mockResolvedValue({ canManage: true, staffViewing: false })
  mocks.renderPath.mockImplementation(async (surface: string) => surface === 'space_profile')
  mocks.space.mockImplementation(async () => ({ id: SPACE, slug: 'calm', name: 'Calm Studio', preferences: structuredClone(preferences) }))
  mocks.write.mockImplementation(async (_id: string, next: Record<string, unknown>) => { preferences = structuredClone(next); return 'written' })
})

const rowIds = () => draft().rows.map((row) => row.id)

describe('row-add', () => {
  it('adds an empty row at the index, keeps the block selected, and the tree shows it', async () => {
    const res = await send({ kind: 'row-add', at: 1 })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.node.nid).toBe(CALLOUT)
    expect(draft().rows).toHaveLength(3)
    expect(draft().rows[1]!.cells.flat()).toEqual([])
    expect(res.view?.tree?.map((row) => row.split)).toEqual(['full', 'full', 'even'])
    expect(placed().map((node) => node.nid)).toEqual([CALLOUT, EDITORIAL])
  })
  it('refuses past the 24-row cap and leaves the draft alone', async () => {
    for (let i = 0; i < 22; i++) expect((await send({ kind: 'row-add', at: 0 })).ok).toBe(true)
    const before = structuredClone(preferences)
    const res = await send({ kind: 'row-add', at: 0 })
    expect(res).toMatchObject({ ok: false, error: 'This page already has as many rows as it can hold.' })
    expect(preferences).toEqual(before)
  })
  it('rejects an index the schema does not allow', async () => {
    expect((await send({ kind: 'row-add', at: 99 })).ok).toBe(false)
  })
})

describe('row-remove', () => {
  it('takes off an empty row only', async () => {
    await send({ kind: 'row-add', at: 2 })
    const empty = rowIds()[2]!
    expect((await send({ kind: 'row-remove', rowId: empty })).ok).toBe(true)
    expect(rowIds()).toEqual(['r1', 'r2'])
  })
  it('refuses a row that holds a block, so nothing is benched', async () => {
    const res = await send({ kind: 'row-remove', rowId: 'r2' })
    expect(res).toMatchObject({ ok: false, error: 'Only an empty row can come off, and a page keeps at least one row.' })
    expect(preferences[CANVAS_DRAFT_KEY]).toBeUndefined()
  })
})

describe('row-move', () => {
  it('moves a row one step and refuses past the edge', async () => {
    expect((await send({ kind: 'row-move', rowId: 'r2', by: -1 })).ok).toBe(true)
    expect(rowIds()).toEqual(['r2', 'r1'])
    const res = await send({ kind: 'row-move', rowId: 'r2', by: -1 })
    expect(res).toMatchObject({ ok: false, error: 'That row is already at the edge of the page.' })
  })
})

describe('row-split', () => {
  it('widens and re-ratios a row', async () => {
    expect((await send({ kind: 'row-split', rowId: 'r1', split: 'even' })).ok).toBe(true)
    expect(draft().rows[0]).toMatchObject({ columns: 2 })
    expect((await send({ kind: 'row-split', rowId: 'r2', split: 'lead' })).ok).toBe(true)
    expect(draft().rows[1]).toMatchObject({ columns: 2, ratio: 'lead' })
    const res = await send({ kind: 'row-split', rowId: 'r2', split: 'sidebar' })
    expect(res.ok && res.view?.tree?.[1]?.split).toBe('sidebar')
  })
  it('narrows only when the dropped columns are empty', async () => {
    expect((await send({ kind: 'row-split', rowId: 'r2', split: 'full' })).ok).toBe(true)
    expect(draft().rows[1]).toMatchObject({ columns: 1 })
    await send({ kind: 'row-split', rowId: 'r2', split: 'even' })
    await send({ kind: 'move', to: { rowId: 'r2', col: 1, index: 0 } }, EDITORIAL)
    const res = await send({ kind: 'row-split', rowId: 'r2', split: 'full' })
    expect(res).toMatchObject({ ok: false, error: 'Move the blocks out of the columns this would drop first. Nothing was moved.' })
    expect(draft().rows[1]!.cells[1]!.map((node) => node.nid)).toEqual([EDITORIAL])
  })
  it('rejects a split a Space page cannot hold', async () => {
    expect((await send({ kind: 'row-split', rowId: 'r1', split: 'three' })).ok).toBe(false)
  })
})
