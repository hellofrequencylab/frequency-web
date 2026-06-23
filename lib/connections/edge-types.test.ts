import { describe, it, expect } from 'vitest'
import { resolveConnectProvenance, isConnectionEdgeType } from './edge-types'

describe('isConnectionEdgeType', () => {
  it('accepts the four known edge types and rejects others', () => {
    expect(isConnectionEdgeType('opt_in_connect')).toBe(true)
    expect(isConnectionEdgeType('met_at_event')).toBe(true)
    expect(isConnectionEdgeType('referral')).toBe(false) // referral is a CRM-axis signal, not here
    expect(isConnectionEdgeType(null)).toBe(false)
  })
})

describe('resolveConnectProvenance', () => {
  it('defaults to a plain opt-in connect with no provenance', () => {
    expect(resolveConnectProvenance()).toEqual({ edge_type: 'opt_in_connect', event_id: null, circle_id: null })
    expect(resolveConnectProvenance({})).toEqual({ edge_type: 'opt_in_connect', event_id: null, circle_id: null })
  })

  it('stamps event provenance for a met_at_event connect', () => {
    expect(resolveConnectProvenance({ edgeType: 'met_at_event', eventId: 'e1' })).toEqual({
      edge_type: 'met_at_event',
      event_id: 'e1',
      circle_id: null,
    })
  })

  it('stamps circle provenance for a shared_circle connect', () => {
    expect(resolveConnectProvenance({ edgeType: 'shared_circle', circleId: 'c1' })).toEqual({
      edge_type: 'shared_circle',
      event_id: null,
      circle_id: 'c1',
    })
  })

  it('falls back to opt_in_connect when the claimed provenance is missing its id', () => {
    expect(resolveConnectProvenance({ edgeType: 'met_at_event' }).edge_type).toBe('opt_in_connect')
    expect(resolveConnectProvenance({ edgeType: 'shared_circle', circleId: '  ' }).edge_type).toBe('opt_in_connect')
  })

  it('ignores an unknown edge type', () => {
    expect(resolveConnectProvenance({ edgeType: 'telepathy' }).edge_type).toBe('opt_in_connect')
  })

  it('never keeps a mismatched FK (event id on a circle connect is dropped)', () => {
    const r = resolveConnectProvenance({ edgeType: 'shared_circle', circleId: 'c1', eventId: 'e1' })
    expect(r).toEqual({ edge_type: 'shared_circle', event_id: null, circle_id: 'c1' })
  })
})
