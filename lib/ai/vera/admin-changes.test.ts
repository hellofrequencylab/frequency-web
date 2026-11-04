import { describe, expect, it } from 'vitest'
import { ticketCard, ticketChange } from './admin-changes'

describe('support ticket changes Vera may propose (LIVE-2191)', () => {
  it('checks the ticket number, field and value', () => {
    expect(ticketChange('#1001', 'status', 'resolved')).toEqual({ ref: 1001, field: 'status', value: 'resolved' })
    expect(ticketChange(' 1002 ', 'priority', 'high')).toEqual({ ref: 1002, field: 'priority', value: 'high' })
    for (const [r, f, v] of [
      ['1001', 'assigned_to', 'x'],
      ['1001', 'status', 'deleted'],
      ['1001', 'toString', 'x'],
      ['1001', 'status', 'toString'],
      ['abc', 'status', 'open'],
      [1001, 'status', 'open'],
      ['1001', 'priority', 1],
    ]) expect(ticketChange(r, f, v)).toBeNull()
  })

  it('words the card plainly', () => {
    expect(ticketCard('1001', 'status', 'waiting')).toBe('Mark support ticket #1001 waiting on the member?')
    expect(ticketCard('1001', 'priority', 'urgent')).toBe('Set support ticket #1001 to urgent priority?')
    expect(ticketCard('1001', 'status', 'gone')).toBeNull()
  })
})
