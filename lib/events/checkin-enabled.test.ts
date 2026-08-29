import { describe, it, expect } from 'vitest'
import {
  readEventCheckInEnabled,
  writeEventCheckInEnabled,
  CHECK_IN_LABEL,
  CHECK_IN_HELP,
} from './checkin-enabled'

// The host's check-in switch, stored on the events.theme jsonb bag (no column, no migration).
// The contract that matters most is the DEFAULT: every event that exists today has never touched
// this key, and every one of them must keep its check-in exactly as it is.

describe('readEventCheckInEnabled', () => {
  it('defaults to ON for a theme that never set the key — no existing event changes', () => {
    expect(readEventCheckInEnabled({})).toBe(true)
    expect(readEventCheckInEnabled({ coverFocus: '50% 20%' })).toBe(true)
    expect(readEventCheckInEnabled({ marketListed: false })).toBe(true)
  })

  it('fails OPEN on a missing or malformed bag rather than closing a host’s door', () => {
    expect(readEventCheckInEnabled(null)).toBe(true)
    expect(readEventCheckInEnabled(undefined)).toBe(true)
    expect(readEventCheckInEnabled('nonsense')).toBe(true)
    expect(readEventCheckInEnabled(42)).toBe(true)
    // Only an explicit boolean false counts — a truthy-looking string does not disable.
    expect(readEventCheckInEnabled({ checkInEnabled: 'false' })).toBe(true)
  })

  it('reads an explicit false as OFF', () => {
    expect(readEventCheckInEnabled({ checkInEnabled: false })).toBe(false)
  })
})

describe('writeEventCheckInEnabled', () => {
  it('stores false when the host turns check-in off', () => {
    expect(writeEventCheckInEnabled({}, false)).toEqual({ checkInEnabled: false })
  })

  it('DELETES the key when turning it back on, so the default stays a real default', () => {
    expect(writeEventCheckInEnabled({ checkInEnabled: false }, true)).toEqual({})
  })

  it('preserves the other theme keys it shares the bag with', () => {
    const theme = { coverFocus: '50% 20%', heroHeight: 'tall', marketListed: false }
    expect(writeEventCheckInEnabled(theme, false)).toEqual({ ...theme, checkInEnabled: false })
    expect(writeEventCheckInEnabled(theme, true)).toEqual(theme)
  })

  it('does not mutate the theme it was handed', () => {
    const theme = { coverFocus: '50% 20%' }
    writeEventCheckInEnabled(theme, false)
    expect(theme).toEqual({ coverFocus: '50% 20%' })
  })

  it('round-trips through read', () => {
    expect(readEventCheckInEnabled(writeEventCheckInEnabled({}, false))).toBe(false)
    expect(readEventCheckInEnabled(writeEventCheckInEnabled({ checkInEnabled: false }, true))).toBe(true)
  })

  it('tolerates a null/garbage base by starting a fresh bag', () => {
    expect(writeEventCheckInEnabled(null, false)).toEqual({ checkInEnabled: false })
    expect(writeEventCheckInEnabled('nonsense', false)).toEqual({ checkInEnabled: false })
  })
})

describe('host-facing copy', () => {
  it('has no em dashes (docs/CONTENT-VOICE.md) and does not narrate the reader’s feelings', () => {
    expect(CHECK_IN_LABEL).not.toMatch(/—/)
    expect(CHECK_IN_HELP).not.toMatch(/—/)
  })
})
