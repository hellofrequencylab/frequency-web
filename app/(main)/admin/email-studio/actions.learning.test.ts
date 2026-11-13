import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ writer: vi.fn(), approver: vi.fn(), analyze: vi.fn(), apply: vi.fn(), admin: vi.fn(), audit: vi.fn() }))
vi.mock('@/lib/outbound/guard', () => ({ writerGate: mocks.writer, approverGate: mocks.approver }))
vi.mock('@/lib/admin/guard', () => ({ requireAdmin: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getCachedUser: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.admin }))
vi.mock('@/lib/admin/audit', () => ({ logAdminAction: mocks.audit }))
vi.mock('@/lib/email-studio/campaign-learning', () => ({ analyzeCampaignLearning: mocks.analyze, applyCampaignLearningRevision: mocks.apply }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/email', () => ({ sendRawEmail: vi.fn() }))
vi.mock('@/lib/site', () => ({ SITE_URL: 'https://frequencylocal.com' }))

import { analyzeCampaignLearningAction, applyCampaignLearningRevisionAction } from './actions'

const source = '10047b53-4cf4-4262-92d9-1d8711615332'
const target = '85ca4b8c-1cee-46d5-a092-499f54e8600e'
const input = { sourceCampaignId: source, targetCampaignId: target, strategy: 'personal_preview' as const, expectedFingerprint: 'a'.repeat(64), expectedProposalFingerprint: 'b'.repeat(64), reviewed: true as const }
beforeEach(() => {
  vi.clearAllMocks()
  mocks.writer.mockResolvedValue({ ok: true, profileId: 'operator' })
  mocks.approver.mockResolvedValue({ ok: true, profileId: 'operator' })
  mocks.admin.mockReturnValue({})
  mocks.analyze.mockResolvedValue({ ok: true, review: {} })
  mocks.apply.mockResolvedValue({ ok: true, campaignId: target })
})

describe('campaign learning action authorization', () => {
  it('does not read campaign evidence when the writer gate refuses', async () => {
    mocks.writer.mockResolvedValue({ ok: false, error: 'Denied' })
    expect(await analyzeCampaignLearningAction(source, target, 'personal_preview')).toEqual({ ok: false, error: 'Denied' })
    expect(mocks.admin).not.toHaveBeenCalled()
    expect(mocks.analyze).not.toHaveBeenCalled()
  })
  it('requires approver access before a revision can disarm a schedule', async () => {
    mocks.approver.mockResolvedValue({ ok: false, error: 'Denied' })
    expect(await applyCampaignLearningRevisionAction(input)).toEqual({ ok: false, error: 'Denied' })
    expect(mocks.apply).not.toHaveBeenCalled()
  })
  it('rejects malformed source IDs and unsupported strategies', async () => {
    expect((await analyzeCampaignLearningAction('bad', target, 'personal_preview')).ok).toBe(false)
    expect((await analyzeCampaignLearningAction(source, target, 'automatic_send' as never)).ok).toBe(false)
    expect(mocks.analyze).not.toHaveBeenCalled()
  })
  it('requires an explicit review acknowledgement and revision fingerprints', async () => {
    expect((await applyCampaignLearningRevisionAction({ ...input, reviewed: false } as never)).ok).toBe(false)
    expect((await applyCampaignLearningRevisionAction({ ...input, expectedFingerprint: '' })).ok).toBe(false)
    expect(mocks.apply).not.toHaveBeenCalled()
  })
  it('passes authenticated actor and fixed site configuration, never client credentials', async () => {
    await analyzeCampaignLearningAction(source, target, 'personal_preview')
    expect(mocks.analyze).toHaveBeenCalledWith({}, source, target, 'personal_preview', { callerProfileId: 'operator', siteUrl: 'https://frequencylocal.com' })
  })
  it('records successful revision provenance without sending or scheduling', async () => {
    expect(await applyCampaignLearningRevisionAction(input)).toMatchObject({ ok: true, campaignId: target })
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ actorId: 'operator', action: 'email.campaign.learning_revision', targetId: target }))
  })
  it('does not audit a refused or stale revision as successful', async () => {
    mocks.apply.mockResolvedValue({ ok: false, error: 'Changed since review' })
    expect((await applyCampaignLearningRevisionAction(input)).ok).toBe(false)
    expect(mocks.audit).not.toHaveBeenCalled()
  })
})
