import { describe, expect, it } from 'vitest'
import type { Data } from '@/lib/page-editor/types'
import { config } from '@/lib/page-editor/config'
import { platformConfig } from '@/lib/page-editor/platform-config'
import { SURFACE_CATEGORIES } from '@/lib/page-editor/palette-scope'
import { getTemplate } from '@/lib/page-editor/templates'

// PERF-031: the platform marketing pages render with a SUBSET of the block library so they stop shipping
// the site kits. These pin that the subset can draw everything those pages can hold.

/** Every block type in a document, including blocks nested in slot/zone props. */
function typesIn(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => typesIn(v, out))
  else if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>
    if (typeof o.type === 'string' && o.props && typeof o.props === 'object') out.add(o.type)
    Object.values(o).forEach((v) => typesIn(v, out))
  }
  return out
}

const PLATFORM_SLUGS = [
  'about', 'spaces', 'the-lab', 'the-community', 'pricing', 'circles', 'how-to-start-a-circle',
  'how-to-build-community', 'loneliness', 'friendship-as-an-adult', 'how-to-be-more-social', 'business-of-community',
]

describe('platformConfig (PERF-031)', () => {
  it('draws every block the marketing palette offers', () => {
    const offered = SURFACE_CATEGORIES.marketing.flatMap((k) => config.categories?.[k]?.components ?? [])
    const missing = offered.filter((t) => !(t in platformConfig.components))
    expect(missing).toEqual([])
  })

  it('draws every block in every platform page template', () => {
    for (const slug of PLATFORM_SLUGS) {
      const doc = getTemplate(slug) as Data | null
      if (!doc) continue
      const missing = [...typesIn(doc)].filter((t) => !(t in platformConfig.components))
      expect({ slug, missing }).toEqual({ slug, missing: [] })
    }
  })

  it('renders each block exactly as the full library does', () => {
    for (const [type, block] of Object.entries(platformConfig.components)) expect(block).toBe(config.components[type])
    expect(platformConfig.root).toBe(config.root)
  })
})
