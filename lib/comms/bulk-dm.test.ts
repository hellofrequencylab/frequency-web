import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// The shared bulk-DM loop (lib/comms/bulk-dm) is the ONE implementation of the operator-DM blast
// the event Manage and Journey launch broadcasts both ride. These tests lock down the invariants
// the extraction must never lose: the DM_BLAST_CAP refuse-first (before any rate-limit token is
// drawn), the per-recipient block check, the email-required thread key (the spine threads by
// counterpart address), the per-recipient spine open + append on channel 'in_app', and the skip
// counting. The last test pins the SOURCE SHAPE: both call sites go through sendBulkDm and no
// longer carry a private copy of the loop.

const openOrGetConversation = vi.fn()
const appendConversationMessage = vi.fn()
vi.mock('@/lib/comms/conversations', () => ({
  openOrGetConversation: (a: unknown) => openOrGetConversation(a),
  appendConversationMessage: (a: unknown) => appendConversationMessage(a),
}))

const isBlockedBetween = vi.fn()
vi.mock('@/lib/blocking', () => ({
  isBlockedBetween: (a: string, b: string) => isBlockedBetween(a, b),
}))

const rateLimitOk = vi.fn()
vi.mock('@/lib/rate-limit', () => ({
  rateLimitOk: (...args: unknown[]) => rateLimitOk(...args),
}))

// The internal recipient resolution (profiles → auth email) is exercised only when the caller
// passes no pre-resolved map; these tests pass one, so the admin client stays inert.
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ in: async () => ({ data: [] }) }) }),
    auth: { admin: { getUserById: async () => ({ data: { user: { email: null } } }) } },
  }),
}))

import { sendBulkDm, DM_BLAST_CAP, type BulkDmRecipient } from './bulk-dm'

function recipientsMap(entries: [string, string | null][]): Map<string, BulkDmRecipient> {
  return new Map(entries.map(([id, email]) => [id, { displayName: 'Member', email }]))
}

function baseInput(overrides: Partial<Parameters<typeof sendBulkDm>[0]> = {}) {
  return {
    actorId: 'actor-1',
    recipientProfileIds: ['r1', 'r2'],
    subject: 'Hello',
    body: 'The message body.',
    spaceId: 'space-1',
    scope: { kind: 'event' as const, id: 'event-1' },
    bucket: 'event-broadcast',
    recipients: recipientsMap([
      ['r1', 'r1@example.com'],
      ['r2', 'r2@example.com'],
    ]),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  rateLimitOk.mockResolvedValue(true)
  isBlockedBetween.mockResolvedValue(false)
  openOrGetConversation.mockResolvedValue({ id: 'conv-1', ref: '1001', created: true })
  appendConversationMessage.mockResolvedValue({ id: 'msg-1' })
})

describe('sendBulkDm', () => {
  it('refuses first past the cap: nothing is sent and no rate-limit token is drawn', async () => {
    const ids = Array.from({ length: DM_BLAST_CAP + 1 }, (_, i) => `p${i}`)
    const res = await sendBulkDm(
      baseInput({ recipientProfileIds: ids, capAlternative: 'Use Email for a list this size.' }),
    )

    expect(res.sent).toBe(0)
    expect(res.detail).toBe(
      `That is too many people for Direct Messages (limit ${DM_BLAST_CAP}). Use Email for a list this size.`,
    )
    // Refuse-first: the cap fires before the buckets, so a refused blast costs no tokens.
    expect(rateLimitOk).not.toHaveBeenCalled()
    expect(openOrGetConversation).not.toHaveBeenCalled()
    expect(appendConversationMessage).not.toHaveBeenCalled()
  })

  it('skips (and counts) a blocked recipient, both directions checked per recipient', async () => {
    isBlockedBetween.mockImplementation(async (_a: string, b: string) => b === 'r1')

    const res = await sendBulkDm(baseInput())

    expect(res.sent).toBe(1)
    expect(res.skipped).toBe(1)
    expect(openOrGetConversation).toHaveBeenCalledTimes(1)
    const arg = openOrGetConversation.mock.calls[0][0] as Record<string, unknown>
    expect(arg.memberProfileId).toBe('r2')
  })

  it('skips (and counts) a recipient with no resolvable email — the spine threads by address', async () => {
    const res = await sendBulkDm(
      baseInput({ recipients: recipientsMap([['r1', null], ['r2', 'r2@example.com']]) }),
    )

    expect(res.sent).toBe(1)
    expect(res.skipped).toBe(1)
    expect(openOrGetConversation).toHaveBeenCalledTimes(1)
    const arg = openOrGetConversation.mock.calls[0][0] as Record<string, unknown>
    expect(arg.externalEmail).toBe('r2@example.com')
  })

  it('happy path: one in-app CRM thread + one message per recipient, in the given scope lane', async () => {
    const res = await sendBulkDm(baseInput({ scopeOnMirror: true }))

    expect(res.sent).toBe(2)
    expect(res.skipped).toBe(0)
    expect(res.detail).toBe('Delivered to 2 people in their Frequency inbox.')

    expect(openOrGetConversation).toHaveBeenCalledTimes(2)
    expect(appendConversationMessage).toHaveBeenCalledTimes(2)
    // The two abuse buckets, drawn once per blast: `${bucket}:dm` per hour + the shared per-minute token.
    expect(rateLimitOk).toHaveBeenCalledWith('event-broadcast:dm', 'actor-1', 10, '1 h')
    expect(rateLimitOk).toHaveBeenCalledWith('scoped-dm:msg', 'actor-1', 20, '1 m')

    for (const call of openOrGetConversation.mock.calls) {
      const arg = call[0] as Record<string, unknown>
      expect(arg.kind).toBe('crm')
      expect(arg.channel).toBe('in_app')
      expect(arg.scopeKind).toBe('event')
      expect(arg.scopeId).toBe('event-1')
    }
    for (const call of appendConversationMessage.mock.calls) {
      const arg = call[0] as Record<string, unknown>
      expect(arg.channel).toBe('in_app')
      expect(arg.direction).toBe('outbound')
      expect(arg.authorKind).toBe('leader')
    }
  })
})

describe('call sites ride the shared loop', () => {
  const files = [
    '../../app/(main)/events/[slug]/manage/broadcast-actions.ts',
    '../../app/(main)/journeys/[slug]/launch/actions.ts',
  ]

  it.each(files)('%s calls sendBulkDm and no longer defines its own DM loop', (rel) => {
    const src = readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
    expect(src).toContain('sendBulkDm')
    // The old local loop's marker: a direct spine open. Its presence means the loop grew back.
    expect(src).not.toContain('openOrGetConversation({')
  })
})
