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
export type MapPinKind = 'event' | 'circle' | 'space' | 'place'

/** Which token drives a pin's colour when the caller wants to override its kind. Map DOM lives
 *  outside Tailwind, so the canvas resolves the CSS custom property at mount. */
export type MapPinTone = 'primary' | 'secondary'

export type MapPinPaint = {
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
}

/** The pre-ADR-1022 tone escape hatch, kept so no migrated surface changes colour. */
export const MAP_PIN_TONES: Record<MapPinTone, MapPinPaint> = {
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
}): MapPinPaint {
  if (pin.tone) return MAP_PIN_TONES[pin.tone]
  return MAP_PIN_KINDS[pin.kind ?? 'place']
}

/** The layers a browsing surface offers, in the order a legend should list them. `place` is
 *  deliberately absent: it is the default for pins that belong to no layer. */
export const MAP_PIN_LAYERS: readonly MapPinKind[] = ['event', 'circle', 'space'] as const
