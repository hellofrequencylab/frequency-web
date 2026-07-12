// ─────────────────────────────────────────────────────────────────────────────
// CLASSIFIEDS & HOUSING SEEDER — the Frequency SEED OWNER resolver (Phase 0).
// SERVER-ONLY. A seeded listing is authored by a stable "Frequency" account until
// the real poster claims it (claim.ts transfers ownership away from this id).
//
// CHOICE (documented): we reuse the platform SYSTEM PROFILE (profiles.is_system =
// true, is_active = true) as the seed author, the same identity lib/system-line.ts
// posts the quiet Vera notices under. Rationale: it already exists, is unique
// (one system row), is excluded from people search / suggestions / leaderboards
// (migration 20260616110000), and reads as "Frequency" to members. That keeps the
// seeded rows attributable to the platform (not a random operator) and gives the
// claim transfer a single, well-known "from" owner to guard against. There is no
// separate seed-account table in the repo; introducing one would duplicate this
// identity. If a dedicated seeder identity is ever wanted, this is the ONE place to
// change (every seed author flows through resolveSeedOwnerProfileId).
// ─────────────────────────────────────────────────────────────────────────────

import { createAdminClient } from '@/lib/supabase/admin'

// Cache the resolved id for the process lifetime: fixed reference data (the system
// profile id never changes), so we avoid a lookup on every seed/publish.
let cached: string | null = null

/**
 * Resolve the stable Frequency seed-owner profile id (the system profile). Returns null when no
 * system profile exists (a mis-seeded environment) so the caller fails safe rather than authoring a
 * listing under nobody. Reads only; behind the service-role client (the profiles read is public data
 * but the system row is app-internal).
 */
export async function resolveSeedOwnerProfileId(): Promise<string | null> {
  if (cached) return cached
  try {
    const admin = createAdminClient()
    // Seeded listings are attributed to the dedicated brand account @frequency (display "Frequency"),
    // NOT the platform SYSTEM profile — the system profile also posts the quiet Vera notices, so seeded
    // rows would otherwise read "Posted by Vera". Prefer the @frequency handle; fall back to the system
    // profile so a mis-seeded environment still authors under a stable platform identity rather than nobody.
    const byHandle = await admin
      .from('profiles')
      .select('id')
      .eq('handle', 'frequency')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()
    let id = (byHandle.data as { id?: string } | null)?.id ?? null
    if (!id) {
      const bySystem = await admin
        .from('profiles')
        .select('id')
        .eq('is_system', true)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle()
      id = (bySystem.data as { id?: string } | null)?.id ?? null
    }
    if (id) cached = id
    return id
  } catch {
    return null
  }
}

/** Test-only: clear the memoized seed-owner id. */
export function __resetSeedOwnerCache(): void {
  cached = null
}
