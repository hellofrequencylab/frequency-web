import { describe, it, expect } from 'vitest'
import { getIconData } from '@iconify/utils'
import phIcons from '@iconify-json/ph/icons.json'
import tablerIcons from '@iconify-json/tabler/icons.json'
import type { IconifyJSON } from '@iconify/types'
import { ICON_SETS, iconSetByPrefix, houseIconSet } from './icon-sets'

const COLLECTIONS: Record<string, IconifyJSON> = {
  ph: phIcons as IconifyJSON,
  tabler: tablerIcons as IconifyJSON,
}

describe('Loom icon-set registry', () => {
  it('exposes exactly one house family', () => {
    expect(ICON_SETS.filter((s) => s.role === 'house')).toHaveLength(1)
    expect(houseIconSet().prefix).toBe('ph')
  })

  it('every set carries a license (the white-label audit needs it)', () => {
    for (const set of ICON_SETS) {
      expect(set.license.title).toBeTruthy()
      expect(set.total).toBeGreaterThan(0)
    }
  })

  it('every sample name resolves in its set (no empty previews)', () => {
    const broken: string[] = []
    for (const set of ICON_SETS) {
      const collection = COLLECTIONS[set.prefix]
      for (const sample of set.samples) {
        if (!collection || !getIconData(collection, sample)) broken.push(`${set.prefix}:${sample}`)
      }
    }
    expect(broken).toEqual([])
  })

  it('looks a set up by prefix', () => {
    expect(iconSetByPrefix('ph')?.name).toBe('Phosphor')
    expect(iconSetByPrefix('nope')).toBeNull()
  })
})
