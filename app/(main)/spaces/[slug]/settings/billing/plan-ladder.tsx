import { Check, Sparkles, ShieldCheck, Globe } from 'lucide-react'
import { SPACE_PLAN_LABEL, type SpacePlan } from '@/lib/pricing/plans'
import { PLACEHOLDER_SPACE_PRICE_CENTS } from '@/lib/pricing/feature-tiers'
import { formatCents } from '@/lib/pricing/display'

// THE COMMUNITY COLLECTIVE plan ladder (Phase 4, ADR-811) — the informational tier map on the Space
// billing surface. It shows where a Space sits in the collective and what each rung is for, leading with
// the promise that matters most: you keep 100% of what you bring in; we earn only on the business the
// network sends you, at a rate that drops as the tier rises (buying down your rate, never a wall).
//
// PRESENTATIONAL + OFF-SAFE. It NEVER charges: the live upgrade action stays the Business CTA below it
// (GoBusinessCta, itself gated on billingLive). Rungs the checkout cannot sell yet (Collective /
// Independent have no catalog entry until go-live) read "Coming soon", which is truthful today, not a
// dark pattern. Prices come from the ONE placeholder map (feature-tiers), never hardcoded here. Non
// Profit points at the existing verify flow. No em dashes (CONTENT-VOICE §10); plain, no hype, no guilt.

/** Beta founding price for the Collective tier (strategy: $79 list, $49 beta). Preview only; nothing
 *  charges while billing is off. Kept next to the placeholder list price it annotates. */
const COLLECTIVE_BETA_CENTS = 4900

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

/** Resolve the state chip for a rung given the Space's current plan. Business is the one live-sellable
 *  rung today (its CTA lives below); Collective / Independent are previews; Non Profit is by verification. */
function rungState(plan: SpacePlan, currentPlan: SpacePlan): RungState {
  if (plan === currentPlan) return 'current'
  if (plan === 'business') return 'available'
  if (plan === 'nonprofit') return 'verify'
  return 'soon'
}

/** The plain, honest price label for a rung. "Free" never appears here (these are the paid rungs). */
function priceLabel(plan: SpacePlan): string {
  const cents = PLACEHOLDER_SPACE_PRICE_CENTS[plan]
  return cents > 0 ? `${formatCents(cents)}/mo` : 'Free'
}

/**
 * The informational Community Collective ladder for a Space's billing surface. Reads the Space's current
 * plan to mark its rung; everything else is a plain preview. PURE presentation (no I/O, no charge).
 */
export function PlanLadder({ currentPlan }: { currentPlan: SpacePlan }) {
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
          const state = rungState(rung.plan, currentPlan)
          const chip = STATE_CHIP[state]
          const Icon = rung.icon
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
              <span className={`shrink-0 self-center rounded-md px-2 py-0.5 text-2xs font-bold uppercase tracking-wide ${chip.className}`}>
                {chip.label}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
