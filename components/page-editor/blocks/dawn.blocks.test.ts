import { describe, it, expect } from 'vitest'
import { dawnComponents } from './dawn'
import { sectionsComponents } from './sections'
import { config } from '@/lib/page-editor/config'

// DAWN 2 marketing block schemas. Pure, no IO. Locks: every block is a well-formed
// ComponentConfig (fields + defaultProps + render), every default prop has a matching
// field (no orphan defaults), the PlanBand live-price binding field exists on both the
// row and the strip (ADR-918), and each block is registered + categorised in the shared
// config so it shows up in the editor left bar. Importing dawnComponents ALSO proves
// the module stays client-safe.

const KEYS = [
  'PhotoBeat',
  'PhotoTrio',
  'StoryBeats',
  'ValueBand',
  'BuildTimeline',
  'PhotoCardRow',
  'PlanBand',
  'PillarNav',
  'DawnHowToSteps',
] as const

describe('every DAWN block is a well-formed ComponentConfig', () => {
  it.each(KEYS)('%s has fields, defaultProps, and a render', (key) => {
    const block = dawnComponents[key]
    expect(block).toBeTruthy()
    expect(typeof block.render).toBe('function')
    expect(block.fields).toBeTruthy()
    expect(block.defaultProps).toBeTruthy()
  })

  it.each(KEYS)('%s declares a field for every default prop (no orphan defaults)', (key) => {
    const block = dawnComponents[key]
    const fieldKeys = new Set(Object.keys(block.fields ?? {}))
    for (const propKey of Object.keys(block.defaultProps ?? {})) {
      if (propKey === 'id') continue
      expect(fieldKeys.has(propKey), `${key}.${propKey}`).toBe(true)
    }
  })
})

describe('PlanBand binds to live pricing (ADR-918)', () => {
  it('carries livePriceKey on both the row and the strip', () => {
    const fields = dawnComponents.PlanBand.fields ?? {}
    for (const name of ['plans', 'strip'] as const) {
      const arr = fields[name] as { type?: string; arrayFields?: Record<string, unknown> }
      expect(arr?.type).toBe('array')
      expect(Object.keys(arr?.arrayFields ?? {})).toContain('livePriceKey')
    }
  })

  it('price schema is opt-in (off by default: /pricing hoists its own)', () => {
    expect((dawnComponents.PlanBand.defaultProps as { priceSchema?: string }).priceSchema).toBe('off')
  })
})

describe('the Hero fact dock (DAWN glass dock on the existing Hero key)', () => {
  it('Hero declares a facts array of value/label pairs, defaulting empty', () => {
    const facts = (sectionsComponents.Hero.fields ?? {}).facts as {
      type?: string
      arrayFields?: Record<string, unknown>
    }
    expect(facts?.type).toBe('array')
    expect(Object.keys(facts?.arrayFields ?? {}).sort()).toEqual(['label', 'value'])
    expect((sectionsComponents.Hero.defaultProps as { facts?: unknown[] }).facts).toEqual([])
  })
})

describe('DAWN blocks are registered + categorised in the shared config', () => {
  it.each(KEYS)('%s is in config.components', (key) => {
    expect(config.components[key]).toBeTruthy()
  })

  it('is listed under the expected left-bar categories', () => {
    const media = config.categories?.media?.components ?? []
    const content = config.categories?.content?.components ?? []
    const sections = config.categories?.sections?.components ?? []
    expect(media).toContain('PhotoBeat')
    expect(media).toContain('PhotoTrio')
    expect(content).toContain('StoryBeats')
    for (const key of [
      'ValueBand',
      'BuildTimeline',
      'PhotoCardRow',
      'PlanBand',
      'PillarNav',
      'DawnHowToSteps',
    ]) {
      expect(sections).toContain(key)
    }
  })
})
