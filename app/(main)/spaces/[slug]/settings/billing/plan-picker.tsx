'use client'

import { useState, useTransition } from 'react'
import { Check, Lock, Loader2, ArrowRight } from 'lucide-react'
import { isError } from '@/lib/action-result'
import { startSpacePlanCheckout } from './actions'
import type { PriceRow } from '@/lib/pricing/display'

// SPACE PLAN PICKER (client). Renders the paid plan ladder (Practitioner -> Nonprofit -> Organization;
// white-label is its own lead surface). The CURRENT plan is marked; a higher plan whose checkout is
// live shows an "Upgrade" button (-> startSpacePlanCheckout -> Stripe); when not sellable (billing
// OFF, or the per-plan switch off) it shows a disabled "coming soon" CTA so nothing is ever a broken
// button. The server re-gates the checkout, so this is convenience, not the authority. No em dashes.

/** Plain labels for the entitlement keys a plan unlocks (for the "what you get" line). */
const UNLOCK_LABEL: Record<string, string> = {
  crm: 'CRM',
  email: 'Email campaigns',
  automation: 'Automations',
  team: 'Team seats',
  multi_pipeline: 'Multiple pipelines',
  reporting: 'Reporting',
  whitelabel: 'White-label branding',
}

// The capability/ladder order the picker ranks on (current vs lower vs upgrade). Nonprofit rides
// between business and organization, mirroring lib/pricing/display.ts spacePlanRows.
const PLAN_ORDER = ['free', 'practitioner', 'business', 'nonprofit', 'organization', 'whitelabel']

export function SpacePlanPicker({
  slug,
  currentPlan,
  rows,
  sellable,
  unlocks,
}: {
  slug: string
  currentPlan: string
  rows: PriceRow[]
  sellable: Record<string, boolean>
  unlocks: Record<string, readonly string[]>
}) {
  const currentRank = PLAN_ORDER.indexOf(currentPlan)
  // White-label has its own request surface below; the picker covers the self-serve plans only.
  const picks = rows.filter((r) => r.key !== 'whitelabel')

  return (
    <div className="grid gap-4 @lg:grid-cols-3">
      {picks.map((row) => (
        <PlanCard
          key={row.key}
          slug={slug}
          row={row}
          isCurrent={row.key === currentPlan}
          isLower={PLAN_ORDER.indexOf(row.key) < currentRank}
          sellable={sellable[row.key] === true}
          unlocks={unlocks[row.key] ?? []}
        />
      ))}
    </div>
  )
}

function PlanCard({
  slug,
  row,
  isCurrent,
  isLower,
  sellable,
  unlocks,
}: {
  slug: string
  row: PriceRow
  isCurrent: boolean
  isLower: boolean
  sellable: boolean
  unlocks: readonly string[]
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function upgrade() {
    setError(null)
    start(async () => {
      const result = await startSpacePlanCheckout(slug, row.key, 'monthly')
      if (isError(result)) {
        setError(result.error)
        return
      }
      window.location.href = result.data.url
    })
  }

  return (
    <div
      className={`flex h-full flex-col rounded-2xl border bg-surface p-5 shadow-sm ${
        isCurrent ? 'border-primary' : 'border-border'
      }`}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold leading-tight text-text">{row.label}</h3>
        {isCurrent && (
          <span className="rounded-md bg-primary px-2 py-0.5 text-3xs font-bold uppercase tracking-wider text-on-primary">
            Current
          </span>
        )}
      </div>

      <p className="mt-1 text-sm text-muted">
        <span className="font-semibold text-text">{row.monthly}</span> per month
        {row.annual && <span className="block text-2xs text-subtle">or {row.annual} a year</span>}
      </p>

      {unlocks.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {unlocks.map((key) => (
            <li key={key} className="flex items-start gap-2 text-sm text-text">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
              <span>{UNLOCK_LABEL[key] ?? key}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto pt-4">
        {isCurrent ? (
          <div className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary-bg/40 px-4 py-2.5 text-xs font-semibold text-primary-strong">
            Your current plan
          </div>
        ) : isLower ? (
          <div className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border px-4 py-2.5 text-xs font-semibold text-subtle">
            Included in your plan
          </div>
        ) : sellable ? (
          <button
            type="button"
            onClick={upgrade}
            disabled={pending}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ArrowRight className="h-4 w-4" aria-hidden />}
            {pending ? 'Redirecting' : `Upgrade to ${row.label}`}
          </button>
        ) : (
          <div
            aria-disabled
            className="flex w-full cursor-default items-center justify-center gap-2 rounded-xl border border-dashed border-border px-4 py-2.5 text-xs font-semibold text-subtle"
          >
            <Lock className="h-3.5 w-3.5" aria-hidden /> Coming soon
          </div>
        )}
        {error && (
          <p className="mt-2 text-2xs font-medium text-danger" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
