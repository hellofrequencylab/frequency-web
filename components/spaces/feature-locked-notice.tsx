import Link from 'next/link'
import { CreditCard, Gauge, Lock, SlidersHorizontal } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { spaceManageHref, type SpaceType } from '@/lib/spaces/types'
import { FeatureMeterUpsell } from '@/components/pricing/feature-meter-upsell'

// FEATURE LOCKED notice (per-space-roles Phase 2; metered reframe ADR-519). The calm state a Space
// settings surface renders when the per-Space function gate says the viewer cannot use the tool. It is a
// tasteful "here is why, and the next step" card, NOT a 404 (the surface still resolves a visible Space,
// so dead-ending would be jarring). Three reasons, each with its own next step:
//   • 'disabled' — a UNIVERSAL tool is turned OFF for this space. An admin can turn it on under
//                  Menu and features (the Module Manager).
//   • 'plan'     — a tool whose plan ALLOWANCE is used up (metered model, ADR-519). Nothing is locked;
//                  an admin sees a "you're on the free allowance, upgrade for more" nudge to billing, a
//                  non-admin is pointed at whoever runs the space. (During the beta, with billing off,
//                  this reason never fires: allowances are informational and nothing is hard-blocked.)
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
  /** Why the gate closed: a universal tool is OFF, a plan allowance is used up, or the role is too low. */
  reason: 'disabled' | 'plan' | 'role'
  /** Whether THIS viewer (owner / admin) can open Features and access / billing to change it. */
  canManageMembers: boolean
  /** The pricing feature key (e.g. 'space_email'). When set on a PLAN-allowance gap for a manager, the
   *  reusable FeatureMeterRange (ADR-519) shows the usage-meter ladder + placeholder allowances. */
  featureKey?: string
  /** The Space's current plan, for the meter range highlight. */
  currentPlan?: string | null
}) {
  const title =
    reason === 'disabled'
      ? `${label} is turned off`
      : reason === 'plan'
        ? `Do more with ${label}`
        : 'This is a team tool'

  const description =
    reason === 'disabled'
      ? canManageMembers
        ? `${label} is off for this space. Turn it on under Menu and features, then it shows here.`
        : `${label} is off for this space. Ask an admin to turn it on under Menu and features.`
      : reason === 'plan'
        ? canManageMembers
          ? `${label} is available on every plan. You are on the free allowance for this space. Move up a plan for a higher limit.`
          : `${label} is available on every plan. You are on the free allowance. Ask an admin to move up a plan for more.`
        : `${label} is set for a higher role on this space. Ask whoever runs ${brandName} to give you access, or set the role under Menu and features.`

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
      href={`/spaces/${slug}/manage/modules`}
      className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover"
    >
      <SlidersHorizontal className="h-4 w-4" aria-hidden /> Menu and features
    </Link>
  )

  // Metered model (ADR-519): on a PLAN-allowance gap, a manager who can act sees the reusable usage-meter
  // range (the allowance ladder + placeholder numbers + an "upgrade for more" CTA that only navigates,
  // never charges). It is a no-op for a feature with no meter or ladder. A non-manager is not shown it
  // (they cannot change the plan). Nothing is locked, so a plan gap uses the Gauge icon, not the padlock.
  const showRange = reason === 'plan' && canManageMembers && !!featureKey

  return (
    <>
      <EmptyState
        icon={reason === 'plan' ? Gauge : Lock}
        variant="permission"
        title={title}
        description={description}
        action={action}
      />
      {showRange && (
        <FeatureMeterUpsell
          featureKey={featureKey!}
          currentTier={currentPlan}
          upgradeHref={`/spaces/${slug}/settings/billing`}
        />
      )}
    </>
  )
}
