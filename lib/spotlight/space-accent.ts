import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { readSiteStyle } from '@/lib/theme/site-style'

// ONE ACCENT (owner, 2026-11-05: "set it in one place and see it wherever"). A themed Spotlight wears the accent of the
// owner's Space that wears the same theme, so the colour picked once (the Space's brand accent: the create flow, the
// brand settings, a published website) shows on the website, the Space page, the emails AND the Spotlight. A Space
// accent stored as a DAWN token name, or none, leaves the Spotlight's own accent standing. Fails closed to null.

const HEX6 = /^#[0-9a-f]{6}$/i

/** The first stored `#rrggbb` brand accent among the owner's Spaces that wear `theme`. Pure; exported for tests. */
export function pickThemeSpaceAccent(rows: readonly { brand_accent: string | null; preferences: unknown }[], theme: string): string | null {
  for (const r of rows) {
    const a = r.brand_accent?.trim()
    if (a && HEX6.test(a) && readSiteStyle(r.preferences).theme === theme) return a.toLowerCase()
  }
  return null
}

/** The brand accent of the owner's Space that wears `theme`, or null. One small read, only for a themed Spotlight. */
export async function readThemeSpaceAccent(profileId: string, theme: string): Promise<string | null> {
  try {
    const { data } = await createAdminClient()
      .from('spaces')
      .select('brand_accent, preferences')
      .eq('owner_profile_id', profileId)
      .order('created_at', { ascending: true })
      .limit(20)
    return pickThemeSpaceAccent((data ?? []) as { brand_accent: string | null; preferences: unknown }[], theme)
  } catch {
    return null
  }
}
