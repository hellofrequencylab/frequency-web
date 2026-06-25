import { getPlatformSetting } from '@/lib/platform-flags'

// Storage + resolution for the movable circle TEXT block (the `circle-text` layout module): a
// rich-text (markdown-subset) note an operator can place anywhere on the circle page via the Layout
// editor. Two levels, resolved per-circle ?? network default:
//   - NETWORK DEFAULT: a platform_settings row (key `circle_layout_text`), janitor-set — the same
//     copy on every circle (e.g. a standard welcome) until a circle overrides it.
//   - PER-CIRCLE OVERRIDE: stored on circles.sidebar_order (a jsonb column freed up when the
//     rail-layout system was removed, ADR-406) as { text }, gated by circle.editSettings.
// Markdown subset only (richParagraphs): **bold** · *italic* · [label](/path), so there's no HTML
// injection surface. Capped length so it can't bloat a row.
//
// This module holds the SERVER-SIDE READ helpers + the pure parser, imported by the RSC page and the
// `circle-text` module. The mutating + client-callable server ACTIONS live in circle-text-actions.ts
// ('use server'), so this file can also export the SYNC parser without tripping the rule that every
// export of a 'use server' module be an async action.

export const CIRCLE_TEXT_KEY = 'circle_layout_text'
export const CIRCLE_TEXT_MAX = 5000

/** The network-wide default circle text (markdown), or '' when unset. Request-memoized. */
export async function getCircleTextDefault(): Promise<string> {
  return getPlatformSetting(CIRCLE_TEXT_KEY, '')
}

/** Pull a circle's per-circle text override out of its stored sidebar_order jsonb ({ text }). */
export function circleTextOverride(sidebarOrder: unknown): string | null {
  if (sidebarOrder && typeof sidebarOrder === 'object' && !Array.isArray(sidebarOrder)) {
    const t = (sidebarOrder as { text?: unknown }).text
    if (typeof t === 'string' && t.trim()) return t
  }
  return null
}

/** The text to render for a circle: its override, else the network default ('' = render nothing). */
export async function resolveCircleText(override: string | null): Promise<string> {
  if (override && override.trim()) return override
  return getCircleTextDefault()
}
