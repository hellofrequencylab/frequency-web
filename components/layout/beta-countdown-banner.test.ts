import { describe, it, expect, beforeEach, vi } from 'vitest'

// THE PREDICATE THAT DECIDES WHETHER THE SHELL RESERVES SPACE (ADR-1030).
//
// `betaCountdownEndsAt()` exists so that ONE answer to "is a banner coming?" is shared by
// app/(main)/layout.tsx, which mounts the banner, and the banner itself, which renders the date it
// is handed. Before the split the banner answered privately, behind `<Suspense fallback={null}>`,
// and the shell painted a page that then jumped down by the banner's height when the read landed.
//
// The reason this is worth a test rather than an eyeball: the two failure directions are opposite
// and both invisible. Return a date too eagerly (a past one) and the shell holds space for a banner
// that renders nothing, leaving a gap above every page. Return null too eagerly and a live countdown
// silently stops appearing. Neither throws, and neither shows up in a typecheck.

const { betaEndsAt } = vi.hoisted(() => ({ betaEndsAt: vi.fn() }))
vi.mock('@/lib/platform-flags', () => ({ betaEndsAt }))

const { betaCountdownEndsAt } = await import('./beta-countdown-banner')

const HOUR = 3_600_000

beforeEach(() => {
  betaEndsAt.mockReset()
})

describe('deciding whether there is a countdown to show', () => {
  it('hands back the date when one is set and still ahead', async () => {
    const ends = new Date(Date.now() + 30 * 24 * HOUR)
    betaEndsAt.mockResolvedValue(ends)
    await expect(betaCountdownEndsAt()).resolves.toBe(ends)
  })

  it('is null when no operator has set a date, which is the state today', async () => {
    betaEndsAt.mockResolvedValue(null)
    await expect(betaCountdownEndsAt()).resolves.toBeNull()
  })

  it('🔴 is null once the date has passed, so the shell stops holding space for it', async () => {
    // The banner used to make this call itself and return null. Moving the read up without moving
    // this check with it would leave the layout reserving a slot the banner declines to fill: a
    // permanent empty band above every page in the app, appearing the day the beta ends.
    betaEndsAt.mockResolvedValue(new Date(Date.now() - HOUR))
    await expect(betaCountdownEndsAt()).resolves.toBeNull()
  })

  it('is null exactly AT the end date, not one tick after', async () => {
    // `<=` not `<`. A countdown reading "0 days left" is not a countdown.
    betaEndsAt.mockResolvedValue(new Date(Date.now()))
    await expect(betaCountdownEndsAt()).resolves.toBeNull()
  })

  it('still shows a date an hour out, so the last day is not rounded away', async () => {
    const ends = new Date(Date.now() + HOUR)
    betaEndsAt.mockResolvedValue(ends)
    await expect(betaCountdownEndsAt()).resolves.toBe(ends)
  })
})
