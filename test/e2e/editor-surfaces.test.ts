import { describe, it, expect } from 'vitest'
import { coverageSurfaces, editorTargetSurfaces } from './surfaces'

// PROG-E3's instrument: the visual suite photographs a Spotlight and a Site once the owner sets the
// two repo variables, and adds nothing while they are unset (the suite stays unchanged).
describe('editorTargetSurfaces', () => {
  it('adds nothing until the handle and slug are set', () => {
    expect(editorTargetSurfaces({})).toEqual([])
  })

  it('names an anonymous, first-screen surface for each variable that is set', () => {
    const rows = editorTargetSurfaces({ spotlightHandle: 'ada', siteSlug: 'house-of-fates' })
    expect(rows).toEqual([
      { path: '/spotlight/ada', slug: 'editor-spotlight', audience: 'anon', viewportOnly: true },
      { path: '/sites/house-of-fates', slug: 'editor-site', audience: 'anon', viewportOnly: true },
    ])
  })

  it('joins the coverage union so the baseline-distinctness reader sees them', () => {
    const slugs = coverageSurfaces({ spotlightHandle: 'ada', siteSlug: 'x' }).map((s) => s.slug)
    expect(slugs).toContain('editor-spotlight')
    expect(slugs).toContain('editor-site')
  })
})
