import { describe, it, expect } from 'vitest'
import {
  isAssetRef,
  assetRefUrl,
  assetRefId,
  deepResolveAssetRefs,
  collectAssetRefIds,
  applyAssetUrls,
} from './asset-ref'

// The AssetField seam (PROG-D2, ADR-1130). The properties proven here are the ones the
// whole design leans on: a legacy string document is untouched byte-for-byte (identity,
// not just equality), a ref always renders its CACHE when nothing fresher exists
// (fail-open), and an unrelated `{ url }` config blob is never mistaken for a ref.

const REF = { assetId: '11111111-2222-4333-8444-555555555555', url: 'https://cdn.example/one.jpg' }

describe('isAssetRef is conservative', () => {
  it('accepts the stored shape', () => {
    expect(isAssetRef(REF)).toBe(true)
    expect(isAssetRef({ ...REF, alt: 'a dog' })).toBe(true)
  })

  it('rejects everything that merely resembles it', () => {
    expect(isAssetRef('https://cdn.example/one.jpg')).toBe(false)
    expect(isAssetRef({ url: 'https://cdn.example/one.jpg' })).toBe(false) // config blob with url
    expect(isAssetRef({ assetId: '' , url: 'x' })).toBe(false)
    expect(isAssetRef({ assetId: 42, url: 'x' })).toBe(false)
    expect(isAssetRef(null)).toBe(false)
    expect(isAssetRef([REF])).toBe(false)
  })
})

describe('assetRefUrl / assetRefId — the one read', () => {
  it('passes a legacy string through and reads a ref cache', () => {
    expect(assetRefUrl('https://x/y.png')).toBe('https://x/y.png')
    expect(assetRefUrl(REF)).toBe(REF.url)
    expect(assetRefUrl(undefined)).toBe('')
    expect(assetRefUrl({ src: 'nope' })).toBe('')
  })

  it('yields the id only for a real ref', () => {
    expect(assetRefId(REF)).toBe(REF.assetId)
    expect(assetRefId('https://x/y.png')).toBeNull()
  })
})

describe('deepResolveAssetRefs — what the render walk applies', () => {
  it('replaces refs at any depth, including inside gallery arrays', () => {
    const props = {
      image: REF,
      gallery: [{ src: REF }, { src: 'https://legacy/two.jpg' }],
      nested: { cover: REF, label: 'hi' },
    }
    const out = deepResolveAssetRefs(props) as typeof props
    expect(out.image).toBe(REF.url)
    expect(out.gallery[0].src).toBe(REF.url)
    expect(out.gallery[1].src).toBe('https://legacy/two.jpg')
    expect(out.nested.cover).toBe(REF.url)
  })

  it('is IDENTITY-preserving on a ref-free document — the parity property', () => {
    const props = { image: 'https://legacy/a.jpg', items: [{ src: 'https://legacy/b.jpg' }], n: 3 }
    expect(deepResolveAssetRefs(props)).toBe(props)
    expect(deepResolveAssetRefs(props.items)).toBe(props.items)
  })

  it('never descends into a React element', () => {
    const el = { $$typeof: Symbol.for('react.element'), props: { image: REF } }
    expect(deepResolveAssetRefs(el)).toBe(el)
  })
})

describe('collectAssetRefIds — what the refresh queries', () => {
  it('collects distinct well-formed ids and skips malformed ones', () => {
    const bad = { assetId: 'DROP TABLE library_assets', url: 'https://x' }
    const doc = { content: [{ props: { image: REF, other: bad, again: { ...REF } } }] }
    expect([...collectAssetRefIds(doc)]).toEqual([REF.assetId])
  })

  it('finds nothing in a legacy document, so the refresh makes no query at all', () => {
    expect(collectAssetRefIds({ content: [{ props: { image: 'https://x/y.jpg' } }] }).size).toBe(0)
  })
})

describe('applyAssetUrls — the cache refresh', () => {
  it('re-points a stale cache and leaves a missing asset on its cache (fail-open)', () => {
    const stale = { assetId: '99999999-8888-4777-8666-555555555555', url: 'https://cdn/old.jpg' }
    const doc = { a: REF, b: stale }
    const out = applyAssetUrls(doc, new Map([[stale.assetId, 'https://cdn/new.jpg']])) as typeof doc
    expect(out.b).toEqual({ ...stale, url: 'https://cdn/new.jpg' })
    expect(out.a).toBe(REF) // not in the map: cache stands, same reference
  })

  it('returns the SAME document when every cache is already current', () => {
    const doc = { a: REF }
    expect(applyAssetUrls(doc, new Map([[REF.assetId, REF.url]]))).toBe(doc)
  })
})
