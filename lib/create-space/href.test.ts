import { describe, expect, it } from 'vitest'
import { createSpaceHref } from './href'
import { PREVIEW_KIT_ORDER } from '@/lib/theme/preview-tokens'

describe('createSpaceHref', () => {
  it('carries every preview kit', () => {
    for (const id of PREVIEW_KIT_ORDER) expect(createSpaceHref(id)).toBe(`/launch-your-business?kit=${id}`)
  })
  it('drops an unknown or missing kit', () => {
    expect(createSpaceHref('network')).toBe('/launch-your-business')
    expect(createSpaceHref(null)).toBe('/launch-your-business')
    expect(createSpaceHref()).toBe('/launch-your-business')
  })
  it('carries the accent picked beside the Use button, and drops an odd one', () => {
    expect(createSpaceHref('cyberwitch', 'Absinthe')).toBe('/launch-your-business?kit=cyberwitch&accent=absinthe')
    expect(createSpaceHref('cyberwitch', 'a b<c')).toBe('/launch-your-business?kit=cyberwitch')
    expect(createSpaceHref('network', 'absinthe')).toBe('/launch-your-business')
  })
})
