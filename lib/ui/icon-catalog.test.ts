import { describe, it, expect } from 'vitest'
import { getIconData } from '@iconify/utils'
import lucideIcons from '@iconify-json/lucide/icons.json'
import phIcons from '@iconify-json/ph/icons.json'
import tablerIcons from '@iconify-json/tabler/icons.json'
import type { IconifyJSON } from '@iconify/types'
import { ICONS, icon } from './icon-catalog'

const COLLECTIONS: Record<string, IconifyJSON> = {
  lucide: lucideIcons as IconifyJSON,
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

  it('icon() returns the mapped name (Lucide-primary)', () => {
    expect(icon('energy')).toBe('lucide:zap')
    expect(icon('award')).toBe('lucide:trophy')
    // gap-fill: Lucide has no lotus, so meditation comes from Phosphor
    expect(icon('meditation')).toBe('ph:flower-lotus')
  })

  it('is Lucide-first: the primary set backs the vast majority of meanings', () => {
    const lucide = Object.values(ICONS).filter((n) => n.startsWith('lucide:')).length
    expect(lucide).toBeGreaterThan(Object.keys(ICONS).length * 0.8)
  })

  it('every name is prefixed (prefix:name)', () => {
    for (const name of Object.values(ICONS)) expect(name).toMatch(/^[a-z]+:[a-z0-9-]+$/)
  })
})
