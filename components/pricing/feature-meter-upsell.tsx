import { billingLive } from '@/lib/pricing/settings'
import { featureMeter } from '@/lib/pricing/feature-meters'
import { FeatureMeterRange } from './feature-meter-range'
import { FeatureTierUpsell } from './feature-tier-upsell'

// FEATURE METER UPSELL (ADR-519, owner directive #4). The server seam that mounts the reusable usage-meter
// range on a metered surface. It resolves the ONE piece of IO the client selector needs (billingLive(),
// for the note copy only) and hands the pre-built meter ladder + the viewer's current tier down. Nothing
// here charges or blocks: billingLive stays false while billing is on hold, the selector's CTA is a plain
// link, and the meter is informational.
//
// FALLBACK: a feature with NO usage meter (an on/off capability like branding) has no allowance ladder to
// show, so this defers to the tier ladder (FeatureTierUpsell) so that surface still explains which tier
// turns it on. A feature with neither a meter nor a tier ladder renders nothing. This keeps ONE mechanism
// keyed off the feature config, not a bespoke widget per feature.

export async function FeatureMeterUpsell({
  featureKey,
  currentTier,
  upgradeHref,
  usage,
}: {
  /** The pricing feature key (e.g. 'space_crm', 'space_email', 'vera_unlimited'). */
  featureKey: string
  /** The viewer's current tier on the feature's axis (the Space plan or membership tier). */
  currentTier: string | null | undefined
  /** Where the CTA links (the billing/upgrade surface). Never a checkout. */
  upgradeHref: string
  /** OPTIONAL current usage on the meter dimension, when a real count is cheaply available. */
  usage?: number
}) {
  const ladder = featureMeter(featureKey)
  // No meter: fall back to the tier ladder (which explains which tier turns the capability on). It is a
  // no-op for a feature with no tier ladder either.
  if (!ladder) {
    return <FeatureTierUpsell featureKey={featureKey} currentTier={currentTier} upgradeHref={upgradeHref} />
  }
  const live = await billingLive()
  return (
    <FeatureMeterRange
      ladder={ladder}
      currentTier={currentTier ?? 'free'}
      upgradeHref={upgradeHref}
      live={live}
      usage={usage}
    />
  )
}
