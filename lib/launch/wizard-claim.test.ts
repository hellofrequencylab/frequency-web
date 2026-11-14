import { beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyDraft, serializeDraft } from '../create-space/builder'
const io = vi.hoisted(() => ({ profile: vi.fn(), pending: vi.fn(), start: vi.fn(), save: vi.fn(), read: vi.fn(), converted: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getMyProfileId: io.profile }))
vi.mock('@/lib/launch/enabled', () => ({ launchSystemEnabled: () => true }))
vi.mock('@/lib/launch/pending-io', () => ({ readPendingLaunch: io.pending, clearPendingLaunch: vi.fn() }))
vi.mock('@/lib/launch/store', () => ({ startLaunch: io.start, saveWizardResume: io.save }))
vi.mock('@/lib/create-space/draft-io', () => ({ readDraftByToken: io.read, markDraftConverted: io.converted }))
vi.mock('next/navigation', () => ({ redirect: (href: string) => { throw Error(href) }, notFound: () => { throw Error('404') } }))
import { GET } from '@/app/(main)/launch/claim/route'
const resume = { version: 1, phase: 'launch', cursor: 4, theme: 'new-world', accentAt: 0, niche: null, goals: [], timedEntry: true, draft: null, leadToken: 'token-12345678' }
describe('wizard claim transfer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    io.profile.mockResolvedValue('session-owner')
    io.pending.mockResolvedValue({ niche: null, intents: [], answers: { spotlight: { lead: 'token-12345678' } }, resume })
    io.start.mockResolvedValue({ id: 'launch', ownerId: 'session-owner' })
    io.read.mockResolvedValue(serializeDraft({ ...emptyDraft('new-world', true), name: 'My Space', startedAt: '2026-11-01T12:00:00Z' }))
    io.save.mockResolvedValue({ id: 'launch' })
  })
  it('reads the token before conversion and saves the full draft under the session owner', async () => {
    await expect(GET()).rejects.toThrow('/launch')
    expect(io.start).toHaveBeenCalledWith('session-owner', { niche: null, intents: [] })
    expect(io.save.mock.calls[0][1]).toMatchObject({ timedEntry: true, cursor: 4, draft: { name: 'My Space', startedAt: '2026-11-01T12:00:00Z' } })
    expect(io.read.mock.invocationCallOrder[0]).toBeLessThan(io.converted.mock.invocationCallOrder[0])
    expect(io.save.mock.invocationCallOrder[0]).toBeLessThan(io.converted.mock.invocationCallOrder[0])
  })
  it('keeps the token unconverted when the canonical save fails', async () => {
    io.save.mockResolvedValue(null)
    await expect(GET()).rejects.toThrow('/launch')
    expect(io.converted).not.toHaveBeenCalled()
  })
})
