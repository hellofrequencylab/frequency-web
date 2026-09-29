// A MINIMAL, hand-written type surface for the Google Maps JavaScript API.
//
// WHY NOT @types/google.maps: that package is ~9k lines describing an API we touch at
// perhaps twenty call sites, and adding a dependency to render a map is a poor trade. This
// file declares exactly what components/maps/google-canvas.tsx uses and nothing else — so
// the compiler still catches a typo, and the blast radius of a Google API change is one file.
//
// Everything here is structural. Nothing is a global declaration, so this cannot leak
// `google` into the ambient namespace of unrelated modules.

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
  disableDefaultUI?: boolean
  zoomControl?: boolean
  gestureHandling?: string
  clickableIcons?: boolean
  keyboardShortcuts?: boolean
  draggable?: boolean
  scrollwheel?: boolean
  disableDoubleClickZoom?: boolean
}

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
}

type GoogleMarkerOptions = {
  map: GoogleMap
  position: GoogleLatLngLiteral
  title?: string
  draggable?: boolean
  icon?: GoogleSymbol
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
}
