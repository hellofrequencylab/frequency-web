import { describe, it, expect } from 'vitest'
import {
  assembleMessagePath,
  resolvePathRef,
  matchesScope,
  mirroredMessageId,
  labelRef,
  EMPTY_MESSAGE_PATH,
  type PathInteractionRow,
  type PathConversationRow,
  type PathMessageRow,
  type PathLabels,
} from './message-path'

// ── Fixtures ───────────────────────────────────────────────────────────────────────────────────────

function interaction(over: Partial<PathInteractionRow> = {}): PathInteractionRow {
  return {
    id: over.id ?? 'i1',
    channel: 'email',
    direction: 'outbound',
    summary: 'Emailed',
    body: null,
    metadata: null,
    source: 'engagement',
    occurredAt: '2026-07-01T10:00:00Z',
    spaceId: null,
    ...over,
  }
}

function conversation(over: Partial<PathConversationRow> = {}): PathConversationRow {
  return {
    id: over.id ?? 'c1',
    kind: 'crm',
    subject: 'Full Moon Gathering',
    channel: 'email',
    spaceId: null,
    metadata: null,
    lastActivityAt: '2026-07-02T10:00:00Z',
    ...over,
  }
}

function message(over: Partial<PathMessageRow> = {}): PathMessageRow {
  return {
    id: over.id ?? 'm1',
    conversationId: over.conversationId ?? 'c1',
    direction: 'outbound',
    authorKind: 'staff',
    authorName: 'Ana',
    body: 'See you there.',
    channel: 'email',
    isInternal: false,
    occurredAt: '2026-07-02T10:00:00Z',
    ...over,
  }
}

const LABELS: PathLabels = {
  'event:ev1': { label: 'Meld', href: '/events/meld' },
  'campaign:ca1': { label: 'Hello from Frequency' },
}

// ── resolvePathRef: scope convention first, legacy metadata second ─────────────────────────────────

describe('resolvePathRef', () => {
  it('prefers the new scope columns over legacy metadata', () => {
    expect(
      resolvePathRef({ scopeKind: 'event', scopeId: 'ev-scope', metadata: { event_id: 'ev-legacy' } }),
    ).toEqual({ kind: 'event', id: 'ev-scope' })
  })

  it('ignores an out-of-vocabulary or half-set scope pair and falls back to metadata', () => {
    expect(resolvePathRef({ scopeKind: 'galaxy', scopeId: 'x', metadata: { event_id: 'ev1' } })).toEqual({
      kind: 'event',
      id: 'ev1',
    })
    expect(resolvePathRef({ scopeKind: 'event', scopeId: null, metadata: { event_id: 'ev1' } })).toEqual({
      kind: 'event',
      id: 'ev1',
    })
  })

  it('resolves the legacy metadata conventions', () => {
    expect(resolvePathRef({ metadata: { kind: 'event_reminder', event_id: 'ev1' } })).toEqual({ kind: 'event', id: 'ev1' })
    expect(resolvePathRef({ metadata: { campaign_id: 'ca1' } })).toEqual({ kind: 'campaign', id: 'ca1' })
    expect(resolvePathRef({ metadata: { broadcast_id: 'd1' } })).toEqual({ kind: 'dispatch', id: 'd1' })
    expect(resolvePathRef({ metadata: { kind: 'booking', bookingId: 'b1' } })).toEqual({ kind: 'booking', id: 'b1' })
    expect(resolvePathRef({ metadata: { kind: 'membership_promote', tierId: 't1' } })).toEqual({ kind: 'membership', id: 't1' })
    expect(resolvePathRef({ metadata: { kind: 'ticket_rsvp', tierId: 't2' } })).toEqual({ kind: 'ticket', id: 't2' })
  })

  it('returns null when nothing resolves', () => {
    expect(resolvePathRef({ metadata: { kind: 'dm', messageId: 'x' } })).toBeNull()
    expect(resolvePathRef({ metadata: null })).toBeNull()
    expect(resolvePathRef({})).toBeNull()
  })
})

describe('labelRef + mirroredMessageId', () => {
  it('labels a ref from the batch map and falls back to a plain kind name', () => {
    expect(labelRef({ kind: 'event', id: 'ev1' }, LABELS)).toEqual({ kind: 'event', id: 'ev1', label: 'Meld', href: '/events/meld' })
    expect(labelRef({ kind: 'event', id: 'unknown' }, LABELS)).toEqual({ kind: 'event', id: 'unknown', label: 'Event', href: undefined })
  })

  it('extracts the mirrored message id from the conv-msg key only', () => {
    expect(mirroredMessageId('conv-msg:abc')).toBe('abc')
    expect(mirroredMessageId('campaign:x:y')).toBeNull()
    expect(mirroredMessageId(null)).toBeNull()
  })
})

// ── Scope matching (the altitude filter) ───────────────────────────────────────────────────────────

describe('matchesScope', () => {
  it('platform sees every lane', () => {
    expect(matchesScope(null, null, { kind: 'platform' })).toBe(true)
    expect(matchesScope({ kind: 'event', id: 'x' }, 'sp1', { kind: 'platform' })).toBe(true)
  })

  it('space requires the space stamp', () => {
    expect(matchesScope(null, 'sp1', { kind: 'space', id: 'sp1' })).toBe(true)
    expect(matchesScope(null, 'sp2', { kind: 'space', id: 'sp1' })).toBe(false)
    expect(matchesScope(null, null, { kind: 'space', id: 'sp1' })).toBe(false)
  })

  it('the leader lanes are scope-eq and fail closed on unresolvable refs', () => {
    expect(matchesScope({ kind: 'event', id: 'ev1' }, null, { kind: 'event', id: 'ev1' })).toBe(true)
    expect(matchesScope({ kind: 'event', id: 'ev2' }, null, { kind: 'event', id: 'ev1' })).toBe(false)
    expect(matchesScope(null, null, { kind: 'event', id: 'ev1' })).toBe(false)
    expect(matchesScope({ kind: 'circle', id: 'ci1' }, null, { kind: 'circle', id: 'ci1' })).toBe(true)
    expect(matchesScope({ kind: 'hub', id: 'h1' }, null, { kind: 'hub', id: 'h1' })).toBe(true)
    expect(matchesScope({ kind: 'event', id: 'ev1' }, null, { kind: 'hub', id: 'h1' })).toBe(false)
    expect(matchesScope(null, 'sp1', { kind: 'nexus', id: 'n1' })).toBe(false)
  })
})

// ── Thread grouping ────────────────────────────────────────────────────────────────────────────────

describe('assembleMessagePath grouping', () => {
  it('threads a conversation with its messages chronologically and dedupes the conv-msg mirrors', () => {
    const path = assembleMessagePath({
      conversations: [conversation({ id: 'c1', metadata: { event_id: 'ev1' } })],
      messages: [
        message({ id: 'm2', occurredAt: '2026-07-02T10:00:00Z' }),
        message({ id: 'm1', occurredAt: '2026-07-01T09:00:00Z', direction: 'inbound', authorKind: 'member', authorName: null, body: 'Can I bring a friend?' }),
      ],
      interactions: [
        // The mirror of m2: already inside the loaded thread, so it must not double-render.
        interaction({ id: 'i-mirror', idempotencyKey: 'conv-msg:m2' }),
        // A mirror of a message whose thread was NOT loaded: kept as a solo entry.
        interaction({ id: 'i-orphan', idempotencyKey: 'conv-msg:elsewhere', summary: 'Emailed', occurredAt: '2026-06-01T10:00:00Z' }),
      ],
      labels: LABELS,
      scope: { kind: 'platform' },
      audience: 'staff',
      memberName: 'Ravi',
    })

    expect(path.threads).toHaveLength(2)
    const conv = path.threads[0]
    expect(conv.key).toBe('conv:c1')
    expect(conv.count).toBe(2)
    expect(conv.entries.map((e) => e.id)).toEqual(['msg:m1', 'msg:m2']) // oldest first inside the thread
    expect(conv.entries[0].sender).toBe('Ravi') // inbound reads as the member
    expect(conv.entries[1].sender).toBe('Ana')
    expect(conv.ref).toEqual({ kind: 'event', id: 'ev1', label: 'Meld', href: '/events/meld' })
    expect(path.threads[1].key).toBe('int:i-orphan')
    expect(path.totalEntries).toBe(3)
  })

  it('collapses a campaign send and its opens into one thread named by the campaign', () => {
    const path = assembleMessagePath({
      conversations: [],
      messages: [],
      interactions: [
        interaction({ id: 'i1', metadata: { campaign_id: 'ca1' }, summary: 'Hello from Frequency', occurredAt: '2026-07-01T10:00:00Z' }),
        interaction({ id: 'i2', metadata: { campaign_id: 'ca1' }, summary: 'Email opened', source: 'resend', occurredAt: '2026-07-01T11:00:00Z' }),
        interaction({ id: 'i3', summary: 'Texted', channel: 'sms', occurredAt: '2026-07-03T10:00:00Z' }),
      ],
      labels: LABELS,
      scope: { kind: 'platform' },
      audience: 'staff',
    })

    expect(path.threads.map((t) => t.key)).toEqual(['int:i3', 'campaign:ca1'])
    const campaign = path.threads[1]
    expect(campaign.subject).toBe('Hello from Frequency')
    expect(campaign.count).toBe(2)
    expect(campaign.entries.map((e) => e.id)).toEqual(['int:i1', 'int:i2'])
    expect(campaign.ref?.label).toBe('Hello from Frequency')
  })

  it('sorts threads newest first and reports the latest touch for the collapsed line', () => {
    const path = assembleMessagePath({
      conversations: [conversation({ id: 'c1' })],
      messages: [message({ id: 'm1', occurredAt: '2026-07-05T10:00:00Z' })],
      interactions: [interaction({ id: 'i1', occurredAt: '2026-07-01T10:00:00Z' })],
      scope: { kind: 'platform' },
      audience: 'staff',
    })
    expect(path.threads[0].key).toBe('conv:c1')
    expect(path.latest?.id).toBe('msg:m1')
  })

  it('drops a conversation whose messages did not load instead of showing an empty thread', () => {
    const path = assembleMessagePath({
      conversations: [conversation({ id: 'c-empty' })],
      messages: [],
      interactions: [],
      scope: { kind: 'platform' },
      audience: 'staff',
    })
    expect(path).toEqual(EMPTY_MESSAGE_PATH)
  })
})

// ── Altitude: scope filtering + leader trimming ────────────────────────────────────────────────────

describe('assembleMessagePath altitude', () => {
  const mixed = {
    conversations: [
      conversation({ id: 'c-ev', scopeKind: 'event', scopeId: 'ev1', subject: 'Re: Meld' }),
      conversation({ id: 'c-other', metadata: { event_id: 'ev-other' } }),
      conversation({ id: 'c-none', subject: 'Unrelated' }),
    ],
    messages: [
      message({ id: 'm-ev', conversationId: 'c-ev' }),
      message({ id: 'm-other', conversationId: 'c-other' }),
      message({ id: 'm-none', conversationId: 'c-none' }),
    ],
    interactions: [
      interaction({ id: 'i-ev-scope', scopeKind: 'event', scopeId: 'ev1', summary: 'RSVP confirmation sent' }),
      interaction({ id: 'i-ev-legacy', metadata: { kind: 'event_reminder', event_id: 'ev1' }, summary: 'Reminder sent' }),
      interaction({ id: 'i-elsewhere', metadata: { event_id: 'ev-other' } }),
      interaction({ id: 'i-unresolvable', summary: 'Emailed' }),
    ],
  }

  it('an event lane keeps only entries that resolve to that event (scope first, legacy second)', () => {
    const path = assembleMessagePath({ ...mixed, scope: { kind: 'event', id: 'ev1' }, audience: 'leader' })
    expect(path.threads.map((t) => t.key).sort()).toEqual(['conv:c-ev', 'int:i-ev-legacy', 'int:i-ev-scope'])
  })

  it('the platform lane sees everything', () => {
    const path = assembleMessagePath({ ...mixed, scope: { kind: 'platform' }, audience: 'staff' })
    expect(path.threads).toHaveLength(7)
  })

  it('a space lane requires the space stamp on interactions', () => {
    const path = assembleMessagePath({
      conversations: [],
      messages: [],
      interactions: [
        interaction({ id: 'i-here', spaceId: 'sp1' }),
        interaction({ id: 'i-elsewhere', spaceId: 'sp2' }),
        interaction({ id: 'i-platform', spaceId: null }),
      ],
      scope: { kind: 'space', id: 'sp1' },
      audience: 'staff',
    })
    expect(path.threads.map((t) => t.key)).toEqual(['int:i-here'])
  })

  it('hub and nexus lanes are scope-eq too: nothing without a matching stamp, only the stamped rows with one', () => {
    expect(assembleMessagePath({ ...mixed, scope: { kind: 'hub', id: 'h1' }, audience: 'leader' })).toEqual(EMPTY_MESSAGE_PATH)
    expect(assembleMessagePath({ ...mixed, scope: { kind: 'nexus', id: 'n1' }, audience: 'leader' })).toEqual(EMPTY_MESSAGE_PATH)
    const path = assembleMessagePath({
      conversations: [],
      messages: [],
      interactions: [
        interaction({ id: 'i-hub', scopeKind: 'hub', scopeId: 'h1', summary: 'Downline update sent' }),
        interaction({ id: 'i-other' }),
      ],
      scope: { kind: 'hub', id: 'h1' },
      audience: 'leader',
    })
    expect(path.threads.map((t) => t.key)).toEqual(['int:i-hub'])
  })

  it('a leader never sees internal messages, notes, or staff-logged manual touches', () => {
    const input = {
      conversations: [conversation({ id: 'c-ev', scopeKind: 'event', scopeId: 'ev1' })],
      messages: [
        message({ id: 'm-pub', conversationId: 'c-ev' }),
        message({ id: 'm-int', conversationId: 'c-ev', isInternal: true, body: 'Steward note about pricing' }),
      ],
      interactions: [
        interaction({ id: 'i-note', channel: 'note' as const, scopeKind: 'event', scopeId: 'ev1' }),
        interaction({ id: 'i-manual', source: 'manual', scopeKind: 'event', scopeId: 'ev1' }),
        interaction({ id: 'i-ok', scopeKind: 'event', scopeId: 'ev1' }),
      ],
    }
    const leader = assembleMessagePath({ ...input, scope: { kind: 'event', id: 'ev1' }, audience: 'leader' })
    expect(leader.threads.map((t) => t.key).sort()).toEqual(['conv:c-ev', 'int:i-ok'])
    expect(leader.threads.find((t) => t.key === 'conv:c-ev')?.count).toBe(1)

    const staff = assembleMessagePath({ ...input, scope: { kind: 'platform' }, audience: 'staff' })
    expect(staff.threads.find((t) => t.key === 'conv:c-ev')?.count).toBe(2)
    expect(staff.threads.map((t) => t.key)).toContain('int:i-note')
  })
})
