import { beforeEach, describe, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({ row: null as Record<string, unknown> | null, raw: {}, writes: [] as Record<string, unknown>[], authorized: true }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/staff', () => ({ requireStaffCap: async () => { if (!h.authorized) throw new Error('Forbidden') } }))
vi.mock('@/lib/auth', () => ({ getMyProfileId: async () => 'operator' }))
vi.mock('@/lib/library/ingest', () => ({ ingestImageBytes: vi.fn() }))
vi.mock('@/lib/listing-seeder/extract', () => ({ extractListing: async () => h.raw }))
vi.mock('@/lib/listing-seeder/dedupe', () => ({ findSimilarSeededListings: async () => [] }))
vi.mock('@/lib/listing-seeder/publish', () => ({ publishListingIntake: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => {
  const api = {
    insert: (data: Record<string, unknown>) => { h.row = { id: 'intake', ...data }; return api },
    select: () => api,
    maybeSingle: async () => ({ data: h.row ? structuredClone(h.row) : null, error: null }),
    update: (patch: Record<string, unknown>) => { h.writes.push(structuredClone(patch)); Object.assign(h.row!, patch); return api },
    eq: () => api,
  }
  return api
} }) }))
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ReviewBoard } from './[id]/review-board'
import { startListingIntake, updateListingDraft, getListingIntakeReview } from './actions'

beforeEach(() => { h.row = null; h.raw = {}; h.writes = []; h.authorized = true })
describe('actual listing intake and review persistence', () => {
  it('stages only source prose, keeps missing questions, then preserves human-written edits', async () => {
    h.raw = { kind: 'classifieds',
      title: { kind: 'fact', value: 'Amazing bike for every adventure', snippet: 'bike' },
      description: { kind: 'generated', value: 'Ride into your future.' },
      priceNote: { kind: 'fact', value: '$40', snippet: '$40' },
    }
    expect(await startListingIntake({ kind: 'classifieds', pastedText: 'Old bike, $40' })).toEqual({ ok: true, intakeId: 'intake' })
    expect(h.writes[0].draft).toMatchObject({ title: '', description: null, priceNote: '$40' })
    expect(JSON.stringify(h.writes)).not.toContain('Amazing bike')
    const review = await getListingIntakeReview('intake')
    const html = renderToStaticMarkup(createElement(ReviewBoard, {
      intakeId: 'intake', kind: 'classifieds', status: 'review', initialModel: review!.model,
      initialImages: [], appliedListingId: null,
    }))
    expect(html).toContain('What title would help someone recognize this listing?')
    expect(html).toContain('Missing title and description fields stay blank')
    expect(html).not.toContain('Amazing bike')
    expect(html).toMatch(/<button[^>]*disabled[^>]*>[^]*?Publish listing/)

    const edit = await updateListingDraft('intake', { title: 'My own bike title', description: 'My own description.' })
    expect(edit.ok).toBe(true)
    expect(h.row?.draft).toMatchObject({ title: 'My own bike title', description: 'My own description.' })
    expect(h.row?.ledger).toMatchObject({ title: [{ verifiedBy: 'human', snippet: 'My own bike title' }] })
    const read = await getListingIntakeReview('intake')
    expect(read?.model.sections.flatMap((s) => s.fields).find((f) => f.path === 'title')?.raw).toBe('My own bike title')
  })
  it('removes historical generated prose before returning the review model without writing on read', async () => {
    h.row = { id: 'intake', kind: 'classifieds', status: 'review', inputs: { pastedText: 'bike' },
      draft: { kind: 'classifieds', title: 'Invented title', description: 'Invented body' },
      ledger: { title: [{ kind: 'generated', confidence: 1 }], description: [{ kind: 'fact', snippet: 'bike', confidence: 1 }] },
    }
    const read = await getListingIntakeReview('intake')
    expect(read?.title).toBe('Untitled listing')
    expect(read?.model.sections.flatMap((s) => s.fields).find((f) => f.path === 'description')?.raw).toBe('')
    expect(h.writes).toEqual([])
  })
  it('retains staff authorization before model or persistence work', async () => {
    h.authorized = false
    await expect(startListingIntake({ kind: 'classifieds', pastedText: 'bike' })).rejects.toThrow('Forbidden')
    expect(h.row).toBeNull()
  })
})
