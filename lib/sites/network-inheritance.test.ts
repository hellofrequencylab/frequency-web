import { describe, expect, it } from 'vitest'
import type { Space } from '@/lib/spaces/types'
import { inheritFromNetwork } from './network-inheritance'
import { readProfilePages } from '@/lib/spaces/profile-pages'
import { readSiteFooter } from './site-footer'

const doc = { content: [{ type: 'Text', props: { id: 'a' } }], root: { props: {} } }
const space = (over: Partial<Space>): Space => ({ id: 's', slug: 's', name: 'S', preferences: {}, ...over }) as Space
const network = space({
  id: 'n', slug: 'the-group', brandLogoUrl: 'https://x.test/net.png', brandAccent: '#112233',
  preferences: {
    siteFooter: { blurb: 'We are The Group' }, siteStyle: { theme: 'network' },
    pages: [{ slug: 'home', label: 'Home' }, { slug: 'about', label: 'About' }, { slug: 'contact', label: 'Contact' }],
    pageDocs: { about: doc, contact: doc },
  },
})

describe('a chapter inherits its Network (LIVE-1288)', () => {
  it('takes the logo, accent, footer, look and pages it did not set', () => {
    const out = inheritFromNetwork(space({ id: 'c', slug: 'the-group-encinitas', parentId: 'n' }), network)
    expect(out.brandLogoUrl).toBe('https://x.test/net.png')
    expect(out.brandAccent).toBe('#112233')
    expect(readSiteFooter(out.preferences)?.blurb).toBe('We are The Group')
    expect((out.preferences as Record<string, unknown>).siteStyle).toEqual({ theme: 'network' })
    expect(readProfilePages(out.preferences).map((p) => p.slug)).toContain('about')
    expect((out.preferences as { pageDocs: Record<string, unknown> }).pageDocs.about).toEqual(doc)
  })

  it('never replaces what the chapter wrote, and never brings down contact', () => {
    const chapter = space({
      id: 'c', slug: 'c', parentId: 'n', brandLogoUrl: 'https://x.test/mine.png', brandAccent: '#abcdef',
      preferences: { siteFooter: { blurb: 'Mine' }, pages: [{ slug: 'home', label: 'Home' }, { slug: 'about', label: 'Our story' }], pageDocs: { about: { ...doc, mine: true } } },
    })
    const out = inheritFromNetwork(chapter, network)
    expect(out.brandLogoUrl).toBe('https://x.test/mine.png')
    expect(out.brandAccent).toBe('#abcdef')
    expect(readSiteFooter(out.preferences)?.blurb).toBe('Mine')
    expect(readProfilePages(out.preferences).find((p) => p.slug === 'about')?.label).toBe('Our story')
    expect(readProfilePages(out.preferences).map((p) => p.slug)).not.toContain('contact')
    expect((out.preferences as { pageDocs: { about: { mine?: boolean } } }).pageDocs.about.mine).toBe(true)
  })

  it('does not change the chapter it was given', () => {
    const chapter = space({ id: 'c', slug: 'c', parentId: 'n' })
    inheritFromNetwork(chapter, network)
    expect(chapter.preferences).toEqual({})
  })
})
