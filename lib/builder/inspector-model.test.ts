import { describe, expect, it } from 'vitest'
import { dividerBlock } from '@/lib/entity-blocks/contract/divider'
import { photoHeroBlock } from '@/lib/entity-blocks/contract/photoHero'
import type { BuilderDevice } from './state'
import {
  inspectorFields,
  resetInspectorOverride,
  resolveInspectorValue,
  type InspectorDeviceValues,
} from './inspector-model'

describe('inspector fields', () => {
  it('uses the block contract as the field list when the surface allows every field', () => {
    expect(inspectorFields(photoHeroBlock, 'space-site')).toEqual(photoHeroBlock.fields)
  })

  it('limits the fields to the surface list and preserves the contract metadata and order', () => {
    const block = {
      ...photoHeroBlock,
      surfaces: {
        'space-site': { density: 'roomy', fields: ['image', 'title', 'unknown'] },
      },
    } as const

    const fields = inspectorFields(block, 'space-site')
    expect(fields.map(field => field.key)).toEqual(['title', 'image'])
    expect(fields[1]).toBe(photoHeroBlock.fields.find(field => field.key === 'image'))
    expect(fields[1]?.upload).toBe(true)
  })

  it('exposes no fields when a surface is absent or declares an empty list', () => {
    expect(inspectorFields(photoHeroBlock, 'profile-inapp')).toEqual([])
    expect(inspectorFields(dividerBlock, 'space-site')).toEqual([])
  })
})

type Display = { hidden: boolean; padding: number; columns: number }
const values: InspectorDeviceValues<Display> = {
  desktop: { hidden: true, padding: 24 },
  tablet: { hidden: false, padding: 0 },
  phone: { hidden: true },
}

describe('inspector device values', () => {
  it.each<{
    device: BuilderDevice
    key: keyof Display
    value: boolean | number | undefined
    source: BuilderDevice | null
  }>([
    { device: 'desktop', key: 'hidden', value: true, source: 'desktop' },
    { device: 'tablet', key: 'hidden', value: false, source: 'tablet' },
    { device: 'tablet', key: 'padding', value: 0, source: 'tablet' },
    { device: 'phone', key: 'hidden', value: true, source: 'phone' },
    { device: 'phone', key: 'padding', value: 24, source: 'desktop' },
    { device: 'phone', key: 'columns', value: undefined, source: null },
  ])('resolves $key on $device with source $source', ({ device, key, value, source }) => {
    expect(resolveInspectorValue(values, device, key)).toEqual({ value, source })
  })

  it('resets just one field while keeping other fields and the other device', () => {
    const next = resetInspectorOverride(values, 'tablet', 'padding')

    expect(resolveInspectorValue(next, 'tablet', 'padding')).toEqual({ value: 24, source: 'desktop' })
    expect(resolveInspectorValue(next, 'tablet', 'hidden')).toEqual({ value: false, source: 'tablet' })
    expect(next.phone).toBe(values.phone)
    expect(values.tablet?.padding).toBe(0)
  })

  it('removes an empty override and returns the same values when the field already inherits', () => {
    const next = resetInspectorOverride(values, 'phone', 'hidden')

    expect(next).not.toHaveProperty('phone')
    expect(resolveInspectorValue(next, 'phone', 'hidden')).toEqual({ value: true, source: 'desktop' })
    expect(next.tablet).toBe(values.tablet)
    expect(resetInspectorOverride(next, 'phone', 'padding')).toBe(next)
  })
})
