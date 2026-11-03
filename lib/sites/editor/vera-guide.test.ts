import { describe, expect, it } from 'vitest'
import type { Config } from '@/lib/page-editor/types'
import type { WebsiteSnapshot } from './state'
import { WEBSITE_EDITOR_GUIDE, readWebsiteVeraFacts, websiteVeraFacts } from './vera-guide'

const config: Config = { components: { Hero: { label: 'Hero', fields: { title: { type: 'text' } }, render: () => null } } }
const draft: WebsiteSnapshot = { theme: 'NewWorld', pages: [
  { slug: 'home', label: 'Home', seo: { title: '', description: '' }, comments: [], doc: { root: {}, content: [{ type: 'Hero', props: { id: 'hero', title: 'My private headline' } }] } },
  { slug: 'about', label: 'About', seo: { title: '', description: 'Who we are' }, comments: [], doc: { root: {}, content: [] } },
] }

describe('Vera editor guide and facts (LIVE-2110)', () => {
  it('names every left rail tab and the inspector tabs the editor draws', () => {
    const guide = WEBSITE_EDITOR_GUIDE.join(' ')
    for (const word of ['Pages', 'Layers', 'Add', 'Theme', 'Site', 'Content', 'Design', 'Advanced', 'Notes', 'Publish', 'Search and sharing']) expect(guide).toContain(word)
    expect(guide).not.toMatch(/—/)
  })

  it('reads the draft as counts, labels and checks, never its words', () => {
    const facts = websiteVeraFacts({ draft, published: null, pageInView: 'Home', themeLabel: 'New World', config })
    expect(facts.pages).toEqual([{ label: 'Home', sections: 1, searchDescription: false }, { label: 'About', sections: 0, searchDescription: true }])
    expect(facts.checks.some((c) => !c.ok && /search description to Home/.test(c.text))).toBe(true)
    expect(facts.unpublished).toContain('Updated Home')
    expect(facts.published).toBe(false)
    expect(JSON.stringify(facts)).not.toContain('My private headline')
  })

  it('reads facts that crossed the network by shape and size', () => {
    const facts = websiteVeraFacts({ draft, published: null, pageInView: 'Home', themeLabel: 'New World', config })
    expect(readWebsiteVeraFacts(JSON.parse(JSON.stringify(facts)))).toEqual(facts)
    expect(readWebsiteVeraFacts({ ...facts, pages: [{ label: 'x', sections: -1 }] })).toBeNull()
    expect(readWebsiteVeraFacts({ ...facts, unpublished: Array.from({ length: 21 }, () => 'x') })).toBeNull()
    expect(readWebsiteVeraFacts({ ...facts, scheduledFor: 'tomorrow-ish' })?.scheduledFor).toBeNull()
    expect(readWebsiteVeraFacts([])).toBeNull()
  })
})
