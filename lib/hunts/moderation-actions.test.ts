import { describe, expect, it, vi } from 'vitest'
import { fileHuntReport, isModerationAction, mayModerate, moderateHunt, moderationMessage, type ModerationFacts } from './moderation-actions'

const HUNT = 'hunt-1'
const NOW = 1_800_000_000
const facts = (profileId: string | null, over: Partial<ModerationFacts> = {}): ModerationFacts => ({
  hunt: { id: HUNT, visibility: 'public', ownerProfileId: 'owner-1', ownerSpaceId: null },
  grants: [],
  partners: [],
  actor: { profileId },
  ...over,
})
const grant = (role: 'owner' | 'admin' | 'editor' | 'operator') => ({ huntId: HUNT, profileId: 'p', role, expiresAt: null, revokedAt: null })

describe('mayModerate', () => {
  it('lets the owner and an admin pause, resume and close', () => {
    for (const a of ['pause', 'resume', 'close'] as const) {
      expect(mayModerate(facts('owner-1'), a, HUNT, NOW)).toBe(true)
      expect(mayModerate(facts('p', { grants: [grant('admin')] }), a, HUNT, NOW)).toBe(true)
    }
  })
  it('refuses editors, operators, strangers and another Hunt', () => {
    expect(mayModerate(facts('p', { grants: [grant('editor')] }), 'pause', HUNT, NOW)).toBe(false)
    expect(mayModerate(facts('p', { grants: [grant('operator')] }), 'close', HUNT, NOW)).toBe(false)
    expect(mayModerate(facts('stranger'), 'pause', HUNT, NOW)).toBe(false)
    expect(mayModerate(facts('owner-1'), 'pause', 'other-hunt', NOW)).toBe(false)
  })
  it('honours the owner Space role and a revoked grant', () => {
    const spaceOwned = facts('p', { hunt: { id: HUNT, visibility: 'public', ownerProfileId: null, ownerSpaceId: 's1' }, actor: { profileId: 'p', ownerSpaceRole: 'admin' } })
    expect(mayModerate(spaceOwned, 'pause', HUNT, NOW)).toBe(true)
    const revoked = facts('p', { grants: [{ ...grant('admin'), revokedAt: new Date((NOW - 10) * 1000).toISOString() }] })
    expect(mayModerate(revoked, 'pause', HUNT, NOW)).toBe(false)
  })
})

describe('isModerationAction', () => {
  it('knows only the three moves', () => {
    expect(['pause', 'resume', 'close'].every(isModerationAction)).toBe(true)
    expect(isModerationAction('delete')).toBe(false)
  })
})

describe('the calls', () => {
  it('sends a report with a stable request hash and reads the answer', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { result: 'reported', replayed: true }, error: null })
    const input = { reporterId: 'a', huntId: HUNT, reason: 'unsafe', details: ' busy road ', idempotencyKey: 'key-12345678' }
    expect(await fileHuntReport(rpc, input)).toEqual({ result: 'reported', replayed: true })
    await fileHuntReport(rpc, { ...input, details: 'busy road' })
    expect(rpc.mock.calls[0][1].p_request_hash).toBe(rpc.mock.calls[1][1].p_request_hash)
    await fileHuntReport(rpc, { ...input, reason: 'other' })
    expect(rpc.mock.calls[2][1].p_request_hash).not.toBe(rpc.mock.calls[0][1].p_request_hash)
  })
  it('throws on a database error or an answer it does not know', async () => {
    await expect(moderateHunt(vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } }), { actorId: 'a', huntId: HUNT, action: 'pause', note: '', idempotencyKey: 'key-12345678' })).rejects.toThrow(/hunt_moderate failed/)
    await expect(moderateHunt(vi.fn().mockResolvedValue({ data: { result: 'surprise' }, error: null }), { actorId: 'a', huntId: HUNT, action: 'pause', note: '', idempotencyKey: 'key-12345678' })).rejects.toThrow(/does not know/)
  })
  it('says the same plain thing for each answer', () => {
    expect(moderationMessage('moderated', 'pause')).toContain('Paused')
    expect(moderationMessage('moderated', 'close')).toContain('Closed')
    expect(moderationMessage('already_reported')).toContain('already')
  })
})
