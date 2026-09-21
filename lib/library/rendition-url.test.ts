import { describe, it, expect } from 'vitest'
import { renditionUrl } from './rendition-url'
import { RENDITION_PRESETS } from './renditions'
import { LIBRARY_RENDITION_KINDS } from './types'

// THE ON-THE-FLY RESOLVER (PROG-D3, owner ruling on HYG-017). The properties that
// matter are the fail-open ones: every call site uses this unconditionally in place
// of the raw url, so anything it cannot transform has to come back renderable.
//
// The host-preserving rewrite is pinned because the live catalog holds urls on TWO
// hosts (the project domain and the api.frequencylocal.com custom domain), and a
// resolver that rebuilt the url from an env var would re-point half the Loom.

const PROJECT = 'https://azsqfeonabsbmemvddqd.supabase.co'
const CUSTOM = 'https://api.frequencylocal.com'
const PATH = '/storage/v1/object/public/library-media/space-1/photo.jpg'
const RENDER = '/storage/v1/render/image/public/library-media/space-1/photo.jpg'

describe('renditionUrl', () => {
  it('rewrites a master to the transform endpoint at the preset width', () => {
    const out = renditionUrl(PROJECT + PATH, 'grid')
    expect(out.startsWith(PROJECT + RENDER)).toBe(true)
    const params = new URLSearchParams(out.split('?')[1])
    expect(params.get('width')).toBe(String(RENDITION_PRESETS.grid.maxWidth))
    expect(params.get('resize')).toBe('contain')
  })

  it('keeps the HOST it was given, so a custom domain is not re-pointed at the project domain', () => {
    expect(renditionUrl(CUSTOM + PATH, 'thumb').startsWith(CUSTOM + RENDER)).toBe(true)
    expect(renditionUrl(CUSTOM + PATH, 'thumb')).not.toContain('supabase.co')
  })

  it('applies each preset width, and every non-custom kind resolves', () => {
    for (const kind of LIBRARY_RENDITION_KINDS) {
      if (kind === 'custom' || kind === 'source') continue
      const params = new URLSearchParams(renditionUrl(PROJECT + PATH, kind).split('?')[1])
      expect(params.get('width')).toBe(String(RENDITION_PRESETS[kind].maxWidth))
    }
  })

  it('serves the MASTER for source and custom', () => {
    expect(renditionUrl(PROJECT + PATH, 'source')).toBe(PROJECT + PATH)
    expect(renditionUrl(PROJECT + PATH, 'custom')).toBe(PROJECT + PATH)
  })

  it('hands back anything it cannot transform, unchanged', () => {
    const untouched = [
      'https://images.example.com/external.jpg',
      'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
      'blob:https://app.local/9f2b',
      '/local/asset.png',
      PROJECT + '/storage/v1/render/image/public/library-media/a/already.jpg?width=160',
    ]
    for (const url of untouched) expect(renditionUrl(url, 'grid')).toBe(url)
  })

  it('leaves an SVG alone rather than rasterising a vector into a thumbnail', () => {
    const svg = PROJECT + '/storage/v1/object/public/library-media/space-1/logo.svg'
    expect(renditionUrl(svg, 'thumb')).toBe(svg)
    expect(renditionUrl(svg.toUpperCase().replace('HTTPS', 'https'), 'thumb')).not.toContain('render/image')
  })

  it('preserves an existing query string, such as a cache-buster', () => {
    const params = new URLSearchParams(renditionUrl(`${PROJECT}${PATH}?t=1699`, 'hero').split('?')[1])
    expect(params.get('t')).toBe('1699')
    expect(params.get('width')).toBe(String(RENDITION_PRESETS.hero.maxWidth))
  })

  it('returns an empty string for a missing or non-string value', () => {
    for (const bad of [undefined, null, '', 0, {}, []]) expect(renditionUrl(bad, 'grid')).toBe('')
  })

  it('never emits a width Supabase would refuse (1-2500)', () => {
    for (const kind of LIBRARY_RENDITION_KINDS) {
      const out = renditionUrl(PROJECT + PATH, kind)
      const raw = new URLSearchParams(out.split('?')[1] ?? '').get('width')
      if (raw === null) continue
      const w = Number(raw)
      expect(w).toBeGreaterThanOrEqual(1)
      expect(w).toBeLessThanOrEqual(2500)
    }
  })

  it('never returns a url that could be mistaken for the stored master', () => {
    // The stored value must stay the master (ADR-1130). A transformed url is display-only,
    // and it is always distinguishable by its path segment.
    const out = renditionUrl(PROJECT + PATH, 'grid')
    expect(out).not.toBe(PROJECT + PATH)
    expect(out).toContain('/render/image/public/')
  })
})
