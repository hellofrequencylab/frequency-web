import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'

const mocks = vi.hoisted(() => ({ search: vi.fn(), schema: vi.fn((rows) => rows), notFound: vi.fn(() => { throw new Error('NOT_FOUND') }) }))
vi.mock('next/navigation', () => ({ notFound: mocks.notFound }))
vi.mock('@/lib/pillars', () => ({ PILLAR_SLUGS: ['mind'], getPillars: async () => [{ id: 'mind-id', slug: 'mind', name: 'Mind', description: null }] }))
vi.mock('@/lib/practices', () => ({ searchLibraryPractices: mocks.search }))
vi.mock('@/lib/layout/index-hero', () => ({ resolveIndexHero: async () => ({ heroImage: null }) }))
vi.mock('@/lib/jsonld', () => ({ practiceListSchema: mocks.schema, breadcrumbSchema: () => ({}) }))
vi.mock('@/components/json-ld', () => ({ JsonLd: () => null }))
vi.mock('@/components/frequency/site/pages/discover/practices', () => ({ FrequencyPillarPractices: () => null }))
import Page, { generateMetadata } from './page'

const row = { id: 'page-two', title: 'A second page practice' }
const props = (page?: string | string[]) => ({ params: Promise.resolve({ slug: 'mind' }), searchParams: Promise.resolve({ page }) })
beforeEach(() => {
  vi.clearAllMocks()
  mocks.search.mockResolvedValue({ rows: [row], total: 121, page: 2, pageSize: 60, pageCount: 3 })
})

describe('public Pillar practice traversal', () => {
  it('requests the next real page with unchanged public library options and exposes its totals to the kit', async () => {
    const tree = await Page(props('2')) as ReactElement<{ children: ReactElement[] }>
    expect(mocks.search).toHaveBeenCalledWith({ pillarId: 'mind-id', hideDemo: true, pageSize: 60, sort: 'trending', page: 2 })
    const view = tree.props.children[1] as ReactElement<Record<string, unknown>>
    expect(view.props).toMatchObject({ rows: [row], page: 2, total: 121, pageCount: 3 })
    expect(mocks.schema).toHaveBeenCalledWith([row], 'Mind Practices')
  })
  it.each([undefined, '0', '-1', '1.5', '2x', 'Infinity', '9007199254740991', ['2', '3']])('normalizes unsafe or ambiguous page %j to the first page', async (value) => {
    await Page(props(value))
    expect(mocks.search).toHaveBeenCalledWith(expect.objectContaining({ page: 1 }))
  })
  it('does not present out-of-range results as an empty Pillar', async () => {
    mocks.search.mockResolvedValue({ rows: [], total: 61, page: 3, pageSize: 60, pageCount: 2 })
    await expect(Page(props('3'))).rejects.toThrow('NOT_FOUND')
  })
  it('surfaces a later-page read failure instead of inventing a not-found response', async () => {
    mocks.search.mockRejectedValue(new Error('upstream unavailable'))
    await expect(Page(props('2'))).rejects.toThrow('upstream unavailable')
    expect(mocks.notFound).not.toHaveBeenCalled()
  })
  it('keeps a genuinely empty first page available', async () => {
    mocks.search.mockResolvedValue({ rows: [], total: 0, page: 1, pageSize: 60, pageCount: 0 })
    await expect(Page(props())).resolves.toBeTruthy()
  })
  it('gives later pages their own canonical and Open Graph URL, with a clean first page', async () => {
    expect(await generateMetadata(props('2'))).toMatchObject({ alternates: { canonical: '/discover/practices/pillar/mind?page=2' }, openGraph: { url: '/discover/practices/pillar/mind?page=2' } })
    expect(await generateMetadata(props('1'))).toMatchObject({ alternates: { canonical: '/discover/practices/pillar/mind' } })
  })
  it('keeps an unknown Pillar unavailable without querying practices', async () => {
    await expect(Page({ ...props('2'), params: Promise.resolve({ slug: 'unknown' }) })).rejects.toThrow('NOT_FOUND')
    expect(mocks.search).not.toHaveBeenCalled()
  })
})
