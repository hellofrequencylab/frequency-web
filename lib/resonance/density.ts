// Resonance Feed Phase 2 (ADR-416): the nightly density rollup caller. Invokes the
// refresh_resonance_density_cells() SQL function (the heavy aggregation lives in the
// DB) so resonance_density_cells stays current for the adaptive-radius feed. Called
// from the nightly cron (app/api/cron/refresh-traits). BEST-EFFORT + FAIL-SAFE: a
// missing function (pre-migration) or any error is caught, so it never breaks the
// trait / edge / embedding steps it runs alongside. It is NOT silent about it any
// more: the caught message comes back as `error`, and the cron logs that at error
// level. Until 2026-09-04 (finding R2) every error collapsed into `{ cells: 0 }`, and
// because a rollup that wrote nothing and a rollup that failed were the same return
// value, the cron reported the function's sqlstate 21000 ("DELETE requires a WHERE
// clause", raised by PostgREST's safeupdate preload; see migration 20270345000000)
// as an ordinary info line every night from 2026-08-22 and nobody saw it.
//
// authz-delegated: the WRITE is the platform-wide nightly rollup (no per-caller scope by
// design, like the trait / edge / embedding refresh). The cron route is the gate
// (rejectUnauthorizedCron); the SQL function is SECURITY DEFINER + service-role only.

import { createAdminClient } from '@/lib/supabase/admin'

export type DensityRefreshResult = {
  /** Rows written to resonance_density_cells (the function's return value). 0 on failure. */
  cells: number
  /** The PostgREST / thrown error message when the refresh failed. Absent on success. */
  error?: string
}

/** The message out of whatever supabase-js or the runtime handed back, never an empty string. */
function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message
  if (err && typeof err === 'object') {
    const e = err as { message?: unknown; code?: unknown; details?: unknown }
    if (typeof e.message === 'string' && e.message) {
      return typeof e.code === 'string' && e.code ? `${e.code}: ${e.message}` : e.message
    }
    if (typeof e.details === 'string' && e.details) return e.details
  }
  const s = String(err)
  return s && s !== '[object Object]' ? s : 'refresh_resonance_density_cells failed (no message)'
}

export async function refreshResonanceDensityCells(): Promise<DensityRefreshResult> {
  try {
    const admin = createAdminClient() as unknown as {
      rpc: (fn: string) => Promise<{ data: number | null; error: unknown }>
    }
    const { data, error } = await admin.rpc('refresh_resonance_density_cells')
    // supabase-js RESOLVES with { error } on a DB error; it does not throw. Surface it.
    if (error) return { cells: 0, error: errorMessage(error) }
    return { cells: typeof data === 'number' ? data : 0 }
  } catch (err) {
    return { cells: 0, error: errorMessage(err) }
  }
}
