import { describe, it, expect } from 'vitest'
import {
  applyTouchFilters,
  normalizeOutreachStatus,
  normalizeDispatchStatus,
  type RecipientTouch,
} from './control-panel'

// The pure slice of the messaging control panel (CRM Phase 5): status normalization + the in-memory
// filter (by campaign/dispatch ref, by person, by status). Network-free.

function touch(over: Partial<RecipientTouch>): RecipientTouch {
  return {
    id: 'x',
    source: 'campaign',
    channel: 'email',
    recipient: 'a@x.com',
    status: 'sent',
    reason: null,
    refId: 'camp-1',
    refLabel: 'Spring update',
    at: '2026-07-14T00:00:00.000Z',
    ...over,
  }
}

describe('normalizeOutreachStatus', () => {
  it('maps raw send statuses onto the unified vocabulary', () => {
    expect(normalizeOutreachStatus('delivered')).toBe('delivered')
    expect(normalizeOutreachStatus('bounced')).toBe('bounced')
    expect(normalizeOutreachStatus('error')).toBe('failed')
    expect(normalizeOutreachStatus('queued')).toBe('queued')
    expect(normalizeOutreachStatus('sent')).toBe('sent')
    expect(normalizeOutreachStatus('whatever')).toBe('sent')
  })
})

describe('normalizeDispatchStatus', () => {
  it('maps the send-gate outcomes', () => {
    expect(normalizeDispatchStatus('suppressed')).toBe('suppressed')
    expect(normalizeDispatchStatus('skipped')).toBe('skipped')
    expect(normalizeDispatchStatus('failed')).toBe('failed')
    expect(normalizeDispatchStatus('sent')).toBe('sent')
  })
})

describe('applyTouchFilters', () => {
  const rows = [
    touch({ id: '1', recipient: 'alice@x.com', refId: 'camp-1', status: 'opened' }),
    touch({ id: '2', recipient: 'bob@x.com', refId: 'camp-2', refLabel: 'Event blast', status: 'bounced' }),
    touch({ id: '3', recipient: 'carol@x.com', refId: 'disp-1', refLabel: 'Circle news', source: 'dispatch', status: 'sent' }),
  ]

  it('no filters = every row', () => {
    expect(applyTouchFilters(rows, {}).map((t) => t.id)).toEqual(['1', '2', '3'])
  })

  it('filters by campaign/dispatch ref', () => {
    expect(applyTouchFilters(rows, { ref: 'camp-2' }).map((t) => t.id)).toEqual(['2'])
    expect(applyTouchFilters(rows, { ref: 'disp-1' }).map((t) => t.id)).toEqual(['3'])
  })

  it('filters by person (email or label substring, case-insensitive)', () => {
    expect(applyTouchFilters(rows, { q: 'ALICE' }).map((t) => t.id)).toEqual(['1'])
    expect(applyTouchFilters(rows, { q: 'circle' }).map((t) => t.id)).toEqual(['3'])
  })

  it('filters by status, treating "all"/null as no status filter', () => {
    expect(applyTouchFilters(rows, { status: 'bounced' }).map((t) => t.id)).toEqual(['2'])
    expect(applyTouchFilters(rows, { status: 'all' }).map((t) => t.id)).toEqual(['1', '2', '3'])
    expect(applyTouchFilters(rows, { status: null }).map((t) => t.id)).toEqual(['1', '2', '3'])
  })

  it('combines filters (AND)', () => {
    expect(applyTouchFilters(rows, { ref: 'camp-1', status: 'opened', q: 'alice' }).map((t) => t.id)).toEqual(['1'])
    expect(applyTouchFilters(rows, { ref: 'camp-1', status: 'bounced' })).toEqual([])
  })
})
