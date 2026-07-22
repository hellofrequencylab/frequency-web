import { describe, it, expect } from 'vitest'
import { collaboratorCalendarSources } from './collaborator-calendar'

describe('collaboratorCalendarSources (shared calendar: own space first, accepted partners, deduped)', () => {
  const partner = (id: string, name: string) => ({ partner: { id, name } })

  it('puts this space first (isOwn), then each accepted collaborator', () => {
    const out = collaboratorCalendarSources('self', 'My Space', [partner('a', 'Alpha'), partner('b', 'Beta')])
    expect(out).toEqual([
      { id: 'self', name: 'My Space', isOwn: true },
      { id: 'a', name: 'Alpha', isOwn: false },
      { id: 'b', name: 'Beta', isOwn: false },
    ])
  })

  it('dedupes a partner id, keeping the first occurrence (own wins over a self-collision)', () => {
    const out = collaboratorCalendarSources('self', 'My Space', [partner('self', 'Echo'), partner('a', 'Alpha'), partner('a', 'Alpha 2')])
    expect(out.map((s) => s.id)).toEqual(['self', 'a'])
    expect(out[0]).toEqual({ id: 'self', name: 'My Space', isOwn: true }) // own name kept, not 'Echo'
    expect(out[1]).toEqual({ id: 'a', name: 'Alpha', isOwn: false })
  })

  it('is just this space when there are no accepted collaborators', () => {
    expect(collaboratorCalendarSources('self', 'My Space', [])).toEqual([{ id: 'self', name: 'My Space', isOwn: true }])
  })

  it('skips a source with an empty id', () => {
    const out = collaboratorCalendarSources('self', 'My Space', [partner('', 'Ghost'), partner('a', 'Alpha')])
    expect(out.map((s) => s.id)).toEqual(['self', 'a'])
  })
})
