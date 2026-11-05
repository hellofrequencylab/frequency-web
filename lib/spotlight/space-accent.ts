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
