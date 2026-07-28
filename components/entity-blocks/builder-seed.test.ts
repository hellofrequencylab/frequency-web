import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// The first-seed race (owner report, 2026-07-28): the shared profile-layout store takes only its FIRST
// seed, and the in-rail page builder seeded rows WITHOUT the authored content map. Whenever the rail
// mounted before the live grid, every authored block on the Space edit canvas fell back to its
// empty-state scaffolding ("Add features in this block's settings") while the published page kept the
// content — the edit surface stopped mirroring the finished product. These assertions pin the fix at
// every seam content must travel through, so no seeding path can quietly go rows-only again (the email
// studio's LayoutSeeder solved this same race and always seeded content; the builder path simply never
// did).

const builder = readFileSync('components/entity-blocks/profile-page-builder.tsx', 'utf8')
const spaceModule = readFileSync('components/admin/modules/space-page-module.tsx', 'utf8')
const spaceGetter = readFileSync('app/(main)/spaces/[slug]/manage/rail-getters.ts', 'utf8')
const memberGetter = readFileSync('app/(main)/settings/rail-getters.ts', 'utf8')

describe('builder seed carries authored content (the first-seed race)', () => {
  it('EntityPageBuilder seeds content + style with the rows, never rows-only', () => {
    expect(builder).toContain('store.seed(d.rows, d.hidden, d.content, d.style)')
    expect(builder).not.toMatch(/store\.seed\(d\.rows, d\.hidden\)/)
  })

  it('both rail load mappers thread content + style through BuilderRailData', () => {
    // SpacePageBuilder (getSpaceLayoutRailData) and ProfilePageBuilder (getMemberLayoutRailData).
    expect(builder.match(/content: d\.content,\s*\n\s*style: d\.style,/g)?.length).toBe(2)
  })

  it('the rail bundle seed (space-page-module) carries content + style', () => {
    expect(spaceModule).toContain('content: layout.content')
    expect(spaceModule).toContain('style: layout.style')
  })

  it('both rail getters return the parsed content + style beside the rows', () => {
    for (const src of [spaceGetter, memberGetter]) {
      expect(src).toContain('content: saved?.content ?? {}')
      expect(src).toContain('style: saved?.style ?? {}')
    }
  })
})
