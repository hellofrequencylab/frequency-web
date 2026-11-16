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
import { getNode } from '@/lib/entity-blocks/node-ops'
import type { NodeLayout } from '@/lib/entity-blocks/node-tree'
import { saveCanvasNodeDraft } from './document-actions'

// PROG-E6C. Duplicate, hide, remove and put-back ride the SAME action as every other canvas change. The real
// action, model and loader run; only the data layer is mocked, and the mocked write stores what it is given.

const SPACE = '0f0e0d0c-0b0a-4908-8706-050403020100'
const CALLOUT = 'ncallout0001'
const EDITORIAL = 'neditorial01'
const published = () => ({
  rows: [
    { id: 'r1', columns: 1, cells: [[
      { nid: CALLOUT, type: 'callout', content: { title: 'Come in', body: 'We are open' }, style: { align: 'center', mt: 'lg' }, responsive: { phone: { title: 'Hi' } } },
      { nid: EDITORIAL, type: 'editorial', content: { title: 'First' } },
    ]] },
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

describe('duplicate', () => {
  it('puts a copy with every bag right under the block and selects it', async () => {
    const res = await send({ kind: 'duplicate' })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const [first, copy, third] = placed()
    expect([first!.nid, third!.nid]).toEqual([CALLOUT, EDITORIAL])
    expect(copy!.nid).toBe(res.node.nid)
    expect(copy!.nid).not.toBe(CALLOUT)
    expect([copy!.type, copy!.content, copy!.style, copy!.responsive]).toEqual(['callout', first!.content, first!.style, first!.responsive])
    expect(res.view?.tree?.[0]?.columns[0]?.map((layer) => layer.label)).toEqual(['Callout', 'Callout 2', 'Editorial section'])
  })
})

describe('hide', () => {
  it('hides and shows one block in place, and the tree says so', async () => {
    const hidden = await send({ kind: 'hide', hidden: true }, EDITORIAL)
    expect(hidden.ok && hidden.view?.tree?.[0]?.columns[0]?.[1]).toEqual({ id: EDITORIAL, label: 'Editorial section', hidden: true })
    expect(getNode(draft(), EDITORIAL)?.hidden).toBe(true)
    await send({ kind: 'hide', hidden: false }, EDITORIAL)
    expect(getNode(draft(), EDITORIAL)?.hidden).toBeUndefined()
    expect(placed().map((node) => node.nid)).toEqual([CALLOUT, EDITORIAL])
  })
})

describe('remove and put back', () => {
  it('keeps a removed block on the bench with its words and puts it back where it was', async () => {
    const removed = await send({ kind: 'remove', keep: true })
    expect(removed.ok && removed.node.nid).toBe(EDITORIAL)
    expect(placed().map((node) => node.nid)).toEqual([EDITORIAL])
    expect(draft().bench.map((node) => [node.nid, node.content])).toEqual([[CALLOUT, { title: 'Come in', body: 'We are open' }]])
    const back = await send({ kind: 'restore', to: { rowId: 'r1', col: 0, index: 0 } })
    expect(back.ok && back.node.nid).toBe(CALLOUT)
    expect(placed().map((node) => node.nid)).toEqual([CALLOUT, EDITORIAL])
    expect(draft().bench).toEqual([])
  })

  it('takes an added block away for good when an add is undone', async () => {
    const copy = await send({ kind: 'duplicate' })
    const nid = copy.ok ? copy.node.nid : ''
    expect((await send({ kind: 'remove', keep: false }, nid)).ok).toBe(true)
    expect(getNode(draft(), nid)).toBeNull()
    expect(draft().bench).toEqual([])
  })

  it('refuses to empty the page, and refuses a put-back of a block that is still placed', async () => {
    await send({ kind: 'remove', keep: true })
    const writes = mocks.write.mock.calls.length
    const last = await send({ kind: 'remove', keep: true }, EDITORIAL)
    expect(last).toMatchObject({ ok: false, conflict: false })
    expect((await send({ kind: 'restore', to: { rowId: 'r1', col: 0, index: 0 } }, EDITORIAL)).ok).toBe(false)
    expect(mocks.write.mock.calls.length).toBe(writes)
  })

  it('refuses a put-back once the page has filled that block\'s limit', async () => {
    preferences = { profileLayout: { rows: [{ id: 'r1', columns: 1, cells: [[{ nid: EDITORIAL, type: 'editorial' }]] }], bench: [{ nid: 'nabout000001', type: 'about' }, { nid: 'nabout000002', type: 'about' }] }, [CANVAS_REVISION_KEY]: 3 }
    expect((await send({ kind: 'restore', to: { rowId: 'r1', col: 0, index: 0 } }, 'nabout000001')).ok).toBe(true)
    expect((await send({ kind: 'restore', to: { rowId: 'r1', col: 0, index: 0 } }, 'nabout000002')).ok).toBe(false)
  })
})

describe('the door', () => {
  it('writes none of the four with the switch off, for a non-staff caller or a read-only viewer', async () => {
    for (const off of [() => mocks.flag.mockReturnValue(false), () => mocks.janitor.mockResolvedValue(null), () => mocks.access.mockResolvedValue({ canManage: false, staffViewing: true })]) {
      off()
      for (const change of [{ kind: 'duplicate' }, { kind: 'hide', hidden: true }, { kind: 'remove', keep: true }, { kind: 'restore', to: { rowId: 'r1', col: 0, index: 0 } }]) {
        expect((await send(change)).ok).toBe(false)
      }
    }
    expect(mocks.write).not.toHaveBeenCalled()
  })

  it('refuses a change it cannot read', async () => {
    for (const change of [{ kind: 'hide' }, { kind: 'remove' }, { kind: 'duplicate', type: 'callout', content: { title: 'x' } }, { kind: 'restore', to: { rowId: 'x', col: 0, index: 0 } }]) {
      const res = await send(change)
      // A copy is made from what is stored: words the tab sends with it are dropped, never written.
      if (change.kind === 'duplicate') expect(res.ok && getNode(draft(), res.node.nid)?.content).toEqual({ title: 'Come in', body: 'We are open' })
      else expect(res.ok).toBe(false)
    }
  })
})
