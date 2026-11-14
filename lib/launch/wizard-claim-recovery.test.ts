import { beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyDraft, serializeDraft } from '../create-space/builder'
import { parseWizardResume } from './wizard-resume'
const io = vi.hoisted(() => ({ profile: vi.fn(), pending: vi.fn(), clear: vi.fn(), start: vi.fn(), save: vi.fn(), read: vi.fn(), converted: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getMyProfileId: io.profile }))
vi.mock('@/lib/launch/enabled', () => ({ launchSystemEnabled: () => true }))
vi.mock('@/lib/launch/pending-io', () => ({ readPendingLaunch: io.pending, clearPendingLaunch: io.clear }))
vi.mock('@/lib/launch/store', () => ({ startLaunch: io.start, saveWizardResume: io.save }))
vi.mock('@/lib/create-space/draft-io', () => ({ readDraftByToken: io.read, markDraftConverted: io.converted }))
vi.mock('next/navigation', () => ({ redirect: (href: string) => { throw Error(href) }, notFound: () => { throw Error('404') } }))
import { GET } from '@/app/(main)/launch/claim/route'
const token = 'pointer-token-12345'
const oldToken = 'older-token-12345'
const oldAt = '2026-11-13T10:00:00Z'
const newAt = '2026-11-13T11:00:00Z'
const draft = (name = 'New draft') => ({ ...emptyDraft('new-world', true), name, leadToken: token, startedAt: '2026-11-01T12:00:00Z' })
const resume = () => parseWizardResume({ version: 1, phase: 'builder', cursor: 2, theme: 'new-world', accentAt: 0, niche: null, goals: [], timedEntry: true, draft: null, leadToken: token })!
const hold = (savedAt = newAt) => ({ niche: null, intents: [], answers: {}, savedAt, resume: resume() })
const canonical = () => ({ ...resume(), draft: draft('Old canonical draft'), leadToken: oldToken })
const run = () => expect(GET()).rejects.toThrow('/launch')

beforeEach(() => {
  vi.clearAllMocks()
  io.profile.mockResolvedValue('session-owner')
  io.pending.mockResolvedValue(hold())
  io.start.mockResolvedValue({ id: 'launch', ownerId: 'session-owner', updatedAt: oldAt, resume: canonical() })
  io.read.mockResolvedValue(serializeDraft(draft()))
  io.save.mockResolvedValue({ id: 'launch' })
})
describe('claim recovery freshness and retry boundaries', () => {
  it('transfers a newer pointer-only hold over an older canonical resume before converting', async () => {
    await run()
    expect(io.save).toHaveBeenCalledWith(expect.objectContaining({ ownerId: 'session-owner' }), expect.objectContaining({ cursor: 2, timedEntry: true, draft: expect.objectContaining({ name: 'New draft', startedAt: '2026-11-01T12:00:00Z' }), leadToken: token }), expect.any(Date), { heldSavedAt: newAt })
    expect(io.read.mock.invocationCallOrder[0]).toBeLessThan(io.save.mock.invocationCallOrder[0])
    expect(io.save.mock.invocationCallOrder[0]).toBeLessThan(io.converted.mock.invocationCallOrder[0])
    expect(io.converted).toHaveBeenCalledWith(token)
    expect(io.clear).toHaveBeenCalledOnce()
  })
  it('prefers the resume pointer over a conflicting legacy carry token', async () => {
    io.pending.mockResolvedValue({ ...hold(), answers: { spotlight: { lead: oldToken } } })
    await run()
    expect(io.read).toHaveBeenCalledWith(token)
    expect(io.read).not.toHaveBeenCalledWith(oldToken)
    expect(io.converted).toHaveBeenCalledWith(token)
    expect(io.clear).not.toHaveBeenCalled()
  })
  it.each([oldAt, '2026-11-13T09:00:00Z'])('keeps an older or equal unmatched hold recoverable (%s)', async (savedAt) => {
    io.pending.mockResolvedValue(hold(savedAt))
    await run()
    expect(io.save).not.toHaveBeenCalled()
    expect(io.converted).not.toHaveBeenCalled()
    expect(io.clear).not.toHaveBeenCalled()
  })
  it('accepts an initial resume even when starting its row is newer than the hold', async () => {
    io.start.mockResolvedValue({ id: 'new-launch', ownerId: 'session-owner', updatedAt: '2026-11-13T12:00:00Z' })
    await run()
    expect(io.save).toHaveBeenCalledOnce()
    expect(io.converted).toHaveBeenCalledWith(token)
  })
  it('retains the hold and unconverted token when the draft cannot be recovered', async () => {
    io.read.mockResolvedValue(null)
    await run()
    expect(io.save).not.toHaveBeenCalled()
    expect(io.converted).not.toHaveBeenCalled()
    expect(io.clear).not.toHaveBeenCalled()
  })
  it('retains an empty-answer hold when saving the canonical record fails', async () => {
    io.save.mockResolvedValue(null)
    await run()
    expect(io.converted).not.toHaveBeenCalled()
    expect(io.clear).not.toHaveBeenCalled()
  })
  it.each([null, 'existing-space'])('acknowledges an exact complete canonical replay with attachment %s when the token no longer reads', async (spaceId) => {
    io.start.mockResolvedValue({ id: 'launch', ownerId: 'session-owner', spaceId, updatedAt: newAt, resume: { ...resume(), draft: draft() } })
    io.read.mockResolvedValue(null)
    await run()
    expect(io.save).not.toHaveBeenCalled()
    expect(io.converted).toHaveBeenCalledWith(token)
    expect(io.clear).toHaveBeenCalledOnce()
  })
  it('does not acknowledge a same-token canonical draft when the recovered content differs', async () => {
    io.start.mockResolvedValue({ id: 'launch', ownerId: 'session-owner', updatedAt: oldAt, resume: { ...resume(), draft: draft('Older content') } })
    await run()
    expect(io.save).toHaveBeenCalledOnce()
    expect(io.save.mock.calls[0][1].draft.name).toBe('New draft')
  })
  it('never transfers an unmatched anonymous draft into an already attached Space', async () => {
    io.start.mockResolvedValue({ id: 'launch', ownerId: 'session-owner', spaceId: 'existing-space', updatedAt: oldAt, resume: canonical() })
    await run()
    expect(io.save).not.toHaveBeenCalled()
    expect(io.converted).not.toHaveBeenCalled()
    expect(io.clear).not.toHaveBeenCalled()
  })
  it('saves full legacy token-backed drafts before stopping reminders', async () => {
    io.pending.mockResolvedValue({ niche: null, intents: [], answers: { spotlight: { lead: token } }, savedAt: newAt })
    io.start.mockResolvedValue({ id: 'launch', ownerId: 'session-owner', updatedAt: newAt })
    await run()
    expect(io.save.mock.calls[0][1]).toMatchObject({ phase: 'launch', cursor: 4, draft: { name: 'New draft' }, leadToken: token })
    expect(io.save.mock.invocationCallOrder[0]).toBeLessThan(io.converted.mock.invocationCallOrder[0])
  })
})
