import { describe, it, expect } from 'vitest'
import { checkInWindowOpenAt } from './checkin-window'
import { checkInSurfaceState } from './checkin-surface'
const start = Date.UTC(2026, 9, 15, 18)
const end = start + 3600000
const display = (nowMs: number) => checkInSurfaceState({
  cancelled: false, checkInEnabled: true, startsAtMs: start,
  windowOpen: checkInWindowOpenAt(start, end, nowMs),
  signedIn: true, isGoing: true, alreadyCheckedIn: false, zaps: 25, nowMs,
})
describe('a mounted event display follows the real door window', () => {
 it('crosses from countdown to check-in without a page reload', () => {
  expect(display(start - 1).kind).toBe('countdown')
  expect(display(start).kind).toBe('open')
 })
 it('closes exactly four hours past the end', () => {
  expect(display(end + 4 * 3600000 - 1).kind).toBe('open')
  expect(display(end + 4 * 3600000).kind).toBe('hidden')
 })
 it('falls back to the start for missing or invalid end times', () => {
  expect(checkInWindowOpenAt(start, null, start + 4 * 3600000)).toBe(false)
  expect(checkInWindowOpenAt(start, start - 1, start)).toBe(true)
  expect(checkInWindowOpenAt(null, end, start)).toBe(false)
 })
})
