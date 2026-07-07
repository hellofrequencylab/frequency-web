import { describe, it, expect } from 'vitest'
import { profileComponents, selectSpaceStats } from './profile'
import { config } from '@/lib/page-editor/config'
import type { SpaceStat } from '@/lib/spaces/content-data'

// PROFILE block set field schemas (Puck content blocks, Phase 4). Pure, no IO. Locks: the
// profile-native blocks are well-formed ComponentConfigs (fields + defaultProps + render), every
// default prop has a matching field, they are registered + categorised in the shared config, and no
// default copy carries an em dash. Importing profileComponents ALSO proves the module is client-safe
// (it must load without dragging in a server-only import, or this import throws) -- the build-trap
// boundary: a Profile block imports NOTHING server-only. The business-profile set now also carries the
// operator-configurable SpaceStats, SpaceQuickLinks, SpaceEvents (live), and SpaceBooking (live) blocks.

const KEYS = [
  'SpaceIdentityHeader',
  'SpaceAbout',
  'SpaceHighlights',
  'SpaceStats',
  'SpaceQuickLinks',
  'SpaceEvents',
  'SpacePractices',
  'SpaceCommunity',
  'SpaceBooking',
  'SpaceOfferings',
  'SpaceContact',
  'SpaceTeam',
  'SpaceCTA',
] as const

describe('the Profile blocks are well-formed ComponentConfigs', () => {
  for (const key of KEYS) {
    it(`${key} has fields, defaultProps, and a render`, () => {
      const block = profileComponents[key]
      expect(block).toBeTruthy()
      expect(typeof block.render).toBe('function')
      expect(block.fields).toBeTruthy()
      expect(block.defaultProps).toBeTruthy()
    })

    it(`${key} declares a field for every default prop (no orphan defaults)`, () => {
      const block = profileComponents[key]
      const fieldKeys = new Set(Object.keys(block.fields ?? {}))
      for (const propKey of Object.keys(block.defaultProps ?? {})) {
        if (propKey === 'id') continue // Puck-managed, never a declared field
        expect(fieldKeys.has(propKey), `${key}.${propKey}`).toBe(true)
      }
    })
  }
})

describe('the Profile blocks are registered + categorised in the shared config', () => {
  it('every Profile block is in config.components', () => {
    for (const key of KEYS) {
      expect(config.components[key]).toBeTruthy()
    }
  })

  it('all the cards + the SpaceLayout box are grouped under the Profile category, layout box first', () => {
    const profile = config.categories?.profile?.components ?? []
    for (const key of KEYS) {
      expect(profile).toContain(key)
    }
    expect(profile).toContain('SpaceLayout')
    expect(profile[0]).toBe('SpaceLayout')
  })

  it('does NOT remove the marketing blocks (the Profile set is additive)', () => {
    for (const marketing of ['Hero', 'FeatureGrid', 'StatRow', 'MediaText', 'CallToAction']) {
      expect(config.components[marketing]).toBeTruthy()
    }
  })
})

describe('the SpaceLayout region box is a well-formed slot shell', () => {
  it('is a well-formed ComponentConfig (fields + defaultProps + render)', () => {
    const block = profileComponents.SpaceLayout
    expect(block).toBeTruthy()
    expect(typeof block.render).toBe('function')
    expect(block.fields).toBeTruthy()
    expect(block.defaultProps).toBeTruthy()
  })

  it('declares a main slot and a side slot', () => {
    const fields = profileComponents.SpaceLayout.fields ?? {}
    expect((fields.main as { type?: string } | undefined)?.type).toBe('slot')
    expect((fields.side as { type?: string } | undefined)?.type).toBe('slot')
  })

  it('defaults both slots to empty arrays (no orphan defaults)', () => {
    const block = profileComponents.SpaceLayout
    const fieldKeys = new Set(Object.keys(block.fields ?? {}))
    for (const propKey of Object.keys(block.defaultProps ?? {})) {
      if (propKey === 'id') continue
      expect(fieldKeys.has(propKey), `SpaceLayout.${propKey}`).toBe(true)
    }
    expect(block.defaultProps?.main).toEqual([])
    expect(block.defaultProps?.side).toEqual([])
  })
})

describe('the operator-authored list blocks expose array fields', () => {
  it('SpaceOfferings has an offerings array (title + blurb)', () => {
    const f = profileComponents.SpaceOfferings.fields!.items as unknown as { type: string; arrayFields: Record<string, unknown> }
    expect(f.type).toBe('array')
    expect(Object.keys(f.arrayFields)).toEqual(['title', 'blurb'])
  })

  it('SpaceTeam has a people array (name + role + avatar) as the manual fallback', () => {
    const f = profileComponents.SpaceTeam.fields!.members as unknown as { type: string; arrayFields: Record<string, unknown> }
    expect(f.type).toBe('array')
    expect(Object.keys(f.arrayFields)).toEqual(['name', 'role', 'avatar'])
  })

  it('SpaceTeam has a network member picker storing an ordered id list', () => {
    const f = profileComponents.SpaceTeam.fields!.memberPicks as unknown as { type: string }
    expect(f.type).toBe('custom')
    const defaults = profileComponents.SpaceTeam.defaultProps as { memberPicks?: { ids?: unknown } }
    expect(defaults.memberPicks).toEqual({ ids: [] })
  })
})

describe('SpaceIdentityHeader is switchable between a Header and a Hero style', () => {
  it('exposes a style radio with header + hero options, defaulting to header', () => {
    const block = profileComponents.SpaceIdentityHeader
    const styleField = block.fields!.style as unknown as {
      type: string
      options: { value: string }[]
    }
    expect(styleField.type).toBe('radio')
    expect(styleField.options.map((o) => o.value)).toEqual(['header', 'hero'])
    expect(block.defaultProps?.style).toBe('header')
  })
})

describe('the new business-profile blocks expose clean, operator-editable fields', () => {
  it('SpaceStats has a metric-choice array (metric + label override), defaulting to real metrics', () => {
    const f = profileComponents.SpaceStats.fields!.metrics as unknown as {
      type: string
      arrayFields: Record<string, unknown>
    }
    expect(f.type).toBe('array')
    expect(Object.keys(f.arrayFields)).toEqual(['metric', 'label'])
    const defaults = profileComponents.SpaceStats.defaultProps?.metrics as { metric: string }[]
    expect(defaults.length).toBeGreaterThan(0)
  })

  it('SpaceQuickLinks has a links array (label + href), empty by default (honest)', () => {
    const f = profileComponents.SpaceQuickLinks.fields!.links as unknown as {
      type: string
      arrayFields: Record<string, unknown>
    }
    expect(f.type).toBe('array')
    expect(Object.keys(f.arrayFields)).toEqual(['label', 'href'])
    expect(profileComponents.SpaceQuickLinks.defaultProps?.links).toEqual([])
  })

  it('SpaceEvents lets the operator set a title + a max count', () => {
    const fields = profileComponents.SpaceEvents.fields ?? {}
    expect((fields.heading as { type?: string } | undefined)?.type).toBe('text')
    expect((fields.max as { type?: string } | undefined)?.type).toBe('select')
  })

  it('SpaceBooking exposes a heading, body, button label, and accent toggle', () => {
    const fields = profileComponents.SpaceBooking.fields ?? {}
    for (const k of ['heading', 'body', 'ctaLabel', 'accent']) {
      expect(Object.keys(fields)).toContain(k)
    }
  })

  it('SpacePractices lets the operator label the practices + journeys groups', () => {
    const fields = profileComponents.SpacePractices.fields ?? {}
    for (const k of ['eyebrow', 'heading', 'practicesHeading', 'journeysHeading']) {
      expect(Object.keys(fields)).toContain(k)
    }
    expect((fields.practicesHeading as { type?: string } | undefined)?.type).toBe('text')
    expect((fields.journeysHeading as { type?: string } | undefined)?.type).toBe('text')
  })

  it('SpaceCommunity exposes an eyebrow + heading (live, no authored list)', () => {
    const fields = profileComponents.SpaceCommunity.fields ?? {}
    expect(Object.keys(fields).sort()).toEqual(['eyebrow', 'heading'])
  })
})

describe('selectSpaceStats is honest: chosen order, no invented / zero numbers', () => {
  const stats: SpaceStat[] = [
    { metric: 'members', label: 'Members', value: 12 },
    { metric: 'offerings', label: 'Offerings', value: 4 },
    { metric: 'sessions', label: 'Upcoming sessions', value: 0 },
  ]

  it('keeps the operator order and resolves live values', () => {
    const out = selectSpaceStats([{ metric: 'offerings' }, { metric: 'members' }], stats)
    expect(out.map((s) => s.metric)).toEqual(['offerings', 'members'])
    expect(out.map((s) => s.value)).toEqual([4, 12])
  })

  it('drops a metric that resolves to zero (honest at day zero)', () => {
    const out = selectSpaceStats([{ metric: 'sessions' }, { metric: 'members' }], stats)
    expect(out.map((s) => s.metric)).toEqual(['members'])
  })

  it('drops a metric that is absent from the resolved set (never invents a number)', () => {
    const out = selectSpaceStats([{ metric: 'circles' }], stats)
    expect(out).toEqual([])
  })

  it('applies a label override, else falls back to the resolved label', () => {
    const out = selectSpaceStats([{ metric: 'members', label: 'People' }, { metric: 'offerings' }], stats)
    expect(out[0].label).toBe('People')
    expect(out[1].label).toBe('Offerings')
  })

  it('renders nothing when no metadata (empty resolved set)', () => {
    expect(selectSpaceStats([{ metric: 'members' }], [])).toEqual([])
  })
})

describe('CONTENT-VOICE: no em dashes in any default copy', () => {
  it('none of the Profile blocks seed an em dash', () => {
    for (const key of KEYS) {
      expect(JSON.stringify(profileComponents[key].defaultProps)).not.toContain('—')
    }
  })
})
