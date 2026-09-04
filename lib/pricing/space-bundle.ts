// APPLY A CAPABILITY BUNDLE TO A SPACE — the IO half of PROG-BUNDLE (ADR-1196).
//
// Thin by design. Every decision lives in the PURE resolver `nextBlobsForBundle` (./bundles), which is
// where the tests are; this file reads two jsonb columns, hands them to the resolver, and writes the
// result back. That split is the direct lesson of SCAN-532, where the one interesting decision in an
// operator write path sat inside a `'use server'` module, could not be reached by a test, and shipped
// wrong for four of the twenty-two functions.
//
// 🔴 THIS WRITER NEVER TOUCHES MONEY, and the omission is the design rather than an oversight:
//   · it does not write `spaces.plan`
//   · it does not write the reserved `entitlements.billing` namespace
//   · it therefore cannot grant a paid capability, only withhold a tool
// `setSpacePlan` / `setSpaceAddons` (./space-plan) remain the SOLE writers of the billing namespace,
// and the Stripe webhook remains their only automatic caller. Shaping a Space and charging for it are
// two decisions on two surfaces; ADR-874 records what this repo paid the last time a pair like that
// was conflated, when turning billing on revoked every paid feature in the same instant.
//
// A bundle is subtractive over a default-ON registry, so it COMPOSES with the plan rather than
// replacing it: a Space on Collective whose bundle omits `shop` has no Shop and keeps everything else
// its plan paid for. Applying the `general` bundle returns a Space to "everything on" and is a no-op
// on one that was never narrowed.
//
// Server-only (service-role client). Not gated on `billingLive()`, deliberately: shaping which tools a
// Space shows is not a charging act, and a bundle must be appliable at provision time, which is
// exactly when billing may be off.

import { createAdminClient } from '@/lib/supabase/admin'
import { capabilityBundle, nextBlobsForBundle, type CapabilityBundle } from './bundles'

export interface SetSpaceBundleResult {
  ok: boolean
  /** Why the write was skipped (when ok=false). */
  reason?: 'unknown_bundle' | 'not_found' | 'error'
  bundle?: CapabilityBundle
  /** The blobs after the write, for callers and tests that assert the result. */
  entitlements?: Record<string, unknown>
  featureRoles?: Record<string, unknown>
}

/** Normalize a raw jsonb value to a plain record (default {} for null / garbage). */
function asRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
}

/**
 * Apply a bundle to one Space: switch OFF every function the bundle omits, restore every one it
 * includes, and merge its role floors. Scoped to the single space id. Returns a result rather than
 * throwing, so a caller can surface a refusal instead of a stack trace.
 */
export async function setSpaceBundle(spaceId: string, bundleId: string): Promise<SetSpaceBundleResult> {
  const bundle = capabilityBundle(bundleId)
  if (!bundle) return { ok: false, reason: 'unknown_bundle' }
  if (!spaceId) return { ok: false, reason: 'not_found' }

  const db = createAdminClient()
  const { data } = (await db
    .from('spaces')
    .select('id, entitlements, feature_roles')
    .eq('id', spaceId)
    .maybeSingle()) as { data: { id?: string; entitlements?: unknown; feature_roles?: unknown } | null }
  if (!data?.id) return { ok: false, reason: 'not_found' }

  const { entitlements, featureRoles } = nextBlobsForBundle(
    asRecord(data.entitlements),
    asRecord(data.feature_roles),
    bundle,
  )

  // Untyped update (ADR-246: neither column is in the generated types).
  const write = db as unknown as {
    from: (t: string) => {
      update: (v: Record<string, unknown>) => { eq: (c: string, val: string) => Promise<{ error: unknown }> }
    }
  }
  const { error } = await write
    .from('spaces')
    .update({ entitlements, feature_roles: featureRoles })
    .eq('id', spaceId)
  if (error) return { ok: false, reason: 'error' }

  return { ok: true, bundle, entitlements, featureRoles }
}
