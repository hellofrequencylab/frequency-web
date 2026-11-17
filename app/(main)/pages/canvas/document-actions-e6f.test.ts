import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  flag: vi.fn(), janitor: vi.fn(), caller: vi.fn(), access: vi.fn(), renderPath: vi.fn(), space: vi.fn(), write: vi.fn(), revalidate: vi.fn(), live: vi.fn(),
}))
vi.mock('@/lib/env/string', async (orig) => ({ ...(await orig<typeof import('@/lib/env/string')>()), envFlag: mocks.flag }))
vi.mock('@/lib/page-editor/guard', () => ({ getJanitor: mocks.janitor }))
vi.mock('@/lib/auth', () => ({ getCallerProfile: mocks.caller }))
vi.mock('@/lib/spaces/entitlements', () => ({ resolveSpaceManageAccess: mocks.access }))
vi.mock('@/lib/platform-flags', () => ({ renderPathEnabled: mocks.renderPath }))
vi.mock('@/lib/spaces/store', () => ({ getSpaceById: mocks.space, writeSpacePreferencesAtRevision: mocks.write }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }))
vi.mock('@/lib/builder/canvas-live-blocks', () => ({ canvasLiveBlockIds: mocks.live }))

import { CANVAS_DRAFT_KEY, CANVAS_REVISION_KEY, readCanvasDocument } from '@/lib/builder/canvas-document'
import type { NodeLayout } from '@/lib/entity-blocks/node-tree'
import { saveCanvasNodeDraft } from './document-actions'

// PROG-E6F. A live section rides the SAME action as every other canvas change. The real
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
  mocks.live.mockResolvedValue(['about', 'events'])
  mocks.write.mockImplementation(async (_id: string, next: Record<string, unknown>) => { preferences = structuredClone(next); return 'written' })
})


describe('live sections', () => {
  it('adds a live section this Space may place under the block, and hands back the inserter with them', async () => {
    const res = await send({ kind: 'insert', source: 'live', id: 'events' })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(placed().map((node) => node.type)).toEqual(['callout', 'events', 'editorial'])
    expect(res.node.nid).toBe(placed()[1]!.nid)
    expect(res.view?.inserter?.live?.map((section) => section.id)).toEqual(['about', 'events'])
    expect(mocks.live).toHaveBeenCalledWith(expect.objectContaining({ id: SPACE }))
  })
  it('refuses a live section the lock rule holds back, and writes nothing', async () => {
    const res = await send({ kind: 'insert', source: 'live', id: 'offerings' })
    expect(res).toMatchObject({ ok: false, error: 'That block is not one this page can add.' })
    expect(mocks.write).not.toHaveBeenCalled()
  })
  it('does not run the lock check for a spacing step', async () => {
    await send({ kind: 'spacing', edge: 'mt', step: 'sm' })
    expect(mocks.live).not.toHaveBeenCalled()
  })
})
