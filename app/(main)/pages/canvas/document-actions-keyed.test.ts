import { beforeEach, describe, expect, it, vi } from 'vitest'

// PROG-E5 item 1. The canvas save hands the store its draft and its actor, so the write goes key-scoped through
// save_space_profile_draft (lib/spaces/store.ts writeSpacePreferencesAtRevision), and a refusal from that function
// reaches the tab in words.

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
import { saveCanvasNodeDraft } from './document-actions'

const SPACE = '0f0e0d0c-0b0a-4908-8706-050403020100'
const CALLOUT = 'ncallout0001'
const published = () => ({
  rows: [{ id: 'r1', columns: 1, cells: [[{ nid: CALLOUT, type: 'callout', content: { title: 'Come in', body: 'We are open' } }]] }],
  bench: [],
})
let preferences: Record<string, unknown>
const save = () => saveCanvasNodeDraft({ spaceId: SPACE, nid: CALLOUT, base: readCanvasDocument(preferences).base, values: { desktop: { title: 'New title', body: 'We are open' } } })

beforeEach(() => {
  vi.resetAllMocks()
  preferences = { accent: 'sky', profileLayout: published(), [CANVAS_REVISION_KEY]: 3 }
  mocks.flag.mockImplementation((name: string) => name === 'EDITOR_CANVAS')
  mocks.janitor.mockResolvedValue({ profileId: 'staff-profile' })
  mocks.caller.mockResolvedValue({ id: 'staff-profile', webRole: 'janitor' })
  mocks.access.mockResolvedValue({ canManage: true, staffViewing: false })
  mocks.renderPath.mockImplementation(async (surface: string) => surface === 'space_profile')
  mocks.space.mockImplementation(async () => ({ id: SPACE, slug: 'calm', name: 'Calm Studio', preferences }))
  mocks.write.mockResolvedValue('written')
})

describe('the canvas save goes key-scoped (PROG-E5 item 1)', () => {
  it('hands the store the sanitized draft and the acting staff profile with the revision the tab loaded', async () => {
    expect((await save()).ok).toBe(true)
    const [spaceId, blob, guard, keyed] = mocks.write.mock.calls[0]!
    expect(spaceId).toBe(SPACE)
    expect(guard).toEqual({ revisionKey: CANVAS_REVISION_KEY, expected: 3 })
    expect(keyed.actor).toBe('staff-profile')
    expect(keyed.draft).toEqual(blob[CANVAS_DRAFT_KEY])
    expect(keyed.draft).not.toHaveProperty('accent')
  })

  it('refuses in words when the function finds the caller may not manage the Space', async () => {
    mocks.write.mockResolvedValue('forbidden')
    const result = await save()
    expect(result.ok).toBe(false)
    expect(result).toMatchObject({ error: 'You cannot save this page.' })
  })
})
