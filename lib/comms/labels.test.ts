import { describe, it, expect } from 'vitest'
import {
  CONVERSATION_STATUSES,
  STATUS_LABELS,
  CONVERSATION_PRIORITIES,
  PRIORITY_LABELS,
  OPEN_CONVERSATION_STATUSES,
  statusTone,
} from './labels'

describe('conversation labels', () => {
  it('has a human label for every status and priority', () => {
    for (const s of CONVERSATION_STATUSES) expect(STATUS_LABELS[s]).toBeTruthy()
    for (const p of CONVERSATION_PRIORITIES) expect(PRIORITY_LABELS[p]).toBeTruthy()
  })

  it('labels carry no em dashes (voice canon)', () => {
    for (const v of [...Object.values(STATUS_LABELS), ...Object.values(PRIORITY_LABELS)]) {
      expect(v).not.toContain('—')
    }
  })

  it('open statuses are the non-terminal ones', () => {
    expect(OPEN_CONVERSATION_STATUSES).toContain('open')
    expect(OPEN_CONVERSATION_STATUSES).not.toContain('resolved')
    expect(OPEN_CONVERSATION_STATUSES).not.toContain('closed')
  })

  it('statusTone maps resolved/closed to success, waiting to warning, else primary', () => {
    expect(statusTone('resolved')).toContain('success')
    expect(statusTone('closed')).toContain('success')
    expect(statusTone('waiting')).toContain('warning')
    expect(statusTone('open')).toContain('primary')
    expect(statusTone('anything-else')).toContain('primary')
  })
})
