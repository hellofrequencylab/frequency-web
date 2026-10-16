// WHAT A PIN *IS*, and therefore what colour it paints — one table, both engines (ADR-1022).
//
// The seam needs pins that a browsing surface can tell apart: an Event is not a Circle is not
// a Space. Before this, each canvas carried its own `TONE_VAR` map, so "make Circles green"
// meant editing two files and hoping they agreed. A colour that matches on Google and drifts
// on MapLibre is exactly the silent degrade docs/DEPLOY-SAFETY.md rule 6 is about: the keyless
// fallback would render a legend that lies, and nothing would fail.
//
// PURE ON PURPOSE. No React, no Next, no map library, no DOM. A page may import this to draw
// its legend without pulling a map engine into its bundle — which matters, because map
// libraries are the heaviest thing the seam can reach (docs/DEPLOY-SAFETY.md §1).
//
// Both `token` and `fallback` are needed. MapLibre marker DOM can read the CSS custom property
// directly; a Google `Symbol` needs a concrete colour string, so a canvas that mounts before
// the stylesheet resolves would otherwise draw an invisible pin.

/** Which layer a pin belongs to. `place` is the neutral default every pre-existing caller
 *  (venue map, location picker, listing map) lands on, and it keeps their colour unchanged. */
export type MapPinKind = 'event' | 'circle' | 'space' | 'place' | 'starter'

/** Which token drives a pin's colour when the caller wants to override its kind. Map DOM lives
 *  outside Tailwind, so the canvas resolves the CSS custom property at mount. */
export type MapPinTone = 'primary' | 'secondary'

type MapPinPaint = {
  /** The DAWN custom property. Read at mount; this is the value that actually ships. */
  token: string
  /** Concrete colour for the one engine that cannot accept a custom property. */
  fallback: string
  /** Plural, title-case label for a legend. Voice: plain noun, no sentence. */
  legend: string
  /** SINGULAR, title-case. The pill on a popup card that says WHAT the member just tapped.
   *
   *  A map with three layers in three colours still leaves a member decoding a legend to know
   *  whether the dot they opened is a gathering or a group. The pill says it in a word, and it is
   *  painted in the SAME token as the dot, so the card and the pin are visibly the same thing. */
  noun: string
}

/** The three layers the Around You map draws, plus the neutral default.
 *
 *  Fallbacks mirror the LIGHT-theme token of the same name in app/globals.css. They are reached
 *  only when the custom property has not resolved yet, so they never fight the dark theme. */
export const MAP_PIN_KINDS: Record<MapPinKind, MapPinPaint> = {
  // token-ok: mirrors --color-primary; a Google Symbol requires a concrete colour string
  event: { token: '--color-primary', fallback: '#E2912F', legend: 'Events', noun: 'Event' },
  // token-ok: mirrors --color-signal
  circle: { token: '--color-signal', fallback: '#0F8E78', legend: 'Circles', noun: 'Circle' },
  // token-ok: mirrors --color-broadcast
  space: { token: '--color-broadcast', fallback: '#1EB6C5', legend: 'Spaces', noun: 'Space' },
  // token-ok: mirrors --color-primary; the pre-existing default, unchanged
  place: { token: '--color-primary', fallback: '#E2912F', legend: 'Places', noun: 'Place' },
  // A Starter Circle waiting to be claimed (the Circles map's second layer). Same token the DAWN Circles
  // map paints its starters in, so moving that map onto the seam changed no colour.
  // token-ok: mirrors --design-map-starter
  starter: { token: '--design-map-starter', fallback: '#7C5CD6', legend: 'Starters', noun: 'Starter Circle' },
}

/** THE FREQUENCY PIN (SCAN-904): a round dot in the kit's accent or side colour with a WHITE ring, on
 *  both engines, on the light Commons and the dark Stage alike. White on purpose, not a surface token:
 *  the kit's surface goes dark at night and on Stage, and a dark ring would sink the pin into the map.
 *  Applied only where the `--fq-*` tokens resolve (lib/maps/basemap-look.ts `isDesignMap`), so DAWN's
 *  pins keep their teardrop and their `--color-surface` ring. */
// token-ok: the design's pin ring is white in every mode; a Google Symbol needs a concrete colour string
export const FREQUENCY_PIN_RING = '#FFFFFF'

/** Pixel size of the Frequency pin (diameter) and its ring. One pair, both engines. */
export const FREQUENCY_PIN = { diameterPx: 16, ringPx: 2.5 } as const

/** THE FREQUENCY CLUSTER BADGE (SCAN-918): a round badge in the kit's soft deep sweep (sky to aqua to
 *  seaglass) with a white ring and a white bold count, on both engines. Literal stops because Google
 *  draws the badge as an SVG image, which cannot read a custom property. Sizes step with the count
 *  (lib/maps/cluster.ts clusterStepDiameterPx). DAWN keeps its flat token bubble. */
export const FREQUENCY_CLUSTER = {
  stops: [
    '#5A9FD0', // token-ok: export deep sweep sky stop (--fq-iridescent-sweep-deep, app/themes/frequency.css)
    '#2C93A3', // token-ok: export deep sweep aqua stop
    '#3C9C8C', // token-ok: export deep sweep seaglass stop
  ],
  ringPx: 2.5,
} as const

/** The pre-ADR-1022 tone escape hatch, kept so no migrated surface changes colour. */
const MAP_PIN_TONES: Record<MapPinTone, MapPinPaint> = {
  // token-ok: mirrors --color-primary
  primary: { token: '--color-primary', fallback: '#E2912F', legend: 'Places', noun: 'Place' },
  // token-ok: mirrors --color-info
  secondary: { token: '--color-info', fallback: '#2F6FB0', legend: 'Places', noun: 'Place' },
}

/** The cluster bubble. One paint for every cluster, whatever the kinds inside it: a bubble that
 *  took the colour of its first member would tell a member something untrue about the rest. */
export const MAP_CLUSTER_PAINT = {
  token: '--color-primary',
  // token-ok: mirrors --color-primary
  fallback: '#E2912F',
  textToken: '--color-text-on-primary',
  // token-ok: mirrors --color-text-on-primary
  textFallback: '#FFFFFF',
  /** The ring that lifts a bubble off the basemap. */
  ringToken: '--color-surface',
  // token-ok: mirrors --color-surface
  ringFallback: '#FFFFFF',
} as const

/**
 * THE one colour decision for a pin, called by both canvases.
 *
 * An explicit `tone` wins, because it predates kinds and the five migrated surfaces still pass
 * it. Otherwise the kind decides, defaulting to `place` — which is the same amber those
 * surfaces already render, so adopting this table changed no existing map.
 */
export function resolvePinPaint(pin: {
  kind?: MapPinKind | null
  tone?: MapPinTone | null
}, design = false): MapPinPaint {
  const paint = pin.tone ? MAP_PIN_TONES[pin.tone] : MAP_PIN_KINDS[pin.kind ?? 'place']
  // Map accents are scoped to the map, not the legacy action-primary token (purple in older kits).
  return design && paint.token === '--color-primary'
    ? { ...paint, token: '--design-map-pin', fallback: FREQUENCY_CLUSTER.stops[1] }
    : paint
}

/** The layers a browsing surface offers, in the order a legend should list them. `place` is
 *  deliberately absent: it is the default for pins that belong to no layer. */
export const MAP_PIN_LAYERS: readonly MapPinKind[] = ['event', 'circle', 'space'] as const
