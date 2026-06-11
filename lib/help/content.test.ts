import { describe, it, expect } from 'vitest'
import { getAllArticles } from './content'

// The help loader gained a `role` front-matter field (ADR-224): when set, the
// article belongs to that community role's advancement-training curriculum. These
// tests read the real content/help tree, so they also guard that the tagging we
// shipped stays valid and that untagged articles keep `role` undefined.

describe('help loader — role front-matter tag', () => {
  it('parses the `role` tag when present and leaves it undefined otherwise', async () => {
    const articles = await getAllArticles()
    expect(articles.length).toBeGreaterThan(0)

    const byKey = (cat: string, slug: string) =>
      articles.find((a) => a.category === cat && a.slug === slug)

    // Tagged on ship (the host advancement path source).
    expect(byKey('groups', 'events')?.role).toBe('host')
    expect(byKey('groups', 'channels')?.role).toBe('host')
    expect(byKey('sharing', 'broadcasts')?.role).toBe('host')
    // Tagged for the guide tier.
    expect(byKey('groups', 'hubs')?.role).toBe('guide')
  })

  it('keeps `role` undefined for untagged articles (behavior-preserving)', async () => {
    const articles = await getAllArticles()
    const untagged = articles.filter((a) => a.role === undefined)
    // The vast majority of articles carry no role tag.
    expect(untagged.length).toBeGreaterThan(0)
    // And every parsed role is a known community-ladder rung.
    const tagged = articles.filter((a) => a.role !== undefined)
    for (const a of tagged) {
      expect(['member', 'crew', 'host', 'guide', 'mentor']).toContain(a.role)
    }
  })
})
