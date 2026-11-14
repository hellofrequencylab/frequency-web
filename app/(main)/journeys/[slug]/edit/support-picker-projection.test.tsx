import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'
const m = vi.hoisted(() => ({ caller: { id: 'author' } as { id: string } | null, allowed: true, practices: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`REDIRECT ${url}`) }, notFound: () => { throw new Error('NOT_FOUND') } }))
vi.mock('@/lib/auth', () => ({ getCallerProfile: async () => m.caller }))
vi.mock('@/lib/journeys/authoring', () => ({ canEditJourney: async () => m.allowed }))
vi.mock('@/lib/journey-plans', () => ({ getPlan: async () => ({ plan: { id: 'plan', title: 'Mine' }, items: [] }), getVeraReview: async () => null, normalizeJourneyMeeting: () => null }))
vi.mock('@/lib/practices', () => ({ listPublicPractices: m.practices }))
vi.mock('@/lib/pillars', () => ({ getPillars: async () => [] }))
vi.mock('@/lib/journeys/store', () => ({ parseCheck: () => null }))
vi.mock('@/components/journey/v2/journey-editor', () => ({ JourneyEditor: () => null }))
vi.mock('@/components/journey/v2/journey-settings', () => ({ JourneySettings: () => null }))
vi.mock('@/components/journey/v2/journey-advanced', () => ({ JourneyAdvanced: () => null }))
vi.mock('@/components/journey/v2/journey-builder', () => ({ JourneyBuilder: () => null }))
vi.mock('@/components/journey/v2/journey-composer', () => ({ JourneyComposer: () => null }))
vi.mock('@/components/journey/v2/journey-danger-zone', () => ({ JourneyDangerZone: () => null }))
vi.mock('@/components/journey/v2/journey-export', () => ({ JourneyExport: () => null }))
import Page from './page'
const ids = ['00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000004']
beforeEach(() => { m.caller = { id: 'author' }; m.allowed = true; m.practices.mockReset() })
describe('the author-gated page sends current authored supports to the picker', () => {
  it('projects primary, secondary and extra focuses once with no raw focus payload', async () => {
    m.practices.mockResolvedValue([{ id: 'p', title: 'Mixed', description: 'Mine', domain_id: ids[0], secondary_domain_id: ids[1], focus_details: { [ids[0]]: {}, [ids[2]]: {}, [ids[3]]: {}, invalid: {} } }])
    const page = await Page({ params: Promise.resolve({ slug: 'mine' }) }) as ReactElement<{ curriculum: ReactElement<{ practices: unknown[] }> }>
    expect(page.props.curriculum.props.practices).toEqual([{ id: 'p', title: 'Mixed', description: 'Mine', pillarId: ids[0], supportIds: ids }])
    expect(m.practices).toHaveBeenCalledExactlyOnceWith()
  })
  it.each(['signed out', 'unauthorized'])('does not load the public practice payload for a %s caller', async state => {
    if (state === 'signed out') m.caller = null
    else m.allowed = false
    await expect(Page({ params: Promise.resolve({ slug: 'mine' }) })).rejects.toThrow('REDIRECT /journeys/mine/learn')
    expect(m.practices).not.toHaveBeenCalled()
  })
})
