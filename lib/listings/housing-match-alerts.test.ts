import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  HOUSING_MATCH_ALERT_MIN_SCORE,
  selectHousingMatchAlerts,
  housingMatchPushCopy,
  housingMatchPath,
  sendHousingMatchAlerts,
  type HousingMatchAlert,
  type HousingMatchAlertDeps,
  type HousingMatchReadings,
} from './housing-match-alerts'
import { resolveNotificationType, NOTIFICATION_REGISTRY } from '@/lib/notifications/registry'
import { WIRED_PREFERENCE_CHANNELS } from '@/lib/notifications/wired'
import { routeNotification } from '@/lib/notifications/router'

// The alerts half of DEF-HOUS (ADR-1278): the registry row the router gates, the pure selection
// past the strong-match bar, and the once-per-pair claim that keeps a member from hearing about
// the same person twice. No database anywhere here: the seams are injected.

const ME = 'me'

function readings(over: Partial<HousingMatchReadings> = {}): HousingMatchReadings {
  return { profileId: ME, seekers: [], listings: [], ...over }
}

describe('the housing.match registry row', () => {
  it('is catalogued on the matches category with email + push, preference-governed', () => {
    const t = resolveNotificationType('housing.match')
    expect(t.category).toBe('matches')
    expect(t.channels).toEqual(['email', 'push'])
    expect(t.transactional ?? false).toBe(false)
  })

  it('renders a push with the device-level tag, and an email only when the caller handed one in', () => {
    const t = NOTIFICATION_REGISTRY['housing.match']
    const withoutEmail = t.render({ title: 'T', body: 'B', url: '/housing/roommates', tag: 'housing-match:seeker:x' })
    expect(withoutEmail.push).toEqual({ title: 'T', body: 'B', url: '/housing/roommates', tag: 'housing-match:seeker:x' })
    expect(withoutEmail.email).toBeUndefined()
    const email = { to: 'a@b.c', subject: 's', html: '<p/>' }
    expect(t.render({ title: 'T', body: 'B', url: '/x', tag: 't', email }).email).toBe(email)
  })

  it('both channels it declares are wired switches, so the grid shows what the router reads', () => {
    expect(WIRED_PREFERENCE_CHANNELS.matches).toEqual(['email', 'push'])
  })

  it('the router skips the email channel cleanly when no email was rendered', async () => {
    const enqueued: { kind: string }[] = []
    const result = await routeNotification(
      'housing.match',
      { profileId: 'p1' },
      { title: 'T', body: 'B', url: '/x', tag: 't' },
      {},
      {
        resolveGate: (async () => ({ allowed: true, reason: 'ok' })) as never,
        enqueueJob: async (kind) => {
          enqueued.push({ kind })
        },
      },
    )
    expect(result.outcomes).toEqual([
      { channel: 'email', reason: 'skipped', enqueued: false },
      { channel: 'push', reason: 'ok', enqueued: true },
    ])
    expect(enqueued).toEqual([{ kind: 'push' }])
  })
})

describe('selectHousingMatchAlerts — pure selection', () => {
  it('the bar is a strong match: an all-round fit with no resonance clears it, an unknown pair does not', () => {
    expect(HOUSING_MATCH_ALERT_MIN_SCORE).toBe(0.6)
    // Every fit term at its ceiling, zero resonance: 0.20 + 0.15 + 0.10 + 0.15 + 0.05.
    expect(0.65).toBeGreaterThanOrEqual(HOUSING_MATCH_ALERT_MIN_SCORE)
    // Nothing known on either side (the RPCs' 0.5 / 0.3 / 0.5 defaults, lifestyle 0.5).
    expect(0.2 * 0.5 + 0.15 * 0.3 + 0.1 * 0.5 + 0.15 * 0.5).toBeLessThan(HOUSING_MATCH_ALERT_MIN_SCORE)
  })

  it('keeps only matches past the bar and never alerts the saver about themselves', () => {
    const out = selectHousingMatchAlerts(
      readings({
        seekers: [
          { profileId: 'a', score: 0.72, city: 'Asheville' },
          { profileId: 'b', score: 0.59, city: null },
          { profileId: ME, score: 0.99, city: null },
        ],
        listings: [{ ownerId: ME, listingId: 'l0', score: 0.9, city: null }],
      }),
    )
    expect(out).toEqual<HousingMatchAlert[]>([
      { recipientProfileId: 'a', counterpartProfileId: ME, kind: 'seeker', listingId: null, score: 0.72, city: 'Asheville' },
    ])
  })

  it('tells a room owner once even when three of their rooms line up, keeping the strongest', () => {
    const out = selectHousingMatchAlerts(
      readings({
        listings: [
          { ownerId: 'owner', listingId: 'l1', score: 0.61, city: 'X' },
          { ownerId: 'owner', listingId: 'l2', score: 0.8, city: 'X' },
          { ownerId: 'owner', listingId: 'l3', score: 0.7, city: 'X' },
        ],
      }),
    )
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ recipientProfileId: 'owner', kind: 'listing', listingId: 'l2', score: 0.8 })
  })

  it('a person who is both a seeker and a room owner gets one alert per kind, strongest first', () => {
    const out = selectHousingMatchAlerts(
      readings({
        seekers: [{ profileId: 'p', score: 0.65, city: null }],
        listings: [{ ownerId: 'p', listingId: 'l', score: 0.9, city: null }],
      }),
    )
    expect(out.map((a) => [a.kind, a.score])).toEqual([
      ['listing', 0.9],
      ['seeker', 0.65],
    ])
  })

  it('ignores a score the RPC could not produce', () => {
    expect(selectHousingMatchAlerts(readings({ seekers: [{ profileId: 'a', score: Number.NaN, city: null }] }))).toEqual([])
  })
})

describe('the copy and the destination', () => {
  it('push copy names the person and the place, plainly, with no em dash', () => {
    const seeker = housingMatchPushCopy('seeker', 'Maya', 'Asheville')
    expect(seeker.title).toBe('New roommate match')
    expect(seeker.body).toBe('Maya is looking for a place in Asheville too, and your searches line up.')
    const listing = housingMatchPushCopy('listing', 'Maya', null)
    expect(listing.title).toBe('Maya lines up with your room')
    expect(listing.body).toBe('Maya is looking for a room and matches your listing.')
    for (const s of [seeker.title, seeker.body, listing.title, listing.body]) expect(s).not.toMatch(/[—–]/)
  })

  it('a seeker opens the People tab; a room owner opens the seeker, or the index when they have no handle', () => {
    expect(housingMatchPath('seeker', 'maya')).toBe('/housing/roommates?tab=people')
    expect(housingMatchPath('listing', 'maya')).toBe('/people/maya')
    expect(housingMatchPath('listing', null)).toBe('/housing/roommates')
  })
})

describe('sendHousingMatchAlerts — claim, then send, once per pair', () => {
  // The email carries a signed unsubscribe link, so building one needs a signing secret. Stubbed
  // the way every other test of a signed link does it (app/u/scan/route.test.ts); without it the
  // builder throws, the loop catches, and every alert reads as a delivery failure.
  beforeEach(() => {
    vi.stubEnv('UNSUBSCRIBE_SECRET', 'test-secret-for-housing-match-alerts-0000')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  function fakeDeps(over: Partial<HousingMatchAlertDeps> = {}) {
    const claimed = new Set<string>()
    const routed: { profileId: string; ctx: Record<string, unknown> }[] = []
    const deps: HousingMatchAlertDeps = {
      // The database's ignore-duplicates upsert, modelled: a pair inserts once, ever.
      claim: async (alerts) =>
        alerts.filter((a) => {
          const key = `${a.recipientProfileId}|${a.counterpartProfileId}|${a.kind}`
          if (claimed.has(key)) return false
          claimed.add(key)
          return true
        }),
      resolveRecipient: async (id) => ({ email: `${id}@example.test`, name: id.toUpperCase() }),
      resolveCounterpart: async () => ({ name: 'Maya', handle: 'maya' }),
      route: (async (_event: string, recipient: { profileId: string }, ctx: Record<string, unknown>) => {
        routed.push({ profileId: recipient.profileId, ctx })
        return { event: 'housing.match', outcomes: [], enqueuedCount: 2 }
      }) as unknown as HousingMatchAlertDeps['route'],
      ...over,
    }
    return { deps, routed }
  }

  const strong = readings({
    seekers: [{ profileId: 'a', score: 0.7, city: 'Asheville' }],
    listings: [{ ownerId: 'o', listingId: 'l1', score: 0.8, city: 'Asheville' }],
  })

  it('routes each claimed alert through the registry event with the email rendered for the recipient', async () => {
    const { deps, routed } = fakeDeps()
    const result = await sendHousingMatchAlerts(strong, deps)
    expect(result).toEqual({ candidates: 2, claimed: 2, routed: 2, enqueued: 4 })
    expect(routed.map((r) => r.profileId)).toEqual(['o', 'a'])
    const toOwner = routed[0].ctx
    expect(toOwner.url).toBe('/people/maya')
    expect(toOwner.tag).toBe('housing-match:listing:me')
    expect((toOwner.email as { to: string }).to).toBe('o@example.test')
    expect((toOwner.email as { subject: string }).subject).toBe('Maya lines up with your room')
    const toSeeker = routed[1].ctx
    expect(toSeeker.url).toBe('/housing/roommates?tab=people')
    expect((toSeeker.email as { subject: string }).subject).toBe('New roommate match: Maya')
  })

  it('a second save with the same matches routes nothing: the pair was claimed', async () => {
    const { deps, routed } = fakeDeps()
    await sendHousingMatchAlerts(strong, deps)
    const again = await sendHousingMatchAlerts(strong, deps)
    expect(again).toEqual({ candidates: 2, claimed: 0, routed: 0, enqueued: 0 })
    expect(routed).toHaveLength(2)
  })

  it('a new counterpart on a later save is a new claim, the old one stays silent', async () => {
    const { deps, routed } = fakeDeps()
    await sendHousingMatchAlerts(strong, deps)
    await sendHousingMatchAlerts(
      readings({ seekers: [{ profileId: 'a', score: 0.7, city: null }, { profileId: 'z', score: 0.66, city: null }] }),
      deps,
    )
    expect(routed.map((r) => r.profileId)).toEqual(['o', 'a', 'z'])
  })

  it('does not touch the claim seam when nothing clears the bar', async () => {
    const claim = vi.fn(async (a: HousingMatchAlert[]) => a)
    const { deps } = fakeDeps({ claim })
    const result = await sendHousingMatchAlerts(readings({ seekers: [{ profileId: 'a', score: 0.5, city: null }] }), deps)
    expect(result.candidates).toBe(0)
    expect(claim).not.toHaveBeenCalled()
  })

  it('a recipient with no email still gets the push context, with no email rendered', async () => {
    const { deps, routed } = fakeDeps({ resolveRecipient: async () => ({ email: null, name: 'O' }) })
    await sendHousingMatchAlerts(readings({ listings: [{ ownerId: 'o', listingId: 'l', score: 0.9, city: null }] }), deps)
    expect(routed).toHaveLength(1)
    expect(routed[0].ctx.email).toBeUndefined()
    expect(routed[0].ctx.title).toBe('Maya lines up with your room')
  })

  it('one unreadable recipient costs that alert, never the batch, and never un-claims it', async () => {
    const { deps, routed } = fakeDeps({
      resolveRecipient: async (id) => (id === 'o' ? Promise.reject(new Error('boom')) : { email: `${id}@x.test`, name: id }),
    })
    const result = await sendHousingMatchAlerts(strong, deps)
    expect(result).toMatchObject({ claimed: 2, routed: 1 })
    expect(routed.map((r) => r.profileId)).toEqual(['a'])
    // The failed pair is claimed: a retry is silent for it (a missed note beats a double).
    const again = await sendHousingMatchAlerts(strong, deps)
    expect(again.claimed).toBe(0)
  })
})
