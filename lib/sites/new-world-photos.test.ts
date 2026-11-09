import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import photos from './new-world-photos.json'

// THE NEW WORLD PHOTO SET (LIVE-2060): thirteen owner-supplied gathering photos under public/sites/new-world/photos, named for the
// twelve slots the New World design names (circle-sunrise to fire-crew) plus one spare (cafe-table). Each has its size, an
// average colour for the frame behind it while it loads, and written alt text. Stand-alone site assets: nothing here is read
// by a member or console area.
const SLOTS = ['circle-sunrise', 'garden-picnic', 'workshop-table', 'hands-up', 'group-hug', 'beach-joy', 'beach-move', 'beach-dance', 'backyard-class', 'beach-gong', 'fire-circle', 'fire-crew']

describe('New World photos', () => {
  it('every slot the design names has a photo', () => {
    for (const slot of SLOTS) expect(Object.keys(photos), slot).toContain(slot)
  })

  it('every entry has a file, a size, an average colour and alt text', () => {
    for (const [name, p] of Object.entries(photos)) {
      expect(existsSync(join(process.cwd(), 'public/sites/new-world/photos', `${name}.webp`)), name).toBe(true)
      expect(p.w).toBeGreaterThan(0)
      expect(p.h).toBeGreaterThan(0)
      expect(p.avg).toMatch(/^#[0-9a-f]{6}$/)
      expect(p.alt.length).toBeGreaterThan(10)
    }
  })
})
