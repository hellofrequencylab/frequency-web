import { describe, it, expect, vi, beforeEach } from 'vitest'

// The ONE thing standing between this module and a database is the admin client, so it is the only
// thing mocked. Everything else under test is the real code path a page takes.
const from = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from }) }))

const {
  SITE_SCOPE,
  routeScopeChain,
  longestPrefixRow,
  pickCascade,
  resolveContentCascade,
} = await import('./content-cascade')

/** Stand the mocked client up over a fixed set of `page_content` rows. The mock APPLIES the
 *  `WHERE route IN (...)` filter itself, so a test can never pass because the module asked for the
 *  wrong scope keys and the stub handed everything back anyway. */
function withRows(rows: Array<Record<string, unknown>>) {
  from.mockReturnValue({
    select: () => ({
      in: (_col: string, chain: string[]) =>
        Promise.resolve({ data: rows.filter((r) => chain.includes(r.route as string)), error: null }),
    }),
  })
}

const row = (route: string, o: Record<string, string | null> = {}) => ({
  route,
  title: null,
  description: null,
  hero_image: null,
  cta_label: null,
  cta_href: null,
  ...o,
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('routeScopeChain — the scopes, most specific first', () => {
  it('a section root reads itself and the site rung', () => {
    expect(routeScopeChain('/events')).toEqual(['/events', SITE_SCOPE])
  })

  it('a child route inserts its section between page and site', () => {
    expect(routeScopeChain('/events/calendar')).toEqual(['/events/calendar', '/events', SITE_SCOPE])
  })

  it('every ancestor segment is a rung, nearest first', () => {
    expect(routeScopeChain('/network/friends/x')).toEqual([
      '/network/friends/x',
      '/network/friends',
      '/network',
      SITE_SCOPE,
    ])
  })

  it("'/' is its own page rung and is NEVER inserted as an ancestor", () => {
    // The landmine this guards: making '/' a section rung would promote the home page's SEO copy
    // to the default for every page in the app.
    expect(routeScopeChain('/')).toEqual(['/', SITE_SCOPE])
    expect(routeScopeChain('/events/calendar')).not.toContain('/')
  })

  it('a trailing slash resolves to the same chain as the clean path', () => {
    expect(routeScopeChain('/events/')).toEqual(routeScopeChain('/events'))
  })

  it('a key that is not root-relative gets the site rung only', () => {
    expect(routeScopeChain('events')).toEqual([SITE_SCOPE])
    expect(routeScopeChain(SITE_SCOPE)).toEqual([SITE_SCOPE])
  })
})

describe('longestPrefixRow — the shared primitive', () => {
  const rows = [{ prefix: '/network' }, { prefix: '/network/friends' }, { prefix: '/journeys' }]

  it('the longest matching prefix wins regardless of table order', () => {
    expect(longestPrefixRow('/network/friends', rows)?.prefix).toBe('/network/friends')
    expect(longestPrefixRow('/network/contacts', rows)?.prefix).toBe('/network')
  })

  it('matches on a segment boundary, never on a raw string prefix', () => {
    expect(longestPrefixRow('/networking', rows)).toBeNull()
  })

  it('an unmapped route returns null', () => {
    expect(longestPrefixRow('/library', rows)).toBeNull()
  })
})

describe('the precedence ladder — every rung', () => {
  const chain = routeScopeChain('/events/calendar')
  const FALLBACK = { title: 'Coded title', description: 'Coded description', heroImage: '/coded.jpg' }

  it('rung 1 — the PAGE row beats the section, the site and the code', () => {
    const r = pickCascade(
      chain,
      {
        '/events/calendar': { heroImage: '/page.jpg' },
        '/events': { heroImage: '/section.jpg' },
        [SITE_SCOPE]: { heroImage: '/site.jpg' },
      },
      FALLBACK,
    )
    expect(r.heroImage).toBe('/page.jpg')
    expect(r.origin.hero).toBe('page')
  })

  it('rung 2 — the SECTION row beats the site and the code', () => {
    const r = pickCascade(
      chain,
      { '/events': { heroImage: '/section.jpg' }, [SITE_SCOPE]: { heroImage: '/site.jpg' } },
      FALLBACK,
    )
    expect(r.heroImage).toBe('/section.jpg')
    expect(r.origin.hero).toBe('section')
  })

  it('rung 2 — the NEAREST section wins on a three-deep route', () => {
    const deep = routeScopeChain('/network/friends/x')
    const r = pickCascade(
      deep,
      { '/network': { heroImage: '/far.jpg' }, '/network/friends': { heroImage: '/near.jpg' } },
      {},
    )
    expect(r.heroImage).toBe('/near.jpg')
  })

  it('rung 3 — the SITE row beats the code', () => {
    const r = pickCascade(chain, { [SITE_SCOPE]: { heroImage: '/site.jpg' } }, FALLBACK)
    expect(r.heroImage).toBe('/site.jpg')
    expect(r.origin.hero).toBe('site')
  })

  it("rung 4 — the page's coded copy, and an empty table is a RESULT not a failure", () => {
    const r = pickCascade(chain, {}, FALLBACK)
    expect(r).toMatchObject({ title: 'Coded title', description: 'Coded description', heroImage: '/coded.jpg' })
    expect(r.origin.hero).toBe('fallback')
  })

  it('the tail is null when neither the table nor the code has a hero', () => {
    expect(pickCascade(chain, {}, { title: 't', description: 'd' }).heroImage).toBeNull()
  })

  it('a blank stored value is not a value — it falls through to the next rung', () => {
    const r = pickCascade(
      chain,
      { '/events/calendar': { heroImage: '   ' }, '/events': { heroImage: '/section.jpg' } },
      {},
    )
    expect(r.heroImage).toBe('/section.jpg')
  })
})

describe('the cascade is FIELD-level, not row-level', () => {
  it('a page row that sets only the title still inherits the section hero', () => {
    const r = pickCascade(
      routeScopeChain('/events/calendar'),
      { '/events/calendar': { title: 'Calendar' }, '/events': { heroImage: '/section.jpg' } },
      { title: 'Coded', description: 'Coded description' },
    )
    expect(r.title).toBe('Calendar')
    expect(r.heroImage).toBe('/section.jpg')
  })
})

describe('identity fields do NOT inherit', () => {
  const chain = routeScopeChain('/events/calendar')

  it("a section's title never renames the page beneath it", () => {
    const r = pickCascade(chain, { '/events': { title: 'Events' } }, { title: 'Calendar', description: 'd' })
    expect(r.title).toBe('Calendar')
    expect(r.origin.title).toBe('fallback')
  })

  it("a section's description never becomes the child's meta description", () => {
    // Inheriting it would emit one description across a whole section — the duplicate-metadata
    // pattern, manufactured by the cascade itself.
    const r = pickCascade(chain, { '/events': { description: 'All the Events.' } }, { title: 't', description: 'Coded.' })
    expect(r.description).toBe('Coded.')
    expect(r.origin.description).toBe('fallback')
  })

  it('the page rung still sets them', () => {
    const r = pickCascade(chain, { '/events/calendar': { title: 'Calendar', description: 'By month.' } }, { title: 't', description: 'd' })
    expect(r).toMatchObject({ title: 'Calendar', description: 'By month.' })
    expect(r.origin).toMatchObject({ title: 'page', description: 'page' })
  })
})

describe('the CTA resolves as ONE unit', () => {
  const chain = routeScopeChain('/circles/mindless')

  it('a complete section CTA is inherited whole', () => {
    const r = pickCascade(chain, { '/circles': { ctaLabel: 'Start a Circle', ctaHref: '/circles/new' } }, {})
    expect(r).toMatchObject({ ctaLabel: 'Start a Circle', ctaHref: '/circles/new' })
    expect(r.origin.cta).toBe('section')
  })

  it("an incomplete rung does not render, at the section rung as at any other", () => {
    // This is production's real `/circles` row: a label with no href.
    const r = pickCascade(chain, { '/circles': { ctaLabel: 'Start a Circle' } }, {})
    expect(r.ctaLabel).toBeNull()
    expect(r.ctaHref).toBeNull()
    expect(r.origin.cta).toBe('fallback')
  })

  it('a page label is NEVER spliced onto a section link', () => {
    const r = pickCascade(
      chain,
      { '/circles/mindless': { ctaLabel: 'Join' }, '/circles': { ctaHref: '/circles/new' } },
      {},
    )
    // The nearest scope that speaks about the CTA owns it, incomplete or not.
    expect(r.ctaLabel).toBeNull()
    expect(r.ctaHref).toBeNull()
  })

  it('a complete page CTA beats a complete section CTA', () => {
    const r = pickCascade(
      chain,
      {
        '/circles/mindless': { ctaLabel: 'Join', ctaHref: '/circles/mindless/join' },
        '/circles': { ctaLabel: 'Start a Circle', ctaHref: '/circles/new' },
      },
      {},
    )
    expect(r).toMatchObject({ ctaLabel: 'Join', ctaHref: '/circles/mindless/join' })
    expect(r.origin.cta).toBe('page')
  })

  it("the coded fallback's CTA still applies when no rung speaks", () => {
    const r = pickCascade(chain, {}, { ctaLabel: 'Coded', ctaHref: '/coded' })
    expect(r).toMatchObject({ ctaLabel: 'Coded', ctaHref: '/coded' })
  })
})

describe('resolveContentCascade (the async wrapper)', () => {
  it('reads every scope in ONE query and folds them', async () => {
    withRows([row('/events', { hero_image: '/section.jpg' })])
    const r = await resolveContentCascade('/events/calendar', { title: 'Calendar', description: 'd' })
    expect(r.heroImage).toBe('/section.jpg')
    expect(r.title).toBe('Calendar')
    expect(from).toHaveBeenCalledTimes(1)
  })

  it('the production shape: a section hero reaches the page beneath it', async () => {
    // The six real rows all sit on section roots and all of them set only `hero_image`.
    withRows([row('/practices', { hero_image: '/uploads/practices.jpg' })])
    const r = await resolveContentCascade('/practices/8add58b1', { title: 'A Practice', description: 'd' })
    expect(r.heroImage).toBe('/uploads/practices.jpg')
    expect(r.origin.hero).toBe('section')
  })

  it('a route with no row anywhere resolves to its coded copy', async () => {
    withRows([])
    const r = await resolveContentCascade('/library/x', { title: 'Coded', description: 'd' })
    expect(r).toMatchObject({ title: 'Coded', heroImage: null })
  })

  it('FAIL-SAFE: a database error degrades to the coded copy, never to a throw', async () => {
    // A distinct route from every other case here, so a memoized read can never stand in for the
    // throw this is asserting.
    from.mockImplementation(() => { throw new Error('down') })
    const r = await resolveContentCascade('/classifieds/broken', { title: 'Coded', description: 'd' })
    expect(r.title).toBe('Coded')
    expect(r.heroImage).toBeNull()
  })
})
