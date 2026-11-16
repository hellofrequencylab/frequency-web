import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ flag: vi.fn(), janitor: vi.fn(), load: vi.fn(), bySlug: vi.fn() }))
vi.mock('@/lib/env/string', async (orig) => ({ ...(await orig<typeof import('@/lib/env/string')>()), envFlag: mocks.flag }))
vi.mock('@/lib/page-editor/guard', () => ({ getJanitor: mocks.janitor }))
vi.mock('@/lib/builder/canvas-document-load', () => ({ loadCanvasDocument: mocks.load }))
vi.mock('@/lib/spaces/store', () => ({ getSpaceBySlug: mocks.bySlug }))
vi.mock('@/lib/page-editor/data', () => ({ EDITABLE_PAGES: [], getPage: vi.fn(), isEditableSlug: () => false, resolveSpaceId: vi.fn() }))
vi.mock('@/lib/page-editor/versions', () => ({ listPageVersions: vi.fn() }))
vi.mock('@/lib/page-editor/templates', () => ({ getTemplate: vi.fn(), isWellFormed: vi.fn() }))
vi.mock('@/components/admin/admin-page', () => ({ AdminPage: ({ children }: { children: unknown }) => children }))
vi.mock('next/dynamic', () => ({ default: () => function Lazy() { return null } }))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NOT_FOUND') } }))

import CanvasPage from './page'

const SPACE = '0f0e0d0c-0b0a-4908-8706-050403020100'
const open = (params: Record<string, string>) => CanvasPage({ searchParams: Promise.resolve(params) })
/** The props the route hands the canvas (the last child of the page). */
const canvasProps = (tree: unknown) => {
  const children = (tree as { props: { children: { props: Record<string, unknown> }[] } }).props.children
  return children[children.length - 1]!.props
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.flag.mockImplementation((name: string) => name === 'EDITOR_CANVAS')
  mocks.janitor.mockResolvedValue({ profileId: 'staff' })
  mocks.load.mockResolvedValue(null)
})

describe('/pages/canvas stays dark (PROG-E5B)', () => {
  it('is a 404 with the switch off, before staff, a Space or a document is looked up', async () => {
    mocks.flag.mockReturnValue(false)
    await expect(open({ space: SPACE })).rejects.toThrow('NOT_FOUND')
    await expect(open({ space: 'calm-studio' })).rejects.toThrow('NOT_FOUND')
    expect(mocks.janitor).not.toHaveBeenCalled()
    expect(mocks.bySlug).not.toHaveBeenCalled()
    expect(mocks.load).not.toHaveBeenCalled()
  })

  it('is a 404 for anyone but staff, and reads no document for them', async () => {
    mocks.janitor.mockResolvedValue(null)
    await expect(open({ space: SPACE })).rejects.toThrow('NOT_FOUND')
    expect(mocks.load).not.toHaveBeenCalled()
  })

  it('keeps the demo Banner when no Space is named or the Space has no document', async () => {
    const none = canvasProps(await open({}))
    expect(none.document).toBeUndefined()
    expect((none.inspector as { title: string }).title).toBe('Banner')
    expect(mocks.load).not.toHaveBeenCalled()
    expect(canvasProps(await open({ space: SPACE })).document).toBeUndefined()
    expect(mocks.load).toHaveBeenCalledWith(SPACE)
  })

  it('hands the canvas the document for a Space named by id or by address', async () => {
    const document = { spaceId: SPACE, base: { revision: 1, fingerprint: 'f' } }
    mocks.load.mockResolvedValue(document)
    mocks.bySlug.mockResolvedValue({ id: SPACE })
    expect(canvasProps(await open({ space: 'Calm-Studio' }))).toMatchObject({ spaceId: SPACE, document })
    expect(mocks.bySlug).toHaveBeenCalledWith('calm-studio')
    mocks.bySlug.mockClear()
    await open({ space: 'not a space!' })
    expect(mocks.bySlug).not.toHaveBeenCalled()
  })
})
