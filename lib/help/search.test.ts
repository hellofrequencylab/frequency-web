import { describe, it, expect } from 'vitest'
import { searchHelp } from './search'
import type { HelpSearchEntry } from './content'

// The matcher behind every help search box. These pin what a person feels: a question typed in
// their own words finds the guide, a typo is forgiven, and a hit can land on the section that
// answers. The entries are synthetic so the test does not move every time an article is edited.

const entry = (over: Partial<HelpSearchEntry>): HelpSearchEntry => ({
  title: 'Untitled',
  description: '',
  category: 'getting-started',
  categoryTitle: 'Getting started',
  href: '/help/getting-started/untitled',
  excerpt: '',
  ...over,
})

const index: HelpSearchEntry[] = [
  entry({
    title: 'Notifications',
    href: '/help/getting-started/notifications',
    description: 'Choose what reaches you and where.',
    keywords: ['unsubscribe', 'stop emails', 'too many emails'],
    sections: [{ id: 'turn-off-email', title: 'Turn off email' }],
  }),
  entry({
    title: 'How to RSVP',
    href: '/help/getting-started/how-to-rsvp',
    description: 'Say you are going to an event.',
    sections: [{ id: 'change-your-rsvp', title: 'Change your RSVP' }],
  }),
  entry({
    title: 'Your website',
    href: '/help/spaces/your-website',
    category: 'spaces',
    categoryTitle: 'Running a space',
    description: 'Publish your Space as a site of its own.',
    sections: [
      { id: 'use-your-own-domain', title: 'Use your own domain' },
      { id: 'pick-a-theme', title: 'Pick a theme' },
    ],
  }),
  entry({
    title: 'Plan your calendar',
    href: '/help/spaces/plan-your-calendar',
    category: 'spaces',
    categoryTitle: 'Running a space',
  }),
  entry({ title: 'Messages', href: '/help/connecting/messages', description: 'Talk one to one or in a room.' }),
]

const hrefs = (q: string) => searchHelp(index, q).map((h) => h.href)

describe('searchHelp', () => {
  it('returns nothing for a query under two characters, or one that matches nothing', () => {
    expect(searchHelp(index, 'a')).toEqual([])
    expect(searchHelp(index, 'zzzqqq')).toEqual([])
  })

  it('ranks a title hit first', () => {
    expect(hrefs('notifications')[0]).toBe('/help/getting-started/notifications')
  })

  it('answers a question typed in plain words, filler and all', () => {
    expect(hrefs('how do I stop the emails')[0]).toBe('/help/getting-started/notifications')
  })

  it('finds an article by a keyword its title does not carry', () => {
    expect(hrefs('unsubscribe')).toEqual(['/help/getting-started/notifications'])
  })

  it('meets plurals and forgives a one-letter typo', () => {
    expect(hrefs('rsvps')[0]).toBe('/help/getting-started/how-to-rsvp')
    expect(hrefs('calender')[0]).toBe('/help/spaces/plan-your-calendar')
  })

  it('maps an everyday word onto the product word', () => {
    expect(hrefs('dm')[0]).toBe('/help/connecting/messages')
  })

  it('links to the section that answers, and names it', () => {
    const [hit] = searchHelp(index, 'domain')
    expect(hit.href).toBe('/help/spaces/your-website')
    expect(hit.to).toBe('/help/spaces/your-website#use-your-own-domain')
    expect(hit.sectionTitle).toBe('Use your own domain')
  })

  it('links to the article itself when the title is the match', () => {
    const [hit] = searchHelp(index, 'website')
    expect(hit.to).toBe('/help/spaces/your-website')
    expect(hit.sectionTitle).toBeUndefined()
  })

  it('still answers when one word of two finds nothing', () => {
    expect(hrefs('custom domain')).toEqual(['/help/spaces/your-website'])
  })

  it('does not let a short prefix match an unrelated long word', () => {
    const approving = [entry({ title: 'Approving people', href: '/help/x/approving' })]
    expect(searchHelp(approving, 'app')).toEqual([])
  })

  it('reads an index built before keywords and sections existed', () => {
    expect(searchHelp([entry({ title: 'Friends', href: '/help/connecting/friends' })], 'friends')[0].to).toBe(
      '/help/connecting/friends',
    )
  })
})
