import { describe, expect, it } from 'vitest'
import {
  basemapPalette,
  DARK_TILE_FILTER,
  googleMapStyles,
  luminance,
  maplibreTileFilter,
  mix,
  readBasemapPalette,
  toHex,
  type Rgb,
} from './basemap-look'

// Frequency's token values (design_handoff/frequency/tokens/themes.css): Stage, and Commons by day.
const hex = (h: string): Rgb => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
const STAGE = {
  canvas: hex('#0A0612'),
  sunken: hex('#06030C'),
  card: hex('#140B22'),
  raised: hex('#1E1232'),
  muted: hex('#A89BC2'),
  faint: hex('#7A6E93'),
  accent: hex('#FF2BD6'),
  water: hex('#3DF2FF'),
}
const COMMONS = {
  canvas: hex('#FAF4EA'),
  sunken: hex('#F2E9DC'),
  card: hex('#FFFEFC'),
  raised: hex('#FFFFFF'),
  muted: hex('#7C766F'),
  faint: hex('#A59F98'),
  accent: hex('#5B3FD0'),
  water: hex('#17788A'),
}

describe('basemap palette', () => {
  it('reads Stage as dark and keeps the land near the canvas', () => {
    const p = basemapPalette(STAGE)
    expect(p.dark).toBe(true)
    expect(luminance(hex(p.land))).toBeLessThan(0.05)
    expect(p.labelHalo).toBe('#0a0612')
    expect(maplibreTileFilter(p)).toBe(DARK_TILE_FILTER)
  })

  it('reads Commons by day as light and leaves the MapLibre tiles alone', () => {
    const p = basemapPalette(COMMONS)
    expect(p.dark).toBe(false)
    expect(p.land).toBe('#faf4ea')
    expect(maplibreTileFilter(p)).toBe('none')
  })

  it('emits only hex colours, which is all Google accepts', () => {
    for (const p of [basemapPalette(STAGE), basemapPalette(COMMONS)]) {
      for (const rule of googleMapStyles(p)) {
        for (const s of rule.stylers) if ('color' in s) expect(s.color).toMatch(/^#[0-9a-f]{6}$/)
      }
    }
  })

  it('hides business pins and transit so only our pins are on the map', () => {
    const rules = googleMapStyles(basemapPalette(STAGE))
    expect(rules).toContainEqual({ featureType: 'poi', stylers: [{ visibility: 'off' }] })
    expect(rules).toContainEqual({ featureType: 'transit', stylers: [{ visibility: 'off' }] })
  })

  it('mixes and clamps', () => {
    expect(toHex(mix([0, 0, 0], [255, 255, 255], 0.5))).toBe('#808080')
    expect(toHex([300, -4, 16])).toBe('#ff0010')
  })

  it('returns null where no Frequency tokens exist (DAWN keeps its map)', () => {
    expect(readBasemapPalette(null)).toBeNull()
    if (typeof document !== 'undefined') expect(readBasemapPalette(document.body)).toBeNull()
  })
})
