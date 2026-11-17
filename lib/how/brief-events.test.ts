import { describe, expect, it } from 'vitest'
import { cleanBriefBatch, cleanRef, BRIEF_EVENT_NAMES } from './brief-events'
import { isTrackedEvent, isClientEvent } from '@/lib/analytics/events'

describe('the /how brief event batch', () => {
  it('registers every how.* event and keeps them off the member sink', () => {
    for (const name of BRIEF_EVENT_NAMES) {
      expect(isTrackedEvent(name)).toBe(true)
      expect(isClientEvent(name)).toBe(false)
    }
  })
  it('drops unknown events, bad keys and junk values', () => {
    const b = cleanBriefBatch({ sid: 'abcd1234efgh', ref: 'coach-jane', events: [
      { name: 'how.view', props: { device: 'mobile', 'Bad Key': 1, obj: { a: 1 }, vw: 390 }, t: Date.now() },
      { name: 'account.created', props: {} },
    ] })
    expect(b?.events).toHaveLength(1)
    expect(b?.events[0].props).toEqual({ device: 'mobile', vw: 390 })
    expect(b?.ref).toBe('coach-jane')
  })
  it('rejects a batch without a well-formed session id', () => {
    expect(cleanBriefBatch({ sid: 'x', events: [{ name: 'how.view' }] })).toBeNull()
    expect(cleanBriefBatch(null)).toBeNull()
  })
  it('normalises recipient codes', () => {
    expect(cleanRef('Coach Jane!')).toBe('coach-jane')
    expect(cleanRef('')).toBeNull()
  })
})
