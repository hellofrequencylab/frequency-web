import { describe, it, expect } from 'vitest'
import { coverageSurfaces, editorTargetSurfaces } from './surfaces'

// PROG-E3's instrument: the visual suite photographs a Spotlight once the owner sets the
// repo variable (a Site lives on its own host, outside the single-base suite), and adds nothing while they are unset (the suite stays unchanged).
describe('editorTargetSurfaces', () => {
  it('adds nothing until the handle is set', () => {
    expect(editorTargetSurfaces({})).toEqual([])
  })

  it('names an anonymous, first-screen surface for the variable when set', () => {
    const rows = editorTargetSurfaces({ spotlightHandle: 'ada' })
    expect(rows).toEqual([
      { path: '/spotlight/ada', slug: 'editor-spotlight', audience: 'anon', viewportOnly: true },
    ])
  })

  it('joins the coverage union so the baseline-distinctness reader sees them', () => {
    const slugs = coverageSurfaces({ spotlightHandle: 'ada' }).map((s) => s.slug)
    expect(slugs).toContain('editor-spotlight')
  })
})
