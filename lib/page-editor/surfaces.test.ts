import { describe, it, expect } from 'vitest'
import { SURFACES, getSurface, type SurfaceKey } from './surfaces'
import { getTemplate, isRenderable } from './templates'
import { config } from './config'

// THE SURFACE REGISTRY contract (cross-surface Puck template system, ADR-500). Pure, no IO. Keeps the
// registry HONEST + nothing orphaned: every surface's starter template is a renderable doc (every block
// is a known block type in the ONE shared config), every blockPreset entry names a real block-library
// category, and the marketing `profile` template resolves. This is the guard that "templates across the
// board" stay wired to the shared block library as surfaces are added.

const CATEGORY_KEYS = new Set(Object.keys(config.categories ?? {}))
const SURFACE_KEYS = Object.keys(SURFACES) as SurfaceKey[]

describe('the surface registry', () => {
  it('keys each surface by its own key', () => {
    for (const key of SURFACE_KEYS) {
      expect(SURFACES[key].key).toBe(key)
    }
  })

  it('getSurface returns the def and throws on an unknown key', () => {
    expect(getSurface('user').label).toBe('Member page')
    expect(() => getSurface('nope' as SurfaceKey)).toThrow()
  })

  it('every blockPreset entry is a real config.categories key', () => {
    for (const key of SURFACE_KEYS) {
      const preset = SURFACES[key].blockPreset
      expect(preset.length).toBeGreaterThan(0)
      for (const cat of preset) {
        expect(CATEGORY_KEYS.has(cat)).toBe(true)
      }
    }
  })

  it('every non-null defaultTemplate produces a doc of only known block types (isRenderable)', () => {
    for (const key of SURFACE_KEYS) {
      const make = SURFACES[key].defaultTemplate
      if (!make) continue
      const doc = make()
      expect(isRenderable(doc)).toBe(true)
    }
  })

  it('never emits an em dash in a default template (CONTENT-VOICE punctuation)', () => {
    for (const key of SURFACE_KEYS) {
      const make = SURFACES[key].defaultTemplate
      if (!make) continue
      expect(JSON.stringify(make())).not.toContain('—')
    }
  })
})

describe('the registered member (profile) template', () => {
  it("getTemplate('profile') returns a renderable member doc, wired (not orphaned)", () => {
    const doc = getTemplate('profile')
    expect(doc).not.toBeNull()
    expect(isRenderable(doc)).toBe(true)
  })

  it('leads with the identity About card then the link tree', () => {
    const types = getTemplate('profile')!.content.map((b) => b.type)
    expect(types[0]).toBe('SpaceAbout')
    expect(types).toContain('LinkTree')
  })

  it('is the same generator the user surface points at', () => {
    const surfaceDoc = SURFACES.user.defaultTemplate!()
    expect(surfaceDoc.content.map((b) => b.type)).toEqual(getTemplate('profile')!.content.map((b) => b.type))
  })
})
