import { describe, it, expect } from 'vitest'
import { buildBriefContext } from './brief'
import type { TimelineEntry } from './timeline'

function entry(over: Partial<TimelineEntry>): TimelineEntry {
  return { id: 'i', channel: 'system', direction: 'internal', title: 'Followed up', detail: null, at: '2026-05-01T00:00:00.000Z', origin: 'interaction', ...over }
}

describe('buildBriefContext', () => {
  it('emits only the name line for a bare contact', () => {
    expect(buildBriefContext({ name: 'Sam' })).toBe('Name: Sam')
  })

  it('formats role as "title at company"', () => {
    expect(buildBriefContext({ name: 'Sam', title: 'Designer', company: 'Acme' })).toContain('Role: Designer at Acme')
  })

  it('emits company alone when there is no title', () => {
    expect(buildBriefContext({ name: 'Sam', company: 'Acme' })).toContain('Role: Acme')
  })

  it('includes the sections that have content and omits empty ones', () => {
    const ctx = buildBriefContext({
      name: 'Sam',
      city: 'Austin',
      tags: ['design', 'climbing'],
      notes: [{ body: 'Met at the summit', createdAt: null }],
      timeline: [entry({ title: 'Emailed', at: '2026-05-02T00:00:00.000Z' })],
      openReminders: [{ dueAt: '2026-06-01T00:00:00.000Z', note: 'send deck' }],
      lastContactedAt: '2026-05-02T00:00:00.000Z',
    })
    expect(ctx).toContain('Location: Austin')
    expect(ctx).toContain('Tags: design, climbing')
    expect(ctx).toContain('Notes:')
    expect(ctx).toContain('- Met at the summit')
    expect(ctx).toContain('Recent timeline:')
    expect(ctx).toContain('2026-05-02 Emailed')
    expect(ctx).toContain('Open follow-ups:')
    expect(ctx).toContain('due 2026-06-01: send deck')
    expect(ctx).toContain('Last contacted: 2026-05-02')
  })

  it('drops blank notes and timeline entries', () => {
    const ctx = buildBriefContext({
      name: 'Sam',
      notes: [{ body: '   ', createdAt: null }],
      timeline: [entry({ title: '   ' })],
    })
    expect(ctx).toBe('Name: Sam')
  })

  it('caps notes at 10 and timeline at 12', () => {
    const notes = Array.from({ length: 20 }, (_, n) => ({ body: `note ${n}`, createdAt: null }))
    const timeline = Array.from({ length: 20 }, (_, n) => entry({ id: `i${n}`, title: `touch ${n}` }))
    const ctx = buildBriefContext({ name: 'Sam', notes, timeline })
    expect((ctx.match(/^- note /gm) ?? []).length).toBe(10)
    expect((ctx.match(/touch \d/g) ?? []).length).toBe(12)
  })
})
