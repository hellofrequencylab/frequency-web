import { describe, it, expect, vi } from 'vitest'
import { safeErrorMessage } from './action-result'

// SCAN-1288: a raw database message never reaches a member.
describe('safeErrorMessage', () => {
  it('hides a PostgREST message behind the fallback', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const raw = { code: '42501', message: 'new row violates row-level security policy for table "friendships"' }
    expect(safeErrorMessage(raw)).toBe('Something went wrong. Try again.')
    expect(safeErrorMessage(raw, 'Could not save.')).toBe('Could not save.')
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
  it('passes through a sentence raised by our own SQL (P0001)', () => {
    expect(safeErrorMessage({ code: 'P0001', message: 'That event is full.' })).toBe('That event is full.')
  })
  it('uses the fallback for a missing error', () => {
    expect(safeErrorMessage(null, 'Nope.')).toBe('Nope.')
  })
})
