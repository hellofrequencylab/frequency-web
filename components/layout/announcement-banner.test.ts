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
