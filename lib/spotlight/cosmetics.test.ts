import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { cosmeticUnlocked, unlockedCosmetics, requiredItemsFor, missingRequiredItems } from './cosmetics'
import { SPOTLIGHT_STICKERS } from './stickers'
import { PROFILE_SKINS } from '@/lib/theme/profile-skins'

// The pure gate at the two cosmetic seams (ADR-1279). A fixture list proves the rules; the last
// block proves the SHIPPED lists against the seeded store catalog, so a requiredItem can never
// name an item nobody can earn.

const FIXTURE = [
  { id: 'free', label: 'Free' },
  { id: 'earned', label: 'Earned', requiredItem: 'full-spectrum-banner' },
  { id: 'rare', label: 'Rare', requiredItem: 'luminary-club-mark' },
] as const

const NONE: ReadonlySet<string> = new Set()
const SPECTRUM: ReadonlySet<string> = new Set(['full-spectrum-banner'])

describe('cosmeticUnlocked / unlockedCosmetics', () => {
  it('a free cosmetic is always unlocked; an earned one needs its item', () => {
    expect(cosmeticUnlocked(FIXTURE[0], NONE)).toBe(true)
    expect(cosmeticUnlocked(FIXTURE[1], NONE)).toBe(false)
    expect(cosmeticUnlocked(FIXTURE[1], SPECTRUM)).toBe(true)
  })

  it('the picker list keeps order and drops only what is locked', () => {
    expect(unlockedCosmetics(FIXTURE, NONE).map((d) => d.id)).toEqual(['free'])
    expect(unlockedCosmetics(FIXTURE, SPECTRUM).map((d) => d.id)).toEqual(['free', 'earned'])
  })
})

describe('requiredItemsFor / missingRequiredItems', () => {
  it('names the distinct items the picks need, and nothing for free picks or unknown ids', () => {
    expect(requiredItemsFor(FIXTURE, ['free', 'nope'])).toEqual([])
    expect(requiredItemsFor(FIXTURE, ['earned', 'earned', 'rare'])).toEqual(['full-spectrum-banner', 'luminary-club-mark'])
  })

  it('reports only what the member lacks', () => {
    expect(missingRequiredItems(FIXTURE, ['free', 'earned', 'rare'], SPECTRUM)).toEqual(['luminary-club-mark'])
    expect(missingRequiredItems(FIXTURE, ['earned'], SPECTRUM)).toEqual([])
    expect(missingRequiredItems(FIXTURE, ['earned'], NONE)).toEqual(['full-spectrum-banner'])
  })
})

describe('the shipped lists only require items the catalog can grant', () => {
  const seed = readFileSync(
    path.join(__dirname, '..', '..', 'supabase', 'migrations', '20260614200000_rewards_economy_v2.sql'),
    'utf8',
  )
  const catalogSlugs = new Set([...seed.matchAll(/^\s*\('([a-z0-9-]+)',/gm)].map((m) => m[1]))

  it('every sticker requiredItem is a seeded store_items slug', () => {
    expect(catalogSlugs.size).toBeGreaterThan(10)
    for (const s of SPOTLIGHT_STICKERS) {
      if (s.requiredItem) expect(catalogSlugs.has(s.requiredItem), `${s.id} requires ${s.requiredItem}`).toBe(true)
    }
  })

  it('every skin requiredItem (none today) would be a seeded slug', () => {
    for (const s of PROFILE_SKINS) {
      if (s.requiredItem) expect(catalogSlugs.has(s.requiredItem), `${s.id} requires ${s.requiredItem}`).toBe(true)
    }
  })

  it('at least one shipped sticker is earned, so the gate has a live consumer', () => {
    expect(SPOTLIGHT_STICKERS.some((s) => !!s.requiredItem)).toBe(true)
  })
})
