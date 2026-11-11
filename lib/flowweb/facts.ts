// FlowWeb facts sheet (LIVE-2259). FlowWeb's draft gate lets an email or DM quote only the numbers and dates
// on this sheet, so the sheet is read from the same sources the site renders: the beta end and launch day
// from lib/core/launch-dates.ts, the plan prices from getPricingValues() (code catalog with the operator's
// /admin/pricing rows layered over it) and the launcher clock budget from lib/launch/clock.ts.
// PURE: the route does the IO and passes the resolved pricing values in.

import { FOUNDING_MEMBER_COPY, LAUNCH_ON } from '@/lib/core/launch-dates'
import { CLOCK_BUDGET_MS } from '@/lib/launch/clock'
import type { PricingDefaults, TierPrice } from '@/lib/pricing/defaults'

interface FlowwebFacts {
  as_of: string
  beta_ends: string
  launch_on: string
  /** Whole-dollar (or cents-precise) amounts, keyed `<plan>_monthly`, `<plan>_annual`, `<plan>_list`. */
  prices: Record<string, number>
  launcher_minutes: number
}

const dollars = (cents: number) => Math.round(cents) / 100

function addTier(out: Record<string, number>, key: string, t: TierPrice | undefined) {
  if (!t) return
  if (Number.isFinite(t.monthly_cents)) out[`${key}_monthly`] = dollars(t.monthly_cents)
  if (typeof t.annual_cents === 'number' && Number.isFinite(t.annual_cents)) out[`${key}_annual`] = dollars(t.annual_cents)
  if (typeof t.list_cents === 'number' && Number.isFinite(t.list_cents)) out[`${key}_list`] = dollars(t.list_cents)
}

/** The sheet FlowWeb stores as facts.json. Prices only, no take-rates or settings beyond what /pricing shows. */
export function buildFacts(values: Pick<PricingDefaults, 'tier' | 'plan'>, now: Date): FlowwebFacts {
  const prices: Record<string, number> = {}
  addTier(prices, 'crew', values.tier?.crew)
  for (const [k, t] of Object.entries(values.plan ?? {})) addTier(prices, k, t as TierPrice)
  return {
    as_of: now.toISOString(),
    beta_ends: FOUNDING_MEMBER_COPY.endsOn,
    launch_on: LAUNCH_ON,
    prices,
    launcher_minutes: Math.round(CLOCK_BUDGET_MS / 60_000),
  }
}
