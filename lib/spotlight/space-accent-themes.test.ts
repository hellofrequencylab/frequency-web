import { describe, expect, it } from 'vitest'
import { NEW_WORLD_ACCENTS } from '@/lib/theme/new-world'
import { SERVICES_ACCENTS } from '@/lib/theme/services'
import { NETWORK_KIT_SCHEMES } from '@/lib/theme/network-kit'
import { TEMPLE_KIT_PROFILES } from '@/lib/theme/temple-kit'
import { designerProfileForAccent } from './designer-kit-content'
import { presetForAccent, themeOfLayout } from './space-accent'

describe('a themed Spotlight borrows its Space accent', () => {
  it('names the theme of every kit layout and none for a plain one', () => {
    expect(themeOfLayout('new-world-kit:stack')).toBe('new-world')
    expect(themeOfLayout('services-kit:stack')).toBe('services')
    expect(themeOfLayout('temple-kit:stack')).toBe('temple-kit')
    expect(themeOfLayout('free-human:stack')).toBe('free-human')
    expect(themeOfLayout('network-kit:stack')).toBe('network-kit')
    expect(themeOfLayout('cyberwitch-kit:stack')).toBe('cyberwitch')
    expect(themeOfLayout('designer-kit:stack')).toBe('designer')
    expect(themeOfLayout(undefined)).toBeNull()
  })
  it('finds the preset an accent hex belongs to, in any case, and nothing for a stranger', () => {
    expect(presetForAccent(NEW_WORLD_ACCENTS, NEW_WORLD_ACCENTS.tide.accent.toLowerCase())).toBe('tide')
    expect(presetForAccent(SERVICES_ACCENTS, SERVICES_ACCENTS.bloom.accent)).toBe('bloom')
    expect(presetForAccent(NETWORK_KIT_SCHEMES, NETWORK_KIT_SCHEMES.coral.accent)).toBe('coral')
    expect(presetForAccent(TEMPLE_KIT_PROFILES, TEMPLE_KIT_PROFILES.studios.accent)).toBe('studios')
    expect(designerProfileForAccent('#6f7a3e')).toBe('venues')
    expect(designerProfileForAccent('#4F6A8A')).toBe('creators')
    expect(designerProfileForAccent('#123456')).toBeNull()
    expect(presetForAccent(SERVICES_ACCENTS, '#123456')).toBeNull()
    expect(presetForAccent(SERVICES_ACCENTS, null)).toBeNull()
  })
})
