import { describe, expect, it } from 'vitest'
import { newWorldProfilePageContent } from './new-world-kit-content'

const links = [
  { label: 'Instagram', url: 'https://instagram.com/x' },
  { label: 'Frequency', url: 'https://frequencylocal.com', style: 'main' },
  { label: 'Site', url: 'https://example.com' },
]

describe('newWorldProfilePageContent', () => {
  // Owner ruling 2026-11-19 (decision card, "Owner picks it"): the main button is the link the owner marks, not the
  // frequencylocal.com host.
  it('makes the link the owner marked main the primary button and lists the other links under it', () => {
    const c = newWorldProfilePageContent({ name: 'Dan', tagline: 'Alchemy', about: null, portrait: 'p.jpg', cover: 'c.jpg', links })
    expect(c.cta).toEqual({ label: 'Frequency', href: 'https://frequencylocal.com' })
    expect(c.doors.map((d) => d.title)).toEqual(['Instagram', 'Site'])
    expect(c.linkPage).toEqual({ portrait: 'p.jpg', cover: 'c.jpg' })
  })
  it('falls back to the first link when no link is marked main, even a frequencylocal.com one', () => {
    const c = newWorldProfilePageContent({ name: 'Dan', tagline: null, about: null, portrait: null, cover: null, links: [links[0]!, { label: 'Frequency', url: 'https://frequencylocal.com' }] })
    expect(c.cta.href).toBe('https://instagram.com/x')
    expect(c.doors).toHaveLength(1)
  })
  it('falls back to the host only when the link has no label', () => {
    const c = newWorldProfilePageContent({ name: 'Dan', tagline: null, about: null, portrait: null, cover: null, links: [{ label: ' ', url: 'https://www.example.com/a' }] })
    expect(c.cta.label).toBe('example.com')
  })
  it('keeps a link the owner drew as a text link out of the main button, and carries each style to its door (LIVE-2486)', () => {
    const c = newWorldProfilePageContent({
      name: 'Dan', tagline: null, about: null, portrait: null, cover: null,
      links: [{ label: 'Launch', url: 'https://a.example/l', style: 'text' }, { label: 'Beta', url: 'https://a.example/b' }, { label: 'Site', url: 'https://b.example', style: 'button' }],
    })
    expect(c.cta.href).toBe('https://a.example/b')
    expect(c.doors.map((d) => [d.title, d.style])).toEqual([['Launch', 'text'], ['Site', 'button']])
  })
  it('draws every link in the block default when the link has none of its own', () => {
    const c = newWorldProfilePageContent({
      name: 'Dan', tagline: null, about: null, portrait: null, cover: null, linkStyle: 'text',
      links: [{ label: 'Main', url: 'https://a.example', style: 'main' }, { label: 'Beta', url: 'https://b.example' }, { label: 'Card', url: 'https://c.example', style: 'card' }],
    })
    expect(c.cta.label).toBe('Main')
    expect(c.doors.map((d) => d.style)).toEqual(['text', 'card'])
  })
})
