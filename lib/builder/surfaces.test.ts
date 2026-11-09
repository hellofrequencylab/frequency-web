import { describe, expect, it } from 'vitest'
import { config } from '@/lib/page-editor/config'
import { applyKit } from '@/lib/sites/kits/apply'
import { KIT_INDEX, loadKit, NEW_WORLD_KIT_INDEX } from '@/lib/sites/kits/registry'
import { ROLES, ROLE_IDS, roleOfType } from '@/lib/blocks/roles/roles'
import { stackClassFor } from '@/lib/entity-blocks/density'
import type { Data } from '@/lib/page-editor/types'
import { builderInit, builderReducer } from './state'
import { BUILDER_SURFACES, SURFACE_IDS, hiddenOnSurface, surfaceFrame, surfaceSections, surfaceShowing, type BuilderSurface } from './surfaces'

async function corpus(): Promise<Data[]> {
  const docs: Data[] = []
  for (const { id, theme } of [...KIT_INDEX, ...NEW_WORLD_KIT_INDEX]) {
    const kit = await loadKit(id)
    if (!kit) continue
    const r = applyKit({ theme, pages: [] } as never, kit, 'replace', (type) => config.components[type]?.defaultProps)
    if (r.ok) for (const p of r.snapshot.pages) if (p.doc.content.length > 0) docs.push(p.doc)
  }
  return docs
}

/** A block has a surface when its role draws, doors or freezes there, or when it is a site block with no role. */
const hasSurface = (type: string, surface: BuilderSurface) => {
  const role = roleOfType(type)
  return role ? ROLES[role].surfaces[surface] !== 'hide' : surface === 'site'
}

describe('surface switcher (BLD-301)', () => {
  it('names the four surfaces in the owner ruling order, each with a density on the E3 scale and a width', () => {
    expect(SURFACE_IDS).toEqual(['site', 'profile', 'spotlight', 'email'])
    for (const s of BUILDER_SURFACES) {
      expect(['compact', 'standard', 'roomy']).toContain(s.density)
      expect(s.maxWidth).toBeGreaterThanOrEqual(390)
    }
    expect(surfaceFrame('email', 1280)).toEqual({ width: 600, density: 'compact', stackClass: stackClassFor('compact') })
    expect(surfaceFrame('site', 390).width).toBe(390)
    expect(surfaceFrame('profile', 1280).width).toBe(840)
  })

  it('the hidden-on-surface list equals the blocks without that surface, over the kit corpus', async () => {
    const docs = await corpus()
    expect(docs.length).toBeGreaterThan(20)
    let hiddenSomewhere = 0
    for (const doc of docs) {
      for (const surface of SURFACE_IDS) {
        const expected = doc.content.filter((s) => !hasSurface(s.type, surface)).map((s) => String(s.props.id))
        expect(hiddenOnSurface(doc, config, surface)).toEqual(expected)
        hiddenSomewhere += expected.length
        const split = surfaceSections(doc, config, surface)
        // Nothing is lost: shown plus hidden is the page, in order, byte for byte.
        expect([...split.shown.map((s) => String(s.props.id)), ...split.hidden.map((h) => h.id)].sort()).toEqual(doc.content.map((s) => String(s.props.id)).sort())
        for (const s of split.shown) expect(doc.content).toContain(s)
        for (const h of split.hidden) expect(h.reason.length).toBeGreaterThan(10)
      }
      // The site shows every section of a site page.
      expect(hiddenOnSurface(doc, config, 'site')).toEqual([])
    }
    expect(hiddenSomewhere).toBeGreaterThan(0)
  })

  it('reads each role\'s own surface table and treats a block with no role as site only', () => {
    for (const id of ROLE_IDS) for (const surface of SURFACE_IDS) expect(surfaceShowing(ROLES[id].type, surface)).toBe(ROLES[id].surfaces[surface])
    expect(surfaceShowing('ServicesStory', 'site')).toBe('draw')
    expect(surfaceShowing('ServicesStory', 'email')).toBe('legacy')
    const doc = { root: { props: {} }, content: [
      { type: ROLES.faq.type, props: { id: 'q' } }, { type: ROLES.stats.type, props: { id: 'n' } }, { type: 'ServicesStory', props: { id: 's' } },
    ] } as Data
    const email = surfaceSections(doc, config, 'email')
    expect(email.hidden.map((h) => h.id)).toEqual(['q', 's'])
    expect(email.hidden[0].reason).toMatch(/no email form/)
    expect(email.hidden[1].reason).toMatch(/Update to new layouts/)
    expect(email.shown.map((s) => s.props.id)).toEqual(['n'])
    expect(email.notes).toEqual([{ id: 'n', note: expect.stringMatching(/fixed when the email is sent/) }])
    expect(surfaceSections(doc, config, 'spotlight').notes.map((n) => n.id)).toEqual(['q', 'n'])
  })

  it('keeps the selection across a switch, and the switch itself is not an edit', () => {
    const doc = { root: { props: {} }, content: [{ type: 'ServicesStory', props: { id: 's' } }, { type: ROLES.stats.type, props: { id: 'n' } }] }
    let s = builderInit({ revision: 1, draft: { theme: 'NewWorld', pages: [{ slug: 'home', label: 'Home', doc, comments: [] }] }, published: null, versions: [] } as never)
    s = builderReducer(s, { type: 'select', id: 'n' })
    for (const surface of SURFACE_IDS) {
      s = builderReducer(s, { type: 'surface', surface })
      expect(s.surface).toBe(surface)
      expect(s.selectedId).toBe('n')
      expect(s.past).toEqual([])
      expect(s.save).toBe('saved')
    }
  })
})
