import { describe, expect, it } from 'vitest'
import { overlaySpaceOnKit, spaceFactsFromGrid } from './space-kit-page'
import { asSpotlightLook, spaceLayoutId, spaceLooksFor } from './layouts'
import { nextSpotlightPreferences, readSpaceSpotlight } from '@/lib/spaces/spotlight'
import { servicesKitSpotlightContent } from './services-kit-content'
import { templeKitSpotlightContent } from './temple-kit-content'

const base = { slug: 'dan', name: 'Dan', tagline: 'Alchemy' }

describe('Space Spotlight looks', () => {
  it('offers six looks to every kit theme and none to a theme without layouts', () => {
    for (const t of ['new-world', 'services', 'cyberwitch', 'designer', 'temple-kit', 'free-human', 'network-kit']) {
      expect(spaceLooksFor(t).map((l) => l.look)).toEqual(['stack', 'card-wall', 'story', 'calendar-first', 'shop-front', 'profile'])
    }
    for (const t of ['midnight', 'bold', 'wildheart', 'frequency']) expect(spaceLooksFor(t)).toEqual([])
  })
  it('maps a theme and look to the registered layout id', () => {
    expect(spaceLayoutId('designer', 'profile')).toBe('designer-kit:profile')
    expect(spaceLayoutId('new-world', 'stack')).toBe('new-world-kit:stack')
    expect(spaceLayoutId('bold', 'stack')).toBeNull()
    expect(asSpotlightLook('nope')).toBeNull()
  })
  it('stores a look, keeps it across a publish toggle, and clears it with null', () => {
    const a = nextSpotlightPreferences({}, { look: 'story' })
    expect(readSpaceSpotlight(a).look).toBe('story')
    expect(readSpaceSpotlight(nextSpotlightPreferences(a, { published: true })).look).toBe('story')
    expect(readSpaceSpotlight(nextSpotlightPreferences(a, { look: null })).look).toBeUndefined()
  })
})

describe('overlaySpaceOnKit', () => {
  const facts = spaceFactsFromGrid(base, { links: { items: [{ label: 'Insta', url: 'https://instagram.com/x' }] }, button: { label: 'Hi', url: 'https://example.com/hi' } })
  it('turns the owner links into doors and the button into the main call', () => {
    const c = overlaySpaceOnKit(servicesKitSpotlightContent('general', { sample: false }), facts)
    expect(c.name).toBe('Dan')
    expect(c.doors.map((d) => d.title)).toEqual(['Insta'])
    expect(c.cta).toEqual({ label: 'Hi', href: 'https://example.com/hi' })
  })
  it('without links points every kept door at this Space own pages, never off it', () => {
    const c = overlaySpaceOnKit(templeKitSpotlightContent('general', { sample: false }), spaceFactsFromGrid(base, {}))
    expect(c.doors.length).toBeGreaterThan(0)
    for (const d of c.doors) expect(d.href).toMatch(/^\/spaces\/dan\//)
    expect(c.featured.href).toMatch(/^\/spaces\/dan/)
  })
})
