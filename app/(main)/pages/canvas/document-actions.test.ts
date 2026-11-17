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
import { CANVAS_OLDER_LAYOUT, CANVAS_READ_ONLY, loadCanvasDocument } from '@/lib/builder/canvas-document-load'
import { getNode } from '@/lib/entity-blocks/node-ops'
import { saveCanvasNodeDraft } from './document-actions'

const SPACE = '0f0e0d0c-0b0a-4908-8706-050403020100'
const CALLOUT = 'ncallout0001'
const TEXT = 'ntext0000001'
const published = () => ({
  rows: [{ id: 'r1', columns: 1, cells: [[{ nid: CALLOUT, type: 'callout', content: { title: 'Come in', body: 'We are open' } }, { nid: TEXT, type: 'text', content: { text: 'First' } }]] }],
  bench: [],
})
let preferences: Record<string, unknown>
const base = () => readCanvasDocument(preferences).base
const save = (over: Record<string, unknown> = {}) =>
  saveCanvasNodeDraft({ spaceId: SPACE, nid: CALLOUT, base: base(), values: { desktop: { title: 'New title', body: 'We are open' }, phone: { title: 'Short', body: '' } }, ...over })

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

describe('saveCanvasNodeDraft', () => {
  it('is off without the switch, and for anyone but staff: nothing is read or written', async () => {
    mocks.flag.mockReturnValue(false)
    expect(await save()).toMatchObject({ ok: false, conflict: false })
    mocks.flag.mockImplementation((name: string) => name === 'EDITOR_CANVAS')
    mocks.janitor.mockResolvedValue(null)
    expect(await save()).toMatchObject({ ok: false, conflict: false })
    expect(mocks.space).not.toHaveBeenCalled()
    expect(mocks.write).not.toHaveBeenCalled()
  })

  it('refuses input that does not parse, before it touches a Space', async () => {
    for (const bad of [null, {}, { spaceId: 'nope', nid: CALLOUT, base: base(), values: {} }, { spaceId: SPACE, nid: '../x', base: base(), values: {} },
      { spaceId: SPACE, nid: CALLOUT, base: { revision: -1, fingerprint: 'x' }, values: {} }, { spaceId: SPACE, nid: CALLOUT, base: base(), values: { desktop: { title: { $ne: 1 } } } }]) {
      expect(await saveCanvasNodeDraft(bad)).toMatchObject({ ok: false, conflict: false })
    }
    expect(mocks.space).not.toHaveBeenCalled()
    expect(mocks.write).not.toHaveBeenCalled()
  })

  it('uses the Space page builder rule: a staff preview that is not an editor of the Space cannot save', async () => {
    mocks.access.mockResolvedValue({ canManage: false, staffViewing: true })
    expect(await save()).toEqual({ ok: false, conflict: false, error: CANVAS_READ_ONLY })
    mocks.access.mockResolvedValue({ canManage: false, staffViewing: false })
    expect(await save()).toMatchObject({ ok: false, error: 'That Space was not found.' })
    expect(mocks.access).toHaveBeenCalledWith(expect.objectContaining({ id: SPACE }), 'staff', 'janitor')
    expect(mocks.write).not.toHaveBeenCalled()
  })

  it('does not write a node document under a Space still on the older layout', async () => {
    mocks.renderPath.mockResolvedValue(false)
    expect(await save()).toEqual({ ok: false, conflict: false, error: CANVAS_OLDER_LAYOUT })
    expect(mocks.write).not.toHaveBeenCalled()
  })

  it('writes the DRAFT only, guarded on the revision the tab loaded, and never the published page', async () => {
    const result = await save()
    if (!result.ok) throw new Error(result.error)
    expect(mocks.write).toHaveBeenCalledTimes(1)
    const [spaceId, written, guard] = mocks.write.mock.calls[0]!
    expect(spaceId).toBe(SPACE)
    expect(guard).toEqual({ revisionKey: CANVAS_REVISION_KEY, expected: 3 })
    expect(written.profileLayout).toEqual(published())
    expect(written.accent).toBe('sky')
    expect(written[CANVAS_REVISION_KEY]).toBe(4)
    const node = getNode(written[CANVAS_DRAFT_KEY], CALLOUT)!
    expect(node.content).toEqual({ title: 'New title', body: 'We are open' })
    expect(node.responsive).toEqual({ phone: { title: 'Short', body: '' } })
    expect(getNode(written[CANVAS_DRAFT_KEY], TEXT)!.content).toEqual({ text: 'First' })
    expect(result.base.revision).toBe(4)
    expect(result.node).toEqual({ nid: CALLOUT, type: 'callout', content: node.content, responsive: node.responsive })
    // The next save from this tab builds on what was just written.
    preferences = JSON.parse(JSON.stringify(written))
    expect(result.base).toEqual(base())
  })

  it('writes only the fields the block contract gives the inspector: a client cannot name its own keys', async () => {
    await saveCanvasNodeDraft({ spaceId: SPACE, nid: TEXT, base: base(), values: { desktop: { text: 'Edited', title: 'Smuggled', hidden: true }, phone: { nope: 'x' } } })
    const written = mocks.write.mock.calls[0]![1]
    expect(getNode(written[CANVAS_DRAFT_KEY], TEXT)).toEqual({ nid: TEXT, type: 'text', content: { text: 'Edited' } })
  })

  it('a stale tab cannot overwrite a newer draft: an old revision or a changed document is a conflict, with no write', async () => {
    const stale = base()
    preferences = { ...preferences, [CANVAS_REVISION_KEY]: 4 }
    expect(await save({ base: stale })).toMatchObject({ ok: false, conflict: true })

    // Someone saved the draft in the Space page builder: same counter, different document.
    preferences = { ...preferences, [CANVAS_REVISION_KEY]: 3, profileLayoutDraft: { ...published(), bench: [{ nid: 'nbench000001', type: 'text', content: { text: 'Theirs' } }] } }
    expect(await save({ base: stale })).toMatchObject({ ok: false, conflict: true })
    expect(mocks.write).not.toHaveBeenCalled()
  })

  it('reports a conflict when the guarded update finds the revision already moved, and an error when it fails', async () => {
    mocks.write.mockResolvedValue('stale')
    expect(await save()).toMatchObject({ ok: false, conflict: true })
    mocks.write.mockResolvedValue('error')
    expect(await save()).toMatchObject({ ok: false, conflict: false })
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })

  it('refuses a node that is not on the page, and a Space with no page', async () => {
    expect(await save({ nid: 'nmissing0001' })).toMatchObject({ ok: false, conflict: true })
    preferences = { accent: 'sky' }
    expect(await save({ base: { revision: 0, fingerprint: 'x' } })).toMatchObject({ ok: false, conflict: false })
    expect(mocks.write).not.toHaveBeenCalled()
  })
})

describe('loadCanvasDocument', () => {
  it('gives the canvas each placed node with fields from that block contract, not the demo Banner', async () => {
    const view = (await loadCanvasDocument(SPACE))!
    expect(view).toMatchObject({ spaceId: SPACE, spaceName: 'Calm Studio', source: 'published', canSave: true, notice: null, base: base() })
    expect(view.layers).toEqual([{ id: CALLOUT, label: 'Callout' }, { id: TEXT, label: 'Text' }])
    expect(view.nodes[0]!.fields.map((f) => f.key)).toEqual(expect.arrayContaining(['title', 'body', 'buttonOn']))
    expect(view.nodes[1]).toMatchObject({ nid: TEXT, title: 'Text', fields: [{ key: 'text', kind: 'textarea' }], node: { nid: TEXT, type: 'text', content: { text: 'First' } } })
  })

  it('is read only for a staff preview, and nothing at all without access or a page', async () => {
    mocks.access.mockResolvedValue({ canManage: false, staffViewing: true })
    expect(await loadCanvasDocument(SPACE)).toMatchObject({ canSave: false, notice: CANVAS_READ_ONLY })
    mocks.access.mockResolvedValue({ canManage: false, staffViewing: false })
    expect(await loadCanvasDocument(SPACE)).toBeNull()
    mocks.access.mockResolvedValue({ canManage: true, staffViewing: false })
    preferences = {}
    expect(await loadCanvasDocument(SPACE)).toBeNull()
    mocks.space.mockResolvedValue(null)
    expect(await loadCanvasDocument(SPACE)).toBeNull()
  })
})
