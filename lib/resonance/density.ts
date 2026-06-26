// Resonance Feed Phase 2 (ADR-416): the nightly density rollup caller. Invokes the
// refresh_resonance_density_cells() SQL function (the heavy aggregation lives in the
// DB) so resonance_density_cells stays current for the adaptive-radius feed. Called
// from the nightly cron (app/api/cron/refresh-traits). BEST-EFFORT + FAIL-SAFE: a
// missing function (pre-migration) or any error is swallowed, so it never breaks the
// trait / edge / embedding steps it runs alongside.
//
// authz-delegated: the WRITE is the platform-wide nightly rollup (no per-caller scope by
// design, like the trait / edge / embedding refresh). The cron route is the gate
// (rejectUnauthorizedCron); the SQL function is SECURITY DEFINER + service-role only.

import { createAdminClient } from '@/lib/supabase/admin'

export async function refreshResonanceDensityCells(): Promise<{ cells: number }> {
  try {
    const admin = createAdminClient() as unknown as {
      rpc: (fn: string) => Promise<{ data: number | null; error: unknown }>
    }
    const { data, error } = await admin.rpc('refresh_resonance_density_cells')
    if (error) return { cells: 0 }
    return { cells: typeof data === 'number' ? data : 0 }
  } catch {
    return { cells: 0 }
  }
}
