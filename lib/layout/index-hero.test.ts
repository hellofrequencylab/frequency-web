import { describe, it, expect, vi, beforeEach } from 'vitest'

// The two settings readers are the only things standing between this module and a database, so they
// are the only things mocked. Everything else under test is the real code path a page takes.
const getPageHeaderImage = vi.fn<(route: string) => Promise<string | null>>()
const getPageHeaderFocus = vi.fn<(route: string) => Promise<string | null>>()
const resolveHeaderElement = vi.fn()

vi.mock('@/lib/page-settings/store', () => ({
  getPageHeaderImage: (route: string) => getPageHeaderImage(route),
  getPageHeaderFocus: (route: string) => getPageHeaderFocus(route),
}))
vi.mock('@/lib/elements/header', () => ({
  resolveHeaderElement: (opts: unknown) => resolveHeaderElement(opts),
}))

const {
  INDEX_HERO_DEFAULTS,
  indexHeroDefaultsFor,
  pickIndexHero,
  resolveIndexHero,
} = await import('./index-hero')

const SHIPPED_HEADER = { layout: 'overlay' as const, height: 'large' as const, scrim: true }

/** The pure ladder with only the rungs a case cares about supplied. */
function pick(route: string, over: Partial<Parameters<typeof pickIndexHero>[1]> = {}, opts = {}) {
  return pickIndexHero(route, { operatorImage: null, operatorFocus: null, header: SHIPPED_HEADER, ...over }, opts)
}

beforeEach(() => {
  vi.clearAllMocks()
  getPageHeaderImage.mockResolvedValue(null)
  getPageHeaderFocus.mockResolvedValue(null)
  resolveHeaderElement.mockResolvedValue(SHIPPED_HEADER)
})

describe('the image precedence ladder', () => {
  it('rung 1 — the operator Settings image beats everything below it', () => {
    const hero = pick(
      '/library',
      { operatorImage: '/uploads/operator.jpg' },
      { contentImage: '/content.jpg', fallbackImage: '/explicit.jpg' },
    )
    expect(hero.heroImage).toBe('/uploads/operator.jpg')
  })

  it('rung 2 — the page-content hero wins when the operator has set none', () => {
    const hero = pick('/library', {}, { contentImage: '/content.jpg', fallbackImage: '/explicit.jpg' })
    expect(hero.heroImage).toBe('/content.jpg')
  })

  it('rung 3a — an explicit fallbackImage wins over the route map', () => {
    const hero = pick('/library', {}, { fallbackImage: '/explicit.jpg' })
    expect(hero.heroImage).toBe('/explicit.jpg')
  })

  it('rung 3b — the route section default carries the band when nothing above it is set', () => {
    // The exact stanza /library, /journeys and /practices each hardcoded before this module existed.
    expect(pick('/library').heroImage).toBe('/images/site/community-1.jpg')
    expect(pick('/journeys').heroImage).toBe('/images/site/nature-viewing-sunset.jpg')
    expect(pick('/practices').heroImage).toBe('/images/site/meditation-circle.jpg')
  })

  it('rung 4 — THE NULL TAIL: no operator image, no content hero, no section cover = null', () => {
    // null is a RESULT, not a failure: IndexTemplate's overlay branch renders the neutral gradient
    // band for it, which is what /network and /journeys/mine have shipped since they adopted.
    const hero = pick('/network')
    expect(hero.heroImage).toBeNull()
    expect(hero.heroOverlay).toBe(true)
  })

  it('rung 4 — an unmapped route also lands on the null tail rather than throwing', () => {
    expect(pick('/somewhere/nobody/mapped').heroImage).toBeNull()
  })
})

describe('the focal point rides the operator image only', () => {
  it('applies the focal point to the operator’s own upload', () => {
    const hero = pick('/library', { operatorImage: '/uploads/op.jpg', operatorFocus: '20% 80%' })
    expect(hero.heroFocus).toBe('20% 80%')
  })

  it('drops a stale focal point when a FALLBACK image is showing', () => {
    // A focal point is picked against one photo. Cropping the section default by those coordinates
    // would frame something nobody chose, which is why every hand-rolled stanza guarded this.
    const hero = pick('/library', { operatorFocus: '20% 80%' }, { contentImage: '/content.jpg' })
    expect(hero.heroImage).toBe('/content.jpg')
    expect(hero.heroFocus).toBeNull()
  })
})

describe('the short / large split is data, not page taste', () => {
  it('gives discovery sections the tall directory band', () => {
    expect(indexHeroDefaultsFor('/practices').size).toBe('large')
    expect(indexHeroDefaultsFor('/journeys').size).toBe('large')
    expect(indexHeroDefaultsFor('/library').size).toBe('large')
    expect(indexHeroDefaultsFor('/network').size).toBe('large')
  })

  it('gives personal / utility surfaces the short band', () => {
    expect(indexHeroDefaultsFor('/journeys/mine').size).toBe('short')
    expect(indexHeroDefaultsFor('/network/contacts').size).toBe('short')
    expect(indexHeroDefaultsFor('/network/friends').size).toBe('short')
  })

  it('resolves the LONGEST matching prefix, so a nested utility row beats its section', () => {
    // '/journeys/mine' matches both rows; the specific one must win or the management space
    // silently inherits the 24rem discovery billboard.
    expect(indexHeroDefaultsFor('/journeys/mine')).toEqual({ image: null, size: 'short' })
    expect(indexHeroDefaultsFor('/journeys/mine/anything')).toEqual({ image: null, size: 'short' })
  })

  it('never prefix-matches a sibling route that merely starts with the same letters', () => {
    // '/networking' is not under '/network'.
    expect(indexHeroDefaultsFor('/networking')).toEqual({ image: null, size: 'large' })
  })

  it('every default points at a real size tier and an absolute image path', () => {
    for (const row of INDEX_HERO_DEFAULTS) {
      expect(['short', 'standard', 'large', 'tall']).toContain(row.size)
      if (row.image !== null) expect(row.image.startsWith('/images/site/')).toBe(true)
    }
  })
})

describe('resolveIndexHero (the async wrapper)', () => {
  it('reproduces the shipped placeholder band for /network', async () => {
    const hero = await resolveIndexHero('/network')
    expect(hero).toEqual({
      heroImage: null,
      heroFocus: null,
      heroOverlay: true,
      heroLayout: 'overlay',
      heroSize: 'large',
      heroScrim: true,
    })
  })

  it('passes the route’s section size to the header element as the SURFACE default', async () => {
    await resolveIndexHero('/journeys/mine')
    expect(resolveHeaderElement).toHaveBeenCalledWith({ defaults: { layout: 'overlay', height: 'short' } })
  })

  it('lets an operator height master beat the route default', async () => {
    resolveHeaderElement.mockResolvedValue({ layout: 'identity', height: 'tall', scrim: false })
    const hero = await resolveIndexHero('/network/friends')
    expect(hero.heroSize).toBe('tall')
    expect(hero.heroLayout).toBe('identity')
    expect(hero.heroScrim).toBe(false)
  })

  it('skips the focal-point read entirely when there is no operator image', async () => {
    await resolveIndexHero('/library')
    expect(getPageHeaderFocus).not.toHaveBeenCalled()
  })

  it('reads the focal point when the operator HAS set an image', async () => {
    getPageHeaderImage.mockResolvedValue('/uploads/op.jpg')
    getPageHeaderFocus.mockResolvedValue('50% 10%')
    const hero = await resolveIndexHero('/library')
    expect(hero).toMatchObject({ heroImage: '/uploads/op.jpg', heroFocus: '50% 10%' })
  })

  it('FAIL-SAFE: a throwing settings read still yields a renderable band', async () => {
    getPageHeaderImage.mockRejectedValue(new Error('page_settings is down'))
    const hero = await resolveIndexHero('/practices')
    // The section default still paints; only the operator's own choices are lost.
    expect(hero).toEqual({
      heroImage: '/images/site/meditation-circle.jpg',
      heroFocus: null,
      heroOverlay: true,
      heroLayout: 'overlay',
      heroSize: 'large',
      heroScrim: true,
    })
  })
})
