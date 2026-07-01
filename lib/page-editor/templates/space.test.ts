import { describe, it, expect } from 'vitest'
import type { Data } from '@measured/puck'
import {
  generateSpacePreset,
  generateSpacePresetForSpace,
  spacePuckData,
  readStoredSpaceDoc,
  isRenderableSpaceDoc,
} from './space'
import { config } from '@/lib/page-editor/config'
import { SPACE_TEMPLATES, templateDescriptor, type SpaceTemplate } from '@/lib/spaces/templates'

// SPACE LANDING PUCK PRESET + RESOLVER contract (ADR-476/472, Phase 1). Pure, no IO.
// Locks: the four presets are valid Puck documents composed only from registered blocks, are
// descriptor-driven (hero emphasis + stat set + About lead order), read visibly distinct per
// template, and the resolver prefers a stored valid doc, else the preset, fail-safe throughout.

const KNOWN_BLOCKS = new Set(Object.keys(config.components))

// Every block in a doc is a currently-registered block type.
function everyBlockKnown(data: Data): boolean {
  return (data.content ?? []).every((b) => typeof b?.type === 'string' && KNOWN_BLOCKS.has(b.type))
}

describe('the four preset generators', () => {
  it('generates a valid Puck Data shape for every template', () => {
    for (const t of SPACE_TEMPLATES) {
      const doc = generateSpacePreset(t, 'Willow Studio')
      expect(doc.root).toBeTruthy()
      expect(Array.isArray(doc.content)).toBe(true)
      expect(doc.content.length).toBeGreaterThan(0)
    }
  })

  it('composes ONLY from registered blocks (no invented block types)', () => {
    for (const t of SPACE_TEMPLATES) {
      const doc = generateSpacePreset(t, 'Willow Studio')
      expect(everyBlockKnown(doc)).toBe(true)
    }
  })

  it('leads with a Cover, then a Hero, and ends with a StatRow (Phase 2)', () => {
    for (const t of SPACE_TEMPLATES) {
      const doc = generateSpacePreset(t, 'Willow Studio')
      expect(doc.content[0]?.type).toBe('Cover')
      expect(doc.content[1]?.type).toBe('Hero')
      expect(doc.content[doc.content.length - 1]?.type).toBe('StatRow')
    }
  })

  it('drives the hero CTA + label from the descriptor (descriptor-driven)', () => {
    for (const t of SPACE_TEMPLATES) {
      const descriptor = templateDescriptor(t)
      const doc = generateSpacePreset(t, 'Willow Studio')
      const hero = doc.content.find((b) => b.type === 'Hero')!
      expect(hero.props.ctaPrimaryLabel).toBe(descriptor.hero.primaryCta.label)
    }
  })

  it('drives the StatRow stat labels from the descriptor hero stats (in order)', () => {
    for (const t of SPACE_TEMPLATES) {
      const descriptor = templateDescriptor(t)
      const doc = generateSpacePreset(t, 'Willow Studio')
      const stat = doc.content.find((b) => b.type === 'StatRow')!
      const labels = (stat.props.items as { label: string }[]).map((i) => i.label)
      expect(labels).toEqual(descriptor.hero.heroStats.slice(0, 4).map((s) => s.label))
    }
  })

  it('never seeds invented counts in the stat band (honest at day zero)', () => {
    for (const t of SPACE_TEMPLATES) {
      const doc = generateSpacePreset(t, 'Willow Studio')
      const stat = doc.content.find((b) => b.type === 'StatRow')!
      for (const item of stat.props.items as { value: string }[]) {
        expect(item.value).toBe('-')
      }
    }
  })

  it('skips the brand-new-Space empty (entity-getting-started) in the body', () => {
    // The descriptor's aboutModules lead with entity-getting-started; the preset drops it (it has no
    // public landing section), so no body block id references it.
    for (const t of SPACE_TEMPLATES) {
      const doc = generateSpacePreset(t, 'Willow Studio')
      const ids = doc.content.map((b) => String(b.props.id ?? ''))
      expect(ids.some((id) => id.includes('entity-getting-started'))).toBe(false)
    }
  })

  it('threads the Space name through the copy so it reads as the operator site', () => {
    const doc = generateSpacePreset('book', 'Willow Studio')
    const hero = doc.content.find((b) => b.type === 'Hero')!
    expect(String(hero.props.title)).toContain('Willow Studio')
  })

  it('never emits an em dash in any string prop (CONTENT-VOICE punctuation)', () => {
    for (const t of SPACE_TEMPLATES) {
      const doc = generateSpacePreset(t, 'Willow Studio')
      const json = JSON.stringify(doc)
      expect(json).not.toContain('—')
    }
  })

  it('falls back to a neutral name when the brand name is blank', () => {
    const doc = generateSpacePreset('book', '   ')
    const hero = doc.content.find((b) => b.type === 'Hero')!
    expect(String(hero.props.title)).toContain('this space')
  })
})

describe('the four presets read visibly distinct', () => {
  // A fingerprint of the visible differences: the hero eyebrow/title + the ordered body block types
  // + the ordered stat labels. Two templates must never share the same fingerprint.
  function fingerprint(t: SpaceTemplate): string {
    const doc = generateSpacePreset(t, 'Willow Studio')
    const hero = doc.content.find((b) => b.type === 'Hero')!
    const bodyTypes = doc.content.map((b) => b.type).join(',')
    const stat = doc.content.find((b) => b.type === 'StatRow')!
    const statLabels = (stat.props.items as { label: string }[]).map((i) => i.label).join(',')
    return `${hero.props.eyebrow}|${hero.props.title}|${bodyTypes}|${statLabels}`
  }

  it('produces four different fingerprints', () => {
    const prints = SPACE_TEMPLATES.map(fingerprint)
    expect(new Set(prints).size).toBe(SPACE_TEMPLATES.length)
  })

  it('each template opens its body on a distinct lead section, mirroring the descriptor aboutLead', () => {
    // The block right after the Hero is the first non-empty About module. Map the module the
    // descriptor leads with (aboutLead) to the block type the preset uses for it.
    const leadBlockType: Record<string, string> = {
      'entity-offerings': 'Heading',
      'entity-about': 'MediaText',
      'entity-cta': 'CallToAction',
    }
    for (const t of SPACE_TEMPLATES) {
      const descriptor = templateDescriptor(t)
      const doc = generateSpacePreset(t, 'Willow Studio')
      const firstBody = doc.content[2] // after the Cover + Hero (Phase 2 leads with Cover)
      expect(firstBody.type).toBe(leadBlockType[descriptor.aboutLead])
    }
  })

  it('hub is the fullest body (mission-first, all functions on)', () => {
    const hub = generateSpacePreset('hub', 'Willow Studio')
    const book = generateSpacePreset('book', 'Willow Studio')
    expect(hub.content.length).toBeGreaterThan(book.content.length)
    // Hub leads its body with the mission (entity-about -> MediaText), right after the Cover + Hero.
    expect(hub.content[2].type).toBe('MediaText')
  })
})

describe('Phase 2 content blocks are wired into the presets (Cover leads; per-template placements)', () => {
  const types = (t: SpaceTemplate) => generateSpacePreset(t, 'Willow Studio').content.map((b) => b.type)

  it('Cover is the first block in every template', () => {
    for (const t of SPACE_TEMPLATES) {
      expect(generateSpacePreset(t, 'Willow Studio').content[0]?.type).toBe('Cover')
    }
  })

  it('Book and Schedule include SpaceReviews then SpaceFAQ (proof near the CTA, FAQ lower)', () => {
    for (const t of ['book', 'schedule'] as const) {
      const ts = types(t)
      expect(ts).toContain('SpaceReviews')
      expect(ts).toContain('SpaceFAQ')
      expect(ts.indexOf('SpaceReviews')).toBeLessThan(ts.indexOf('SpaceFAQ'))
      expect(ts).not.toContain('SpaceUpdates') // Updates are the Hub feed, not Book/Schedule
    }
  })

  it('Storefront keeps a Gallery, plus SpaceReviews and SpaceFAQ', () => {
    const ts = types('storefront')
    expect(ts).toContain('Gallery')
    expect(ts).toContain('SpaceReviews')
    expect(ts).toContain('SpaceFAQ')
  })

  it('Hub is the fullest: Cover, mission (MediaText), SpaceUpdates, Gallery, SpaceFAQ, community', () => {
    const ts = types('hub')
    expect(ts).toContain('Cover')
    expect(ts).toContain('SpaceUpdates')
    expect(ts).toContain('Gallery')
    expect(ts).toContain('SpaceFAQ')
    // The community beat is seeded as a Heading (entity-community); mission leads the body.
    expect(ts).toContain('MediaText')
  })

  it('every seeded content block is a currently-registered block type', () => {
    for (const t of SPACE_TEMPLATES) {
      const doc = generateSpacePreset(t, 'Willow Studio')
      expect(everyBlockKnown(doc)).toBe(true)
    }
  })
})

describe('generateSpacePresetForSpace resolves the template from the descriptor layer', () => {
  it('a practitioner resolves to the Book preset', () => {
    const doc = generateSpacePresetForSpace({ name: 'Ana Coaching', type: 'practitioner', variant: 'appointments' })
    // Book's hero CTA is "Book a session".
    const hero = doc.content.find((b) => b.type === 'Hero')!
    expect(hero.props.ctaPrimaryLabel).toBe(templateDescriptor('book').hero.primaryCta.label)
  })

  it('a Nonprofit/Organization tier forces the Hub preset', () => {
    const doc = generateSpacePresetForSpace({ name: 'Rivers Fund', type: 'business', plan: 'organization' })
    const hero = doc.content.find((b) => b.type === 'Hero')!
    expect(hero.props.ctaPrimaryLabel).toBe(templateDescriptor('hub').hero.primaryCta.label)
  })

  it('a preferences.template override wins over the type map', () => {
    const doc = generateSpacePresetForSpace({
      name: 'Willow Studio',
      type: 'business',
      variant: 'service',
      preferences: { template: 'schedule' },
    })
    const hero = doc.content.find((b) => b.type === 'Hero')!
    expect(hero.props.ctaPrimaryLabel).toBe(templateDescriptor('schedule').hero.primaryCta.label)
  })

  it('an unknown type is default-safe (Book), never blank', () => {
    const doc = generateSpacePresetForSpace({ name: 'Mystery', type: undefined })
    expect(doc.content.length).toBeGreaterThan(0)
    const hero = doc.content.find((b) => b.type === 'Hero')!
    expect(hero.props.ctaPrimaryLabel).toBe(templateDescriptor('book').hero.primaryCta.label)
  })
})

describe('readStoredSpaceDoc + isRenderableSpaceDoc', () => {
  const goodDoc: Data = generateSpacePreset('book', 'Willow Studio')

  it('reads a stored valid doc off preferences.puck', () => {
    expect(readStoredSpaceDoc({ puck: goodDoc })).toEqual(goodDoc)
  })

  it('returns null for a missing / malformed preferences blob', () => {
    for (const bad of [null, undefined, 7, 'x', [], {}, { puck: null }, { mode: {} }]) {
      expect(readStoredSpaceDoc(bad as unknown)).toBeNull()
    }
  })

  it('rejects a doc with an unknown block type (stale block set)', () => {
    const stale: Data = { root: {}, content: [{ type: 'RetiredBlock', props: { id: 'x' } }] }
    expect(isRenderableSpaceDoc(stale)).toBe(false)
    expect(readStoredSpaceDoc({ puck: stale })).toBeNull()
  })

  it('rejects an empty content array', () => {
    expect(isRenderableSpaceDoc({ root: {}, content: [] })).toBe(false)
  })

  it('accepts a doc where every block is a known type', () => {
    expect(isRenderableSpaceDoc(goodDoc)).toBe(true)
  })
})

describe('spacePuckData resolver (stored doc wins; else preset; fail-safe)', () => {
  it('returns the stored valid doc when present', () => {
    const stored = generateSpacePreset('schedule', 'Custom Space')
    const resolved = spacePuckData({ name: 'Willow Studio', type: 'practitioner', preferences: { puck: stored } })
    expect(resolved).toEqual(stored)
  })

  it('falls back to the generated preset when no stored doc is present', () => {
    const resolved = spacePuckData({ name: 'Willow Studio', type: 'practitioner', variant: 'appointments' })
    const preset = generateSpacePresetForSpace({ name: 'Willow Studio', type: 'practitioner', variant: 'appointments' })
    expect(resolved).toEqual(preset)
  })

  it('falls back to the preset when the stored doc has a stale block (fail-safe)', () => {
    const stale: Data = { root: {}, content: [{ type: 'RetiredBlock', props: { id: 'x' } }] }
    const resolved = spacePuckData({ name: 'Willow Studio', type: 'organization', plan: 'organization', preferences: { puck: stale } })
    const preset = generateSpacePresetForSpace({ name: 'Willow Studio', type: 'organization', plan: 'organization' })
    expect(resolved).toEqual(preset)
  })

  it('never returns a blank document', () => {
    const resolved = spacePuckData({ name: 'Willow Studio', type: undefined })
    expect(resolved.content.length).toBeGreaterThan(0)
  })
})
