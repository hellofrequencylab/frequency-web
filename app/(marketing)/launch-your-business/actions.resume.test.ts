import { beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyDraft, serializeDraft } from '@/lib/create-space/builder'
const io = vi.hoisted(() => ({ profile: vi.fn(), active: vi.fn(), pending: vi.fn(), hold: vi.fn(), save: vi.fn(), start: vi.fn(), saveDraft: vi.fn(), signup: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => ({ toString: () => '' }), headers: async () => new Headers() }))
vi.mock('next/navigation', () => ({ redirect: (href: string) => { throw new Error(`redirect:${href}`) }, notFound: () => { throw new Error('not-found') } }))
vi.mock('@/app/sign-in/actions', () => ({ signInWithGoogle: vi.fn(), sendSignupLink: io.signup }))
vi.mock('@/lib/auth', () => ({ getMyProfileId: io.profile }))
vi.mock('@/lib/launch/enabled', () => ({ launchSystemEnabled: () => true }))
vi.mock('@/lib/launch/pending-io', () => ({ readPendingLaunch: io.pending, writePendingLaunch: io.hold }))
vi.mock('@/lib/launch/store', () => ({ getActiveLaunch: io.active, saveWizardResume: io.save, startLaunch: io.start }))
vi.mock('@/lib/launch/entry-io', () => ({ ownedWizardEntry: async () => null }))
vi.mock('@/lib/launch/events', () => ({ recordLaunchEvent: vi.fn() }))
vi.mock('@/lib/spaces/store', () => ({ isSpaceSlugTaken: async () => false }))
vi.mock('@/lib/create-space/draft-io', () => ({ readDraftByToken: vi.fn(), saveDraft: io.saveDraft }))
vi.mock('@/lib/rate-limit', () => ({ rateLimitOk: async () => true }))
import { claimWithEmail, continueSignedIn } from './actions'
import { GET } from '@/app/(main)/launch/start/route'
const draft = { ...emptyDraft('new-world', true), name: 'New Space', startedAt: '2026-11-01T12:00:00Z' }
const baseResume = { version: 1, phase: 'builder', cursor: 2, theme: 'new-world', accentAt: 0, niche: null, goals: [], timedEntry: true, draft, leadToken: null }
const form = () => { const f = new FormData(); f.set('draft', serializeDraft(draft)); f.set('email', 'owner@example.com'); return f }
beforeEach(() => { vi.clearAllMocks(); io.profile.mockResolvedValue('owner'); io.active.mockResolvedValue({ id: 'launch', ownerId: 'owner', spaceId: null, resume: baseResume }); io.pending.mockResolvedValue(null); io.save.mockImplementation(async (launch, resume) => ({ ...launch, resume })); io.start.mockResolvedValue(null); io.signup.mockResolvedValue({ ok: true }); io.saveDraft.mockResolvedValue({ token: 'rotated-token-12345678', handleTaken: false }) })
describe('builder handover and explicit timer entry', () => {
  it('keeps canonical signed-in timer provenance and the original draft start', async () => {
    expect(await continueSignedIn(form())).toMatchObject({ ok: true })
    expect(io.hold).toHaveBeenCalledWith(expect.objectContaining({ resume: expect.objectContaining({ timedEntry: true, draft: expect.objectContaining({ startedAt: '2026-11-01T12:00:00Z' }) }) }))
    expect(io.start).not.toHaveBeenCalled()
  })
  it('does not replace an active launch already attached to a Space', async () => {
    io.active.mockResolvedValue({ id: 'launch', ownerId: 'owner', spaceId: 'existing' })
    expect(await continueSignedIn(form())).toMatchObject({ ok: false })
    expect(io.save).not.toHaveBeenCalled(); expect(io.hold).not.toHaveBeenCalled()
  })
  it('carries the signed-out explicit timer through the existing pending bridge', async () => {
    io.profile.mockResolvedValue(null); io.pending.mockResolvedValue({ resume: baseResume })
    expect(await claimWithEmail(form())).toMatchObject({ ok: true })
    expect(io.hold).toHaveBeenCalledWith(expect.objectContaining({ resume: expect.objectContaining({ timedEntry: true }) }))
  })
  it('records an explicit timer entry on an existing unattached launch', async () => {
    await expect(GET(new Request('https://frequencylocal.com/launch/start?timer=12'))).rejects.toThrow('redirect:/launch')
    expect(io.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'launch' }), expect.objectContaining({ timedEntry: true }))
  })
  it('adds a timer to an existing builder without erasing its cursor, theme or full draft', async () => {
    await expect(GET(new Request('https://frequencylocal.com/launch/start?timer=12'))).rejects.toThrow('redirect:/launch')
    expect(io.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'launch' }), expect.objectContaining({ phase: 'builder', cursor: 2, theme: 'new-world', draft: expect.objectContaining({ name: 'New Space', startedAt: '2026-11-01T12:00:00Z' }) }))
  })
  it('persists the latest signed-out draft before auth and carries a rotated token', async () => {
    io.profile.mockResolvedValue(null)
    const f = form()
    f.set('draft', serializeDraft({ ...draft, email: 'owner@example.com', offer: 'Latest offer from this tab', cover: 's2', leadToken: 'old-token-12345678' }))
    expect(await claimWithEmail(f)).toMatchObject({ ok: true })
    expect(io.saveDraft).toHaveBeenCalledWith(expect.objectContaining({ draft: expect.objectContaining({ offer: 'Latest offer from this tab', cover: 's2' }), token: 'old-token-12345678' }))
    expect(io.hold).toHaveBeenCalledWith(expect.objectContaining({ resume: expect.objectContaining({ leadToken: 'rotated-token-12345678', draft: expect.objectContaining({ leadToken: 'rotated-token-12345678' }) }) }))
    expect(io.saveDraft.mock.invocationCallOrder[0]).toBeLessThan(io.hold.mock.invocationCallOrder[0])
    expect(io.hold.mock.invocationCallOrder[0]).toBeLessThan(io.signup.mock.invocationCallOrder[0])
  })
  it('keeps the pending draft and does not start auth when its latest snapshot cannot be saved', async () => {
    io.profile.mockResolvedValue(null); io.saveDraft.mockResolvedValue(null)
    const f = form(); f.set('draft', serializeDraft({ ...draft, email: 'owner@example.com' }))
    expect(await claimWithEmail(f)).toMatchObject({ ok: false })
    expect(io.hold).not.toHaveBeenCalled(); expect(io.signup).not.toHaveBeenCalled()
  })
  it('passes a validated browser timezone into the latest handover snapshot', async () => {
    io.profile.mockResolvedValue(null)
    const f = form(); f.set('draft', serializeDraft({ ...draft, email: 'owner@example.com' })); f.set('tz', 'America/Los_Angeles')
    expect(await claimWithEmail(f)).toMatchObject({ ok: true })
    expect(io.saveDraft).toHaveBeenCalledWith(expect.objectContaining({ tz: 'America/Los_Angeles' }))
  })
  it('keeps generic Free Spotlight untimed', async () => {
    io.active.mockResolvedValue({ id: 'launch', ownerId: 'owner', spaceId: null })
    await expect(GET(new Request('https://frequencylocal.com/launch/start'))).rejects.toThrow('redirect:/launch')
    expect(io.save).not.toHaveBeenCalled()
  })
})
