import { describe, it, expect, vi, beforeEach } from 'vitest'

// THE SPACE-DOCUMENT LOAD SEAM (PROG-D2). The `pages` table got its ref refresh in
// ADR-1130 (`getPublishedData`); a Space profile's doc lives on `spaces.preferences`
// and had none, so a Loom replace / rollback / Recraft edit re-pointed the asset and
// every Space profile kept rendering the old file forever.
//
// The properties pinned here are the ones a render path has to keep:
//   • a Space whose doc carries a stale ref renders the asset's CURRENT url;
//   • a legacy all-strings doc costs NO query and returns the same object;
//   • an unreachable database leaves every cached url standing (fail-open), because
//     a stale image is a degradation and a blank one is an outage;
//   • the fail-safe default still wins for a missing / malformed doc, so the refresh
//     never turned a blank-proof read into a throwing one;
//   • the authored-content bag, the module engine's own read of the same doc,
//     refreshes too — otherwise the fix leaks out through the second render path.

const inCalls: { table: string; ids: string[] }[] = []
let result: { data: { id: string; url: string | null }[] | null; error: unknown } = { data: [], error: null }
let throwOnQuery = false

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => ({
        in: (_col: string, ids: string[]) => {
          if (throwOnQuery) throw new Error('no credentials at build time')
          inCalls.push({ table, ids })
          return Promise.resolve(result)
        },
      }),
    }),
  }),
}))

import { loadSpacePageDoc, loadSpaceAuthoredContent } from './page-doc'

const ID_A = 'aaaaaaaa-0000-4000-a000-00000000000a'
const OLD = 'https://cdn/replaced-old.jpg'
const NEW = 'https://cdn/replaced-new.jpg'

/** A Space Home doc as the page editor stores it: one authored Image block holding an AssetRef. */
function docWithRef(url = OLD) {
  return {
    root: { props: {} },
    content: [{ type: 'Image', props: { image: { assetId: ID_A, url } } }],
  }
}

function prefsWith(doc: unknown) {
  return { pageDocs: { home: doc } }
}

/** The image url the doc's first block carries, however it is stored. */
function storedImage(doc: unknown): unknown {
  return (doc as { content: { props: { image: unknown } }[] }).content[0].props.image
}

beforeEach(() => {
  inCalls.length = 0
  result = { data: [], error: null }
  throwOnQuery = false
})

describe('loadSpacePageDoc', () => {
  it('renders the asset CURRENT url after a Loom replace re-points it, with no re-save', async () => {
    result = { data: [{ id: ID_A, url: NEW }], error: null }
    const out = await loadSpacePageDoc(prefsWith(docWithRef()), 'Studio', 'home')
    expect(inCalls[0]?.table).toBe('library_assets')
    expect(inCalls[0]?.ids).toEqual([ID_A])
    expect(storedImage(out)).toEqual({ assetId: ID_A, url: NEW })
  })

  it('makes NO query for a legacy all-strings doc and returns the same object', async () => {
    const doc = {
      root: { props: {} },
      content: [{ type: 'Image', props: { image: 'https://legacy/a.jpg' } }],
    }
    const out = await loadSpacePageDoc(prefsWith(doc), 'Studio', 'home')
    expect(inCalls).toEqual([])
    expect(storedImage(out)).toBe('https://legacy/a.jpg')
  })

  it('fails OPEN to the cached url when the database cannot be reached', async () => {
    throwOnQuery = true
    const out = await loadSpacePageDoc(prefsWith(docWithRef()), 'Studio', 'home')
    expect(storedImage(out)).toEqual({ assetId: ID_A, url: OLD })
  })

  it('keeps the fail-safe default for a missing or malformed doc', async () => {
    const fromNothing = await loadSpacePageDoc(null, 'Studio', 'home')
    expect(Array.isArray(fromNothing.content)).toBe(true)
    const fromGarbage = await loadSpacePageDoc(prefsWith('garbage'), 'Studio', 'home')
    expect(Array.isArray(fromGarbage.content)).toBe(true)
    expect(inCalls).toEqual([])
  })

  it('reads a custom page, not only Home', async () => {
    result = { data: [{ id: ID_A, url: NEW }], error: null }
    const out = await loadSpacePageDoc({ pageDocs: { classes: docWithRef() } }, 'Studio', 'classes')
    expect(storedImage(out)).toEqual({ assetId: ID_A, url: NEW })
  })

  it('refreshes the LEGACY pre-model doc at preferences.puck too', async () => {
    result = { data: [{ id: ID_A, url: NEW }], error: null }
    const out = await loadSpacePageDoc({ puck: docWithRef() }, 'Studio', 'home')
    expect(storedImage(out)).toEqual({ assetId: ID_A, url: NEW })
  })
})

describe('loadSpaceAuthoredContent', () => {
  it('refreshes the authored bag the module engine renders from', async () => {
    result = { data: [{ id: ID_A, url: NEW }], error: null }
    const bag = await loadSpaceAuthoredContent(prefsWith(docWithRef()), 'Studio')
    expect(bag.image[0]?.props.image).toEqual({ assetId: ID_A, url: NEW })
  })

  it('stays total and query-free for a Space that has authored nothing', async () => {
    const bag = await loadSpaceAuthoredContent(null, 'Studio')
    expect(Object.keys(bag).sort()).toEqual(
      ['divider', 'embed', 'gallery', 'heading', 'image', 'quote', 'text'].sort(),
    )
    expect(inCalls).toEqual([])
  })
})
