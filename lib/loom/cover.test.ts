import { describe, it, expect } from 'vitest'
import { buildCoverPrompt, coverAssetTitle, coverFieldFor, coverOffer } from './cover'
import { STUDIO_ENTITIES, studioManifest } from '@/lib/studio/registry'
import type { EntityManifest } from '@/lib/studio/kernel/manifest'

// The cover offer (ADR-993). The rule that must not drift is WHO gets offered a drawn cover:
// it is derived from each manifest's own declarations, so adding an entity cannot quietly opt it
// in, and `veraDrafts: false` (a photo of a real thing) can never be filled by a generation.

const manifest = (entity: string): EntityManifest => {
  const m = studioManifest(entity)
  if (!m) throw new Error(`no manifest for ${entity}`)
  return m
}

describe('who may be offered a generated cover', () => {
  it('offers one for the entities whose image field Vera may fill', () => {
    expect(coverFieldFor(manifest('journey'))?.path).toBe('cover_image')
    expect(coverFieldFor(manifest('practice'))?.path).toBe('header_image')
    // The Event's own cover wins over its gallery, because it is declared first.
    expect(coverFieldFor(manifest('event'))?.path).toBe('coverImagePath')
  })

  it('never offers one where the manifest says only a human may fill it', () => {
    // A Space logo and header, and the commerce photos, are all veraDrafts: false: those images
    // are claims about a real thing, and a drawing is not one.
    expect(coverFieldFor(manifest('space'))).toBeNull()
    expect(coverFieldFor(manifest('product'))).toBeNull()
    expect(coverFieldFor(manifest('service'))).toBeNull()
    expect(coverFieldFor(manifest('listing'))).toBeNull()
  })

  it('never picks a field the manifest marked veraDrafts: false, for any registered entity', () => {
    for (const m of STUDIO_ENTITIES) {
      const field = coverFieldFor(m)
      if (field) expect(field.veraDrafts).not.toBe(false)
    }
  })
})

describe('coverOffer (the offer predicate)', () => {
  const journey = manifest('journey')

  it('offers when the draft has no image', () => {
    expect(coverOffer(journey, { title: 'Four Weeks of Quiet' })).toEqual({
      path: 'cover_image',
      label: 'Cover image',
      multiple: false,
    })
  })

  it('stays quiet when the author already has one', () => {
    expect(coverOffer(journey, { cover_image: 'https://example.com/a.png' })).toBeNull()
  })

  it('treats blank and empty-list values as no image', () => {
    expect(coverOffer(journey, { cover_image: '   ' })).not.toBeNull()
    expect(coverOffer(manifest('event'), { coverImagePath: '' })).not.toBeNull()
  })

  it('offers nothing at all to an entity with no fillable image field', () => {
    expect(coverOffer(manifest('space'), {})).toBeNull()
    expect(coverOffer(manifest('circle'), {})).toBeNull()
  })
})

describe('buildCoverPrompt', () => {
  const base = { entityLabel: 'Journey', title: 'Four Weeks of Quiet' }

  it('names the thing and bans the three ways a generated cover looks cheap', () => {
    const p = buildCoverPrompt({ ...base, summary: 'Slow mornings, on purpose.' })
    expect(p).toContain('Four Weeks of Quiet')
    expect(p).toContain('Slow mornings, on purpose.')
    expect(p).toMatch(/No text/i)
    expect(p).toMatch(/No human faces/i)
    expect(p).toMatch(/Not a photograph/i)
  })

  it('lets the mood pick the look, so the picture matches the words', () => {
    expect(buildCoverPrompt({ ...base, mood: 'calm' })).toContain('muted palette')
    expect(buildCoverPrompt({ ...base, mood: 'bold' })).toContain('high contrast')
    // Total: an unknown mood still produces a complete prompt.
    expect(buildCoverPrompt({ ...base, mood: 'nonsense' }).length).toBeGreaterThan(50)
  })

  it('stays inside the 1000 character Recraft prompt limit', () => {
    const p = buildCoverPrompt({
      entityLabel: 'Journey',
      title: 'x'.repeat(400),
      summary: 'y'.repeat(900),
      directions: 'z'.repeat(900),
      mood: 'playful',
    })
    expect(p.length).toBeLessThanOrEqual(1000)
  })
})

describe('coverAssetTitle', () => {
  it('says it was made by Vera, in the asset title itself', () => {
    const t = coverAssetTitle('Journey', 'Four Weeks of Quiet')
    expect(t).toContain('Four Weeks of Quiet')
    expect(t).toContain('made by Vera')
    expect(t.length).toBeLessThanOrEqual(120)
  })
})
