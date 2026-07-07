import { describe, it, expect } from 'vitest'
import {
  slugifyName,
  resolveSlug,
  resolveAccent,
  mapIdentity,
  mapProfileData,
  composeBlockOrder,
  mapBlockContent,
  composeLayout,
  buildPlan,
  isReadyMediaUrl,
  commercialFieldClears,
  prosePublishes,
  type CommercialPolicy,
} from './map'
import type { ProvenanceLedger } from './schema'
import { sanitizeEntityLayout, resolveRows } from '@/lib/entity-blocks/layout'
import type { BusinessProfile } from './schema'
import { wellnessStudioFixture } from './fixtures/wellness-studio'

// The PURE mapping contract (P0, docs/BUSINESS-IMPORTER.md §5). A hand-authored BusinessProfile maps
// deterministically to profileData + an EntityLayout jsonb + record payloads, with ZERO AI and ZERO DB.
// If this holds, the materializer's DB layer just runs these payloads through the real stores.

describe('slugifyName / resolveSlug', () => {
  it('derives a safe slug from a name', () => {
    expect(slugifyName('Still Water Wellness')).toBe('still-water-wellness')
    expect(slugifyName('Café  &  Co.')).toBe('cafe-co')
    expect(slugifyName('   ---   ')).toBe('')
  })

  it('prefers an explicit valid slug, else derives from the name', () => {
    expect(resolveSlug({ name: 'X Co', slug: 'my-handle', type: 'business' })).toBe('my-handle')
    expect(resolveSlug({ name: 'X Co', slug: 'Not A Slug!', type: 'business' })).toBe('x-co')
    expect(resolveSlug({ name: '', type: 'business' })).toBe('')
  })
})

describe('resolveAccent', () => {
  it('keeps a valid token accent', () => {
    expect(resolveAccent({ name: 'x', type: 'business', accent: '--color-signal' })).toBe('--color-signal')
  })
  it('normalizes a bare or short hex to #rrggbb', () => {
    expect(resolveAccent({ name: 'x', type: 'business', accent: '2f6fb0' })).toBe('#2f6fb0')
    expect(resolveAccent({ name: 'x', type: 'business', accent: '#abc' })).toBe('#aabbcc')
  })
  it('drops an unknown token / junk', () => {
    expect(resolveAccent({ name: 'x', type: 'business', accent: 'not-a-token' })).toBeNull()
    expect(resolveAccent({ name: 'x', type: 'business' })).toBeNull()
  })
})

describe('mapIdentity', () => {
  it('maps identity columns and folds an unknown type to business', () => {
    const id = mapIdentity(
      { name: 'Still Water', type: 'nonprofit', tagline: 'calm', about: 'hi' },
      { slug: 'still-water', accent: '--color-signal' },
    )
    expect(id).toMatchObject({
      slug: 'still-water',
      name: 'Still Water',
      type: 'nonprofit',
      brandName: 'Still Water',
      tagline: 'calm',
      brandAccent: '--color-signal',
      about: 'hi',
    })
  })
  it('stores a ready media URL and ignores a bare storage path', () => {
    expect(isReadyMediaUrl('https://cdn.example/logo.png')).toBe(true)
    expect(isReadyMediaUrl('1234-abc.png')).toBe(false)
    const withUrl = mapIdentity(
      { name: 'x', type: 'business', media: { logoPath: 'https://cdn.example/l.png', heroPath: 'bare-path.jpg' } },
      { slug: 'x', accent: null },
    )
    expect(withUrl.brandLogoUrl).toBe('https://cdn.example/l.png')
    expect(withUrl.coverImageUrl).toBeNull() // bare path is not stored (needs upload, P1)
  })
})

describe('mapProfileData', () => {
  it('maps contact / hours / socials / offerings / rating (allow policy)', () => {
    const data = mapProfileData(wellnessStudioFixture, 'allow')
    expect(data.address).toContain('Elm Street')
    expect(data.phone).toBe('(503) 555-0142')
    expect(data.email).toBe('hello@stillwater.example')
    expect(data.hours).toContain('Mon to Fri')
    expect(data.website).toBe('https://stillwater.example')
    expect(data.socials).toEqual([
      { platform: 'instagram', url: 'https://instagram.com/stillwaterpdx' },
      { platform: 'google', url: 'https://g.page/stillwaterpdx' },
    ])
    expect(data.offerings?.length).toBe(3)
    expect(data.offerings?.[0]).toMatchObject({ title: 'Drop-in class', price: 22, priceModel: 'fixed' })
    expect(data.rating).toBe('4.9')
    expect(data.ratingCount).toBe('212 reviews')
  })

  it('WITHHOLDS commercial facts under the gate policy (address/phone/email/hours/rating/price)', () => {
    const data = mapProfileData(wellnessStudioFixture, 'withhold')
    // Commercial facts are withheld...
    expect(data.address).toBeUndefined()
    expect(data.phone).toBeUndefined()
    expect(data.email).toBeUndefined()
    expect(data.hours).toBeUndefined()
    expect(data.rating).toBeUndefined()
    expect(data.ratingCount).toBeUndefined()
    // ...but the non-commercial fields survive, and offerings keep title/blurb minus price.
    expect(data.website).toBe('https://stillwater.example')
    expect(data.offerings?.length).toBe(3)
    expect(data.offerings?.every((o) => o.price === undefined)).toBe(true)
    expect(data.offerings?.[0].title).toBe('Drop-in class')
  })

  // REGRESSION (finding #1): priceModel + currency are commercial claims too ("Free", "From $95"),
  // so under withhold they must be stripped ALONGSIDE price, not survive it.
  it('withholds an offering priceModel + currency together with the price', () => {
    const profile = {
      name: 'Spa',
      type: 'business' as const,
      offerings: [{ title: 'Massage', price: 95, currency: 'USD', priceModel: 'from' as const, durationMinutes: 60 }],
    }
    const withheld = mapProfileData(profile, 'withhold').offerings?.[0]
    expect(withheld?.price).toBeUndefined()
    expect(withheld?.priceModel).toBeUndefined()
    expect(withheld?.currency).toBeUndefined()
    // The non-commercial title + duration survive.
    expect(withheld?.title).toBe('Massage')
    expect(withheld?.durationMinutes).toBe(60)
    // Under allow, all three publish.
    const allowed = mapProfileData(profile, 'allow').offerings?.[0]
    expect(allowed).toMatchObject({ price: 95, currency: 'USD', priceModel: 'from' })
  })

  // REGRESSION (finding #3): the map is an INDEPENDENT per-field ledger gate. A verified fact
  // publishes; an uncleared fact on the SAME ledger is withheld, even though the flag is not 'withhold'.
  it('re-derives per field from a ledger: verified publishes, uncleared is withheld', () => {
    const profile = {
      name: 'Cafe',
      type: 'business' as const,
      contact: { address: '123 Main St', phone: '555-1212' },
    }
    const ledger = {
      'contact.address': [{ kind: 'fact' as const, confidence: 0.9, verifiedBy: 'auto' as const, snippet: '123 Main St' }],
      // phone entry is inferred (never verified) -> must be withheld
      'contact.phone': [{ kind: 'inferred' as const, confidence: 0.4 }],
    }
    const data = mapProfileData(profile, { mode: 'ledger', ledger })
    expect(data.address).toBe('123 Main St') // verified -> published (verified path is alive)
    expect(data.phone).toBeUndefined() //        uncleared -> withheld
  })

  it('drops unknown social platforms', () => {
    const data = mapProfileData({
      name: 'x',
      type: 'business',
      contact: { socials: [{ platform: 'myspace', url: 'https://x' }, { platform: 'instagram', url: 'https://ig' }] },
    })
    expect(data.socials).toEqual([{ platform: 'instagram', url: 'https://ig' }])
  })
})

describe('composeBlockOrder', () => {
  it('places only blocks that have content, honoring the layoutHint order', () => {
    const order = composeBlockOrder(wellnessStudioFixture)
    expect(order).toEqual([
      'photoHero',
      'about',
      'story',
      'offerings',
      'booking',
      'events',
      'links',
      'reviews',
      'faq',
      'contact',
    ])
  })

  it('drops blocks with no content and ignores unknown hint ids', () => {
    const minimal: BusinessProfile = {
      name: 'Bare Co',
      type: 'business',
      about: 'Just us.',
      layoutHint: ['photoHero', 'about', 'offerings', 'booking', 'nonsense'],
    }
    // photoHero is always the opener; about has content; offerings/booking/nonsense are dropped.
    expect(composeBlockOrder(minimal)).toEqual(['photoHero', 'about'])
  })
})

describe('mapBlockContent', () => {
  it('emits CORE content-bag keys per block (photoHero / about / story / links)', () => {
    const content = mapBlockContent(wellnessStudioFixture)
    expect(content.photoHero).toMatchObject({
      title: wellnessStudioFixture.tagline,
      eyebrow: 'Wellness studio',
      buttonOn: false,
    })
    expect(content.about).toEqual({ body: wellnessStudioFixture.about })
    expect(content.story).toEqual({ body: wellnessStudioFixture.story })
    expect(content.links).toEqual({
      items: [
        { label: 'instagram', url: 'https://instagram.com/stillwaterpdx' },
        { label: 'website', url: 'https://stillwater.example' },
      ],
    })
  })
})

describe('composeLayout', () => {
  it('builds one 1-column row per placed block, with scoped content bags', () => {
    const layout = composeLayout(wellnessStudioFixture)
    expect(layout.rows?.length).toBe(10)
    expect(layout.rows?.every((r) => r.columns === 1 && r.cells.length === 1)).toBe(true)
    // First row is the hero.
    expect(layout.rows?.[0].cells[0]).toEqual(['photoHero'])
    // Content bags exist only for placed blocks.
    expect(Object.keys(layout.content ?? {}).sort()).toEqual(['about', 'links', 'photoHero', 'story'])
  })

  it('survives sanitizeEntityLayout(space) unchanged (real block ids + valid content)', () => {
    const layout = composeLayout(wellnessStudioFixture)
    const safe = sanitizeEntityLayout(layout, 'space')
    expect(safe).not.toBeNull()
    // Every placed id is a real space block that survives sanitize.
    const placed = safe!.rows!.flatMap((r) => r.cells.flat())
    expect(placed).toContain('offerings')
    expect(placed).toContain('booking')
    expect(placed).toContain('contact')
    // The renderer resolves the same rows for the space kind.
    const rendered = resolveRows(safe, 'space')
    expect(rendered.length).toBeGreaterThan(0)
    expect(rendered[0].cells[0]).toEqual(['photoHero'])
  })
})

describe('buildPlan', () => {
  it('assembles the full plan from the fixture', () => {
    const plan = buildPlan(wellnessStudioFixture)
    expect(plan).not.toBeNull()
    expect(plan!.identity.slug).toBe('still-water-wellness')
    expect(plan!.identity.brandAccent).toBe('--color-signal')
    expect(plan!.profileData.offerings?.length).toBe(3)
    expect(plan!.availability.length).toBe(2)
    expect(plan!.faqs).toEqual([
      { question: 'Do I need to bring my own mat?', answer: 'No. We have plenty of clean mats. Bring one if you prefer your own.', position: 0 },
      { question: 'Are classes beginner friendly?', answer: 'Yes. Every class has options for a first day and a hundredth.', position: 1 },
    ])
    expect(plan!.events.length).toBe(1)
    expect(plan!.events[0]).toMatchObject({ title: 'New Moon Breathwork Circle', location: '218 Elm Street, Portland, OR' })
    expect(plan!.events[0].startsAt).toBe('2099-01-15T02:00:00.000Z')
  })

  it('returns null for a draft with no usable name/slug', () => {
    expect(buildPlan({ name: '', type: 'business' })).toBeNull()
    expect(buildPlan({ name: '   ', type: 'business' })).toBeNull()
  })

  it('drops malformed events / faqs / offerings', () => {
    const plan = buildPlan({
      name: 'Edge Co',
      type: 'business',
      events: [{ title: 'No date' }, { title: '', startsAt: '2099-01-01' }, { title: 'Bad date', startsAt: 'not-a-date' }],
      faq: [{ q: '', a: 'orphan answer' }, { q: 'Real?', a: 'Yes' }],
      offerings: [{ title: '' }, { title: 'Real service', price: 10 }],
    })
    expect(plan!.events).toEqual([]) // all three events are malformed
    expect(plan!.faqs.map((f) => f.question)).toEqual(['Real?'])
    expect(plan!.profileData.offerings?.map((o) => o.title)).toEqual(['Real service'])
  })
})

// ── Commercial-fact gate (docs §4.3): the map as an INDEPENDENT second gate ─────────────

describe('commercialFieldClears — the per-field gate', () => {
  const cleared: ProvenanceLedger = {
    'contact.address': [{ kind: 'fact', confidence: 0.9, verifiedBy: 'auto', snippet: '123 Main' }],
  }
  it('allow clears everything; withhold clears nothing', () => {
    expect(commercialFieldClears('allow', 'contact.address')).toBe(true)
    expect(commercialFieldClears('withhold', 'contact.address')).toBe(false)
  })
  it('a ledger clears only a verified fact', () => {
    expect(commercialFieldClears({ mode: 'ledger', ledger: cleared }, 'contact.address')).toBe(true)
    // An inferred entry never clears.
    const inferred: ProvenanceLedger = { 'contact.phone': [{ kind: 'inferred', confidence: 0.9 }] }
    expect(commercialFieldClears({ mode: 'ledger', ledger: inferred }, 'contact.phone')).toBe(false)
    // A fact WITHOUT verifiedBy never clears.
    const unverified: ProvenanceLedger = { 'rating': [{ kind: 'fact', confidence: 0.9 }] }
    expect(commercialFieldClears({ mode: 'ledger', ledger: unverified }, 'rating')).toBe(false)
    // A field the ledger never mentions is withheld (fail-closed).
    expect(commercialFieldClears({ mode: 'ledger', ledger: cleared }, 'contact.phone')).toBe(false)
  })
})

describe('prosePublishes — generated prose is review-required (finding #2)', () => {
  it('allow publishes all prose; withhold publishes none', () => {
    expect(prosePublishes('allow', 'about')).toBe(true)
    expect(prosePublishes('withhold', 'about')).toBe(false)
  })
  it('under a ledger, generated/inferred prose is WITHHELD but a verified fact publishes', () => {
    const generated: ProvenanceLedger = { about: [{ kind: 'generated', confidence: 0.6 }] }
    expect(prosePublishes({ mode: 'ledger', ledger: generated }, 'about')).toBe(false)
    const verified: ProvenanceLedger = { about: [{ kind: 'fact', confidence: 0.9, verifiedBy: 'auto', snippet: 'x' }] }
    expect(prosePublishes({ mode: 'ledger', ledger: verified }, 'about')).toBe(true)
  })
  it('prose with NO ledger entry is hand-supplied and trusted', () => {
    expect(prosePublishes({ mode: 'ledger', ledger: {} }, 'about')).toBe(true)
  })
})

// REGRESSION (finding #2): a generated `about` that hides a commercial claim
// ("Massages from $95. Call (555) 123-4567.") must NOT auto-publish as trusted prose.
describe('generated prose with an embedded commercial claim is not auto-published', () => {
  const profile: BusinessProfile = {
    name: 'Calm Co',
    type: 'business',
    tagline: 'Open 9 to 5. Massages from $95.',
    about: 'A calm studio. Massages from $95. Call (555) 123-4567.',
    story: 'We opened in 2015. Rated 4.9 by 200 clients.',
  }
  // The verifier marked all three prose fields as generated (no verified citation).
  const ledger: ProvenanceLedger = {
    tagline: [{ kind: 'generated', confidence: 0.6 }],
    about: [{ kind: 'generated', confidence: 0.6 }],
    story: [{ kind: 'generated', confidence: 0.6 }],
  }
  const policy: CommercialPolicy = { mode: 'ledger', ledger }

  it('mapProfileData drops the unverified about prose', () => {
    expect(mapProfileData(profile, policy).about).toBeUndefined()
  })

  it('mapIdentity drops the unverified tagline + about from the Space row', () => {
    const id = mapIdentity(profile, { slug: 'calm-co', accent: null }, policy)
    expect(id.tagline).toBeNull()
    expect(id.about).toBeNull()
  })

  it('mapBlockContent falls the hero back to the name and drops the about/story bodies', () => {
    const content = mapBlockContent(profile, policy)
    // hero title falls back to the (safe) name, never the commercial-claim tagline.
    expect(content.photoHero.title).toBe('Calm Co')
    expect(content.photoHero.subtitle).toBeUndefined()
    expect(content.about).toBeUndefined()
    expect(content.story).toBeUndefined()
  })

  it('composeBlockOrder does not place the about/story prose blocks', () => {
    const order = composeBlockOrder(profile, policy)
    expect(order).not.toContain('about')
    expect(order).not.toContain('story')
  })

  it('but under allow (hand-authored trust) the prose publishes', () => {
    expect(mapProfileData(profile, 'allow').about).toContain('Massages')
    expect(mapIdentity(profile, { slug: 'x', accent: null }, 'allow').tagline).toContain('Massages')
  })
})
