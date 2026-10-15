import type * as maplibregl from 'maplibre-gl'
import {
  maplibreBasemapPaint,
  maplibreTileFilter,
  readBasemapPalette,
  watchColorMode,
  type BasemapPalette,
  type StyleLayerLike,
} from '@/lib/maps/basemap-look'

// THE DESIGN'S BASEMAP ON A MAPLIBRE MAP (SCAN-904). One call, shared by every module that builds a
// maplibregl.Map: the seam's canvas, the DAWN Circles map and the admin QR scan map. Under Frequency it
// paints the kit's palette into the vector style (lib/maps/basemap-look.ts `maplibreBasemapPaint`, the
// same palette Google's JSON style is built from), so the keyless fallback looks like the Google map in
// both the light Commons and the dark Stage. Under DAWN there are no `--fq-*` tokens, nothing happens,
// and the caller's warm filter stays exactly as it was.

/** Apply the design's basemap to `map`, mounted in `container`. Returns whether a design applied. */
export function applyDesignBasemap(map: maplibregl.Map, container: HTMLElement): boolean {
  const first = readBasemapPalette(container)
  if (!first) return false

  // The design owns the look now: drop DAWN's container filter (it would tint the pins too) and put the
  // land colour behind the canvas so the first frame is the kit's ground, not a white flash.
  container.style.filter = 'none'
  const canvas = map.getCanvas()

  const paint = (palette: BasemapPalette) => {
    container.style.background = palette.land
    const layers = (map.getStyle()?.layers ?? []) as unknown as StyleLayerLike[]
    let applied = 0
    for (const [id, property, value] of maplibreBasemapPaint(layers, palette)) {
      try {
        // The repaint only names paint keys (lib/maps/basemap-look.ts): colours, and the opacity that
        // hides a business POI label.
        map.setPaintProperty(id, property as Parameters<maplibregl.Map['setPaintProperty']>[1], value)
        applied++
      } catch {
        // A layer a custom style names differently: leave it at the style's own colour.
      }
    }
    // Repainted: the tiles carry the palette themselves. A style with none of the known layers (a
    // custom NEXT_PUBLIC_MAP_STYLE) keeps the filter, which still reads as the design.
    canvas.style.filter = applied > 0 ? 'none' : maplibreTileFilter(palette)
  }

  container.style.background = first.land
  // Until the style is repainted, the tiles wear the design's filter so no frame is bare grey.
  canvas.style.filter = maplibreTileFilter(first)
  if (map.isStyleLoaded()) paint(first)
  else map.once('style.load', () => paint(first))

  // SCAN-918: the members app flips light/dark without a reload, so the map follows it live, as the
  // Google canvas does, instead of keeping the ground it was built on.
  const stop = watchColorMode(() => {
    const next = readBasemapPalette(container)
    if (next && map.isStyleLoaded()) paint(next)
  })
  map.once('remove', stop)
  return true
}
