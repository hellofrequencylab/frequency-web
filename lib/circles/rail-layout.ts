// The circle page's right-rail layout system — operator default + host override.
//
// One source of truth for the rail blocks and how a saved layout is shaped, coerced,
// and resolved. PURE: no server imports (so both the client editors and the server
// render can use it). The operator-default get/set lives in rail-layout-store.ts
// (it needs platform_settings) and the host override rides on circles.sidebar_order.
//
// A layout is { order, hidden }:
//   order  — the arrangement of block keys (a key's position)
//   hidden — keys explicitly switched off
// Resolution is host override ?? operator default ?? the coded default, with any block
// that actually rendered but isn't named in the layout appended (visible), so a newly
// added rail block never silently disappears from circles that already saved a layout.

/** Every right-rail block, in the coded default order. Labels drive both layout editors. */
export const RAIL_BLOCKS = [
  { key: 'members', label: 'Members' },
  { key: 'health', label: 'Circle health' },
  { key: 'momentum', label: 'Momentum' },
  { key: 'practice', label: "This week's practice" },
  { key: 'events', label: 'Upcoming events' },
  { key: 'map', label: 'Venue map' },
  { key: 'invite', label: 'Invite a friend' },
  { key: 'journeyRun', label: 'Start a journey run' },
] as const

export type RailKey = (typeof RAIL_BLOCKS)[number]['key']

export const RAIL_KEYS: readonly string[] = RAIL_BLOCKS.map((b) => b.key)
export const RAIL_LABELS: Record<string, string> = Object.fromEntries(RAIL_BLOCKS.map((b) => [b.key, b.label]))
/** The coded default order — used when neither host nor operator has set a layout. */
export const DEFAULT_RAIL_ORDER: string[] = RAIL_BLOCKS.map((b) => b.key)

export interface RailLayout {
  order: string[]
  hidden: string[]
}

const isKnownKey = (k: unknown): k is string => typeof k === 'string' && RAIL_KEYS.includes(k)

/** Coerce any stored value (legacy `string[]`, a `{order,hidden}` object, null, or junk)
 *  into a clean RailLayout restricted to known keys — or null when there's nothing usable. */
export function coerceLayout(raw: unknown): RailLayout | null {
  if (!raw) return null
  // Legacy shape: a bare ordered array of keys (the original sidebar_order).
  if (Array.isArray(raw)) {
    const order = raw.filter(isKnownKey)
    return order.length ? { order, hidden: [] } : null
  }
  if (typeof raw === 'object') {
    const o = raw as { order?: unknown; hidden?: unknown }
    const order = Array.isArray(o.order) ? o.order.filter(isKnownKey) : []
    const hidden = Array.isArray(o.hidden) ? o.hidden.filter(isKnownKey) : []
    return order.length || hidden.length ? { order, hidden } : null
  }
  return null
}

/** Normalize a layout coming off an editor: drop unknown keys, de-dupe, and make sure
 *  hidden keys are a subset of known keys. Safe to hand straight to a store write. */
export function sanitizeLayout(layout: { order?: unknown; hidden?: unknown }): RailLayout {
  const order = Array.isArray(layout.order) ? [...new Set(layout.order.filter(isKnownKey))] : []
  const hidden = Array.isArray(layout.hidden) ? [...new Set(layout.hidden.filter(isKnownKey))] : []
  return { order, hidden }
}

/** Resolve the effective, ordered, VISIBLE rail keys for one circle.
 *  @param present keys whose blocks actually built for this viewer (Object.keys(railMap))
 *  @param host    the circle's own override (coerced), or null
 *  @param operator the operator global default (coerced), or null
 *  host ?? operator ?? coded default; hidden keys removed; any present-but-unnamed block
 *  appended so new blocks never vanish. */
export function resolveRailOrder(
  present: string[],
  host: RailLayout | null,
  operator: RailLayout | null,
): string[] {
  const layout = host ?? operator ?? { order: DEFAULT_RAIL_ORDER, hidden: [] }
  const hidden = new Set(layout.hidden)
  const ordered = layout.order.filter((k) => present.includes(k) && !hidden.has(k))
  const appended = present.filter((k) => !layout.order.includes(k) && !hidden.has(k))
  return [...ordered, ...appended]
}
