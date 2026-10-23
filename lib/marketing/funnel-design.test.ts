import { describe, expect, it } from 'vitest'
import { NICHE_DESIGN } from './funnel-design'
import { funnelSlugs, getFunnelConfig } from './funnel-config'

const plain = (s: string) => s.replace(/[’]/g, "'").replace(/\s+/g, ' ').trim()

describe('the rendered audience headline matches the search and fallback copy', () => {
  it.each(funnelSlugs())('%s uses the same headline in both designs', (slug) => {
    const design = NICHE_DESIGN[slug]
    const config = getFunnelConfig(slug)
    expect(config).toBeDefined()
    expect(design).toBeDefined()
    expect(plain([design.h1.lead, ...design.h1.em].join(' '))).toBe(plain(config!.hero.h1))
  })
})
