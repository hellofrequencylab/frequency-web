// The map colours a design system owns (ADR-1737). MapLibre paints its layers from concrete colour
// strings, so it cannot take `var(--…)`; this reads the live custom property at mount, which is the
// value the active design (and mode) resolved. The DAWN value is the fallback for the one moment a
// map could mount before the stylesheet does, so DAWN renders exactly as it always has.
//
// The tokens live in the design layer of app/globals.css (`--design-map-*`); a design redefines them in
// app/themes/<id>.css. Popup HTML is real DOM, so it uses `var(--design-map-*)` directly.

/* token-ok: DAWN's map colours, the fallback before CSS resolves; the live values are the CSS tokens. */
export const MAP_COLOR_FALLBACK = {
  '--design-map-pin': '#E2912F', // token-ok: mirrors --design-map-pin
  '--design-map-pin-ring': '#FFFFFF', // token-ok: mirrors --design-map-pin-ring
  '--design-map-count': '#2A1B06', // token-ok: mirrors --design-map-count
  '--design-map-starter': '#7C5CD6', // token-ok: mirrors --design-map-starter
} as const

export type MapColorToken = keyof typeof MAP_COLOR_FALLBACK

/** The resolved colour of a map token on <html>, or DAWN's value when it has not resolved. */
export function mapColor(token: MapColorToken): string {
  if (typeof window === 'undefined') return MAP_COLOR_FALLBACK[token]
  const live = getComputedStyle(document.documentElement).getPropertyValue(token).trim()
  return live || MAP_COLOR_FALLBACK[token]
}
