import { clusterAccessibleLabel, clusterDiameterPx, clusterLabel, clusterStepDiameterPx } from '@/lib/maps/cluster'
import { FREQUENCY_CLUSTER, FREQUENCY_PIN, FREQUENCY_PIN_RING, MAP_CLUSTER_PAINT } from '@/lib/maps/pin-kinds'

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

/** A cluster bubble: a filled circle with its count, ringed so it reads against any basemap.
 *
 *  `plus` is the "and more behind this" flag from lib/maps/cluster.ts, which turns the label into
 *  `1+` for a repeating event folded to one pin. It only ever reaches the two shared functions
 *  below, so the fallback engine cannot label a bubble differently from Google. */
export function buildClusterMarker(count: number, plus = false, ring: string | null = null): HTMLElement {
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
    // `ring` is the Frequency pin's white ring (SCAN-904); DAWN passes none and keeps its surface ring.
    `box-shadow:0 0 0 2px ${ring ?? `var(${MAP_CLUSTER_PAINT.ringToken})`}, 0 1px 3px color-mix(in srgb, var(--color-ink) 28%, transparent)`,
    'font-weight:600',
    'font-size:13px',
    'line-height:1',
    'cursor:pointer',
    'user-select:none',
  ].join(';')
  el.textContent = clusterLabel(count, plus)
  makeMarkerActivatable(el, clusterAccessibleLabel(count, plus))
  return el
}

/** The CSS gradient of the Frequency badge, from the shared stops (lib/maps/pin-kinds.ts). */
function badgeGradient(): string {
  const [a, b, c] = FREQUENCY_CLUSTER.stops
  return `linear-gradient(135deg, ${a} 0%, ${b} 58%, ${c} 100%)`
}

/** THE FREQUENCY CLUSTER BADGE on the keyless engine (SCAN-918): a round badge in the kit's soft deep
 *  sweep with a white ring and a white bold count with a soft shadow, stepped small, medium, large.
 *  The Google canvas draws the same badge from `frequencyBadgeSvg` and the same two numbers. `label`
 *  overrides the accessible name (an area badge says what is there, not "zoom in"). */
export function buildFrequencyBadge(count: number, plus = false, label: string | null = null): HTMLElement {
  const size = clusterStepDiameterPx(count)
  const el = document.createElement('div')
  el.className = 'frequency-map-cluster'
  el.style.cssText = [
    `width:${size}px`,
    `height:${size}px`,
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'border-radius:9999px',
    `background:${badgeGradient()}`,
    `color:${FREQUENCY_PIN_RING}`,
    `box-shadow:0 0 0 ${FREQUENCY_CLUSTER.ringPx}px ${FREQUENCY_PIN_RING}, 0 2px 8px color-mix(in srgb, var(--color-ink) 30%, transparent)`,
    'text-shadow:0 1px 2px color-mix(in srgb, var(--color-ink) 45%, transparent)',
    'font-weight:700',
    `font-size:${size >= 50 ? 15 : 13}px`,
    'line-height:1',
    'cursor:pointer',
    'user-select:none',
  ].join(';')
  el.textContent = clusterLabel(count, plus)
  makeMarkerActivatable(el, label ?? clusterAccessibleLabel(count, plus))
  return el
}

/** The same badge as an SVG image for Google's classic Marker, which takes an icon URL and no DOM
 *  (SCAN-918). Disc in the shared gradient, white ring, a soft drop shadow; the count is the marker's
 *  own label laid over it. `pad` leaves room for the shadow; the anchor is the disc's centre. */
export function frequencyBadgeSvg(diameter: number): { url: string; box: number } {
  const pad = 4
  const box = diameter + pad * 2
  const c = box / 2
  const r = diameter / 2 - FREQUENCY_CLUSTER.ringPx / 2
  const [a, b, d] = FREQUENCY_CLUSTER.stops
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${box}" height="${box}" viewBox="0 0 ${box} ${box}">` +
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
    `<stop offset="0" stop-color="${a}"/><stop offset=".58" stop-color="${b}"/><stop offset="1" stop-color="${d}"/>` +
    '</linearGradient><filter id="s" x="-30%" y="-30%" width="160%" height="160%">' +
    '<feDropShadow dx="0" dy="1.5" stdDeviation="1.6" flood-opacity=".28"/></filter></defs>' +
    `<circle cx="${c}" cy="${c}" r="${r}" fill="url(#g)" stroke="${FREQUENCY_PIN_RING}" stroke-width="${FREQUENCY_CLUSTER.ringPx}" filter="url(#s)"/>` +
    '</svg>'
  return { url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`, box }
}

/** THE FREQUENCY PIN on the keyless engine (SCAN-904): a round dot in the pin's kind colour with a
 *  white ring, the same shape and size Google draws from FREQUENCY_PIN. Centre-anchored, so the dot
 *  sits ON the point (DAWN's teardrop points at it from above). */
export function buildRoundPin(paint: { token: string; fallback: string }, ring: string): HTMLElement {
  const size = FREQUENCY_PIN.diameterPx
  const el = document.createElement('div')
  el.className = 'frequency-map-pin'
  el.style.cssText = [
    `width:${size}px`,
    `height:${size}px`,
    'border-radius:9999px',
    `background:var(${paint.token}, ${paint.fallback})`,
    `box-shadow:0 0 0 ${FREQUENCY_PIN.ringPx}px ${ring}, 0 2px 6px color-mix(in srgb, var(--color-ink) 35%, transparent)`,
    'cursor:pointer',
  ].join(';')
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
