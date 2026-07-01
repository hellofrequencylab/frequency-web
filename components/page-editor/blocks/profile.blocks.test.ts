import { describe, it, expect } from 'vitest'
import { profileComponents } from './profile'
import { config } from '@/lib/page-editor/config'

// PROFILE block set field schemas (Puck content blocks, Phase 4). Pure, no IO. Locks: the seven
// profile-native blocks are well-formed ComponentConfigs (fields + defaultProps + render), every
// default prop has a matching field, they are registered + categorised in the shared config, and no
// default copy carries an em dash. Importing profileComponents ALSO proves the module is client-safe
// (it must load without dragging in a server-only import, or this import throws) -- the build-trap
// boundary: a Profile block imports NOTHING server-only.

const KEYS = [
  'SpaceIdentityHeader',
  'SpaceAbout',
  'SpaceHighlights',
  'SpaceOfferings',
  'SpaceContact',
  'SpaceTeam',
  'SpaceCTA',
] as const

describe('the seven Profile blocks are well-formed ComponentConfigs', () => {
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

  it('all seven cards + the SpaceLayout box are grouped under the Profile category, layout box first', () => {
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

  it('SpaceTeam has a people array (name + role + avatar)', () => {
    const f = profileComponents.SpaceTeam.fields!.members as unknown as { type: string; arrayFields: Record<string, unknown> }
    expect(f.type).toBe('array')
    expect(Object.keys(f.arrayFields)).toEqual(['name', 'role', 'avatar'])
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

describe('CONTENT-VOICE: no em dashes in any default copy', () => {
  it('none of the Profile blocks seed an em dash', () => {
    for (const key of KEYS) {
      expect(JSON.stringify(profileComponents[key].defaultProps)).not.toContain('—')
    }
  })
})
