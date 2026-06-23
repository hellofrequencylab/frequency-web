import { describe, it, expect } from 'vitest'
import { buildTimeline, interactionTitle, type TimelineEntry } from './timeline'
import type { ContactInteraction } from './interactions'

function interaction(over: Partial<ContactInteraction>): ContactInteraction {
  return {
    id: 'i1',
    ownerProfileId: 'owner',
    subjectKind: 'contact',
    subjectId: 'c1',
    spaceId: null,
    channel: 'email',
    direction: 'outbound',
    summary: null,
    body: null,
    metadata: {},
    source: 'manual',
    occurredAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

describe('interactionTitle', () => {
  it('maps channel + direction to a plain verb', () => {
    expect(interactionTitle('email', 'outbound')).toBe('Emailed')
    expect(interactionTitle('email', 'inbound')).toBe('Email received')
    expect(interactionTitle('sms', 'outbound')).toBe('Texted')
    expect(interactionTitle('in_person', 'inbound')).toBe('Met in person')
    expect(interactionTitle('note', 'internal')).toBe('Note')
  })
})

describe('buildTimeline', () => {
  it('returns [] for empty input', () => {
    expect(buildTimeline({ interactions: [] })).toEqual([])
  })

  it('uses the summary as the title when present, else the default verb', () => {
    const out = buildTimeline({
      interactions: [interaction({ id: 'a', summary: 'Sent the intro deck' }), interaction({ id: 'b', summary: null })],
    })
    const byId = Object.fromEntries(out.map((e) => [e.id, e]))
    expect(byId['interaction:a'].title).toBe('Sent the intro deck')
    expect(byId['interaction:b'].title).toBe('Emailed')
  })

  it('folds in legacy notes and scans, dropping blank notes', () => {
    const out = buildTimeline({
      interactions: [interaction({ id: 'a' })],
      notes: [
        { id: 'n1', body: 'Coffee next week', createdAt: '2026-01-02T00:00:00.000Z' },
        { id: 'n2', body: '   ', createdAt: '2026-01-03T00:00:00.000Z' },
      ],
      scans: [{ id: 's1', codeTitle: 'Summit booth', scannedAt: '2026-01-04T00:00:00.000Z' }],
    })
    const ids = out.map((e) => e.id)
    expect(ids).toContain('interaction:a')
    expect(ids).toContain('note:n1')
    expect(ids).toContain('scan:s1')
    expect(ids).not.toContain('note:n2') // blank note dropped
    expect(out.find((e) => e.id === 'scan:s1')!.title).toBe('Met via Summit booth')
  })

  it('sorts newest first', () => {
    const out = buildTimeline({
      interactions: [
        interaction({ id: 'old', occurredAt: '2026-01-01T00:00:00.000Z' }),
        interaction({ id: 'new', occurredAt: '2026-06-01T00:00:00.000Z' }),
      ],
    })
    expect(out.map((e) => e.id)).toEqual(['interaction:new', 'interaction:old'])
  })

  it('caps the result length', () => {
    const many: ContactInteraction[] = Array.from({ length: 10 }, (_, n) =>
      interaction({ id: `i${n}`, occurredAt: `2026-01-${String(n + 1).padStart(2, '0')}T00:00:00.000Z` }),
    )
    expect(buildTimeline({ interactions: many }, 3)).toHaveLength(3)
  })

  it('carries the body into detail', () => {
    const out = buildTimeline({ interactions: [interaction({ id: 'a', body: '  full notes  ' })] })
    const entry = out[0] as TimelineEntry
    expect(entry.detail).toBe('full notes')
  })
})
