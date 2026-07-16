import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  LEAD_DOORS,
  isLeadDoor,
  doorLabel,
  isMailableDoor,
  consentStateForDoor,
  normalizeEmail,
  normalizePhoneKey,
  encodeLeadGrab,
  parseLeadGrab,
  buildEntryPointRow,
  captureLead,
  captureLeadMagnet,
  captureEventLead,
  captureShareBack,
  captureWarmIntro,
  acceptWarmIntro,
  type PendingLeadGrab,
} from './lead-capture'

// A recording mock of the service-role admin client: every from() spins a fresh chainable/awaitable
// builder that records the (method, args) sequence it received, so a test can assert HOW a query was
// scoped. maybeSingle()/await resolve to a canned row per table (the 'contacts' row is already in
// 'space-1', so captureLead takes the existing-row path — no inserts, no root lookup needed).
const { chains } = vi.hoisted(() => ({ chains: [] as Array<{ table: string; calls: Array<[string, unknown[]]> }> }))

vi.mock('@/lib/supabase/admin', () => {
  const rowFor = (table: string): unknown => {
    if (table === 'contacts')
      return { id: 'c1', email: 'jo@example.com', space_id: 'space-1', profile_id: null, consent_state: 'unknown', display_name: null, meta: {} }
    if (table === 'spaces') return { id: 'root-1' }
    return { id: `${table}-1` }
  }
  const makeBuilder = (table: string): unknown => {
    const chain = { table, calls: [] as Array<[string, unknown[]]> }
    chains.push(chain)
    const result = { data: rowFor(table), error: null }
    const p: unknown = new Proxy(
      {},
      {
        get(_t, prop: string) {
          if (prop === 'then') return (resolve: (v: unknown) => unknown) => resolve(result)
          if (prop === 'maybeSingle' || prop === 'single') return () => Promise.resolve(result)
          return (...args: unknown[]) => {
            chain.calls.push([prop, args])
            return p
          }
        },
      },
    )
    return p
  }
  return { createAdminClient: () => ({ from: (t: string) => makeBuilder(t) }) }
})

vi.mock('@/lib/crm/interactions', () => ({ recordContactInteraction: async () => {} }))

// PURE-engine tests for the capture-now / claim-on-join lead-grab engine (CRM Phase 3). These lock the
// three invariants the DB also enforces: entry-point immutability (a set-once, well-formed door row),
// deterministic dedupe/claim keys (email + phone), and the consent posture (capture != marketing
// consent unless the door is consent-native). No IO — network-free.

describe('door taxonomy', () => {
  it('recognizes exactly the five doors', () => {
    expect([...LEAD_DOORS]).toEqual(['space_qr', 'warm_intro', 'event', 'lead_magnet', 'share_back'])
    for (const d of LEAD_DOORS) expect(isLeadDoor(d)).toBe(true)
    expect(isLeadDoor('nope')).toBe(false)
    expect(isLeadDoor(null)).toBe(false)
    expect(doorLabel('space_qr')).toBe('QR scan')
  })
})

describe('consent posture (capture != marketing consent)', () => {
  it('a default Space-QR grab is NOT mailable; an offer-unlock flips it', () => {
    expect(isMailableDoor('space_qr')).toBe(false)
    expect(isMailableDoor('space_qr', { offerUnlocked: true })).toBe(true)
  })

  it('a lead magnet is consent-native (mailable); event + share-back are not', () => {
    expect(isMailableDoor('lead_magnet')).toBe(true)
    expect(isMailableDoor('event')).toBe(false)
    expect(isMailableDoor('share_back')).toBe(false)
  })

  it('a warm intro is mailable only once accepted (double opt-in)', () => {
    expect(isMailableDoor('warm_intro')).toBe(false)
    expect(isMailableDoor('warm_intro', { introAccepted: true })).toBe(true)
  })

  it('default sealed lead stays unknown; mailable door lifts unknown -> subscribed', () => {
    expect(consentStateForDoor('space_qr', 'unknown')).toBe('unknown')
    expect(consentStateForDoor('lead_magnet', 'unknown')).toBe('subscribed')
    expect(consentStateForDoor('space_qr', 'unknown', { offerUnlocked: true })).toBe('subscribed')
  })

  it('NEVER re-subscribes an unsubscribed lead and never downgrades a subscriber', () => {
    expect(consentStateForDoor('lead_magnet', 'unsubscribed')).toBe('unsubscribed')
    expect(consentStateForDoor('space_qr', 'unsubscribed', { offerUnlocked: true })).toBe('unsubscribed')
    expect(consentStateForDoor('event', 'subscribed')).toBe('subscribed')
  })
})

describe('deterministic dedupe + claim keys', () => {
  it('normalizes email to a lowercased trimmed key, rejecting non-addresses', () => {
    expect(normalizeEmail('  Jo@Example.COM ')).toBe('jo@example.com')
    expect(normalizeEmail('not-an-email')).toBeNull()
    expect(normalizeEmail('')).toBeNull()
    expect(normalizeEmail(null)).toBeNull()
  })

  it('phone key is the last 10 digits regardless of formatting / country code', () => {
    expect(normalizePhoneKey('+1 (415) 555-0134')).toBe('4155550134')
    expect(normalizePhoneKey('415.555.0134')).toBe('4155550134')
    expect(normalizePhoneKey('555-0134')).toBe('5550134')
    expect(normalizePhoneKey('')).toBeNull()
    // the same human number in two formats resolves to ONE key (dedupe correctness)
    expect(normalizePhoneKey('001-415-555-0134')).toBe(normalizePhoneKey('(415) 555 0134'))
  })
})

describe('pending lead-grab cookie round-trip', () => {
  it('encodes + parses a valid grab', () => {
    const grab: PendingLeadGrab = { s: 'space-1', d: 'space_qr', c: 'code-1', w: 'The Lab', by: 'owner-1', o: true, l: 'Free class' }
    const enc = encodeLeadGrab(grab)
    expect(enc.length).toBeGreaterThan(0)
    expect(parseLeadGrab(enc)).toEqual(grab)
  })

  it('rejects a grab with no space or a bad door', () => {
    expect(encodeLeadGrab({ s: '', d: 'space_qr' } as PendingLeadGrab)).toBe('')
    expect(encodeLeadGrab({ s: 'x', d: 'bogus' } as unknown as PendingLeadGrab)).toBe('')
    expect(parseLeadGrab('')).toBeNull()
    expect(parseLeadGrab('not-json')).toBeNull()
    expect(parseLeadGrab(encodeURIComponent(JSON.stringify({ s: 'x', d: 'bogus' })))).toBeNull()
  })
})

describe('immutable entry-point row (set-once, well-formed)', () => {
  it('builds a normalized row and is deterministic for the same input', () => {
    const input = {
      spaceId: 'space-1',
      contactId: 'contact-1',
      door: 'space_qr' as const,
      label: '  Free  class  ',
      where: '  The Lab  ',
      capturedByProfileId: 'owner-1',
      codeId: 'code-1',
    }
    const a = buildEntryPointRow(input)
    const b = buildEntryPointRow(input)
    expect(a).toEqual(b)
    expect(a?.kind).toBe('space_qr')
    expect(a?.label).toBe('Free class')
    expect(a?.captured_where).toBe('The Lab')
    expect(a?.space_id).toBe('space-1')
    expect(a?.contact_id).toBe('contact-1')
  })

  it('falls back to the door label and null met-context when unset', () => {
    const row = buildEntryPointRow({ spaceId: 's', contactId: 'c', door: 'lead_magnet' })
    expect(row?.label).toBe('Lead magnet')
    expect(row?.captured_where).toBeNull()
    expect(row?.captured_by_profile_id).toBeNull()
    expect(row?.code_id).toBeNull()
  })

  it('returns null for an invalid input (missing ids or unknown door)', () => {
    expect(buildEntryPointRow({ spaceId: '', contactId: 'c', door: 'space_qr' })).toBeNull()
    expect(buildEntryPointRow({ spaceId: 's', contactId: '', door: 'space_qr' })).toBeNull()
    expect(buildEntryPointRow({ spaceId: 's', contactId: 'c', door: 'bogus' as unknown as never })).toBeNull()
  })
})

// Per-space contact tenancy (ADR-624): the email lookup behind captureLead MUST be scoped to the
// capture's space_id. Under the per-space unique index an unscoped email lookup can span Spaces and
// throw on a multi-row address, so this locks the scope in.
describe('findContactByEmail is space-scoped (per-space tenancy, ADR-624)', () => {
  beforeEach(() => {
    chains.length = 0
  })

  it('scopes the contacts email lookup to the capture space_id (never an unscoped email match)', async () => {
    await captureLead({ spaceId: 'space-1', door: 'lead_magnet', email: 'Jo@Example.com' })

    // The lookup chain is the `contacts` query that matched on email. It must ALSO have filtered space_id.
    const lookup = chains.find(
      (c) => c.table === 'contacts' && c.calls.some(([m, a]) => m === 'ilike' && a[0] === 'email'),
    )
    expect(lookup, 'expected a contacts email lookup to have run').toBeTruthy()
    const eqCalls = lookup!.calls.filter(([m]) => m === 'eq')
    expect(eqCalls).toContainEqual(['eq', ['space_id', 'space-1']])
    // And the email match is present on the same chain (proving the scope + email dedupe are together).
    expect(lookup!.calls).toContainEqual(['ilike', ['email', 'jo@example.com']])
  })
})

// The four front-door WRAPPERS (doors 2 to 5) each pre-set the door + consent posture, so the surface
// on top calls one function. These lock what CONSENT each writes onto the sealed lead: capture !=
// marketing consent, except the consent-native lead magnet. The mocked contacts row starts 'unknown'.
describe('front-door wrappers seal the right consent (doors 2 to 5)', () => {
  beforeEach(() => {
    chains.length = 0
  })

  /** Any consent_state written onto a `contacts` UPDATE across the recorded chains. */
  const consentWrites = (): string[] => {
    const out: string[] = []
    for (const c of chains) {
      if (c.table !== 'contacts') continue
      for (const [method, args] of c.calls) {
        if (method === 'update') {
          const patch = args[0] as Record<string, unknown>
          if (patch && typeof patch === 'object' && 'consent_state' in patch) out.push(String(patch.consent_state))
        }
      }
    }
    return out
  }

  it('lead magnet is consent-native: it lifts the sealed lead to subscribed (mailable)', async () => {
    const res = await captureLeadMagnet({ spaceId: 'space-1', email: 'jo@example.com', magnetLabel: 'Guide' })
    expect(res).not.toBeNull()
    expect(consentWrites()).toContain('subscribed')
  })

  it('event capture is NOT mailable: the sealed lead stays unknown (no consent lift)', async () => {
    await captureEventLead({ spaceId: 'space-1', email: 'jo@example.com', eventTitle: 'Sunday Sit', tier: 'attended' })
    expect(consentWrites()).not.toContain('subscribed')
  })

  it('share-back is NOT mailable: a swap does not subscribe anyone', async () => {
    await captureShareBack({ spaceId: 'space-1', email: 'jo@example.com' })
    expect(consentWrites()).not.toContain('subscribed')
  })

  it('warm intro capture is NOT mailable until accepted (double opt-in)', async () => {
    const res = await captureWarmIntro({ spaceId: 'space-1', email: 'jo@example.com', vouchedByProfileId: 'owner-1' })
    expect(res).not.toBeNull()
    expect(consentWrites()).not.toContain('subscribed')
  })
})

// The accept step IS the opt-in: acceptWarmIntro flips the sealed lead mailable and logs it.
describe('acceptWarmIntro flips the lead mailable + logs the accept', () => {
  beforeEach(() => {
    chains.length = 0
  })

  it('writes consent_state subscribed and logs an intro_accepted touchpoint', async () => {
    const ok = await acceptWarmIntro('space-1', 'c1')
    expect(ok).toBe(true)

    // The consent flip lands on a contacts update.
    const flipped = chains.some(
      (c) =>
        c.table === 'contacts' &&
        c.calls.some(([m, a]) => m === 'update' && (a[0] as Record<string, unknown>)?.consent_state === 'subscribed'),
    )
    expect(flipped).toBe(true)

    // The accept is logged as a touchpoint on the timeline.
    const logged = chains.some(
      (c) =>
        c.table === 'lead_touchpoints' &&
        c.calls.some(([m, a]) => m === 'insert' && JSON.stringify(a[0]).includes('intro_accepted')),
    )
    expect(logged).toBe(true)
  })
})
