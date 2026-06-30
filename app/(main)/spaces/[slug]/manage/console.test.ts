import { describe, it, expect } from 'vitest'
import { hrefForSurface } from './console'
import { SPACE_SURFACES } from '@/lib/admin/entities/registry'

// The console section links must each open their OWN editor, never bounce back to /manage. The
// /settings INDEX redirects every console type to /manage (isConsoleSpaceType), so any section href
// pointed at the bare index would loop /settings -> /manage -> the console. This is the regression
// that broke "Open basics" (ADR-441 EM1-3 hotfix): Basics pointed at the index. Lock the rule so a
// future href change that reintroduces the loop fails here.
describe('hrefForSurface (console section targets never loop)', () => {
  const slug = 'demo'
  const indexHref = `/spaces/${slug}/settings`

  it('opens Basics at its dedicated editor, NOT the redirecting /settings index', () => {
    expect(hrefForSurface('space.basics', slug)).toBe(`/spaces/${slug}/settings/basics`)
    expect(hrefForSurface('space.basics', slug)).not.toBe(indexHref)
  })

  it('gives Danger no href (it renders its delete control inline)', () => {
    expect(hrefForSurface('space.danger', slug)).toBeNull()
  })

  it('points every linkable spine surface at a real, non-looping sub-page', () => {
    for (const surface of SPACE_SURFACES) {
      const href = hrefForSurface(surface.id, slug)
      if (surface.id === 'space.danger') {
        expect(href).toBeNull()
        continue
      }
      // Every other surface must resolve to a concrete sub-page UNDER this slug, and never to the
      // bare /settings index (the one route that redirects console types back to /manage).
      expect(href).not.toBeNull()
      expect(href).not.toBe(indexHref)
      expect(href).toMatch(new RegExp(`^/spaces/${slug}/`))
      // A sub-page always has a segment past the slug (so it cannot be the redirecting index).
      expect(href!.split('/').filter(Boolean).length).toBeGreaterThan(2)
    }
  })
})
