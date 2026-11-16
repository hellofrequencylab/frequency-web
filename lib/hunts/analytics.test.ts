// FH-025: the Hunt measurement model. Done when: guest analytics forwarding stays off by default, and
// neither the ledger nor a log line can carry an exact location, a code or a contact detail.
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ANALYTICS_EVENTS, isClientEvent } from '@/lib/analytics/events'
import { pixelSafeProps } from '@/lib/analytics/sanitize'
import {
  HUNT_ALLOWED_KEYS,
  HUNT_EVENTS,
  HUNT_GUEST_FORWARDING_KEY,
  guestForwardingOn,
  huntEventProps,
  mayForward,
  reasonClass,
  recordHuntEvent,
} from './analytics'

const HUNT = '0b0e7c8e-3c1f-4f6e-9a55-2f1f6f1f0a11'
const PLAYER = '7d4c1f0a-52c3-4b6e-8f0a-1c2d3e4f5a6b'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

function sink(consent = false) {
  const calls: { event: string; props: Record<string, unknown>; actor: string | null; mirror: boolean }[] = []
  return {
    calls,
    track: async (event: string, props: Record<string, unknown>, actor: string | null, mirror: boolean) => {
      calls.push({ event, props, actor, mirror })
    },
    analyticsConsent: vi.fn(async () => consent),
  }
}

/** Everything a careless or hostile caller might hand in. None of it may come out the other side. */
const HOSTILE: Record<string, unknown> = {
  lat: 33.1958,
  lng: -117.3795,
  latitude: '33.1958',
  longitude: '-117.3795',
  location: '300 Carlsbad Village Dr',
  address: '300 Carlsbad Village Dr',
  geo: { lat: 33.1958, lng: -117.3795 },
  distance_m: 4,
  code: 'stop-code-1',
  placement_code: 'stop-code-1',
  placement_id: '5a1e2d3c-4b5a-4c6d-8e7f-0a1b2c3d4e5f',
  placementId: '5a1e2d3c-4b5a-4c6d-8e7f-0a1b2c3d4e5f',
  venue_space_id: '9c8b7a6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d',
  mission_key: 'joes-cafe',
  token: 'c1.eyJnIjoiZyJ9.sig',
  nonce: 'abcdef0123456789',
  email: 'player@example.com',
  phone: '+17605550100',
  name: 'Sam Player',
  handle: '@sam',
  profile_id: PLAYER,
  persona: 'seeker',
  mood: 'low',
  path: '/hunts/p/stop-code-1',
  __proto__: { email: 'player@example.com' },
  constructor: 'x',
}

describe('the allowlist', () => {
  it('keeps the closed dimensions and drops every hostile property', () => {
    const out = huntEventProps({ ...HOSTILE, hunt_id: HUNT, reason_class: 'credited', medium: 'qr', cohort: 'member', assurance: 'signed_node', replayed: false })
    expect(out).toEqual({ hunt_id: HUNT, reason_class: 'credited', medium: 'qr', cohort: 'member', assurance: 'signed_node', replayed: false })
    expect(Object.keys(huntEventProps(HOSTILE))).toEqual([])
  })

  it('refuses a location, code or contact smuggled as the value of an allowed name', () => {
    const smuggled = {
      hunt_id: 'player@example.com',
      reason_class: '33.1958,-117.3795',
      medium: 'stop-code-1',
      cohort: '+17605550100',
      assurance: { toString: () => 'staff' },
      replayed: 'Sam Player',
    }
    expect(huntEventProps(smuggled)).toEqual({})
    expect(huntEventProps({ hunt_id: `${HUNT} player@example.com` })).toEqual({})
    expect(huntEventProps({ medium: ['qr'] })).toEqual({})
  })

  it('reads own properties only, survives a throwing getter, and ignores non-objects', () => {
    const inherited = Object.create({ medium: 'qr', hunt_id: HUNT }) as Record<string, unknown>
    expect(huntEventProps(inherited)).toEqual({})
    const trap = { assurance: 'staff' }
    Object.defineProperty(trap, 'medium', { enumerable: true, get() { throw new Error('boom') } })
    expect(huntEventProps(trap)).toEqual({ assurance: 'staff' })
    for (const bad of [null, undefined, 'qr', 7, [{ medium: 'qr' }]]) expect(huntEventProps(bad)).toEqual({})
  })

  it('has no name that could hold a location, a code, a contact, or persona and wellness data', () => {
    const forbidden = /lat|lng|lon|geo|loc|addr|place|venue|space|code|token|nonce|mail|phone|name|handle|profile|persona|mood|topic|mission|path|url/i
    expect(HUNT_ALLOWED_KEYS.filter((k) => forbidden.test(k))).toEqual([])
    // The site-wide pixel rules pass every allowed name through unchanged: nothing here is one of theirs.
    const sample = { hunt_id: HUNT, reason_class: 'credited', medium: 'qr', cohort: 'guest', assurance: 'none', replayed: true }
    expect(pixelSafeProps(sample)).toEqual(sample)
  })

  it('folds engine answers into a closed class and never passes an unknown answer through', () => {
    expect(reasonClass('credited')).toBe('credited')
    expect(reasonClass('already_credited')).toBe('replayed')
    expect(reasonClass('held')).toBe('held')
    expect(reasonClass('mission_closed')).toBe('closed')
    expect(reasonClass('bad_signature')).toBe('proof_failed')
    expect(reasonClass('forbidden')).toBe('not_permitted')
    for (const unknown of ['player@example.com', 'stop-code-1', 'constructor', 'toString', '', null, undefined]) expect(reasonClass(unknown)).toBe('unavailable')
  })
})

describe('the registry', () => {
  it('registers every Hunt event with the site taxonomy as server-only', () => {
    const registered = new Set(ANALYTICS_EVENTS.map((e) => e.name))
    for (const name of Object.keys(HUNT_EVENTS)) {
      expect(registered.has(name), name).toBe(true)
      expect(isClientEvent(name), name).toBe(false)
    }
    expect(ANALYTICS_EVENTS.filter((e) => e.name.startsWith('hunt.')).map((e) => e.name).sort()).toEqual(Object.keys(HUNT_EVENTS).sort())
  })

  it('is called where Hunt events happen', () => {
    const sites: Record<string, string[]> = {
      'app/(main)/hunts/p/[code]/route.ts': ["event: 'hunt.placement_scan'", "event: 'hunt.stop_claim'"],
      'app/(main)/hunts/[slug]/play/actions.ts': ["event: 'hunt.stop_claim'"],
      'app/api/hunts/staff/verify/route.ts': ["event: 'hunt.staff_verify'"],
      'app/api/hunts/station/route.ts': ["event: 'hunt.reward_redeem'", "event: 'hunt.reward_void'"],
    }
    for (const [file, needles] of Object.entries(sites)) {
      const source = readFileSync(file, 'utf8')
      expect(source, file).toContain('deferHuntEvent(')
      for (const needle of needles) expect(source, `${file} ${needle}`).toContain(needle)
    }
  })
})

describe('forwarding', () => {
  it('keeps guest forwarding off by default, and off without HUNTS_ENABLED', () => {
    expect(guestForwardingOn()).toBe(false)
    vi.stubEnv('HUNTS_ENABLED', '1')
    expect(guestForwardingOn()).toBe(false)
    vi.stubEnv(HUNT_GUEST_FORWARDING_KEY, 'yes')
    expect(guestForwardingOn()).toBe(false)
    vi.stubEnv(HUNT_GUEST_FORWARDING_KEY, 'on')
    expect(guestForwardingOn()).toBe(true)
    vi.stubEnv('HUNTS_ENABLED', '')
    expect(guestForwardingOn()).toBe(false)
  })

  it('forwards a guest only by the switch, a member only by consent, and staff never', () => {
    expect(mayForward({ cohort: 'guest', guestForwarding: false, memberConsent: true })).toBe(false)
    expect(mayForward({ cohort: 'guest', guestForwarding: true, memberConsent: false })).toBe(true)
    expect(mayForward({ cohort: 'member', guestForwarding: true, memberConsent: false })).toBe(false)
    expect(mayForward({ cohort: 'member', guestForwarding: false, memberConsent: true })).toBe(true)
    expect(mayForward({ cohort: 'staff', guestForwarding: true, memberConsent: true })).toBe(false)
  })
})

describe('recordHuntEvent', () => {
  it('records nothing while Hunts are dark', async () => {
    const s = sink(true)
    expect(await recordHuntEvent({ event: 'hunt.stop_claim', actorProfileId: PLAYER, props: { hunt_id: HUNT } }, s)).toMatchObject({ recorded: false })
    expect(s.calls).toEqual([])
  })

  it('records a guest scan first-party and does not forward it by default', async () => {
    vi.stubEnv('HUNTS_ENABLED', '1')
    const s = sink(true)
    const out = await recordHuntEvent({ event: 'hunt.placement_scan', actorProfileId: null, props: { ...HOSTILE, hunt_id: HUNT, reason_class: 'opened' } }, s)
    expect(out).toEqual({ recorded: true, forwarded: false, props: { hunt_id: HUNT, reason_class: 'opened', cohort: 'guest' } })
    expect(s.calls).toEqual([{ event: 'hunt.placement_scan', props: { hunt_id: HUNT, reason_class: 'opened', cohort: 'guest' }, actor: null, mirror: false }])
    expect(s.analyticsConsent).not.toHaveBeenCalled()

    vi.stubEnv(HUNT_GUEST_FORWARDING_KEY, '1')
    expect((await recordHuntEvent({ event: 'hunt.placement_scan', actorProfileId: null, props: { hunt_id: HUNT } }, s)).forwarded).toBe(true)
  })

  it('forwards a member only with their recorded consent, and never trusts a cohort the caller sent', async () => {
    vi.stubEnv('HUNTS_ENABLED', '1')
    vi.stubEnv(HUNT_GUEST_FORWARDING_KEY, '1')
    const no = sink(false)
    const refused = await recordHuntEvent({ event: 'hunt.stop_claim', actorProfileId: PLAYER, props: { hunt_id: HUNT, cohort: 'guest', reason_class: 'credited' } }, no)
    expect(refused).toMatchObject({ recorded: true, forwarded: false })
    expect(no.calls[0]).toMatchObject({ actor: PLAYER, mirror: false, props: { cohort: 'member' } })
    expect(no.analyticsConsent).toHaveBeenCalledWith(PLAYER)

    const yes = sink(true)
    expect((await recordHuntEvent({ event: 'hunt.stop_claim', actorProfileId: PLAYER, props: { hunt_id: HUNT } }, yes)).forwarded).toBe(true)
  })

  it('never forwards a staff event and never writes who the staff member was', async () => {
    vi.stubEnv('HUNTS_ENABLED', '1')
    vi.stubEnv(HUNT_GUEST_FORWARDING_KEY, '1')
    const s = sink(true)
    await recordHuntEvent({ event: 'hunt.staff_verify', actorProfileId: PLAYER, staff: true, props: { hunt_id: HUNT, assurance: 'staff' } }, s)
    expect(s.calls).toEqual([{ event: 'hunt.staff_verify', props: { hunt_id: HUNT, assurance: 'staff', cohort: 'staff' }, actor: null, mirror: false }])
  })

  it('drops an event it does not know, and a failure logs only allowlisted fields', async () => {
    vi.stubEnv('HUNTS_ENABLED', '1')
    const s = sink()
    expect((await recordHuntEvent({ event: 'hunt.made_up' as never, actorProfileId: null, props: {} }, s)).recorded).toBe(false)
    expect((await recordHuntEvent({ event: 'toString' as never, actorProfileId: null, props: {} }, s)).recorded).toBe(false)
    expect(s.calls).toEqual([])

    const lines: string[] = []
    vi.spyOn(console, 'warn').mockImplementation((line: string) => { lines.push(line) })
    const broken = { ...sink(), track: async () => { throw new Error('ledger down for player@example.com at 33.1958,-117.3795') } }
    const out = await recordHuntEvent({ event: 'hunt.placement_scan', actorProfileId: null, props: { ...HOSTILE, hunt_id: HUNT } }, broken)
    expect(out.recorded).toBe(false)
    expect(lines).toHaveLength(1)
    const logged = JSON.parse(lines[0]) as Record<string, unknown>
    expect(Object.keys(logged).sort()).toEqual(['cohort', 'event', 'hunt_event', 'hunt_id', 'level', 'ts'])
    expect(lines[0]).not.toMatch(/example\.com|33\.19|stop-code|Carlsbad|7605550100|Sam Player/)
  })
})
