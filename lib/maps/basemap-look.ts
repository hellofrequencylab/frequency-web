// THE BASEMAP'S LOOK UNDER A DESIGN SYSTEM (ADR-901, ADR-1737).
//
// Pins already wear the design (`--design-map-*`, lib/maps/css-color.ts). This is the ground under
// them: land, water, roads and labels. Under Frequency the map reads the kit's own `--fq-*` tokens AT
// ITS CONTAINER, not on <html>, because the palette changes below the root: the website kit is Stage
// (always dark), a `[data-time="night"]` section flips to UV, and the members kit dims to Thermal at
// night. A token read on <html> would paint a cream map inside a dark band.
//
// Both engines take the same palette:
//   • Google, with no Cloud Map ID, gets a JSON `styles` array built from it. (A Map ID owns styling
//     when set, so `styles` is only passed without one; NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID still wins.)
//   • MapLibre gets the SAME palette painted into its vector style (`maplibreBasemapPaint`, SCAN-904):
//     land, water, parks, roads and labels take the kit's colours layer by layer, so the keyless fallback
//     and Google read as one map in the light Commons and the dark Stage alike. Only when a style has
//     none of the layers we know (a custom NEXT_PUBLIC_MAP_STYLE) does it fall back to a CSS filter on
//     the tile canvas (never the container: that would recolour the pins and the attribution). Dark uses
//     the design's own tile filter (templates/website/web/site.css `.fqm .leaflet-tile-pane`); light a
//     warm sand tint, not the bare grey Positron.
//
// DAWN has no `--fq-*` tokens, so `readBasemapPalette` returns null and every DAWN map renders exactly
// as before (Google's default palette, MapLibre's warm filter).
//
// SCAN-918 (owner 2026-10-14, the installed Android app: "the map on the App looks like trash", then "the
// google map needs a full Frequency styling"): the token-derived palette drew roads in the raised surface,
// which on some kits and modes read as heavy dark lines over grey clutter. Frequency now ships ONE full
// custom style in two modes, FREQUENCY_BASEMAP light and dark, from the SCAN-907 export values (the
// canvas token is scoped to light mode only, so the literals are read here, not off the CSS variable).
// Light: the cool canvas, a soft aqua sea, faint seaglass parks, roads a breath darker than the land with
// no casings, lavender-grey labels on a canvas halo. Dark (html.dark, or a band whose canvas is dark, like
// the Stage): near-black blue land, deep teal water, dim roads, soft light labels. Every business POI,
// attraction and transit line is hidden, terrain is flat, and boundaries are faint.

export type Rgb = [number, number, number]

export interface BasemapPalette {
  dark: boolean
  land: string
  water: string
  park: string
  road: string
  /** Arterials: a half step stronger than local roads. */
  roadArterial: string
  /** Highways: only a little stronger again. */
  roadMajor: string
  label: string
  labelFaint: string
  labelHalo: string
  boundary: string
}

/** The Frequency tokens a basemap is drawn from. Every one is an opaque colour in every mode. */
const TOKENS = {
  canvas: '--fq-bg-canvas',
  sunken: '--fq-bg-sunken',
  card: '--fq-surface-card',
  raised: '--fq-surface-raised',
  muted: '--fq-text-muted',
  faint: '--fq-text-faint',
  accent: '--fq-accent',
  water: '--fq-accent-2',
} as const

type TokenName = keyof typeof TOKENS

/** The design's dark tile treatment, verbatim from the handoff's event map. */
export const DARK_TILE_FILTER = 'invert(1) hue-rotate(205deg) brightness(.78) contrast(.92) saturate(.55)'

export function toHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((n) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0')).join('')}`
}

/** `a` moved `t` of the way towards `b`. */
export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance([r, g, b]: Rgb): number {
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** Build the palette from resolved token colours. Pure, so both modes are unit-tested. */
export function basemapPalette(c: Record<TokenName, Rgb>): BasemapPalette {
  const dark = luminance(c.canvas) < 0.2
  if (dark) {
    const land = mix(c.canvas, c.card, 0.6)
    return {
      dark,
      land: toHex(land),
      water: toHex(mix(c.canvas, c.water, 0.16)),
      park: toHex(mix(land, c.water, 0.06)),
      road: toHex(c.raised),
      roadArterial: toHex(mix(c.raised, c.accent, 0.09)),
      roadMajor: toHex(mix(c.raised, c.accent, 0.18)),
      label: toHex(c.muted),
      labelFaint: toHex(c.faint),
      labelHalo: toHex(c.canvas),
      boundary: toHex(mix(land, c.muted, 0.35)),
    }
  }
  return {
    dark,
    land: toHex(c.canvas),
    water: toHex(mix(c.canvas, c.water, 0.28)),
    park: toHex(mix(c.sunken, c.water, 0.08)),
    road: toHex(c.raised),
    roadArterial: toHex(mix(c.raised, c.accent, 0.08)),
    roadMajor: toHex(mix(c.raised, c.accent, 0.16)),
    label: toHex(c.muted),
    labelFaint: toHex(c.faint),
    labelHalo: toHex(c.canvas),
    boundary: toHex(mix(c.canvas, c.muted, 0.35)),
  }
}

/**
 * THE FREQUENCY BASEMAP (SCAN-918), light and dark. Literal on purpose: Google's JSON style takes hex
 * only, and the canvas token no longer resolves in dark mode. Light is built on the SCAN-907 export
 * canvas #F4F6F7 (lib/theme/design.ts chrome.light) with the export aqua #8FE9FF, seaglass #A3E8D4 and
 * a lavender-grey ink; dark on the Stage blue-black #070B14 (chrome.dark), raised #121C2E and muted
 * #98A6BC. Lowercase, because that is the form toHex emits and the style tests read.
 */
export const FREQUENCY_BASEMAP: { light: BasemapPalette; dark: BasemapPalette } = {
  light: {
    dark: false,
    land: '#f4f6f7', // token-ok: export canvas, cooled (SCAN-907); Google styles need hex
    water: '#cde9ee', // token-ok: canvas mixed a fifth toward export aqua #8FE9FF
    park: '#e2f1ec', // token-ok: canvas with a breath of export seaglass #A3E8D4
    road: '#e8ecef', // token-ok: a step below the canvas, so roads read without lines
    roadArterial: '#e0e5e9', // token-ok: arterials a half step stronger
    roadMajor: '#d7dee4', // token-ok: highways only a little stronger again
    label: '#8a879c', // token-ok: lavender-grey label ink
    labelFaint: '#a9a7b8', // token-ok: road and water names, quieter
    labelHalo: '#f4f6f7', // token-ok: halo in the canvas colour
    boundary: '#d9dde3', // token-ok: faint administrative lines
  },
  dark: {
    dark: true,
    land: '#0b111c', // token-ok: Stage blue-black #070B14 lifted a step
    water: '#0d2830', // token-ok: deep teal
    park: '#0e1d20', // token-ok: land with a breath of teal
    road: '#151e2c', // token-ok: dim roads, a step above the land
    roadArterial: '#1a2536', // token-ok: arterials a half step stronger
    roadMajor: '#1f2c40', // token-ok: highways, still under the raised surface #121C2E lifted
    label: '#a4adc4', // token-ok: soft light labels, the Stage muted #98A6BC lifted
    labelFaint: '#6e7a90', // token-ok: road and water names, quieter
    labelHalo: '#0b111c', // token-ok: halo in the land colour
    boundary: '#253047', // token-ok: faint administrative lines
  },
}

/** A Google Maps JSON style rule. */
export type GoogleMapStyle = {
  featureType?: string
  elementType?: string
  stylers: Record<string, string | number>[]
}

/** Google's `styles` for a palette: a full custom style, not a softened default (SCAN-918). Quiet on
 *  purpose: no business POIs, attractions or transit, so the only points on the map are ours; roads are
 *  fill only (no stroke anywhere), thin, and a breath off the land; labels are muted on a halo. */
export function googleMapStyles(p: BasemapPalette): GoogleMapStyle[] {
  return [
    { elementType: 'geometry', stylers: [{ color: p.land }] },
    { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: p.label }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: p.labelHalo }, { weight: 3 }] },
    { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: p.boundary }, { weight: 0.6 }] },
    { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
    { featureType: 'administrative.neighborhood', elementType: 'labels', stylers: [{ visibility: 'off' }] },
    { featureType: 'administrative.province', elementType: 'labels.text.fill', stylers: [{ color: p.labelFaint }] },
    { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: p.land }] },
    { featureType: 'landscape.natural.terrain', stylers: [{ visibility: 'off' }] },
    { featureType: 'poi', stylers: [{ visibility: 'off' }] },
    { featureType: 'poi.park', elementType: 'geometry', stylers: [{ visibility: 'on' }, { color: p.park }] },
    { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: p.road }] },
    { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ visibility: 'off' }] },
    { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
    { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: p.labelFaint }] },
    { featureType: 'road.local', elementType: 'geometry.fill', stylers: [{ weight: 0.8 }] },
    { featureType: 'road.local', elementType: 'labels', stylers: [{ visibility: 'off' }] },
    { featureType: 'road.arterial', elementType: 'geometry.fill', stylers: [{ color: p.roadArterial }, { weight: 1 }] },
    { featureType: 'road.highway', elementType: 'geometry.fill', stylers: [{ color: p.roadMajor }, { weight: 1.2 }] },
    { featureType: 'road.highway', elementType: 'labels', stylers: [{ visibility: 'simplified' }] },
    { featureType: 'transit', stylers: [{ visibility: 'off' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: p.water }] },
    { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: p.labelFaint }] },
  ]
}

/** The light Commons fallback tint: Positron's cool grey warmed to the kit's sand canvas. */
export const LIGHT_TILE_FILTER = 'sepia(.24) saturate(1.12) hue-rotate(-14deg) brightness(1.02) contrast(.95)'

/** The MapLibre tile-canvas filter for a palette, used only when the style could not be repainted. */
export function maplibreTileFilter(p: BasemapPalette): string {
  return p.dark ? DARK_TILE_FILTER : LIGHT_TILE_FILTER
}

/** The slice of a MapLibre style layer the repaint reads. */
export type StyleLayerLike = { id: string; type: string; 'source-layer'?: string }

/** MapLibre's label-halo paint property. Joined, not written whole: the class scanners (check:phantom)
 *  read the bare string as a Tailwind utility that emits nothing. */
const TEXT_HALO_COLOR = ['text', 'halo', 'color'].join('-')

/** One `map.setPaintProperty(layer, property, value)` call. A number only for the opacity that hides a
 *  business POI label (SCAN-918); every colour is a hex string. */
type PaintOverride = [layerId: string, property: string, value: string | number]

/** MapLibre's label opacity paint properties, joined for the same reason as TEXT_HALO_COLOR. */
const TEXT_OPACITY = ['text', 'opacity'].join('-')
const ICON_OPACITY = ['icon', 'opacity'].join('-')

/**
 * The palette painted into a MapLibre vector style (OpenMapTiles schema, which OpenFreeMap's Positron
 * and most hosted styles use). Pure, so both modes are unit-tested; the canvas applies the result.
 * Mirrors googleMapStyles: quiet ground, soft roads with no casings, muted labels on a canvas halo.
 */
export function maplibreBasemapPaint(layers: readonly StyleLayerLike[], p: BasemapPalette): PaintOverride[] {
  const out: PaintOverride[] = []
  for (const l of layers) {
    const src = l['source-layer'] ?? ''
    const id = l.id
    // Only the basemap's own vector layers. A layer a map adds for its pins (a GeoJSON source has no
    // source-layer) is never repainted, whatever order the events fire in.
    if (l.type !== 'background' && !src) continue
    if (l.type === 'background') out.push([id, 'background-color', p.land])
    else if (l.type === 'fill') {
      if (src === 'water') out.push([id, 'fill-color', p.water])
      else if (src === 'park' || src === 'landcover') out.push([id, 'fill-color', p.park])
      else if (src === 'landuse') out.push([id, 'fill-color', p.land])
      else if (src === 'building' || src === 'aeroway' || src === 'transportation') out.push([id, 'fill-color', p.road])
    } else if (l.type === 'line') {
      if (src === 'waterway') out.push([id, 'line-color', p.water])
      else if (src === 'boundary') out.push([id, 'line-color', p.boundary])
      else if (src === 'transportation' || src === 'aeroway') {
        // Casings vanish into the land, as Google's road strokes are switched off.
        if (id.includes('casing')) out.push([id, 'line-color', p.land])
        else if (id.includes('railway')) out.push([id, 'line-color', p.boundary])
        else if (id.includes('motorway') || id.includes('major') || id.includes('trunk')) out.push([id, 'line-color', p.roadMajor])
        else if (id.includes('primary') || id.includes('secondary') || id.includes('tertiary')) out.push([id, 'line-color', p.roadArterial])
        else out.push([id, 'line-color', p.road])
      }
    } else if (l.type === 'symbol') {
      // Business POIs and transit stops vanish, as Google's `poi` and `transit` rules hide them.
      if (src === 'poi' || src === 'aerodrome_label') {
        out.push([id, TEXT_OPACITY, 0])
        out.push([id, ICON_OPACITY, 0])
        continue
      }
      const faint = src === 'water_name' || src === 'waterway' || src === 'transportation_name'
      out.push([id, 'text-color', faint ? p.labelFaint : p.label])
      out.push([id, TEXT_HALO_COLOR, p.labelHalo])
    }
  }
  return out
}

/** Is this map mounted under a design that styles maps (Frequency's `--fq-*` tokens resolve here)?
 *  Cheap: one computed-style read, no canvas. False under DAWN, so DAWN's pins and filter stay. */
export function isDesignMap(el: Element | null): boolean {
  if (!el || typeof window === 'undefined') return false
  try {
    return getComputedStyle(el).getPropertyValue(TOKENS.canvas).trim() !== ''
  } catch {
    return false
  }
}

/** Resolve any CSS colour (var(), color-mix(), oklch…) to RGB by painting it. */
function resolveColor(el: Element, value: string, ctx: CanvasRenderingContext2D): Rgb | null {
  const probe = document.createElement('span')
  probe.style.color = value
  probe.style.display = 'none'
  el.appendChild(probe)
  const computed = getComputedStyle(probe).color
  probe.remove()
  if (!computed) return null
  ctx.clearRect(0, 0, 1, 1)
  ctx.fillStyle = '#000'
  ctx.fillStyle = computed
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
  return a === 0 ? null : [r, g, b]
}

/** Is the map in `el` on a dark ground? The members app's dark mode (`.dark` on <html>), or a band
 *  whose own canvas is dark (the website's Stage, a night section). */
function isDarkGround(el: Element): boolean {
  if (document.documentElement.classList.contains('dark')) return true
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return false
  const rgb = resolveColor(el, `var(${TOKENS.canvas})`, ctx)
  return rgb ? luminance(rgb) < 0.2 : false
}

/**
 * The Frequency basemap for a map mounted in `el` (FREQUENCY_BASEMAP light or dark), or null when the
 * page wears no `--fq-*` tokens (DAWN). Never throws: a basemap that cannot be styled renders at its
 * default.
 */
export function readBasemapPalette(el: Element | null): BasemapPalette | null {
  if (!el || typeof window === 'undefined') return null
  try {
    if (!getComputedStyle(el).getPropertyValue(TOKENS.canvas).trim()) return null
    return FREQUENCY_BASEMAP[isDarkGround(el) ? 'dark' : 'light']
  } catch {
    return null
  }
}

/** Call `onChange` whenever the members app flips light/dark (the `.dark` class on <html>), so a
 *  live map can swap its style without a rebuild. Returns the teardown. */
export function watchColorMode(onChange: () => void): () => void {
  if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') return () => {}
  const root = document.documentElement
  let dark = root.classList.contains('dark')
  const observer = new MutationObserver(() => {
    const next = root.classList.contains('dark')
    if (next === dark) return
    dark = next
    onChange()
  })
  observer.observe(root, { attributes: true, attributeFilter: ['class'] })
  return () => observer.disconnect()
}
