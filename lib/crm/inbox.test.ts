import { describe, it, expect } from 'vitest'
import { groupIntoThreads, parseInboundEmailPayload, type ContactIdentity } from './inbox'
import type { ContactInteraction } from './interactions'

function interaction(over: Partial<ContactInteraction> = {}): ContactInteraction {
  return {
    id: over.id ?? 'i1',
    ownerProfileId: over.ownerProfileId ?? 'owner',
    subjectKind: over.subjectKind ?? 'contact',
    subjectId: over.subjectId ?? 'c1',
    spaceId: over.spaceId ?? null,
    channel: over.channel ?? 'email',
    direction: over.direction ?? 'outbound',
    summary: 'summary' in over ? (over.summary ?? null) : 'Emailed',
    body: 'body' in over ? (over.body ?? null) : null,
    metadata: over.metadata ?? {},
    source: over.source ?? 'manual',
    occurredAt: over.occurredAt ?? '2026-07-10T00:00:00.000Z',
    createdAt: over.createdAt ?? '2026-07-10T00:00:00.000Z',
  }
}

const IDENTITIES = new Map<string, ContactIdentity>([
  ['c1', { name: 'Ada', email: 'ada@example.com' }],
  ['c2', { name: 'Ben', email: 'ben@example.com' }],
])

describe('groupIntoThreads', () => {
  it('groups conversational rows by contact, newest first, and sorts threads by latest message', () => {
    const rows = [
      interaction({ id: 'a', subjectId: 'c1', occurredAt: '2026-07-10T00:00:00.000Z', direction: 'outbound' }),
      interaction({ id: 'b', subjectId: 'c1', occurredAt: '2026-07-12T00:00:00.000Z', direction: 'inbound' }),
      interaction({ id: 'c', subjectId: 'c2', occurredAt: '2026-07-11T00:00:00.000Z', direction: 'outbound' }),
    ]
    const threads = groupIntoThreads(rows, IDENTITIES)
    expect(threads.map((t) => t.contactId)).toEqual(['c1', 'c2']) // c1 has the newest message (07-12)
    expect(threads[0].messages.map((m) => m.id)).toEqual(['b', 'a']) // newest first within a thread
    expect(threads[0].contactName).toBe('Ada')
    expect(threads[0].count).toBe(2)
    expect(threads[0].awaitingReply).toBe(true) // latest is inbound
    expect(threads[1].awaitingReply).toBe(false)
  })

  it('drops non-conversational channels and non-contact subjects', () => {
    const rows = [
      interaction({ id: 'note', subjectId: 'c1', channel: 'note' }),
      interaction({ id: 'sys', subjectId: 'c1', channel: 'system' }),
      interaction({ id: 'profile', subjectKind: 'profile', subjectId: 'p1', channel: 'email' }),
      interaction({ id: 'keep', subjectId: 'c1', channel: 'sms' }),
    ]
    const threads = groupIntoThreads(rows, IDENTITIES)
    expect(threads).toHaveLength(1)
    expect(threads[0].messages.map((m) => m.id)).toEqual(['keep'])
  })

  it('falls back a channel verb when a message has no summary, and nulls unknown identities', () => {
    const rows = [interaction({ id: 'x', subjectId: 'c9', summary: null, direction: 'inbound', channel: 'email' })]
    const threads = groupIntoThreads(rows, IDENTITIES)
    expect(threads[0].messages[0].title).toBe('Email received')
    expect(threads[0].contactName).toBeNull()
    expect(threads[0].contactEmail).toBeNull()
  })

  it('returns [] for empty input', () => {
    expect(groupIntoThreads([], IDENTITIES)).toEqual([])
  })
})

describe('parseInboundEmailPayload', () => {
  it('reads a Resend-style { data: { from, subject, text } } payload', () => {
    const parsed = parseInboundEmailPayload({
      type: 'email.inbound',
      data: { from: 'Ada Lovelace <ADA@Example.com>', subject: '  Re: hello  ', text: '  hi there  ' },
    })
    expect(parsed).toEqual({ from: 'ada@example.com', subject: 'Re: hello', text: 'hi there' })
  })

  it('reads a from object { address } and a flat payload', () => {
    expect(parseInboundEmailPayload({ from: { address: 'x@y.com' } })).toMatchObject({ from: 'x@y.com' })
  })

  it('falls back to html when there is no text, and nulls a blank subject', () => {
    const parsed = parseInboundEmailPayload({ data: { from: 'a@b.com', html: '<p>body</p>', subject: '   ' } })
    expect(parsed?.text).toBe('<p>body</p>')
    expect(parsed?.subject).toBeNull()
  })

  it('returns null without a usable from-address', () => {
    expect(parseInboundEmailPayload({ data: { subject: 'x' } })).toBeNull()
    expect(parseInboundEmailPayload({ data: { from: 'not-an-email' } })).toBeNull()
    expect(parseInboundEmailPayload(null)).toBeNull()
    expect(parseInboundEmailPayload('nope')).toBeNull()
  })
})
