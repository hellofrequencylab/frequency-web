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
} from './map'
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
    const data = mapProfileData(wellnessStudioFixture, { commercial: 'allow' })
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
    const data = mapProfileData(wellnessStudioFixture, { commercial: 'withhold' })
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
