import { clusterAccessibleLabel, clusterDiameterPx, clusterLabel } from '@/lib/maps/cluster'
import { MAP_CLUSTER_PAINT } from '@/lib/maps/pin-kinds'

// The cluster bubble as REAL DOM, for the engine that draws markers as DOM (MapLibre).
//
// Sibling of popup-content.ts and held to the same rule: nodes and `textContent`, never an
// HTML string. A cluster label is a number we computed, so this is not the injection surface a
// pin title is — but the one place in the map stack that parses HTML is the one place a future
// edit would reach for, so there isn't one.
//
// SIZE AND TEXT COME FROM lib/maps/cluster.ts, not from here. The Google canvas cannot use a
// DOM element (a classic Marker takes a Symbol, and AdvancedMarkerElement would force a Cloud
// Map ID on every deployment), so it draws its bubble with the same diameter and the same
// label read from the same two functions. The drawing primitive differs; nothing a member can
// perceive does.
//
// Colours are CSS custom properties, not resolved values: map DOM sits outside Tailwind, but
// the variables cascade from :root, so a bubble tracks the active theme for free.

/** A cluster bubble: a filled circle with its count, ringed so it reads against any basemap. */
export function buildClusterMarker(count: number): HTMLElement {
  const size = clusterDiameterPx(count)
  const el = document.createElement('div')
  el.className = 'frequency-map-cluster'
  el.style.cssText = [
    `width:${size}px`,
    `height:${size}px`,
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'border-radius:9999px',
    `background:var(${MAP_CLUSTER_PAINT.token})`,
    `color:var(${MAP_CLUSTER_PAINT.textToken})`,
    // color-mix, not an rgba() literal: the drop shadow stays on the token layer, so it
    // darkens with the ink token instead of pinning a raw black to every theme.
    `box-shadow:0 0 0 2px var(${MAP_CLUSTER_PAINT.ringToken}), 0 1px 3px color-mix(in srgb, var(--color-ink) 28%, transparent)`,
    'font-weight:600',
    'font-size:13px',
    'line-height:1',
    'cursor:pointer',
    'user-select:none',
  ].join(';')
  el.textContent = clusterLabel(count)
  makeMarkerActivatable(el, clusterAccessibleLabel(count))
  return el
}

/**
 * Give a marker element the keyboard and screen-reader behaviour a tappable thing needs.
 *
 * Google's classic markers get this from the Maps API itself (they are focusable and Enter
 * fires `click`). A MapLibre marker is a plain div, so without this the keyless fallback would
 * ship a map whose pins are mouse-only — a real accessibility regression that only appears on
 * the engine nobody with a Google key ever loads.
 */
export function makeMarkerActivatable(el: HTMLElement, label: string | null): void {
  if (label) {
    el.setAttribute('aria-label', label)
    el.setAttribute('title', label)
  }
  el.setAttribute('role', 'button')
  el.tabIndex = 0
}

/** Fire `onActivate` on click, Enter and Space. Returns a teardown for the element's listeners
 *  (MapLibre discards the element on `marker.remove()`, but a leaked handler on a retained
 *  node is exactly the kind of thing that survives a hot reload and confuses the next reader). */
export function onMarkerActivate(el: HTMLElement, onActivate: () => void): () => void {
  const click = (e: Event) => {
    e.stopPropagation()
    onActivate()
  }
  const key = (e: KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    e.stopPropagation()
    onActivate()
  }
  el.addEventListener('click', click)
  el.addEventListener('keydown', key)
  return () => {
    el.removeEventListener('click', click)
    el.removeEventListener('keydown', key)
  }
}
