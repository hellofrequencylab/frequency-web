import { readSiteStyle } from '@/lib/theme/site-style'

// ONE ACCENT (owner, 2026-11-05: "set it in one place and see it wherever"). A themed Spotlight wears the accent of the
// owner's Space that wears the same theme, so the colour picked once (the Space's brand accent: the create flow, the
// brand settings, a published website) shows on the website, the Space page, the emails AND the Spotlight. A Space
// accent stored as a DAWN token name, or none, leaves the Spotlight's own accent standing. The read itself lives in
// lib/spotlight/data.ts beside the page's other reads (same client, fails closed to null); this file is the pure rule.

const HEX6 = /^#[0-9a-f]{6}$/i

/** The first stored `#rrggbb` brand accent among the owner's Spaces that wear `theme`. Pure. */
export function pickThemeSpaceAccent(rows: readonly { brand_accent: string | null; preferences: unknown }[], theme: string): string | null {
  for (const r of rows) {
    const a = r.brand_accent?.trim()
    if (a && HEX6.test(a) && readSiteStyle(r.preferences).theme === theme) return a.toLowerCase()
  }
  return null
}

// A themed Spotlight layout's id starts with its kit's name; the Space that wears the same theme is the one whose accent it
// borrows.
const LAYOUT_THEME: Record<string, string> = {
  'new-world-kit': 'new-world', 'services-kit': 'services', 'temple-kit': 'temple-kit', 'free-human': 'free-human', 'network-kit': 'network-kit', 'cyberwitch-kit': 'cyberwitch', 'designer-kit': 'designer',
}
/** The site theme whose Space accent a Spotlight layout wears, or null for a layout that keeps its own. Pure. */
export function themeOfLayout(layout: string | null | undefined): string | null {
  return (layout && LAYOUT_THEME[layout.split(':')[0] ?? '']) || null
}

/** The key of `table` whose `accent` is the `#rrggbb` the owner picked (case-blind), else null. Pure. */
export function presetForAccent<T extends Record<string, { accent: string }>>(table: T, accent: string | null | undefined): Extract<keyof T, string> | null {
  const want = accent?.trim().toLowerCase()
  if (!want) return null
  return (Object.keys(table).find((k) => table[k]!.accent.toLowerCase() === want) as Extract<keyof T, string> | undefined) ?? null
}
