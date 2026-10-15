// A MINIMAL, hand-written type surface for the Google Maps JavaScript API.
//
// WHY NOT @types/google.maps: that package is ~9k lines describing an API we touch at
// perhaps twenty call sites, and adding a dependency to render a map is a poor trade. This
// file declares exactly what components/maps/google-canvas.tsx uses and nothing else — so
// the compiler still catches a typo, and the blast radius of a Google API change is one file.
//
// Everything here is structural. Nothing is a global declaration, so this cannot leak
// `google` into the ambient namespace of unrelated modules.
import type { GoogleMapStyle } from './basemap-look'

type GoogleLatLngLiteral = { lat: number; lng: number }

export type GoogleListener = { remove(): void }

type GooglePadding = { top: number; right: number; bottom: number; left: number }

interface GoogleLatLng {
  lat(): number
  lng(): number
}

interface GoogleLatLngBounds {
  extend(point: GoogleLatLngLiteral): GoogleLatLngBounds
  isEmpty(): boolean
}

type GoogleMapMouseEvent = { latLng: GoogleLatLng | null }

export interface GoogleMap {
  setCenter(c: GoogleLatLngLiteral): void
  setZoom(z: number): void
  getZoom(): number | undefined
  panTo(c: GoogleLatLngLiteral): void
  fitBounds(bounds: GoogleLatLngBounds, padding?: number | GooglePadding): void
  addListener(event: string, handler: (e: GoogleMapMouseEvent) => void): GoogleListener
  /** Swap options on a live map: the Frequency style when the members app flips light/dark (SCAN-918). */
  setOptions(opts: Partial<GoogleMapOptions>): void
}

export interface GoogleMarker {
  setPosition(p: GoogleLatLngLiteral): void
  getPosition(): GoogleLatLng | null | undefined
  setMap(map: GoogleMap | null): void
  addListener(event: string, handler: () => void): GoogleListener
}

export interface GoogleInfoWindow {
  setContent(content: Node | string): void
  open(opts: { map: GoogleMap; anchor?: GoogleMarker }): void
  close(): void
}

export interface GoogleCircle {
  setMap(map: GoogleMap | null): void
}

type GoogleMapOptions = {
  center: GoogleLatLngLiteral
  zoom: number
  mapId?: string
  /** JSON styling. Ignored by Google when a Map ID is set (the Cloud style wins). */
  styles?: GoogleMapStyle[]
  /** The colour shown before tiles paint. */
  backgroundColor?: string
  disableDefaultUI?: boolean
  zoomControl?: boolean
  /** Where the zoom buttons sit: a google.maps.ControlPosition value (SCAN-918 pins them bottom right,
   *  clear of the full-screen map's "Close map" pill). */
  zoomControlOptions?: { position?: number }
  mapTypeControl?: boolean
  streetViewControl?: boolean
  fullscreenControl?: boolean
  rotateControl?: boolean
  gestureHandling?: string
  clickableIcons?: boolean
  keyboardShortcuts?: boolean
  draggable?: boolean
  scrollwheel?: boolean
  disableDoubleClickZoom?: boolean
}

/** An image icon: how the Frequency cluster badge is drawn (an SVG data URL, SCAN-918). */
type GoogleIcon = {
  url: string
  scaledSize?: GoogleSize
  anchor?: GooglePoint
  labelOrigin?: GooglePoint
}

type GoogleSize = { width: number; height: number }
type GooglePoint = { x: number; y: number }

type GoogleSymbol = {
  path: number | string
  scale?: number
  fillColor?: string
  fillOpacity?: number
  strokeColor?: string
  strokeWeight?: number
}

/** Text drawn INSIDE a marker. This is how the Google canvas prints a cluster count: a classic
 *  Marker takes no DOM element, and AdvancedMarkerElement (which does) would force a Cloud Map
 *  ID onto every deployment — the trade the canvas header already rejects for ordinary pins. */
type GoogleMarkerLabel = {
  text: string
  color?: string
  fontSize?: string
  fontWeight?: string
  /** A CSS class on the label, so the theme sheet can give the count its soft shadow (SCAN-918). */
  className?: string
}

type GoogleMarkerOptions = {
  map: GoogleMap
  position: GoogleLatLngLiteral
  title?: string
  draggable?: boolean
  icon?: GoogleSymbol | GoogleIcon
  label?: GoogleMarkerLabel
  zIndex?: number
}

type GoogleCircleOptions = {
  map: GoogleMap
  center: GoogleLatLngLiteral
  radius: number
  fillColor?: string
  fillOpacity?: number
  strokeColor?: string
  strokeOpacity?: number
  strokeWeight?: number
  clickable?: boolean
}

/** The slice of `google.maps` this app constructs. */
export type GoogleMapsApi = {
  Map: new (el: HTMLElement, opts: GoogleMapOptions) => GoogleMap
  Marker: new (opts: GoogleMarkerOptions) => GoogleMarker
  InfoWindow: new (opts?: { disableAutoPan?: boolean }) => GoogleInfoWindow
  LatLngBounds: new () => GoogleLatLngBounds
  Circle: new (opts: GoogleCircleOptions) => GoogleCircle
  SymbolPath: { CIRCLE: number }
  Size: new (width: number, height: number) => GoogleSize
  Point: new (x: number, y: number) => GooglePoint
  ControlPosition: { RIGHT_BOTTOM: number }
}
