import { Check, Sparkles, ShieldCheck, Globe } from 'lucide-react'
import { SPACE_PLAN_LABEL, type SpacePlan } from '@/lib/pricing/plans'
import { PLACEHOLDER_SPACE_PRICE_CENTS, COLLECTIVE_BETA_CENTS } from '@/lib/pricing/feature-tiers'
import { formatCents } from '@/lib/pricing/display'
import { ChoosePlanButton } from './choose-plan'

// THE COMMUNITY COLLECTIVE plan ladder (Phase 4, ADR-811) — the tier map on the Space billing surface.
// It shows where a Space sits in the collective and what each rung is for, leading with the promise that
// matters most: you keep 100% of what you bring in; we earn only on the business the network sends you, at
// a rate that drops as the tier rises (buying down your rate, never a wall).
//
// GO-LIVE (ADR-811): the higher flat rungs the checkout can sell (Collective / Independent, gated on
// billingLive + their per-plan switch) carry an inline Choose action for a FREE Space; Business keeps its
// richer CTA below (GoBusinessCta, with the seat picker). A rung whose switch is still OFF reads "Coming
// soon", truthful, not a dark pattern. Prices come from the ONE placeholder map (feature-tiers), never
// hardcoded here. Non Profit points at the existing verify flow. No em dashes (CONTENT-VOICE §10); plain,
// no hype, no guilt. COLLECTIVE_BETA_CENTS ($49) is imported from feature-tiers, the ONE source shared
// with the marketing pricing page, so the beta anchor never drifts between the two surfaces.

type RungState = 'current' | 'available' | 'soon' | 'verify'

interface Rung {
  plan: SpacePlan
  icon: typeof Check
  blurb: string
  /** An optional secondary price note (e.g. the beta anchor). */
  note?: string
}

const RUNGS: Rung[] = [
  {
    plan: 'business',
    icon: Check,
    blurb: 'Run your practice: the full CRM, email, reporting, and your own website.',
  },
  {
    plan: 'collective',
    icon: Sparkles,
    blurb: 'Everything in Business, plus automations, team roles, multiple pipelines, and hosting collaborators.',
    note: `Beta ${formatCents(COLLECTIVE_BETA_CENTS)}/mo`,
  },
  {
    plan: 'nonprofit',
    icon: ShieldCheck,
    blurb: 'The full Collective toolkit for verified 501(c)(3) organizations.',
  },
  {
    plan: 'independent',
    icon: Globe,
    blurb: 'Your own brand and domain, standalone. Outside the collective, standard pricing.',
  },
]

const STATE_CHIP: Record<RungState, { label: string; className: string }> = {
  current: { label: 'Your plan', className: 'bg-primary text-on-primary' },
  available: { label: 'Available below', className: 'bg-success-bg/40 text-success' },
  soon: { label: 'Coming soon', className: 'border border-dashed border-border text-subtle' },
  verify: { label: 'By verification', className: 'border border-border text-muted' },
}

/** Resolve the state chip for a rung given the Space's current plan and which rungs are sellable now.
 *  Business's live CTA lives below (always "available"); Collective / Independent are "available" once
 *  their per-plan switch is on (else "Coming soon"); Non Profit is by verification. */
function rungState(plan: SpacePlan, currentPlan: SpacePlan, sellable: Partial<Record<SpacePlan, boolean>>): RungState {
  if (plan === currentPlan) return 'current'
  if (plan === 'business') return 'available'
  if (plan === 'nonprofit') return 'verify'
  if ((plan === 'collective' || plan === 'independent') && sellable[plan]) return 'available'
  return 'soon'
}

/** The plain, honest price label for a rung. "Free" never appears here (these are the paid rungs). */
function priceLabel(plan: SpacePlan): string {
  const cents = PLACEHOLDER_SPACE_PRICE_CENTS[plan]
  return cents > 0 ? `${formatCents(cents)}/mo` : 'Free'
}

/**
 * The Community Collective ladder for a Space's billing surface. Reads the Space's current plan to mark
 * its rung; a FREE Space gets an inline Choose action on each sellable higher rung (Collective /
 * Independent), gated server-side. `sellable` is the resolved per-plan switch map (billingLive AND the
 * per-plan flag); `slug` + `isFree` decide whether to render the action. No charge happens here.
 */
export function PlanLadder({
  currentPlan,
  slug,
  sellable = {},
  isFree = false,
}: {
  currentPlan: SpacePlan
  slug?: string
  sellable?: Partial<Record<SpacePlan, boolean>>
  isFree?: boolean
}) {
  return (
    <section aria-labelledby="collective-ladder-heading" className="rounded-2xl border border-border bg-surface px-5 py-5 shadow-sm">
      <h2 id="collective-ladder-heading" className="text-base font-bold text-text">
        The Community Collective
      </h2>
      {/* The promise, stated plainly (CONTENT-VOICE §1a, brand promise #1 + #4). No guilt, no hype. */}
      <p className="mt-1 text-sm leading-relaxed text-muted">
        You keep 100% of what you bring in. We earn only on the business the network sends you, at a rate
        that drops as your plan rises. A paid plan buys down that rate.
      </p>

      <ul className="mt-4 space-y-2.5">
        {RUNGS.map((rung) => {
          const state = rungState(rung.plan, currentPlan, sellable)
          const chip = STATE_CHIP[state]
          const Icon = rung.icon
          // A FREE Space gets a one-click Choose on a sellable higher flat rung (Collective / Independent).
          // Business keeps its richer CTA below; Non Profit routes through verification, not a direct buy.
          const canChoose =
            isFree &&
            !!slug &&
            state === 'available' &&
            (rung.plan === 'collective' || rung.plan === 'independent')
          return (
            <li
              key={rung.plan}
              className="flex items-start gap-3 rounded-xl border border-border bg-surface-elevated/40 px-4 py-3"
            >
              <div className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-bg/40">
                <Icon className="h-4 w-4 text-primary-strong" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-sm font-bold text-text">{SPACE_PLAN_LABEL[rung.plan]}</span>
                  <span className="text-sm font-semibold text-text">{priceLabel(rung.plan)}</span>
                  {rung.note && <span className="text-2xs font-medium text-primary-strong">{rung.note}</span>}
                </div>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">{rung.blurb}</p>
              </div>
              {canChoose ? (
                <ChoosePlanButton
                  slug={slug}
                  plan={rung.plan as 'collective' | 'independent'}
                  label={`Choose ${SPACE_PLAN_LABEL[rung.plan]}`}
                />
              ) : (
                <span className={`shrink-0 self-center rounded-md px-2 py-0.5 text-2xs font-bold uppercase tracking-wide ${chip.className}`}>
                  {chip.label}
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
