import { describe, it, expect, vi, beforeEach } from 'vitest'

// The two settings readers are the only things standing between this module and a database, so they
// are the only things mocked. Everything else under test is the real code path a page takes.
const getPageHeaderImage = vi.fn<(route: string, spaceId?: string | null) => Promise<string | null>>()
const getPageHeaderFocus = vi.fn<(route: string, spaceId?: string | null) => Promise<string | null>>()
const resolveHeaderElement = vi.fn()

vi.mock('@/lib/page-settings/store', () => ({
  getPageHeaderImage: (route: string, spaceId?: string | null) => getPageHeaderImage(route, spaceId),
  getPageHeaderFocus: (route: string, spaceId?: string | null) => getPageHeaderFocus(route, spaceId),
}))
vi.mock('@/lib/elements/header', () => ({
  resolveHeaderElement: (opts: unknown) => resolveHeaderElement(opts),
}))

const {
  DETAIL_HERO_DEFAULTS,
  DETAIL_HERO_FALLBACK,
  detailHeroDefaultsFor,
  pickDetailHero,
  resolveDetailHero,
} = await import('./detail-hero')

const SHIPPED_HEADER = { height: 'standard' as const, overlayStyle: 'shadow' as const }

/** The pure ladder with only the rungs a case cares about supplied. */
function pick(route: string, over: Partial<Parameters<typeof pickDetailHero>[1]> = {}, opts = {}) {
  return pickDetailHero(
    route,
    { operatorImage: null, operatorFocus: null, header: SHIPPED_HEADER, ...over },
    opts,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  getPageHeaderImage.mockResolvedValue(null)
  getPageHeaderFocus.mockResolvedValue(null)
  resolveHeaderElement.mockResolvedValue(SHIPPED_HEADER)
})

describe('the image precedence ladder', () => {
  it('rung 1 — the ENTITY’s own cover beats everything below it', () => {
    // The inversion from index-hero: on an entity page the host who uploaded THIS cover outranks
    // the site-wide operator setting, which is the whole design decision (ADR-1115).
    const hero = pick(
      '/practices/abc',
      { operatorImage: '/uploads/operator.jpg' },
      { entityImage: '/uploads/mine.jpg', fallbackImage: '/explicit.jpg' },
    )
    expect(hero.coverImage).toBe('/uploads/mine.jpg')
  })

  it('rung 2 — the operator’s SECTION image stands in when the entity brought none', () => {
    const hero = pick('/practices/abc', { operatorImage: '/uploads/operator.jpg' }, { fallbackImage: '/explicit.jpg' })
    expect(hero.coverImage).toBe('/uploads/operator.jpg')
  })

  it('rung 3a — an explicit fallbackImage wins over the section map', () => {
    const hero = pick('/discover/circles/abc', {}, { fallbackImage: '/explicit.jpg' })
    expect(hero.coverImage).toBe('/explicit.jpg')
  })

  it('rung 3b — the section default carries the band when nothing above it is set', () => {
    // The public Circle read exposes no image at all, so this row is the only thing giving
    // /discover/circles/<id> a cover. It is the rung-3 case, in production.
    expect(pick('/discover/circles/abc').coverImage).toBe('/images/site/group-of-friends.jpg')
  })

  it('rung 4 — the PLACEHOLDER tail: an editable section with nothing to show paints the band', () => {
    // null is a RESULT, not a failure: DetailTemplate renders its neutral gradient placeholder for
    // an explicit null, which on /practices is the empty slot a host can fill in place.
    const hero = pick('/practices/abc')
    expect(hero.coverImage).toBeNull()
  })

  it('rung 4 — the NONE tail: a section a viewer cannot act on renders no cover at all', () => {
    // undefined, not null. DetailTemplate keys on `coverImage !== undefined`, so this page is
    // byte-identical to before it adopted.
    expect(pick('/discover/practices/abc').coverImage).toBeUndefined()
    expect(pick('/discover/topics/breathwork').coverImage).toBeUndefined()
  })

  it('the SAME entity takes different tails on its in-app and public surfaces', () => {
    // The placeholder is an affordance, so it belongs where someone can fill it.
    expect(pick('/practices/abc').coverImage).toBeNull()
    expect(pick('/discover/practices/abc').coverImage).toBeUndefined()
  })

  it('rung 4 — an UNMAPPED route lands on no-cover, so adopting there is a visual no-op', () => {
    // The safety property: the map is the opt-in. A page whose section nobody mapped and whose
    // entity has no image renders exactly as it did before `{...hero}` was spread onto it.
    expect(pick('/hubs/something').coverImage).toBeUndefined()
    expect(pick('/somewhere/nobody/mapped').coverImage).toBeUndefined()
  })

  it('an unmapped route still shows an entity that HAS a cover of its own', () => {
    expect(pick('/hubs/something', {}, { entityImage: '/uploads/mine.jpg' }).coverImage).toBe('/uploads/mine.jpg')
  })

  it('an explicit `tail` option overrides the section’s', () => {
    expect(pick('/discover/practices/abc', {}, { tail: 'placeholder' }).coverImage).toBeNull()
    expect(pick('/practices/abc', {}, { tail: 'none' }).coverImage).toBeUndefined()
  })
})

describe('the focal point travels with its image', () => {
  it('applies the entity’s focal point to the entity’s own cover', () => {
    const hero = pick('/practices/abc', {}, { entityImage: '/uploads/mine.jpg', entityFocus: '20% 80%' })
    expect(hero.coverFocus).toBe('20% 80%')
  })

  it('applies the OPERATOR’s focal point when the operator’s section image is showing', () => {
    // index-hero only ever has one focus-bearing rung; the detail ladder has two, so the rule is
    // stated as "focus travels with its image" rather than "focus rides rung 1".
    const hero = pick('/practices/abc', { operatorImage: '/uploads/op.jpg', operatorFocus: '10% 90%' })
    expect(hero).toMatchObject({ coverImage: '/uploads/op.jpg', coverFocus: '10% 90%' })
  })

  it('drops a stale ENTITY focal point when the operator’s image is the one showing', () => {
    const hero = pick('/practices/abc', { operatorImage: '/uploads/op.jpg' }, { entityFocus: '20% 80%' })
    expect(hero).toMatchObject({ coverImage: '/uploads/op.jpg', coverFocus: null })
  })

  it('drops both focal points when a SECTION DEFAULT is showing', () => {
    // Nobody has ever framed a shipped section photo, so cropping it by someone's coordinates
    // frames something nobody chose.
    const hero = pick('/discover/circles/abc', { operatorFocus: '10% 90%' }, { entityFocus: '20% 80%' })
    expect(hero).toMatchObject({ coverImage: '/images/site/group-of-friends.jpg', coverFocus: null })
  })
})

describe('height and overlay: the entity’s stored choice beats the operator master', () => {
  it('defers to the header element when the host has chosen nothing', () => {
    const hero = pick('/practices/abc', { header: { height: 'tall', overlayStyle: 'fade' } })
    expect(hero).toMatchObject({ coverSize: 'tall', coverOverlayStyle: 'fade' })
  })

  it('lets the host’s own stored height and overlay win', () => {
    // The `hasChannelHeroHeight(theme) ? read… : null` idiom the Channel and Circle pages spell
    // out by hand: a host who picks Standard on an entity whose element says Tall must see it.
    const hero = pick(
      '/practices/abc',
      { header: { height: 'tall', overlayStyle: 'fade' } },
      { entitySize: 'standard', entityOverlayStyle: 'none' },
    )
    expect(hero).toMatchObject({ coverSize: 'standard', coverOverlayStyle: 'none' })
  })

  it('a null entitySize means "not chosen" and defers, rather than forcing a default', () => {
    const hero = pick(
      '/practices/abc',
      { header: { height: 'tall', overlayStyle: 'fade' } },
      { entitySize: null, entityOverlayStyle: null },
    )
    expect(hero).toMatchObject({ coverSize: 'tall', coverOverlayStyle: 'fade' })
  })
})

describe('the section map is data, not page taste', () => {
  it('resolves the LONGEST matching prefix, so the public twin beats a shorter section', () => {
    expect(detailHeroDefaultsFor('/discover/practices/abc').section).toBe('/discover/practices')
    expect(detailHeroDefaultsFor('/practices/abc').section).toBe('/practices')
  })

  it('never prefix-matches a sibling route that merely starts with the same letters', () => {
    // '/practices-archive' is not under '/practices'.
    expect(detailHeroDefaultsFor('/practices-archive/abc')).toEqual({ section: null, ...DETAIL_HERO_FALLBACK })
  })

  it('matches the section route itself, not only its children', () => {
    expect(detailHeroDefaultsFor('/practices').section).toBe('/practices')
  })

  it('an unmapped route resolves to the no-cover fallback with no section key', () => {
    expect(detailHeroDefaultsFor('/nexuses/abc')).toEqual({ section: null, image: null, size: 'standard', tail: 'none' })
  })

  it('every row points at a real size tier, a real tail, and an absolute image path', () => {
    for (const row of DETAIL_HERO_DEFAULTS) {
      expect(['short', 'standard', 'large', 'tall']).toContain(row.size)
      expect(['placeholder', 'none']).toContain(row.tail)
      expect(row.prefix.startsWith('/')).toBe(true)
      if (row.image !== null) expect(row.image.startsWith('/images/site/')).toBe(true)
    }
  })

  it('no two rows declare the same prefix', () => {
    const prefixes = DETAIL_HERO_DEFAULTS.map((r) => r.prefix)
    expect(new Set(prefixes).size).toBe(prefixes.length)
  })
})

describe('resolveDetailHero (the async wrapper)', () => {
  it('reproduces the no-cover result for an unmapped route', async () => {
    const hero = await resolveDetailHero('/hubs/anything')
    expect(hero).toEqual({
      coverImage: undefined,
      coverFocus: null,
      coverSize: 'standard',
      coverOverlayStyle: 'shadow',
    })
  })

  it('asks the header element for the MINIMAL layout, because the h1 lives below the cover', async () => {
    await resolveDetailHero('/practices/abc')
    expect(resolveHeaderElement).toHaveBeenCalledWith({ defaults: { layout: 'minimal', height: 'standard' } })
  })

  it('passes the section’s size to the header element as the SURFACE default', async () => {
    await resolveDetailHero('/practices/abc', { size: 'large' })
    expect(resolveHeaderElement).toHaveBeenCalledWith({ defaults: { layout: 'minimal', height: 'large' } })
  })

  it('lets an operator height/overlay master beat the section default', async () => {
    resolveHeaderElement.mockResolvedValue({ height: 'tall', overlayStyle: 'fade' })
    const hero = await resolveDetailHero('/discover/circles/abc')
    expect(hero).toMatchObject({ coverSize: 'tall', coverOverlayStyle: 'fade' })
  })

  it('reads the operator image against the SECTION route, not the entity route', async () => {
    await resolveDetailHero('/practices/abc-123')
    expect(getPageHeaderImage).toHaveBeenCalledWith('/practices', undefined)
  })

  it('skips the settings read entirely when the entity brought its own cover', async () => {
    const hero = await resolveDetailHero('/practices/abc', { entityImage: '/uploads/mine.jpg' })
    expect(getPageHeaderImage).not.toHaveBeenCalled()
    expect(getPageHeaderFocus).not.toHaveBeenCalled()
    expect(hero.coverImage).toBe('/uploads/mine.jpg')
  })

  it('skips the settings read entirely for an unmapped section', async () => {
    await resolveDetailHero('/somewhere/nobody/mapped')
    expect(getPageHeaderImage).not.toHaveBeenCalled()
  })

  it('skips the focal-point read when the operator has set no section image', async () => {
    await resolveDetailHero('/practices/abc')
    expect(getPageHeaderFocus).not.toHaveBeenCalled()
  })

  it('reads the focal point when the operator HAS set a section image', async () => {
    getPageHeaderImage.mockResolvedValue('/uploads/op.jpg')
    getPageHeaderFocus.mockResolvedValue('50% 10%')
    const hero = await resolveDetailHero('/practices/abc')
    expect(getPageHeaderFocus).toHaveBeenCalledWith('/practices', undefined)
    expect(hero).toMatchObject({ coverImage: '/uploads/op.jpg', coverFocus: '50% 10%' })
  })

  it('carries a spaceId through to both the settings reads and the element layer', async () => {
    getPageHeaderImage.mockResolvedValue('/uploads/op.jpg')
    await resolveDetailHero('/practices/abc', { spaceId: 'space-1' })
    expect(getPageHeaderImage).toHaveBeenCalledWith('/practices', 'space-1')
    expect(getPageHeaderFocus).toHaveBeenCalledWith('/practices', 'space-1')
    expect(resolveHeaderElement).toHaveBeenCalledWith({
      defaults: { layout: 'minimal', height: 'standard' },
      spaceId: 'space-1',
    })
  })

  it('FAIL-SAFE: a throwing settings read still yields a renderable cover', async () => {
    getPageHeaderImage.mockRejectedValue(new Error('page_settings is down'))
    const hero = await resolveDetailHero('/discover/circles/abc')
    // The section default still paints; only the operator's own choices are lost.
    expect(hero).toEqual({
      coverImage: '/images/site/group-of-friends.jpg',
      coverFocus: null,
      coverSize: 'standard',
      coverOverlayStyle: 'shadow',
    })
  })

  it('FAIL-SAFE: a throwing element read never costs the entity its OWN cover', async () => {
    resolveHeaderElement.mockRejectedValue(new Error('element_settings is down'))
    const hero = await resolveDetailHero('/practices/abc', {
      entityImage: '/uploads/mine.jpg',
      entityFocus: '30% 30%',
    })
    expect(hero).toEqual({
      coverImage: '/uploads/mine.jpg',
      coverFocus: '30% 30%',
      coverSize: 'standard',
      coverOverlayStyle: 'shadow',
    })
  })
})
