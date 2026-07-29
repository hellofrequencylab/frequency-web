// The provider-agnostic map contract (ADR-901).
//
// Every map in the app is described with these props and rendered by <MapCanvas>, which
// picks Google or MapLibre. A component that wants a map describes WHAT to plot; it never
// touches a map library. The drift guard (components/maps/maps-wiring.test.ts) enforces that.

/** Which token drives a pin's colour. Map DOM lives outside Tailwind, so the canvas resolves
 *  the CSS custom property at mount rather than taking a raw colour from the caller. */
export type MapPinTone = 'primary' | 'secondary'

export type MapPin = {
  id: string
  lat: number
  lng: number
  /** Bold first line of the popup. Omit for a pin with no popup. */
  title?: string | null
  /** Quiet second line of the popup. */
  subtitle?: string | null
  /** Optional link at the foot of the popup. */
  href?: string | null
  hrefLabel?: string | null
  tone?: MapPinTone
}

/** A geographic area drawn instead of (or alongside) a pin — the privacy circle. */
export type MapArea = {
  lat: number
  lng: number
  radiusM: number
}

/** How to frame multiple pins. Omit to leave the view at `center` / `zoom`. */
export type MapFit = {
  padding?: number
  maxZoom?: number
  /** With exactly one pin, ease to this zoom instead of fitting to a degenerate bounds.
   *  Null means "leave the view alone" (the circle map's behaviour with no event pins). */
  singleZoom?: number | null
}

export type MapCanvasProps = {
  /** [lng, lat] — GeoJSON order, matching the rest of the map stack. */
  center: [number, number]
  zoom: number
  pins?: MapPin[]
  area?: MapArea | null
  fit?: MapFit | null
  /** Pan/zoom/drag. False renders a still map that still shows its attribution. */
  interactive?: boolean
  /** Picker mode: the FIRST pin is draggable and a map click moves it. */
  draggable?: boolean
  /** Picker mode: reports the new pin position. */
  onMove?: (lat: number, lng: number) => void
  /** When set, the view eases here whenever it changes (viewer geolocation arriving). */
  recenterTo?: [number, number] | null
  className?: string
}

/** Props the two implementations receive. `onProviderError` is how the Google canvas asks
 *  the seam to fall back to MapLibre. */
export type MapImplProps = MapCanvasProps & { onProviderError?: () => void }
