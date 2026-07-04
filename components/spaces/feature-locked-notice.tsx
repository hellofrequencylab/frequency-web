import Link from 'next/link'
import { CreditCard, Lock, SlidersHorizontal } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { spaceManageHref, type SpaceType } from '@/lib/spaces/types'
import { FeatureTierUpsell } from '@/components/pricing/feature-tier-upsell'

// FEATURE LOCKED notice (per-space-roles Phase 2). The calm state a Space settings surface renders when
// the per-Space function gate (spaceFunctionAccess) says the viewer cannot use the tool. It is a tasteful
// "here is why, and the next step" card, NOT a 404 (the surface still resolves a visible Space, so dead-
// ending would be jarring). Three reasons, each with its own next step:
//   • 'disabled' — a UNIVERSAL tool is turned OFF for this space. An admin can turn it on under
//                  Features and access.
//   • 'plan'     — a PLAN-GATED tool (CRM, email) the plan does not include. An admin sees an upgrade
//                  nudge to billing; a non-admin is pointed at whoever runs the space.
//   • 'role'     — the tool is on, but the viewer's role is too low. Point them at whoever runs the space.
// Copy follows CONTENT-VOICE: plain, no narrated feelings, no em dashes.

export function FeatureLockedNotice({
  brandName,
  slug,
  type,
  label,
  reason,
  canManageMembers,
  featureKey,
  currentPlan,
}: {
  brandName: string
  /** The Space slug, for the Features-and-access / billing link. */
  slug: string
  /** The Space type, so the "Back to manage" link routes to the right owner surface (ADR-441 EM1-3). */
  type: SpaceType
  /** The tool's member-facing label (e.g. "Email", "Members"). */
  label: string
  /** Why the gate closed: a universal tool is OFF, a plan tool is not granted, or the role is too low. */
  reason: 'disabled' | 'plan' | 'role'
  /** Whether THIS viewer (owner / admin) can open Features and access / billing to change it. */
  canManageMembers: boolean
  /** The pricing feature-gate key (e.g. 'space_email'). When set on a PLAN gap for a manager, the
   *  reusable FeatureTierRange (ADR-518 Phase G) shows the tier ladder + placeholder price points. */
  featureKey?: string
  /** The Space's current plan, for the tier range highlight. */
  currentPlan?: string | null
}) {
  const title =
    reason === 'disabled'
      ? `${label} is turned off`
      : reason === 'plan'
        ? `Unlock ${label} for this space`
        : 'This is a team tool'

  const description =
    reason === 'disabled'
      ? canManageMembers
        ? `${label} is off for this space. Turn it on under Features and access, then it shows here.`
        : `${label} is off for this space. Ask an admin to turn it on under Features and access.`
      : reason === 'plan'
        ? canManageMembers
          ? `${label} is part of a paid plan for this space. Pick a plan that includes it, then it turns on here.`
          : `${label} is part of a paid plan for this space. Ask an admin to add it.`
        : `${label} is set for a higher role on this space. Ask whoever runs ${brandName} to give you access, or set the role under Features and access.`

  // The next step depends on the reason: a plan gap points at billing, a universal-off / role gap points
  // at Features and access. A non-manager always lands back on the hub (they cannot change either).
  const action = !canManageMembers ? (
    <Link
      href={spaceManageHref(type, slug)}
      className="inline-flex items-center gap-1.5 rounded-xl bg-surface-elevated px-4 py-2 text-sm font-semibold text-muted hover:bg-surface-elevated/70"
    >
      Back to manage {brandName}
    </Link>
  ) : reason === 'plan' ? (
    <Link
      href={`/spaces/${slug}/settings/billing`}
      className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover"
    >
      <CreditCard className="h-4 w-4" aria-hidden /> See plans
    </Link>
  ) : (
    <Link
      href={`/spaces/${slug}/settings/features`}
      className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover"
    >
      <SlidersHorizontal className="h-4 w-4" aria-hidden /> Features and access
    </Link>
  )

  // After freemium (ADR-518 Phase G): on a PLAN gap, a manager who can act sees the reusable tier range
  // (the ladder + placeholder price points + an upgrade CTA that only navigates, never charges). It is a
  // no-op for a feature with no ladder. A non-manager is not shown it (they cannot change the plan).
  const showRange = reason === 'plan' && canManageMembers && !!featureKey

  return (
    <>
      <EmptyState icon={Lock} variant="permission" title={title} description={description} action={action} />
      {showRange && (
        <FeatureTierUpsell
          featureKey={featureKey!}
          currentTier={currentPlan}
          upgradeHref={`/spaces/${slug}/settings/billing`}
        />
      )}
    </>
  )
}
