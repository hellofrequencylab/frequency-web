import { describe, it, expect } from 'vitest'
import { getIconData } from '@iconify/utils'
import phIcons from '@iconify-json/ph/icons.json'
import tablerIcons from '@iconify-json/tabler/icons.json'
import type { IconifyJSON } from '@iconify/types'
import { ICONS, icon } from './icon-catalog'

const COLLECTIONS: Record<string, IconifyJSON> = {
  ph: phIcons as IconifyJSON,
  tabler: tablerIcons as IconifyJSON,
}

// Locks every semantic catalog entry against the installed icon sets, so a rename in an @iconify-json
// package (or a typo here) fails loudly instead of rendering an empty icon in production.
describe('semantic icon catalog', () => {
  it('every catalog name resolves in its installed set', () => {
    const broken: string[] = []
    for (const [key, name] of Object.entries(ICONS)) {
      const [prefix, iconName] = name.split(':')
      const collection = COLLECTIONS[prefix]
      if (!collection || !getIconData(collection, iconName)) broken.push(`${key} -> ${name}`)
    }
    expect(broken).toEqual([])
  })

  it('icon() returns the mapped name', () => {
    expect(icon('energy')).toBe('ph:lightning-fill')
    expect(icon('award')).toBe('ph:trophy')
  })

  it('every name is prefixed (prefix:name)', () => {
    for (const name of Object.values(ICONS)) expect(name).toMatch(/^[a-z]+:[a-z0-9-]+$/)
  })
})
