import { describe, it, expect } from 'vitest'
import { fileToRoute, affectedFeatureKeys, affectedArticles } from './drift'

describe('fileToRoute', () => {
  it('maps a route file to its route, dropping group + filename', () => {
    expect(fileToRoute('app/(main)/circles/page.tsx')).toBe('/circles')
  })
  it('keeps dynamic segments', () => {
    expect(fileToRoute('app/(main)/circles/[slug]/page.tsx')).toBe('/circles/[slug]')
  })
  it('handles nested route handlers', () => {
    // 2026-09-05 (scan2 L2-09): this case used app/(help)/help/ask/route.ts until that handler was
    // deleted (no caller). Any grouped route handler exercises the same path; this one is live.
    expect(fileToRoute('app/(main)/people/[handle]/vcard/route.ts')).toBe('/people/[handle]/vcard')
  })
  it('returns null for non-app files', () => {
    expect(fileToRoute('lib/help/content.ts')).toBeNull()
    expect(fileToRoute('components/feed/feed-list.tsx')).toBeNull()
  })
})

const FEATURES = [
  { key: 'circles', routes: ['/circles'] },
  { key: 'memberships', routes: ['/circles'] },
  { key: 'zaps', routes: ['/settings'] },
  { key: 'moderation', routes: ['/feed'] },
]

describe('affectedFeatureKeys', () => {
  it('flags keys whose route is touched (incl. nested)', () => {
    const keys = affectedFeatureKeys(['app/(main)/circles/[slug]/page.tsx'], FEATURES)
    expect(keys).toContain('circles')
    expect(keys).toContain('memberships') // also routed at /circles
  })
  it('is empty when no app routes changed', () => {
    expect(affectedFeatureKeys(['lib/utils.ts', 'README.md'], FEATURES)).toEqual([])
  })
})

describe('affectedArticles', () => {
  const articles = [
    { category: 'getting-started', slug: 'join-a-circle', featureKeys: ['circles', 'memberships'] },
    { category: 'the-quest', slug: 'zaps-and-gems', featureKeys: ['zaps', 'gems'] },
    { category: 'safety', slug: 'reporting', featureKeys: ['moderation'] },
  ]
  it('returns articles whose featureKeys intersect the change', () => {
    const hit = affectedArticles(['app/(main)/circles/page.tsx'], articles, FEATURES)
    expect(hit.map((a) => a.slug)).toEqual(['join-a-circle'])
  })
  it('returns [] when nothing relevant changed', () => {
    expect(affectedArticles(['docs/README.md'], articles, FEATURES)).toEqual([])
  })
})
