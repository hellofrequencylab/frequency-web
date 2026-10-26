import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ profile: vi.fn(), discard: vi.fn(), revalidate: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getMyProfileId: mocks.profile }))
vi.mock('@/lib/studio/draft-store', () => ({ discardStagedDraft: mocks.discard }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }))
vi.mock('@/lib/ai/vera/create-entity', () => ({ confirmProposalWithRegisteredCommit: vi.fn(), dismissCreateProposal: vi.fn() }))
vi.mock('@/app/(main)/events/scan/actions', () => ({ deleteDraft: vi.fn() }))

import { binUnfinishedDraftAction } from './actions'

beforeEach(() => {
  vi.resetAllMocks()
  mocks.profile.mockResolvedValue('session-owner')
})

describe('bin unfinished wizard draft', () => {
  it('keeps a failed deletion visible as a failure rather than confirming it', async () => {
    mocks.discard.mockResolvedValue(false)
    expect(await binUnfinishedDraftAction('journeys-new.new-journey')).toBe(false)
    expect(mocks.discard).toHaveBeenCalledWith('session-owner', 'journeys-new.new-journey')
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })

  it('refreshes the list only after confirmed deletion', async () => {
    mocks.discard.mockResolvedValue(true)
    expect(await binUnfinishedDraftAction('journeys-new.new-journey')).toBe(true)
    expect(mocks.revalidate).toHaveBeenCalledWith('/drafts')
  })

  it('cannot delete anything without a signed-in owner', async () => {
    mocks.profile.mockResolvedValue(null)
    expect(await binUnfinishedDraftAction('journeys-new.new-journey')).toBe(false)
    expect(mocks.discard).not.toHaveBeenCalled()
  })
})
