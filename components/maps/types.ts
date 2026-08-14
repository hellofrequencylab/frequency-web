// The provider-agnostic map contract (ADR-901, extended by ADR-1022).
//
// Every map in the app is described with these props and rendered by <MapCanvas>, which
// picks Google or MapLibre. A component that wants a map describes WHAT to plot; it never
// touches a map library. The drift guard (components/maps/maps-wiring.test.ts) enforces that.
//
// ADR-1022 added the four capabilities a browsing map needs — pin click, clustering,
// fullscreen, and pin kinds — WITHOUT letting the two engines answer them differently. Every
// decision they could have disagreed about (which colour a kind paints, which pins merge at
// which zoom, how far a cluster tap zooms, what the bubble says) is computed by a pure module
// under lib/maps/ that both canvases call. components/maps/map-capabilities.test.ts asserts
// they expose the same prop surface and reach for the same shared helpers.

import type { MapClusterOptions } from '@/lib/maps/cluster'
import type { MapPinKind, MapPinTone } from '@/lib/maps/pin-kinds'

// Re-exported so a surface keeps importing its map vocabulary from one place. The definitions
// live under lib/maps/ because they are pure data a page can read to draw a legend without
// pulling a map engine into its bundle (docs/DEPLOY-SAFETY.md §1).
export type { MapClusterOptions, MapPinKind, MapPinTone }

export type MapPin = {
  id: string
  lat: number
  lng: number
  /** Bold first line of the popup. Omit for a pin with no popup. */
  title?: string | null
  /** Quiet second line of the popup. On the Around You map this is the WHEN (the date, and how many
   *  more dates a repeating event has); `detail` carries the WHERE. */
  subtitle?: string | null
  /** Quiet third line, under `subtitle`. Kept separate rather than joined into it because the two
   *  answer different questions and a member scanning a card reads them as different rows. */
  detail?: string | null
  /** A short pill above the title: "RSVP for address", "Approximate area".
   *
   *  🔴 Its job is to qualify the DOT. A coarsened pin looks exactly as precise as an exact one, so
   *  without this the map quietly invites a member to plan around a point that is up to a kilometre
   *  out. lib/maps/pin-copy.ts decides the wording; this only carries it. */
  badge?: string | null
  /** Header image for the popup card. A cover photo, already resolved to a public URL by the
   *  loader: the map layer never touches storage. Omit and the card renders without a header. */
  imageUrl?: string | null
  /** Optional link at the foot of the popup. */
  href?: string | null
  hrefLabel?: string | null
  /** Explicit colour override. Predates `kind` and still wins over it. */
  tone?: MapPinTone
  /** Which layer this pin belongs to: Event, Circle, Space, or the neutral `place` default.
   *  Drives the marker colour through lib/maps/pin-kinds.ts, so a page's legend and the map
   *  can never disagree. */
  kind?: MapPinKind
  /** Accessible name and tooltip for the marker. Falls back to `title`. */
  label?: string | null
  /** How many MORE things this one pin already stands for, beyond itself.
   *
   *  A repeating event is ONE gathering on many dates. lib/nearby/map-pins.ts folds the series to a
   *  single pin (lib/events/series.ts) rather than stacking one pin per date on the same coordinate,
   *  and this is what carries the rest of the dates through to the map: the spot draws as a `1+`
   *  bubble instead of a plain pin, and the bubble opens the pin's popup rather than zooming.
   *
   *  Zero, null and undefined all mean "this pin is exactly one thing". */
  moreCount?: number | null
  /** This pin was COARSENED before it was published: it is an area, not an address.
   *
   *  Set by any loader that ran a point through lib/maps/approximate.ts, which today means an event
   *  whose host set `hide_address` and a Space whose owner chose an approximate location. The popup
   *  already says so, but a popup is only read by someone who taps that one dot, and a map full of
   *  precise-looking dots where some are not precise is a quiet lie to everyone who does not. A
   *  surface that draws a legend should say it there too. */
  approximate?: boolean
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

/** What BOTH engines implement. Every key here is destructured by both canvases, and
 *  components/maps/map-capabilities.test.ts fails if one of them grows or drops a key —
 *  which is how a capability that works on Google and quietly does nothing on the MapLibre
 *  fallback gets caught before a member ever sees it. */
export type MapEngineProps = {
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
  /** Marker click, so a pin can open a card the page owns.
   *
   *  ⚠️ When this is set the canvas does NOT open its own popup. Two cards for one tap is
   *  worse than either alone, and the caller that wants a card is the caller that knows how
   *  it should look. Both engines honour that rule identically. */
  onPinClick?: (pin: MapPin) => void
  /** Density handling: pins that overlap on screen merge into one bubble, which splits as the
   *  member zooms in. Omit for one marker per pin (every pre-ADR-1022 caller).
   *
   *  Ignored in `draggable` picker mode, where there is exactly one pin to place. */
  cluster?: MapClusterOptions | null
  className?: string
}

export type MapCanvasProps = MapEngineProps & {
  /** Render an expand control that reopens this same map full screen.
   *
   *  The overlay is components/ui/dialog.tsx with `align="sheet"`, which already owns the
   *  backdrop, ESC, scroll-lock, focus trap and focus restore. The seam composes it; it does
   *  not re-solve any of that. */
  expandable?: boolean
  /** Copy for the expand control. Defaults to "Expand map". */
  expandLabel?: string
  /** Draw the seam's own corner control (default on). Set false when the caller supplies its own
   *  trigger somewhere else on the page and drives the state below — the Around You header's
   *  "View the map" button sits in the hero lockup, not on the map. */
  expandControl?: boolean
  /** CONTROLLED fullscreen: the caller owns the open state. Omit for the seam's own state.
   *
   *  The point is that the DIALOG stays here. A caller that wanted its own trigger used to have to
   *  hand-roll the overlay too, and the one that did (MapBanner, components/circles/circles-map.tsx)
   *  re-solved ESC by hand and got none of the backdrop, scroll-lock, focus trap or focus restore
   *  that components/ui/dialog.tsx already owns. A button is not a reason to fork a dialog. */
  expanded?: boolean
  onExpandedChange?: (expanded: boolean) => void
}

/** Props the two implementations receive. `onProviderError` is how the Google canvas asks
 *  the seam to fall back to MapLibre.
 *
 *  It carries the REASON. The loader rejects with six distinct diagnostic strings (no key,
 *  script blocked, no API surface, auth rejected, watchdog timeout, server render) and the
 *  seam logs whichever one it was — an argument-less callback threw all six away, which is
 *  how a deterministic loader bug survived three rounds of debugging unseen. */
export type MapImplProps = MapEngineProps & { onProviderError?: (reason: string) => void }
