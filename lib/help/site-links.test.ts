import { existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { FEATURE_KEYS } from './feature-keys'
import { helpSiteLinks } from './site-links'

/** True when `route` is a static page under app/, looking through route groups like `(main)`. */
function pageExists(route: string): boolean {
  const walk = (dir: string, segments: string[]): boolean => {
    if (segments.length === 0 && existsSync(path.join(dir, 'page.tsx'))) return true
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name)
      if (!statSync(full).isDirectory()) continue
      if (name.startsWith('(') && walk(full, segments)) return true
      if (segments.length > 0 && name === segments[0] && walk(full, segments.slice(1))) return true
    }
    return false
  }
  return walk(path.join(process.cwd(), 'app'), route.split('/').filter(Boolean))
}

describe('helpSiteLinks', () => {
  const every = FEATURE_KEYS.flatMap((k) => helpSiteLinks([k.key]))

  it('offers doors for the product areas the guides cover', () => {
    expect(every.length).toBeGreaterThan(30)
  })

  it('only ever points at a page that exists', () => {
    const dead = [...new Set(every.map((l) => l.href))].filter((href) => !pageExists(href))
    expect(dead).toEqual([])
  })

  it('names each place once and stops at three', () => {
    expect(helpSiteLinks(['zaps', 'gems', 'ranks'])).toEqual([{ href: '/crew', label: 'My Quest' }])
    expect(helpSiteLinks(['circles', 'events', 'messages', 'search'])).toHaveLength(3)
  })

  it('offers nothing for a key it does not know', () => {
    expect(helpSiteLinks(['not-a-feature'])).toEqual([])
  })
})
