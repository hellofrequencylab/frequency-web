import { describe, it, expect } from 'vitest'
import { buildJourney, groupByPhase, phaseFor, humanizeEventType, type JourneyInput } from './journey'

function input(over: Partial<JourneyInput> = {}): JourneyInput {
  return {
    contact: { source: 'scan_invite', firstSeenAt: '2026-01-01T00:00:00Z', createdAt: '2026-01-01T00:00:00Z' },
    member: null,
    captures: [],
    scans: [],
    events: [],
    activities: [],
    deals: [],
    ...over,
  }
}

describe('phaseFor', () => {
  it('maps kinds to the funnel phases', () => {
    expect(phaseFor('captured')).toBe('arrival')
    expect(phaseFor('invited')).toBe('outreach')
    expect(phaseFor('scan')).toBe('in_app')
    expect(phaseFor('deal')).toBe('crm')
  })
})

describe('humanizeEventType', () => {
  it('turns a dotted event type into a readable label', () => {
    expect(humanizeEventType('qr.referral_signup')).toBe('Qr referral signup')
    expect(humanizeEventType('post_create')).toBe('Post create')
  })
})

describe('buildJourney', () => {
  it('always records the CRM-lead arrival', () => {
    const j = buildJourney(input())
    expect(j.map((e) => e.kind)).toContain('crm_lead')
  })

  it('records a capture + its invite, and a member join', () => {
    const j = buildJourney(
      input({
        captures: [
          { source: 'card_scan', ownerName: 'Daniel', invitedAt: '2026-01-02T00:00:00Z', createdAt: '2026-01-01T12:00:00Z' },
        ],
        member: { createdAt: '2026-02-01T00:00:00Z', referred: true },
      }),
    )
    const kinds = j.map((e) => e.kind)
    expect(kinds).toContain('captured')
    expect(kinds).toContain('invited')
    expect(kinds).toContain('joined')
    const captured = j.find((e) => e.kind === 'captured')!
    expect(captured.title).toBe('Captured by Daniel')
    expect(captured.channel).toBe('card_scan')
  })

  it('sorts newest-first', () => {
    const j = buildJourney(
      input({
        scans: [{ codeTitle: 'Poster A', scannedAt: '2026-03-01T00:00:00Z' }],
        member: { createdAt: '2026-02-01T00:00:00Z', referred: false },
      }),
    )
    const times = j.map((e) => new Date(e.at).getTime())
    expect(times).toEqual([...times].sort((a, b) => b - a))
    expect(j[0].kind).toBe('scan')
  })

  it('does not double-count a qr_scan engagement event alongside the scan row', () => {
    const j = buildJourney(
      input({
        scans: [{ codeTitle: 'Poster', scannedAt: '2026-03-01T00:00:00Z' }],
        events: [{ eventType: 'qr_scan', source: 'qr', createdAt: '2026-03-01T00:00:00Z' }],
      }),
    )
    expect(j.filter((e) => e.kind === 'scan')).toHaveLength(1)
    expect(j.filter((e) => e.kind === 'engagement')).toHaveLength(0)
  })

  it('drops events with no timestamp', () => {
    const j = buildJourney(input({ member: { createdAt: null, referred: false } }))
    expect(j.find((e) => e.kind === 'joined')).toBeUndefined()
  })
})

describe('groupByPhase', () => {
  it('groups in funnel order and omits empty phases', () => {
    const j = buildJourney(
      input({
        scans: [{ codeTitle: 'X', scannedAt: '2026-03-01T00:00:00Z' }],
        activities: [{ kind: 'note', body: 'Met at market', createdAt: '2026-03-02T00:00:00Z' }],
      }),
    )
    const groups = groupByPhase(j)
    const phases = groups.map((g) => g.phase)
    expect(phases).toEqual(['arrival', 'in_app', 'crm']) // 'outreach' omitted (no invite)
    expect(groups.every((g) => g.events.length > 0)).toBe(true)
  })
})
