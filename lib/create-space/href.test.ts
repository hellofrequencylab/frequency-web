import { describe, expect, it } from 'vitest'
import { createSpaceHref } from './href'
import { PREVIEW_KIT_ORDER } from '@/lib/theme/preview-tokens'

describe('createSpaceHref', () => {
  it('carries every preview kit', () => {
    for (const id of PREVIEW_KIT_ORDER) expect(createSpaceHref(id)).toBe(`/create-a-space?kit=${id}`)
  })
  it('drops an unknown or missing kit', () => {
    expect(createSpaceHref('network')).toBe('/create-a-space')
    expect(createSpaceHref(null)).toBe('/create-a-space')
    expect(createSpaceHref()).toBe('/create-a-space')
  })
  it('carries the accent picked beside the Use button, and drops an odd one', () => {
    expect(createSpaceHref('cyberwitch', 'Absinthe')).toBe('/create-a-space?kit=cyberwitch&accent=absinthe')
    expect(createSpaceHref('cyberwitch', 'a b<c')).toBe('/create-a-space?kit=cyberwitch')
    expect(createSpaceHref('network', 'absinthe')).toBe('/create-a-space')
  })
})
