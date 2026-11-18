import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ flag: vi.fn(), janitor: vi.fn(), coach: vi.fn(), grounding: vi.fn(), access: vi.fn() }))
vi.mock('@/lib/env/string', async (orig) => ({ ...(await orig<typeof import('@/lib/env/string')>()), envFlag: mocks.flag }))
vi.mock('@/lib/page-editor/guard', () => ({ getJanitor: mocks.janitor }))
vi.mock('@/lib/ai/vera/block-coach', () => ({ coachNewBlock: mocks.coach }))
vi.mock('@/lib/ai/space-grounding', () => ({ loadSpaceGrounding: mocks.grounding }))
vi.mock('@/lib/builder/canvas-document-load', () => ({ resolveCanvasAccess: mocks.access }))

import { askVeraAboutCanvasBlock } from './actions'

// PROG-E8 on a real document: the client names a node; the server reads its type from the stored page and coaches
// the fields that block's contract gives the inspector, for an editor of the Space only.

const SPACE = '0f0e0d0c-0b0a-4908-8706-050403020100'
const CALLOUT = 'ncallout0001'
const page = {
  profileLayoutDraft: {
    rows: [{ id: 'r1', columns: 1, cells: [[{ nid: CALLOUT, type: 'callout', content: { title: 'Open house' } }]] }],
    bench: [],
  },
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.flag.mockImplementation((name: string) => name === 'EDITOR_CANVAS')
  mocks.janitor.mockResolvedValue({ profileId: 'staff' })
  mocks.coach.mockResolvedValue({ source: 'fallback', questions: [], blockType: 'Callout' })
  mocks.grounding.mockResolvedValue(null)
  mocks.access.mockResolvedValue({ space: { id: SPACE, preferences: page }, canSave: true, notice: null })
})

describe('askVeraAboutCanvasBlock on a real document', () => {
  it('coaches the stored block the node id names, with that block contract fields', async () => {
    await askVeraAboutCanvasBlock({ trigger: 'asked', values: { body: '' }, spaceId: SPACE, nid: CALLOUT })
    expect(mocks.access).toHaveBeenCalledWith(SPACE)
    const arg = mocks.coach.mock.calls[0]![0]
    expect(arg.blockType).toBe('Callout')
    expect(arg.fields.map((f: { key: string }) => f.key)).toEqual(expect.arrayContaining(['title', 'body']))
    expect(arg.fields.map((f: { key: string }) => f.key)).not.toContain('headline')
  })

  it('says nothing for a node that is not on the page, a malformed id, no Space, or a viewer who cannot edit', async () => {
    expect(await askVeraAboutCanvasBlock({ trigger: 'asked', values: {}, spaceId: SPACE, nid: 'nmissing0001' })).toBeNull()
    expect(await askVeraAboutCanvasBlock({ trigger: 'asked', values: {}, spaceId: SPACE, nid: '../x' })).toBeNull()
    expect(await askVeraAboutCanvasBlock({ trigger: 'asked', values: {}, nid: CALLOUT })).toBeNull()
    mocks.access.mockResolvedValue({ space: { id: SPACE, preferences: page }, canSave: false, notice: 'Read only' })
    expect(await askVeraAboutCanvasBlock({ trigger: 'asked', values: {}, spaceId: SPACE, nid: CALLOUT })).toBeNull()
    expect(mocks.coach).not.toHaveBeenCalled()
  })

  it('keeps creation-time only: a stored block with words is not coached at creation', async () => {
    expect(await askVeraAboutCanvasBlock({ trigger: 'block-created', values: { title: 'Open house', body: 'Tea' }, spaceId: SPACE, nid: CALLOUT })).toBeNull()
    expect(await askVeraAboutCanvasBlock({ trigger: 'edit', values: {}, spaceId: SPACE, nid: CALLOUT })).toBeNull()
    expect(mocks.coach).not.toHaveBeenCalled()
  })
})
