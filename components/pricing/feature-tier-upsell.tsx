import { billingLive } from '@/lib/pricing/settings'
import { featureTierLadder } from '@/lib/pricing/feature-tiers'
import { FeatureTierRange } from './feature-tier-range'

// FEATURE TIER UPSELL (ADR-518 Phase G). The server seam that mounts the reusable FeatureTierRange on a
// tier-gated surface. It resolves the ONE piece of IO the client selector needs (billingLive(), for the
// CTA copy only) and hands the pre-built ladder + the viewer's current tier down. Nothing here charges:
// billingLive stays false while billing is on hold, and the selector's CTA is a plain link either way.
//
// Renders NOTHING when the feature has no tier ladder (not tier-gated), so a caller can drop it on any
// locked/teaser surface and it is a no-op for an ungated feature. This is the single, reusable "after
// freemium" affordance keyed off the feature → tier config, not a bespoke widget per feature.

export async function FeatureTierUpsell({
  featureKey,
  currentTier,
  upgradeHref,
}: {
  /** The pricing feature-gate key (e.g. 'space_crm', 'space_email', 'vera_unlimited'). */
  featureKey: string
  /** The viewer's current tier on the feature's axis (the Space plan or membership tier). */
  currentTier: string | null | undefined
  /** Where the CTA links (the billing/upgrade surface). Never a checkout. */
  upgradeHref: string
}) {
  const ladder = featureTierLadder(featureKey)
  if (!ladder) return null // not a tier-gated feature: no range to show
  const live = await billingLive()
  return (
    <FeatureTierRange
      ladder={ladder}
      currentTier={currentTier ?? 'free'}
      upgradeHref={upgradeHref}
      live={live}
    />
  )
}
