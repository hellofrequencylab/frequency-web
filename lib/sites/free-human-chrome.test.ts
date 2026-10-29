import { describe, it, expect } from 'vitest'
import { FREE_HUMAN_CHROME_COPY, FREE_HUMAN_PANELS, freeHumanNav } from './free-human-chrome'
import { FREE_HUMAN_PHOTOS, freeHumanPhoto, freeHumanPhotoSrc } from './free-human-photos'
import { hasFreeHumanGlyph } from '@/components/sites/free-human-glyph'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const HOME = '/'
const own = [
  { label: 'Program', href: '/program' },
  { label: 'Workshops', href: '/workshops' },
  { label: 'Calendar', href: '/calendar' },
  { label: 'Books', href: '/books' },
  { label: 'Contact', href: '/contact' },
]

describe('the Free Human chrome', () => {
  it('has the design\'s four panels then Calendar as a direct link', () => {
    const nav = freeHumanNav(own, HOME)
    expect(nav.map((n) => n.label)).toEqual(['Program', 'Gather', 'Read', 'Audrey', 'Calendar'])
    expect(nav[4]).toMatchObject({ href: '/calendar', glyph: 'calendar' })
    expect(nav[4].mega).toBeUndefined()
  })

  it('sends a door to the Space\'s own page, else to the home section, else leaves it out', () => {
    const gather = freeHumanNav(own, HOME).find((n) => n.label === 'Gather')!.mega!
    expect(gather.doors.find((d) => d.label === 'Workshops')?.href).toBe('/workshops')
    expect(gather.doors.find((d) => d.label === 'Events & gatherings')?.href).toBe('/calendar')
    expect(gather.doors.find((d) => d.label === 'Solstice retreat')).toBeUndefined()
    const bare = freeHumanNav([], '/')
    expect(bare.find((n) => n.label === 'Gather')!.mega!.doors.find((d) => d.label === 'Workshops')?.href).toBe('/#workshops')
    expect(bare.find((n) => n.label === 'Calendar')).toBeUndefined()
  })

  it('draws every door with a glyph the set has, and every tile with a picture that ships', () => {
    for (const p of FREE_HUMAN_PANELS) {
      for (const e of p.entries) expect(hasFreeHumanGlyph(e.glyph), `${p.label}: ${e.glyph}`).toBe(true)
      for (const t of p.tiles) {
        expect(FREE_HUMAN_PHOTOS[t.photo], t.photo).toBeTruthy()
        expect(existsSync(join(process.cwd(), 'public', freeHumanPhotoSrc(t.photo)))).toBe(true)
      }
    }
    expect(hasFreeHumanGlyph('calendar')).toBe(true)
    expect(hasFreeHumanGlyph('nope')).toBe(false)
  })

  it('ships every select with a size and a loading colour', () => {
    expect(Object.keys(FREE_HUMAN_PHOTOS)).toHaveLength(32)
    for (const [name, p] of Object.entries(FREE_HUMAN_PHOTOS)) {
      expect(p.avg).toMatch(/^#[0-9a-f]{6}$/)
      expect(existsSync(join(process.cwd(), 'public', freeHumanPhotoSrc(name)))).toBe(true)
    }
    expect(freeHumanPhoto('light-sun')?.src).toBe('/sites/free-human/photos/light-sun.webp')
    expect(freeHumanPhoto('nope')).toBeNull()
  })

  it('keeps invented counts and dates out of the menu words', () => {
    const words = JSON.stringify(FREE_HUMAN_PANELS) + JSON.stringify(FREE_HUMAN_CHROME_COPY)
    expect(words).not.toMatch(/\b\d{2,}\+|\b(Nov|Dec|Jan)\b/)
  })
})
