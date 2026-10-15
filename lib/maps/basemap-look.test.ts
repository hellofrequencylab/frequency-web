import { describe, expect, it } from 'vitest'
import {
  basemapPalette,
  DARK_TILE_FILTER,
  FREQUENCY_BASEMAP,
  googleMapStyles,
  isDesignMap,
  LIGHT_TILE_FILTER,
  luminance,
  maplibreBasemapPaint,
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

  it('reads Commons by day as light and tints the fallback tiles warm, never bare grey', () => {
    const p = basemapPalette(COMMONS)
    expect(p.dark).toBe(false)
    expect(p.land).toBe('#faf4ea')
    expect(maplibreTileFilter(p)).toBe(LIGHT_TILE_FILTER)
    expect(LIGHT_TILE_FILTER).not.toContain('invert')
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

  it('returns false for isDesignMap where no Frequency tokens exist', () => {
    expect(isDesignMap(null)).toBe(false)
    if (typeof document !== 'undefined') expect(isDesignMap(document.body)).toBe(false)
  })
})

// A slice of OpenFreeMap's Positron (the keyless default), one layer of each kind the repaint handles.
const POSITRON = [
  { id: 'background', type: 'background' },
  { id: 'park', type: 'fill', 'source-layer': 'park' },
  { id: 'water', type: 'fill', 'source-layer': 'water' },
  { id: 'landcover_wood', type: 'fill', 'source-layer': 'landcover' },
  { id: 'waterway', type: 'line', 'source-layer': 'waterway' },
  { id: 'highway_minor', type: 'line', 'source-layer': 'transportation' },
  { id: 'highway_major_casing', type: 'line', 'source-layer': 'transportation' },
  { id: 'highway_motorway_inner', type: 'line', 'source-layer': 'transportation' },
  { id: 'boundary_2', type: 'line', 'source-layer': 'boundary' },
  { id: 'water_name_point_label', type: 'symbol', 'source-layer': 'water_name' },
  { id: 'label_city', type: 'symbol', 'source-layer': 'place' },
  // A map's own pin layer (GeoJSON, no source-layer): never repainted.
  { id: 'cluster-count', type: 'symbol' },
]

describe('the MapLibre fallback wears the same palette as Google (SCAN-904)', () => {
  for (const [name, tokens] of [['Stage', STAGE], ['Commons', COMMONS]] as const) {
    it(`paints ${name} into the vector style layer by layer`, () => {
      const p = basemapPalette(tokens)
      const paint = maplibreBasemapPaint(POSITRON, p)
      // `prop` is matched by suffix, so a style property name never sits in the source as a bare
      // string the class scanners would read as a utility.
      const get = (id: string, prop: string) => paint.find(([l, k]) => l === id && k.endsWith(prop))?.[2]
      expect(get('background', 'background-color')).toBe(p.land)
      expect(get('water', 'fill-color')).toBe(p.water)
      expect(get('park', 'fill-color')).toBe(p.park)
      expect(get('landcover_wood', 'fill-color')).toBe(p.park)
      expect(get('waterway', 'line-color')).toBe(p.water)
      expect(get('highway_minor', 'line-color')).toBe(p.road)
      expect(get('highway_major_casing', 'line-color')).toBe(p.land)
      expect(get('highway_motorway_inner', 'line-color')).toBe(p.roadMajor)
      expect(get('boundary_2', 'line-color')).toBe(p.boundary)
      expect(get('water_name_point_label', 'text-color')).toBe(p.labelFaint)
      expect(get('label_city', 'text-color')).toBe(p.label)
      expect(get('label_city', 'halo-color')).toBe(p.labelHalo)
      expect(paint.some(([l]) => l === 'cluster-count')).toBe(false)
      for (const [, , v] of paint) expect(v).toMatch(/^#[0-9a-f]{6}$/)
    })
  }
})

// SCAN-918: the full Frequency style, light and dark.
describe('the Frequency basemap (SCAN-918)', () => {
  for (const mode of ['light', 'dark'] as const) {
    it(`${mode}: hex only, no road strokes, POIs and transit hidden, roads a breath off the land`, () => {
      const p = FREQUENCY_BASEMAP[mode]
      const rules = googleMapStyles(p)
      for (const rule of rules) for (const s of rule.stylers) if ('color' in s) expect(s.color).toMatch(/^#[0-9a-f]{6}$/)
      expect(rules).toContainEqual({ featureType: 'road', elementType: 'geometry.stroke', stylers: [{ visibility: 'off' }] })
      expect(rules).toContainEqual({ featureType: 'poi', stylers: [{ visibility: 'off' }] })
      expect(rules).toContainEqual({ featureType: 'transit', stylers: [{ visibility: 'off' }] })
      // Contrast ratio between road and land: low on purpose, so roads never read as heavy lines.
      const [hi, lo] = [luminance(hexOf(p.road)), luminance(hexOf(p.land))].sort((a, b) => b - a)
      expect((hi! + 0.05) / (lo! + 0.05)).toBeLessThan(1.25)
      expect(p.dark).toBe(mode === 'dark')
    })
  }
})
function hexOf(h: string): Rgb {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
}
