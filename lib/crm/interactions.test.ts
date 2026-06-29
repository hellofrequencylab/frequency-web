import { describe, it, expect } from 'vitest'
import { buildInteractionInsert, type RecordInteractionInput } from './interactions'

const base: RecordInteractionInput = {
  ownerProfileId: 'owner-1',
  subjectKind: 'contact',
  subjectId: 'contact-1',
  channel: 'email',
}

describe('buildInteractionInsert — validity', () => {
  it('builds a clean row from a minimal valid input', () => {
    const row = buildInteractionInsert(base)
    expect(row).not.toBeNull()
    expect(row!.owner_profile_id).toBe('owner-1')
    expect(row!.subject_kind).toBe('contact')
    expect(row!.subject_id).toBe('contact-1')
    expect(row!.channel).toBe('email')
    expect(row!.direction).toBe('internal') // safe default
    expect(row!.source).toBe('manual') // safe default
    expect(row!.space_id).toBeNull()
    expect(row!.idempotency_key).toBeNull()
    expect(typeof row!.occurred_at).toBe('string')
  })

  it('returns null when the owner is missing', () => {
    expect(buildInteractionInsert({ ...base, ownerProfileId: '  ' })).toBeNull()
  })

  it('returns null when the subject id is missing', () => {
    expect(buildInteractionInsert({ ...base, subjectId: '' })).toBeNull()
  })

  it('returns null for an unknown channel', () => {
    expect(buildInteractionInsert({ ...base, channel: 'carrier-pigeon' as never })).toBeNull()
  })

  it('returns null for an unknown subject kind', () => {
    expect(buildInteractionInsert({ ...base, subjectKind: 'lead' as never })).toBeNull()
  })
})

describe('buildInteractionInsert — normalization (fail-closed)', () => {
  it('falls back to safe defaults for an unknown direction and source', () => {
    const row = buildInteractionInsert({ ...base, direction: 'sideways' as never, source: 'rogue' as never })
    expect(row!.direction).toBe('internal')
    expect(row!.source).toBe('manual')
  })

  it('keeps a valid direction and source', () => {
    const row = buildInteractionInsert({ ...base, direction: 'outbound', source: 'resend' })
    expect(row!.direction).toBe('outbound')
    expect(row!.source).toBe('resend')
  })

  it('collapses a summary to one trimmed line and caps its length', () => {
    const row = buildInteractionInsert({ ...base, summary: '  hello\n\n  world  ' })
    expect(row!.summary).toBe('hello world')
    const long = buildInteractionInsert({ ...base, summary: 'x'.repeat(500) })
    expect(long!.summary!.length).toBe(280)
  })

  it('treats a blank body/summary as null', () => {
    const row = buildInteractionInsert({ ...base, summary: '   ', body: '' })
    expect(row!.summary).toBeNull()
    expect(row!.body).toBeNull()
  })

  it('coerces a non-object metadata to an empty object', () => {
    const row = buildInteractionInsert({ ...base, metadata: ['nope'] as never })
    expect(row!.metadata).toEqual({})
  })

  it('normalizes a valid occurredAt to an ISO string and ignores garbage', () => {
    const row = buildInteractionInsert({ ...base, occurredAt: '2026-01-02T03:04:05Z' })
    expect(row!.occurred_at).toBe('2026-01-02T03:04:05.000Z')
    const bad = buildInteractionInsert({ ...base, occurredAt: 'not-a-date' })
    expect(Number.isNaN(Date.parse(bad!.occurred_at))).toBe(false) // fell back to now()
  })

  it('keeps a non-empty idempotency key and the Space scope', () => {
    const row = buildInteractionInsert({ ...base, idempotencyKey: 'resend:msg-1:opened' }, 'space-1')
    expect(row!.idempotency_key).toBe('resend:msg-1:opened')
    expect(row!.space_id).toBe('space-1')
  })
})
