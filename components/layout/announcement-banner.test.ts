import { describe, it, expect, vi, beforeEach } from 'vitest'

// THE REGRESSION THIS FILE EXISTS FOR. The predecessor of this banner was gated on a DATE, and its
// sentence ("The Founding Business rate ends <date>. Lock it in before then and it stays your rate.")
// was hardcoded in the component. ADR-1060 closed that window on 2026-08-17; the date in
// platform_settings stayed set to 2026-10-31, so the banner went on advertising a rate the checkout
// would not honour, on every signed-in page, until someone read it.
//
// The fix is the gate, not the copy: the MESSAGE decides whether the banner exists, and the operator
// writes the message. The first case below is the one that would have caught it.

const { announcementMessage, announcementEndsAt } = vi.hoisted(() => ({
  announcementMessage: vi.fn(),
  announcementEndsAt: vi.fn(),
}))
vi.mock('@/lib/platform-flags', () => ({ announcementMessage, announcementEndsAt }))

const { announcementBannerState } = await import('./announcement-banner')

const HOUR = 3_600_000

beforeEach(() => {
  announcementMessage.mockReset()
  announcementEndsAt.mockReset()
  announcementEndsAt.mockResolvedValue(null)
})

describe('announcementBannerState', () => {
  it('is null when a DATE is set but no message is — the 2026-08 beta-banner regression', async () => {
    announcementMessage.mockResolvedValue('')
    announcementEndsAt.mockResolvedValue(new Date(Date.now() + 90 * 24 * HOUR))
    expect(await announcementBannerState()).toBeNull()
  })

  it('is null when nothing is set at all', async () => {
    announcementMessage.mockResolvedValue('')
    expect(await announcementBannerState()).toBeNull()
  })

  it('is null for a whitespace-only message, so a stray space cannot paint an empty strip', async () => {
    announcementMessage.mockResolvedValue('   ')
    expect(await announcementBannerState()).toBeNull()
  })

  it('renders the message on its own when no date is set', async () => {
    announcementMessage.mockResolvedValue('Doors open Friday.')
    expect(await announcementBannerState()).toEqual({ message: 'Doors open Friday.', ends: null })
  })

  it('carries a future date as the countdown', async () => {
    const ends = new Date(Date.now() + 48 * HOUR)
    announcementMessage.mockResolvedValue('Doors open Friday.')
    announcementEndsAt.mockResolvedValue(ends)
    expect(await announcementBannerState()).toEqual({ message: 'Doors open Friday.', ends })
  })

  it('still renders the message when the date has PASSED, and drops only the countdown', async () => {
    announcementMessage.mockResolvedValue('Doors open Friday.')
    announcementEndsAt.mockResolvedValue(new Date(Date.now() - HOUR))
    expect(await announcementBannerState()).toEqual({ message: 'Doors open Friday.', ends: null })
  })

  it('trims the stored message', async () => {
    announcementMessage.mockResolvedValue('  Doors open Friday.  ')
    expect(await announcementBannerState()).toEqual({ message: 'Doors open Friday.', ends: null })
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE COUNTDOWN'S WORDS ARE RENDERED ON THE SERVER.
//
// The bar is a Client Component now (it owns the dismissal), and this arithmetic used to be inline
// in it. Two things broke: react-hooks/purity rejects `Date.now()` in render, and a countdown
// computed once on the server and again in the browser disagrees across a midnight boundary, which
// is a hydration mismatch on precisely the day the number matters. So the label is built here and
// handed over finished.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe('countdownLabel', () => {
  it('is null when there is no deadline, so the pill never renders empty', async () => {
    const { countdownLabel } = await import('./announcement-banner')
    expect(countdownLabel(null)).toBeNull()
  })

  it('says "1 day left" in the singular', async () => {
    const { countdownLabel } = await import('./announcement-banner')
    expect(countdownLabel(new Date(Date.now() + 12 * HOUR))).toBe('1 day left')
  })

  it('rounds a partial day UP, so the last day is never shown as zero', async () => {
    const { countdownLabel } = await import('./announcement-banner')
    expect(countdownLabel(new Date(Date.now() + 49 * HOUR))).toBe('3 days left')
  })

  it('floors at zero rather than counting negative for a date already gone', async () => {
    // `announcementBannerState` drops a passed date before this is ever called, so this is a
    // belt-and-braces case: nothing should be able to paint "-4 days left".
    const { countdownLabel } = await import('./announcement-banner')
    expect(countdownLabel(new Date(Date.now() - 100 * HOUR))).toBe('0 days left')
  })
})
