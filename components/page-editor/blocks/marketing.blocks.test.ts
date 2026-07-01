import { describe, it, expect } from 'vitest'
import { marketingComponents } from './marketing'
import { config } from '@/lib/page-editor/config'

// LeadFunnel block schema (Puck marketing block). Pure, no IO. Locks: the block is a
// well-formed ComponentConfig (fields + defaultProps + render), every default prop has a
// matching field (no orphan defaults), its editable steps carry the array field shape, and
// it is registered + categorised in the shared config so it shows up in the editor left bar.
// Importing marketingComponents ALSO proves the module stays client-safe.

describe('LeadFunnel marketing block is a well-formed ComponentConfig', () => {
  it('has fields, defaultProps, and a render', () => {
    const block = marketingComponents.LeadFunnel
    expect(block).toBeTruthy()
    expect(typeof block.render).toBe('function')
    expect(block.fields).toBeTruthy()
    expect(block.defaultProps).toBeTruthy()
  })

  it('declares a field for every default prop (no orphan defaults)', () => {
    const block = marketingComponents.LeadFunnel
    const fieldKeys = new Set(Object.keys(block.fields ?? {}))
    for (const propKey of Object.keys(block.defaultProps ?? {})) {
      if (propKey === 'id') continue
      expect(fieldKeys.has(propKey)).toBe(true)
    }
  })

  it('offers both directions and editable steps', () => {
    const fields = marketingComponents.LeadFunnel.fields ?? {}
    const orientation = fields.orientation as { options?: { value: string }[] }
    expect(orientation?.options?.map((o) => o.value).sort()).toEqual(['horizontal', 'vertical'])

    const steps = fields.steps as { type?: string; arrayFields?: Record<string, unknown> }
    expect(steps?.type).toBe('array')
    expect(Object.keys(steps?.arrayFields ?? {}).sort()).toEqual(['caption', 'illustration', 'label'])
  })
})

describe('LeadFunnel is registered + categorised in the shared config', () => {
  it('is in config.components', () => {
    expect(config.components.LeadFunnel).toBeTruthy()
  })

  it('is listed under the Sections category', () => {
    expect(config.categories?.sections?.components).toContain('LeadFunnel')
  })
})
