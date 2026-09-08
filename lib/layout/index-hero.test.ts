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
// The copy cascade is rung 2 now (PROG-P6). Only its READ is stubbed — `longestPrefixRow` stays the
// real implementation, since it is the loop `indexHeroDefaultsFor` delegates to.
const resolveContentCascade = vi.fn()
vi.mock('@/lib/layout/content-cascade', async (orig) => ({
  ...(await orig<typeof import('./content-cascade')>()),
  resolveContentCascade: (route: string, fb: unknown) => resolveContentCascade(route, fb),
}))
/** A cascade answer with a hero resolved at the given scope. */
const cascaded = (heroImage: string | null, hero: 'page' | 'section' | 'site' | 'fallback') => ({
  title: '', description: '', heroImage, ctaLabel: null, ctaHref: null,
  origin: { title: 'fallback', description: 'fallback', hero, cta: 'fallback' },
})

const {
  INDEX_HERO_DEFAULTS,
  indexHeroDefaultsFor,
  indexHeroKeyFor,
  pickIndexHero,
  resolveIndexHero,
  asMarketHero,
  resolveMarketHero,
} = await import('./index-hero')

/** Every route the 2026-09-07 slice adopted (ADR-1255), by its literal pathname. The 2026-09-08
 *  kernel change must leave all of them resolving against that exact string. */
const SHIPPED_2026_09_07 = [
  '/help', '/circles/templates', '/crew/leaderboard', '/drafts', '/housing/roommates',
  '/lead/training-library', '/market/manage', '/messages', '/orders', '/partners',
  '/partners/collaborators', '/partners/join', '/search', '/spaces/operating', '/support',
  '/discover/partners', '/discover/practices',
] as const

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
  resolveContentCascade.mockResolvedValue(cascaded(null, 'fallback'))
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
    expect(indexHeroDefaultsFor('/journeys/mine')).toEqual({ image: null, size: 'short', inheritHero: false })
    expect(indexHeroDefaultsFor('/journeys/mine/anything')).toEqual({ image: null, size: 'short', inheritHero: false })
  })

  it('never prefix-matches a sibling route that merely starts with the same letters', () => {
    // '/networking' is not under '/network'.
    expect(indexHeroDefaultsFor('/networking')).toEqual({ image: null, size: 'large', inheritHero: true })
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

describe('rung 2 resolves itself from the copy cascade (PROG-P6, ADR-1122)', () => {
  it("a section's operator hero now reaches the browse page that reads it", async () => {
    // THE BUG THIS CLOSES: '/network' has carried a `page_content.hero_image` in production since
    // June, resolves the same row for its title and description, and dropped the image on the floor
    // because nothing handed it to `resolveIndexHero`.
    resolveContentCascade.mockResolvedValue(cascaded('/uploads/network.jpg', 'page'))
    const hero = await resolveIndexHero('/network')
    expect(hero.heroImage).toBe('/uploads/network.jpg')
  })

  it('an INHERITED hero paints on a discovery surface', async () => {
    resolveContentCascade.mockResolvedValue(cascaded('/uploads/practices.jpg', 'section'))
    expect((await resolveIndexHero('/practices')).heroImage).toBe('/uploads/practices.jpg')
  })

  it('an INHERITED hero is refused by a utility surface, which keeps the gradient band', async () => {
    // '/journeys' carries a hero in production; '/journeys/mine' is a management space and the
    // short/large split says it gets the band without the billboard. `inheritHero: false` is what
    // stops the cascade from quietly overturning that.
    resolveContentCascade.mockResolvedValue(cascaded('/uploads/journeys.jpg', 'section'))
    expect((await resolveIndexHero('/journeys/mine')).heroImage).toBeNull()
  })

  it('a hero set on the utility route ITSELF still wins — that is not inheritance', async () => {
    resolveContentCascade.mockResolvedValue(cascaded('/uploads/mine.jpg', 'page'))
    expect((await resolveIndexHero('/journeys/mine')).heroImage).toBe('/uploads/mine.jpg')
  })

  it('the operator Settings image still outranks the cascade', async () => {
    getPageHeaderImage.mockResolvedValue('/uploads/op.jpg')
    resolveContentCascade.mockResolvedValue(cascaded('/uploads/section.jpg', 'section'))
    expect((await resolveIndexHero('/practices')).heroImage).toBe('/uploads/op.jpg')
  })

  it('an explicit contentImage overrides the read, and an explicit null suppresses it', async () => {
    resolveContentCascade.mockResolvedValue(cascaded('/uploads/section.jpg', 'section'))
    expect((await resolveIndexHero('/practices', { contentImage: '/caller.jpg' })).heroImage).toBe('/caller.jpg')
    // null is a decision, not an absence: fall through to the section default, do not read.
    expect((await resolveIndexHero('/practices', { contentImage: null })).heroImage).toBe(
      '/images/site/meditation-circle.jpg',
    )
    expect(resolveContentCascade).not.toHaveBeenCalled()
  })

  it('FAIL-SAFE: a throwing cascade read still yields a renderable band', async () => {
    resolveContentCascade.mockRejectedValue(new Error('page_content is down'))
    expect((await resolveIndexHero('/practices')).heroImage).toBe('/images/site/meditation-circle.jpg')
  })
})


describe('the editable-index twin: resolveMarketHero (PROG-P4, ADR-1127)', () => {
  // Nine browse render sites head an operator-rearrangeable body with `MarketHero` instead of
  // `IndexTemplate` (PAGE-FRAMEWORK §8.5). Same PageHero underneath, different prop names — and
  // every one of them resolved its image by hand and stopped short of rung 1, so an operator who
  // uploaded a Settings header image for /events or /market watched nothing happen.

  it('re-shapes the resolved band into MarketHero prop names', () => {
    const bag = asMarketHero(
      { heroImage: '/op.jpg', heroFocus: '50% 10%', heroOverlay: true, heroLayout: 'identity', heroSize: 'tall', heroScrim: false },
      '/coded.jpg',
    )
    expect(bag).toEqual({ image: '/op.jpg', focal: '50% 10%', variant: 'identity', size: 'tall', overlay: false })
  })

  it('falls through to the coded cover rather than emitting a null image', () => {
    // `MarketHero` types `image` as a non-null string: the gradient band is a legitimate RESULT on a
    // utility index and a broken header on a hero-led commerce one, so `cover` carries the guarantee.
    const bag = asMarketHero(
      { heroImage: null, heroFocus: null, heroOverlay: true, heroLayout: 'overlay', heroSize: 'large', heroScrim: true },
      '/coded.jpg',
    )
    expect(bag.image).toBe('/coded.jpg')
  })

  it('RUNG 1 NOW REACHES THESE PAGES — the operator Settings image beats the coded cover', async () => {
    // The regression this whole export exists to stop. Before it, /store read `resolveHeaderElement`
    // alone and passed a module constant as `image`, so `page_settings.header_image_url` was dead.
    getPageHeaderImage.mockResolvedValue('/uploads/store.jpg')
    getPageHeaderFocus.mockResolvedValue('20% 80%')
    const bag = await resolveMarketHero('/store', { cover: '/coded.jpg' })
    expect(bag).toMatchObject({ image: '/uploads/store.jpg', focal: '20% 80%' })
  })

  it('rung 2 reaches them too — the page_content hero, via the copy cascade', async () => {
    resolveContentCascade.mockResolvedValue(cascaded('/uploads/section.jpg', 'section'))
    expect((await resolveMarketHero('/market', { cover: '/coded.jpg' })).image).toBe('/uploads/section.jpg')
  })

  it('with nothing set, the coded cover paints — today\'s look, unchanged', async () => {
    expect((await resolveMarketHero('/store', { cover: '/coded.jpg' })).image).toBe('/coded.jpg')
  })

  it('carries the operator header element through for layout / height / scrim', async () => {
    resolveHeaderElement.mockResolvedValue({ layout: 'identity', height: 'tall', scrim: false })
    expect(await resolveMarketHero('/market', { cover: '/coded.jpg' })).toMatchObject({
      variant: 'identity', size: 'tall', overlay: false,
    })
  })

  it('FAIL-SAFE: a throwing settings read still yields a renderable band', async () => {
    getPageHeaderImage.mockRejectedValue(new Error('page_settings is down'))
    expect((await resolveMarketHero('/classifieds', { cover: '/coded.jpg' })).image).toBe('/coded.jpg')
  })
})

describe('the /events/calendar row', () => {
  it('takes the SHORT band — a month grid is a work surface', () => {
    expect(indexHeroDefaultsFor('/events/calendar').size).toBe('short')
  })

  it('still INHERITS the Events section hero, unlike the utility rows', async () => {
    // The two flags are separate on purpose: short is about the BAND, inheritHero is about the
    // IMAGE. The calendar is the Events section wearing a different body, so the operator photo
    // uploaded for /events belongs on it.
    expect(indexHeroDefaultsFor('/events/calendar').inheritHero).toBe(true)
    resolveContentCascade.mockResolvedValue(cascaded('/uploads/events.jpg', 'section'))
    expect((await resolveIndexHero('/events/calendar')).heroImage).toBe('/uploads/events.jpg')
  })
})

describe('the 2026-09-07 adoption rows (LIVE-117, ADR-1255)', () => {
  it('gives the five discovery surfaces the tall directory band', () => {
    for (const route of ['/help', '/partners', '/housing/roommates', '/discover/partners', '/discover/practices']) {
      expect(indexHeroDefaultsFor(route).size).toBe('large')
    }
  })

  it('gives the eleven utility surfaces the short band, and refuses an inherited hero on them', () => {
    for (const route of [
      '/circles/templates', '/crew/leaderboard', '/drafts', '/lead/training-library', '/market/manage',
      '/messages', '/orders', '/partners/join', '/search', '/spaces/operating', '/support',
    ]) {
      expect(indexHeroDefaultsFor(route)).toEqual({ image: null, size: 'short', inheritHero: false })
    }
  })

  it('invents no cover: every new row resolves to the gradient band', () => {
    for (const route of ['/help', '/partners', '/housing/roommates', '/discover/partners', '/discover/practices']) {
      expect(indexHeroDefaultsFor(route).image).toBeNull()
    }
  })

  it('/partners/collaborators takes the section row rather than one of its own', () => {
    // Deliberately unmapped: it is part of the Partners section, which is what a prefix map is for.
    expect(INDEX_HERO_DEFAULTS.some((r) => r.prefix === '/partners/collaborators')).toBe(false)
    expect(indexHeroDefaultsFor('/partners/collaborators')).toEqual(indexHeroDefaultsFor('/partners'))
  })

  it('the nested utility rows still beat their section, longest prefix first', () => {
    // '/partners/join' matches '/partners' too; the specific row must win or a claim flow
    // silently inherits the directory billboard.
    expect(indexHeroDefaultsFor('/partners/join').size).toBe('short')
    expect(indexHeroDefaultsFor('/market/manage').size).toBe('short')
    expect(indexHeroDefaultsFor('/circles/templates').size).toBe('short')
  })

  it('a utility row keeps the gradient when its section carries an operator hero', async () => {
    resolveContentCascade.mockResolvedValue(cascaded('/uploads/partners.jpg', 'section'))
    expect((await resolveIndexHero('/partners/join')).heroImage).toBeNull()
  })

  it('a discovery row DOES take the section hero the cascade hands it', async () => {
    resolveContentCascade.mockResolvedValue(cascaded('/uploads/partners.jpg', 'section'))
    expect((await resolveIndexHero('/discover/partners')).heroImage).toBe('/uploads/partners.jpg')
  })

  it('none of the new prefixes disturbs an existing adopter beneath the same section', () => {
    // '/housing', '/market', '/circles' and '/spaces/directory' are MarketHero adopters that
    // must keep falling through to the map's tail, not pick up a nested utility row.
    expect(indexHeroDefaultsFor('/housing').size).toBe('large')
    expect(indexHeroDefaultsFor('/market').size).toBe('large')
    expect(indexHeroDefaultsFor('/circles').size).toBe('large')
    expect(indexHeroDefaultsFor('/spaces/directory').size).toBe('large')
    expect(indexHeroDefaultsFor('/discover/spaces').size).toBe('large')
  })
})

describe('the prefix key, and the dynamic-route slice (LIVE-117, ADR-1261)', () => {
  describe('the flat lookups the 17 shipped with are unchanged', () => {
    it('every route of the 2026-09-07 slice still keys rung 1 on its own literal pathname', () => {
      // THE PIN. The kernel change makes the settings key a decision of the MAP rather than a
      // synonym for the argument, and the whole safety property is that no shipped page moved:
      // '/help' and '/discover/practices' now carry `keyOn: 'section'`, and for the pages
      // themselves the section key IS the pathname.
      for (const route of SHIPPED_2026_09_07) expect(indexHeroKeyFor(route)).toBe(route)
    })

    it('an unmapped route keys on itself, and a MarketHero route with no row does too', () => {
      expect(indexHeroKeyFor('/somewhere/nobody/mapped')).toBe('/somewhere/nobody/mapped')
      expect(indexHeroKeyFor('/store')).toBe('/store')
      expect(indexHeroKeyFor('/spaces/directory')).toBe('/spaces/directory')
    })

    it('resolveIndexHero reads page_settings on the literal route for a static adopter', async () => {
      await resolveIndexHero('/partners/collaborators')
      expect(getPageHeaderImage).toHaveBeenCalledWith('/partners/collaborators')
    })
  })

  describe('a section key, for the dynamic routes a literal prefix DOES reach', () => {
    it('a help category reads the image an operator set on /help', async () => {
      getPageHeaderImage.mockImplementation(async (route: string) =>
        route === '/help' ? '/uploads/help.jpg' : null,
      )
      getPageHeaderFocus.mockResolvedValue('30% 70%')
      const hero = await resolveIndexHero('/help/getting-started')
      expect(indexHeroKeyFor('/help/getting-started')).toBe('/help')
      expect(hero).toMatchObject({ heroImage: '/uploads/help.jpg', heroFocus: '30% 70%' })
      // The FOCAL POINT has to follow the image to the same key, or it crops a photo by
      // coordinates picked against a different one.
      expect(getPageHeaderFocus).toHaveBeenCalledWith('/help')
    })

    it('a pillar page reads the image an operator set on /discover/practices', async () => {
      getPageHeaderImage.mockImplementation(async (route: string) =>
        route === '/discover/practices' ? '/uploads/library.jpg' : null,
      )
      expect((await resolveIndexHero('/discover/practices/pillar/connection')).heroImage).toBe(
        '/uploads/library.jpg',
      )
    })

    it('RUNG 2 IS NOT RE-KEYED — the copy cascade still climbs the route it was given', async () => {
      // The cascade walks a route's real ancestors, so '/help/x' already inherits '/help'. Handing
      // it the section key instead would cost it every rung in between for no gain.
      await resolveIndexHero('/help/getting-started')
      expect(resolveContentCascade).toHaveBeenCalledWith('/help/getting-started', {})
    })

    it('both dynamic children take their section BAND as well as its key', () => {
      expect(indexHeroDefaultsFor('/help/getting-started').size).toBe('large')
      expect(indexHeroDefaultsFor('/discover/practices/pillar/connection').size).toBe('large')
    })
  })

  describe('the five Space tabs, whose dynamic segment sits in the MIDDLE', () => {
    const TABS = ['journeys', 'loom', 'manage/circles', 'practices'] as const

    it('a pattern row reaches every Space, and names the TAB rather than the section', () => {
      for (const tab of TABS) {
        expect(indexHeroDefaultsFor(`/spaces/acme/${tab}`)).toEqual({
          image: null, size: 'short', inheritHero: false,
        })
      }
      // The public Shows catalog is the one destination of the five.
      expect(indexHeroDefaultsFor('/spaces/acme/podcasts').size).toBe('large')
    })

    it('KEEPS THE LITERAL KEY: a pattern prefix is a matcher, not a key any UI can write', async () => {
      // The on-page Settings panel keys on usePathname(), so '/spaces/_/loom' would be a rung with
      // no writer. Each Space's operator sets their own band, at their own path.
      expect(indexHeroKeyFor('/spaces/acme/loom')).toBe('/spaces/acme/loom')
      await resolveIndexHero('/spaces/acme/loom')
      expect(getPageHeaderImage).toHaveBeenCalledWith('/spaces/acme/loom')
      expect(getPageHeaderImage).not.toHaveBeenCalledWith('/spaces/_/loom')
    })

    it('refuses an inherited hero, so one brand never wears the /spaces marketing photo', async () => {
      resolveContentCascade.mockResolvedValue(cascaded('/uploads/spaces-marketing.jpg', 'section'))
      for (const tab of [...TABS, 'podcasts']) {
        expect((await resolveIndexHero(`/spaces/acme/${tab}`)).heroImage).toBeNull()
      }
    })

    it('a hero set on the tab ITSELF still wins — that is not inheritance', async () => {
      resolveContentCascade.mockResolvedValue(cascaded('/uploads/mine.jpg', 'page'))
      expect((await resolveIndexHero('/spaces/acme/podcasts')).heroImage).toBe('/uploads/mine.jpg')
    })

    it('the tenant rows disturb neither the static /spaces siblings nor the Space profile', () => {
      // '/spaces/operating' and '/spaces/directory' sit at the same depth as a Space slug, and the
      // Space PROFILE tabs (which draw the profile chrome's own band) must stay unmapped.
      expect(indexHeroDefaultsFor('/spaces/operating')).toEqual({ image: null, size: 'short', inheritHero: false })
      expect(indexHeroKeyFor('/spaces/operating')).toBe('/spaces/operating')
      expect(indexHeroDefaultsFor('/spaces/directory')).toEqual({ image: null, size: 'large', inheritHero: true })
      expect(indexHeroDefaultsFor('/spaces/acme')).toEqual({ image: null, size: 'large', inheritHero: true })
      expect(indexHeroDefaultsFor('/spaces/acme/events')).toEqual({ image: null, size: 'large', inheritHero: true })
    })

    it('invents no cover: all five resolve to the gradient band', () => {
      for (const tab of [...TABS, 'podcasts']) {
        expect(indexHeroDefaultsFor(`/spaces/acme/${tab}`).image).toBeNull()
      }
    })
  })

  it('a pattern row is only ever a MATCHER: no row carries both a wildcard and a section key', () => {
    // The dead-rung guard, in the map itself rather than in prose. `page_settings` is an
    // exact-match read and its only writer keys on the live pathname, so a wildcard prefix used as
    // a key would read a row nothing can create.
    for (const row of INDEX_HERO_DEFAULTS) {
      if (row.prefix.split('/').includes('_')) expect(row.keyOn).not.toBe('section')
    }
  })
})
