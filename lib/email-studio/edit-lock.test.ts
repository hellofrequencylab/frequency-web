import { describe, it, expect } from 'vitest'
import { editLockFor, landed } from './edit-lock'

describe('editLockFor (EMAIL-081)', () => {
  it.each([
    [{ status: 'draft' }, 'open'],
    [{ status: 'cancelled' }, 'open'],
    [{ status: 'failed', recipient_count: 0 }, 'open'],
    [{ status: 'scheduled' }, 'disarm'],
    [{ status: 'sending' }, 'locked'],
    [{ status: 'paused' }, 'locked'],
    [{ status: 'sent' }, 'locked'],
    [{ status: 'failed', recipient_count: 3 }, 'locked'],
    [null, 'open'],
  ] as const)('%j is %s', (row, want) => {
    expect(editLockFor(row)).toBe(want)
  })

  it('landed is true only for a non-empty row list', () => {
    expect(landed([{ id: 'c1' }])).toBe(true)
    expect(landed([])).toBe(false)
    expect(landed(null)).toBe(false)
  })
})
