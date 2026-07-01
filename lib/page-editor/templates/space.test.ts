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

// SPACE LANDING PUCK PRESET + RESOLVER contract (profile-native block set). Pure, no IO.
// Locks: the four presets are valid Puck documents composed only from registered blocks, the body is
// the single SpaceLayout content grid (the identity header is owned by the profile LAYOUT now, never a
// block in the preset), the arrangement is distinct per template (Book / Schedule / Storefront / Hub),
// NONE of the marketing display-type blocks (Hero / FeatureGrid / StatRow / MediaText / CallToAction)
// remain in the space presets, and the resolver prefers a stored valid doc, else the preset, fail-safe.

const KNOWN_BLOCKS = new Set(Object.keys(config.components))

// The marketing display-type blocks the profile presets must NO LONGER seed (they still power the
// marketing pages; the Profile set is additive, only the space PRESETS switched).
const MARKETING_BLOCKS = ['Hero', 'FeatureGrid', 'StatRow', 'MediaText', 'CallToAction'] as const

type SlotBlock = { type: string; props: Record<string, unknown> }

// The layout box's two slots hold the cards INLINE (Puck 0.20 slot arrays in props).
function layoutOf(t: SpaceTemplate): { main: string[]; side: string[] } {
  const layout = generateSpacePreset(t, 'Willow Studio').content.find((b) => b.type === 'SpaceLayout')!
  const read = (arr: unknown): string[] => ((arr as SlotBlock[] | undefined) ?? []).map((b) => b.type)
  return { main: read(layout.props.main), side: read(layout.props.side) }
}

// Flatten every block type in a doc: top-level content + any SpaceLayout main/side slots.
function allTypes(data: Data): string[] {
  const out: string[] = []
  for (const b of data.content ?? []) {
    out.push(b.type)
    if (b.type === 'SpaceLayout') {
      for (const key of ['main', 'side'] as const) {
        for (const child of ((b.props as Record<string, unknown>)[key] as SlotBlock[] | undefined) ?? []) {
          out.push(child.type)
        }
      }
    }
  }
  return out
}

// Every block in a doc (top-level AND SpaceLayout slot children) is a registered block type.
function everyBlockKnown(data: Data): boolean {
  return allTypes(data).every((t) => KNOWN_BLOCKS.has(t))
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

  it('composes ONLY from registered blocks (top-level AND slot children)', () => {
    for (const t of SPACE_TEMPLATES) {
      expect(everyBlockKnown(generateSpacePreset(t, 'Willow Studio'))).toBe(true)
    }
  })

  it('is a single-block top level: the SpaceLayout region box (identity header is layout-owned)', () => {
    for (const t of SPACE_TEMPLATES) {
      const ts = types(t)
      expect(ts).toEqual(['SpaceLayout'])
    }
  })

  it('never seeds the identity header in the preset (the profile LAYOUT owns it now)', () => {
    for (const t of SPACE_TEMPLATES) {
      expect(allTypes(generateSpacePreset(t, 'Willow Studio'))).not.toContain('SpaceIdentityHeader')
    }
  })

  it('never seeds any marketing display-type block anywhere (top-level or slots)', () => {
    for (const t of SPACE_TEMPLATES) {
      const ts = allTypes(generateSpacePreset(t, 'Willow Studio'))
      for (const marketing of MARKETING_BLOCKS) {
        expect(ts, `${t} must not include ${marketing}`).not.toContain(marketing)
      }
    }
  })

  it('drops the Gallery block from the profile presets', () => {
    for (const t of SPACE_TEMPLATES) {
      expect(allTypes(generateSpacePreset(t, 'Willow Studio'))).not.toContain('Gallery')
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
  // Fingerprint = main + side types, so a distinct arrangement (even with the same top-level shape)
  // reads as a different preset.
  function fingerprint(t: SpaceTemplate): string {
    const { main, side } = layoutOf(t)
    return [...main, '|', ...side].join(',')
  }

  it('produces four different fingerprints', () => {
    const prints = SPACE_TEMPLATES.map(fingerprint)
    expect(new Set(prints).size).toBe(SPACE_TEMPLATES.length)
  })

  it('Book: main = Offerings -> Booking -> Events -> Reviews -> FAQ; side = Highlights -> About -> QuickLinks -> Contact', () => {
    expect(layoutOf('book')).toEqual({
      main: ['SpaceOfferings', 'SpaceBooking', 'SpaceEvents', 'SpaceReviews', 'SpaceFAQ'],
      side: ['SpaceHighlights', 'SpaceAbout', 'SpaceQuickLinks', 'SpaceContact'],
    })
  })

  it('Schedule: main = Offerings -> Events -> Reviews; side = Highlights -> About -> Contact', () => {
    expect(layoutOf('schedule')).toEqual({
      main: ['SpaceOfferings', 'SpaceEvents', 'SpaceReviews'],
      side: ['SpaceHighlights', 'SpaceAbout', 'SpaceContact'],
    })
  })

  it('Storefront: main = Offerings -> Reviews; side = Highlights -> About -> QuickLinks -> Contact', () => {
    expect(layoutOf('storefront')).toEqual({
      main: ['SpaceOfferings', 'SpaceReviews'],
      side: ['SpaceHighlights', 'SpaceAbout', 'SpaceQuickLinks', 'SpaceContact'],
    })
  })

  it('Hub is the fullest: main = About -> Updates -> Events -> Offerings -> Team; side = Highlights -> CTA -> QuickLinks -> Contact -> FAQ', () => {
    expect(layoutOf('hub')).toEqual({
      main: ['SpaceAbout', 'SpaceUpdates', 'SpaceEvents', 'SpaceOfferings', 'SpaceTeam'],
      side: ['SpaceHighlights', 'SpaceCTA', 'SpaceQuickLinks', 'SpaceContact', 'SpaceFAQ'],
    })
    // Hub is the fullest of the four (most cards across both slots).
    const cardCount = (t: SpaceTemplate) => {
      const { main, side } = layoutOf(t)
      return main.length + side.length
    }
    for (const t of ['book', 'schedule', 'storefront'] as const) {
      expect(cardCount('hub')).toBeGreaterThan(cardCount(t))
    }
  })

  it('reuses the Phase 2 dynamic blocks (never rebuilds them)', () => {
    expect(allTypes(generateSpacePreset('hub', 'Willow Studio'))).toContain('SpaceUpdates')
    for (const t of ['book', 'schedule', 'storefront'] as const) {
      expect(allTypes(generateSpacePreset(t, 'Willow Studio'))).toContain('SpaceReviews')
    }
  })
})

describe('generateSpacePresetForSpace resolves the template from the descriptor layer', () => {
  // The primary CTA copy still threads through, now inside the SpaceLayout slots.
  function ctaLabels(doc: Data): string[] {
    const labels: string[] = []
    for (const b of doc.content) {
      if (b.type !== 'SpaceLayout') continue
      for (const key of ['main', 'side'] as const) {
        for (const child of ((b.props as Record<string, unknown>)[key] as SlotBlock[] | undefined) ?? []) {
          if (child.type === 'SpaceCTA') labels.push(String(child.props.ctaLabel))
        }
      }
    }
    return labels
  }

  it('a practitioner resolves to the Book preset (seeds the live Booking entry)', () => {
    const doc = generateSpacePresetForSpace({ name: 'Ana Coaching', type: 'practitioner', variant: 'appointments' })
    expect(doc.content[0]?.type).toBe('SpaceLayout')
    // The Book preset leads with the bookable Offerings + a live Booking call-to-action.
    expect(allTypes(doc)).toContain('SpaceBooking')
  })

  it('a Nonprofit/Organization tier forces the Hub preset (the fullest arrangement)', () => {
    const doc = generateSpacePresetForSpace({ name: 'Rivers Fund', type: 'business', plan: 'organization' })
    expect(allTypes(doc)).toContain('SpaceTeam') // Team rides only on Hub (in its main slot)
    expect(ctaLabels(doc)).toContain(templateDescriptor('hub').hero.primaryCta.label)
  })

  it('a preferences.template override wins over the type map', () => {
    const doc = generateSpacePresetForSpace({
      name: 'Willow Studio',
      type: 'business',
      variant: 'service',
      preferences: { template: 'schedule' },
    })
    // Schedule leads its main slot with Offerings (its distinctive arrangement).
    const layout = doc.content.find((b) => b.type === 'SpaceLayout')!
    const main = ((layout.props.main as SlotBlock[] | undefined) ?? []).map((b) => b.type)
    expect(main[0]).toBe('SpaceOfferings')
  })

  it('an unknown type is default-safe (Book), never blank', () => {
    const doc = generateSpacePresetForSpace({ name: 'Mystery', type: undefined })
    expect(doc.content.length).toBeGreaterThan(0)
    expect(doc.content[0]?.type).toBe('SpaceLayout')
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
