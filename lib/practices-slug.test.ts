import { describe, it, expect, vi, beforeEach } from 'vitest'

// THE CANONICAL KEY FOR A PUBLIC PRACTICE.
//
// `practices_ranked` is a VIEW and it does not expose `slug`: RANKED_COLS strips the column, and
// selecting it empties the view outright (that failure has its own scar comment in practices.ts).
// So every reader of the ranking view came back with `slug: undefined`, and the `p.slug ?? p.id`
// fallbacks downstream quietly resolved to the uuid — in the cards, and in `app/sitemap.ts`.
//
// It reached production. The sitemap advertised twenty `/discover/practices/<uuid>` URLs while each
// of those pages declared its canonical as the `/discover/practices/<slug>` URL, so Google was
// handed twenty addresses and told, on arrival at every one, that it was not the real address.
//
// These tests read the REAL functions against a mocked database, so they fail if the slug stops
// being fetched. The sitemap's own test mocks `listPublicPractices`, which means it pins the
// consumer's contract and can say nothing about whether the reader supplies a slug at all. This is
// the half that can.

const RANKED_ROWS = [
  { id: 'p-with-slug', title: 'Box breathing', is_public: true, subcategory_id: null },
  { id: 'p-no-slug', title: 'Unnamed', is_public: true, subcategory_id: null },
]
// What the `practices` TABLE holds. Note p-no-slug has none, which is a real state: a practice is
// reachable before it is named.
const SLUG_ROWS = [
  { id: 'p-with-slug', slug: 'box-breathing' },
  { id: 'p-no-slug', slug: null },
]

let rankedSelectedSlug = false

function builder(table: string) {
  const api: Record<string, unknown> = {
    select(cols?: string) {
      // The view really does break when `slug` is selected. Record any attempt so a "fix" that just
      // adds the column to RANKED_COLS fails here instead of silently emptying the library.
      if (table === 'practices_ranked' && typeof cols === 'string' && /\bslug\b/.test(cols)) {
        rankedSelectedSlug = true
      }
      return api
    },
    eq: () => api,
    in: () => api,
    order: () => api,
    then: undefined,
  }
  const rows =
    table === 'practices_ranked' ? RANKED_ROWS : table === 'practices' ? SLUG_ROWS : []
  // Terminal: awaiting the builder resolves to the row set.
  return Object.assign(api, {
    then: (resolve: (v: { data: unknown; error: null }) => void) => resolve({ data: rows, error: null }),
  })
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (table: string) => builder(table) }),
}))

const { listPublicPractices } = await import('./practices')

beforeEach(() => {
  rankedSelectedSlug = false
})

describe('listPublicPractices: the slug survives the ranking view', () => {
  it('attaches the slug from the practices table', async () => {
    const rows = await listPublicPractices()
    const withSlug = rows.find((r) => r.id === 'p-with-slug')
    expect(withSlug?.slug).toBe('box-breathing')
  })

  it('leaves slug null when the practice has none, so the uuid fallback still works', async () => {
    const rows = await listPublicPractices()
    const noSlug = rows.find((r) => r.id === 'p-no-slug')
    expect(noSlug?.slug ?? null).toBeNull()
  })

  it('never asks the ranking VIEW for slug, because that empties it', async () => {
    await listPublicPractices()
    expect(rankedSelectedSlug).toBe(false)
  })
})
