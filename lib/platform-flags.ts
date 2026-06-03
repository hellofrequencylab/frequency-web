import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'

// Global "show demo content" switch — the single source of truth for whether
// seeded Beta demo content (is_demo rows) surfaces site-wide. Backed by
// platform_flags.demo_mode. Flip that row to false to hide ALL demo content at
// once (the soft kill switch; the hard purge is DELETE ... WHERE is_demo).
//
// Defaults to TRUE on any read failure so a transient DB hiccup never blanks the
// Beta community unexpectedly. Cached per request (React cache) so the many
// surfaces that gate on it share one round trip.
export const demoModeEnabled = cache(async (): Promise<boolean> => {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('platform_flags')
      .select('value')
      .eq('key', 'demo_mode')
      .maybeSingle()
    return data?.value ?? true
  } catch {
    return true
  }
})
