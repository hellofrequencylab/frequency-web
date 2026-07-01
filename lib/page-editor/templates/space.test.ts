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

// SPACE LANDING PUCK PRESET + RESOLVER contract (Phase 4, profile-native block set). Pure, no IO.
// Locks: the four presets are valid Puck documents composed only from registered blocks, every
// template LEADS with SpaceIdentityHeader (the shared cover/logo identity), the arrangement is
// distinct per template (Book / Schedule / Storefront / Hub), NONE of the marketing display-type
// blocks (Hero / FeatureGrid / StatRow / MediaText / CallToAction) remain in the space presets, and
// the resolver prefers a stored valid doc, else the preset, fail-safe throughout.

const KNOWN_BLOCKS = new Set(Object.keys(config.components))

// The marketing display-type blocks the profile presets must NO LONGER seed (they still power the
// marketing pages; the Profile set is additive, only the space PRESETS switched).
const MARKETING_BLOCKS = ['Hero', 'FeatureGrid', 'StatRow', 'MediaText', 'CallToAction'] as const

// Every block in a doc is a currently-registered block type.
function everyBlockKnown(data: Data): boolean {
  return (data.content ?? []).every((b) => typeof b?.type === 'string' && KNOWN_BLOCKS.has(b.type))
}

const types = (t: SpaceTemplate) => generateSpacePreset(t, 'Willow Studio').content.map((b) => b.type)

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
      expect(everyBlockKnown(generateSpacePreset(t, 'Willow Studio'))).toBe(true)
    }
  })

  it('LEADS every template with SpaceIdentityHeader (the shared cover/logo identity)', () => {
    for (const t of SPACE_TEMPLATES) {
      expect(generateSpacePreset(t, 'Willow Studio').content[0]?.type).toBe('SpaceIdentityHeader')
    }
  })

  it('never seeds any marketing display-type block (they read like a landing page, not a profile)', () => {
    for (const t of SPACE_TEMPLATES) {
      const ts = types(t)
      for (const marketing of MARKETING_BLOCKS) {
        expect(ts, `${t} must not include ${marketing}`).not.toContain(marketing)
      }
    }
  })

  it('threads the Space name through the copy so it reads as the operator site', () => {
    const doc = generateSpacePreset('book', 'Willow Studio')
    const json = JSON.stringify(doc)
    expect(json).toContain('Willow Studio')
  })

  it('never emits an em dash in any string prop (CONTENT-VOICE punctuation)', () => {
    for (const t of SPACE_TEMPLATES) {
      expect(JSON.stringify(generateSpacePreset(t, 'Willow Studio'))).not.toContain('—')
    }
  })

  it('falls back to a neutral name when the brand name is blank', () => {
    const doc = generateSpacePreset('hub', '   ')
    expect(JSON.stringify(doc)).toContain('this space')
  })
})

describe('the four presets read visibly distinct (per-template arrangement)', () => {
  function fingerprint(t: SpaceTemplate): string {
    return types(t).join(',')
  }

  it('produces four different fingerprints', () => {
    const prints = SPACE_TEMPLATES.map(fingerprint)
    expect(new Set(prints).size).toBe(SPACE_TEMPLATES.length)
  })

  it('Book: Identity -> Highlights -> Offerings -> CTA -> Reviews -> FAQ -> About -> Contact', () => {
    expect(types('book')).toEqual([
      'SpaceIdentityHeader',
      'SpaceHighlights',
      'SpaceOfferings',
      'SpaceCTA',
      'SpaceReviews',
      'SpaceFAQ',
      'SpaceAbout',
      'SpaceContact',
    ])
  })

  it('Schedule: Identity -> Offerings -> CTA -> Highlights -> Reviews -> About -> Contact', () => {
    expect(types('schedule')).toEqual([
      'SpaceIdentityHeader',
      'SpaceOfferings',
      'SpaceCTA',
      'SpaceHighlights',
      'SpaceReviews',
      'SpaceAbout',
      'SpaceContact',
    ])
  })

  it('Storefront: Identity -> Offerings -> Gallery -> Reviews -> About -> Contact', () => {
    expect(types('storefront')).toEqual([
      'SpaceIdentityHeader',
      'SpaceOfferings',
      'Gallery',
      'SpaceReviews',
      'SpaceAbout',
      'SpaceContact',
    ])
  })

  it('Hub is the fullest: Identity -> About -> CTA -> Updates -> Offerings -> Gallery -> Team -> FAQ -> Contact', () => {
    expect(types('hub')).toEqual([
      'SpaceIdentityHeader',
      'SpaceAbout',
      'SpaceCTA',
      'SpaceUpdates',
      'SpaceOfferings',
      'Gallery',
      'SpaceTeam',
      'SpaceFAQ',
      'SpaceContact',
    ])
    // Hub is the fullest of the four.
    for (const t of ['book', 'schedule', 'storefront'] as const) {
      expect(types('hub').length).toBeGreaterThan(types(t).length)
    }
  })

  it('reuses the Phase 2 dynamic blocks + Gallery (never rebuilds them)', () => {
    expect(types('hub')).toContain('SpaceUpdates')
    expect(types('storefront')).toContain('Gallery')
    for (const t of ['book', 'schedule', 'storefront'] as const) {
      expect(types(t)).toContain('SpaceReviews')
    }
  })
})

describe('generateSpacePresetForSpace resolves the template from the descriptor layer', () => {
  // The primary CTA copy still threads through: Book seeds a "Book a session" SpaceCTA.
  function ctaLabels(doc: Data): string[] {
    return doc.content.filter((b) => b.type === 'SpaceCTA').map((b) => String(b.props.ctaLabel))
  }

  it('a practitioner resolves to the Book preset (a bookable CTA)', () => {
    const doc = generateSpacePresetForSpace({ name: 'Ana Coaching', type: 'practitioner', variant: 'appointments' })
    expect(doc.content[0]?.type).toBe('SpaceIdentityHeader')
    expect(ctaLabels(doc)).toContain(templateDescriptor('book').hero.primaryCta.label)
  })

  it('a Nonprofit/Organization tier forces the Hub preset (the fullest arrangement)', () => {
    const doc = generateSpacePresetForSpace({ name: 'Rivers Fund', type: 'business', plan: 'organization' })
    expect(doc.content.map((b) => b.type)).toContain('SpaceTeam') // Team rides only on Hub
    expect(ctaLabels(doc)).toContain(templateDescriptor('hub').hero.primaryCta.label)
  })

  it('a preferences.template override wins over the type map', () => {
    const doc = generateSpacePresetForSpace({
      name: 'Willow Studio',
      type: 'business',
      variant: 'service',
      preferences: { template: 'schedule' },
    })
    // Schedule's arrangement leads Offerings before Highlights.
    const ts = doc.content.map((b) => b.type)
    expect(ts.indexOf('SpaceOfferings')).toBeLessThan(ts.indexOf('SpaceHighlights'))
  })

  it('an unknown type is default-safe (Book), never blank', () => {
    const doc = generateSpacePresetForSpace({ name: 'Mystery', type: undefined })
    expect(doc.content.length).toBeGreaterThan(0)
    expect(doc.content[0]?.type).toBe('SpaceIdentityHeader')
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
