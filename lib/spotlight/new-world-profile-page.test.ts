import { describe, expect, it } from 'vitest'
import { newWorldProfilePageContent } from './new-world-kit-content'

const links = [
  { label: 'Instagram', url: 'https://instagram.com/x' },
  { label: 'Frequency', url: 'https://frequencylocal.com' },
  { label: 'Site', url: 'https://example.com' },
]

describe('newWorldProfilePageContent', () => {
  it('makes frequencylocal.com the primary button and lists the other links under it', () => {
    const c = newWorldProfilePageContent({ name: 'Dan', tagline: 'Alchemy', about: null, portrait: 'p.jpg', cover: 'c.jpg', links })
    expect(c.cta).toEqual({ label: 'frequencylocal.com', href: 'https://frequencylocal.com' })
    expect(c.doors.map((d) => d.title)).toEqual(['Instagram', 'Site'])
    expect(c.linkPage).toEqual({ portrait: 'p.jpg', cover: 'c.jpg' })
  })
  it('falls back to the first link when there is no frequencylocal.com link', () => {
    const c = newWorldProfilePageContent({ name: 'Dan', tagline: null, about: null, portrait: null, cover: null, links: [links[0]!, links[2]!] })
    expect(c.cta.href).toBe('https://instagram.com/x')
    expect(c.doors).toHaveLength(1)
  })
})
