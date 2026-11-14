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
    const slugs = coverageSurfaces({ spotlightHandle: 'ada', siteUrl: 'https://house.example' }).map((s) => s.slug)
    expect(slugs).toContain('editor-spotlight')
    expect(slugs).toContain('editor-site')
  })

  // LIVE-2232: a Site renders only on its own host, so its surface is an absolute url, the Home of that origin.
  it('names the Site Home on its own host when the url is set', () => {
    expect(editorTargetSurfaces({ siteUrl: 'https://house.example/about?x=1' })).toEqual([
      { path: 'https://house.example/', slug: 'editor-site', audience: 'anon', viewportOnly: true },
    ])
  })

  it('adds no Site for a url that is not an https origin', () => {
    for (const siteUrl of ['', '  ', 'house.example', 'http://house.example', '/sites/house', 'https://u:p@house.example']) {
      expect(editorTargetSurfaces({ siteUrl })).toEqual([])
    }
  })
})
