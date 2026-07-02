'use client'

import { useState, useTransition } from 'react'
import { Check, Lock, Loader2, ArrowRight, Minus, Plus } from 'lucide-react'
import { isError } from '@/lib/action-result'
import { startSpacePlanCheckout, startSpaceLoadoutCheckout } from './actions'
import { IntervalSwitch } from './loadout-picker'
import type { PriceRow } from '@/lib/pricing/display'
import type { ResolvedCatalogItem } from '@/lib/pricing/catalog-config'
import type { BillingInterval, CatalogItemKey } from '@/lib/billing/pricing-keys'
import { formatLoadoutCents, intervalSuffix } from '@/lib/pricing/loadout'

// SPACE PLAN PICKER (client). Renders the paid plan ladder (Practitioner -> Nonprofit -> Organization;
// white-label is its own lead surface). The CURRENT plan is marked; a higher plan whose checkout is
// live shows an "Upgrade" button (-> checkout -> Stripe); when not sellable (billing OFF, or the
// per-plan switch off) it shows a disabled "coming soon" CTA so nothing is ever a broken button. The
// server re-gates the checkout, so this is convenience, not the authority. No em dashes.
//
// NONPROFIT + ORGANIZATION ride the SAME multi-item loadout checkout Pro uses (startSpaceLoadoutCheckout
// -> createSpaceLoadoutCheckout, ADR-460/463), so they get Pro's monthly/yearly IntervalSwitch. Nonprofit
// is a per-SEAT catalog item (nonprofit_seat), so it also gets a seat-count control; the chosen interval
// + seats thread straight into that one checkout call. The other rows (Practitioner) stay on the legacy
// single-price startSpacePlanCheckout. See LOADOUT_PLAN below.

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

// The plans that check out through the loadout path (the SAME call Pro uses). Nonprofit maps to the
// per-SEAT catalog item (nonprofit_seat), so it gets both the interval toggle AND a seat-count control.
// Organization maps to the flat `organization` item (perSeat:false): the catalog HAS a yearly price for
// it, so it gets the interval toggle, but a seat count would not change its price, so it has no seat
// control (single-item by product design, ADR-472). Any row NOT here stays on the legacy single-price
// checkout (startSpacePlanCheckout).
const LOADOUT_PLAN: Record<string, { catalogKey: CatalogItemKey; perSeat: boolean }> = {
  nonprofit: { catalogKey: 'nonprofit_seat', perSeat: true },
  organization: { catalogKey: 'organization', perSeat: false },
}

export function SpacePlanPicker({
  slug,
  currentPlan,
  rows,
  sellable,
  unlocks,
  catalogItems,
  seatFloor,
}: {
  slug: string
  currentPlan: string
  rows: PriceRow[]
  sellable: Record<string, boolean>
  unlocks: Record<string, readonly string[]>
  /** The resolved catalog items (operator-set amounts), for the loadout-routed Nonprofit + Organization
   *  cards so their shown price matches what the loadout checkout charges. */
  catalogItems: ResolvedCatalogItem[]
  /** The seat count the Nonprofit seat control starts at (the bundled floor, or the space's current
   *  licensed seats, whichever is higher). Also the minimum it clamps to. */
  seatFloor: number
}) {
  const currentRank = PLAN_ORDER.indexOf(currentPlan)
  // White-label has its own request surface below; the picker covers the self-serve plans only.
  const picks = rows.filter((r) => r.key !== 'whitelabel')
  const itemsByKey = Object.fromEntries(catalogItems.map((i) => [i.key, i])) as Record<CatalogItemKey, ResolvedCatalogItem>

  return (
    <div className="grid gap-4 @lg:grid-cols-3">
      {picks.map((row) => {
        const loadout = LOADOUT_PLAN[row.key]
        return (
          <PlanCard
            key={row.key}
            slug={slug}
            row={row}
            isCurrent={row.key === currentPlan}
            isLower={PLAN_ORDER.indexOf(row.key) < currentRank}
            sellable={sellable[row.key] === true}
            unlocks={unlocks[row.key] ?? []}
            loadout={loadout}
            catalogItem={loadout ? itemsByKey[loadout.catalogKey] : undefined}
            seatFloor={Math.max(1, seatFloor)}
          />
        )
      })}
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
  loadout,
  catalogItem,
  seatFloor,
}: {
  slug: string
  row: PriceRow
  isCurrent: boolean
  isLower: boolean
  sellable: boolean
  unlocks: readonly string[]
  /** Set when this plan checks out through the loadout path (Nonprofit / Organization). */
  loadout?: { catalogKey: CatalogItemKey; perSeat: boolean }
  /** The resolved catalog item for a loadout plan (its live amounts). */
  catalogItem?: ResolvedCatalogItem
  seatFloor: number
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  // Loadout controls (Nonprofit / Organization). Declared unconditionally (hooks rule); ignored for the
  // legacy-path cards.
  const [interval, setInterval] = useState<BillingInterval>('month')
  const [seats, setSeats] = useState(seatFloor)

  // Only the upgrade target rows show a live checkout; current/lower rows never do.
  const isUpgradeTarget = !isCurrent && !isLower
  const showLoadoutControls = loadout !== undefined && isUpgradeTarget
  const seatQty = loadout?.perSeat ? Math.max(seatFloor, seats) : 1

  function upgrade() {
    setError(null)
    start(async () => {
      const result = loadout
        ? await startSpaceLoadoutCheckout(slug, {
            plan: row.key,
            interval,
            seatQuantity: loadout.perSeat ? seatQty : undefined,
          })
        : await startSpacePlanCheckout(slug, row.key, 'monthly')
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

      {loadout && catalogItem ? (
        <LoadoutPrice item={catalogItem} interval={interval} seats={seatQty} perSeat={loadout.perSeat} />
      ) : (
        <p className="mt-1 text-sm text-muted">
          <span className="font-semibold text-text">{row.monthly}</span> per month
          {row.annual && <span className="block text-2xs text-subtle">or {row.annual} a year</span>}
        </p>
      )}

      {showLoadoutControls && (
        <div className="mt-3 space-y-3">
          <IntervalSwitch interval={interval} onChange={setInterval} />
          {loadout.perSeat && <SeatStepper seats={seatQty} min={seatFloor} onChange={setSeats} />}
        </div>
      )}

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

/** The live price for a loadout-routed plan (Nonprofit / Organization): the founding amount for the
 *  chosen interval, multiplied by the seat count for a per-seat item, with the list anchor crossed out
 *  when it is higher. Mirrors the Pro loadout picker's price line (same catalog amounts, same helpers),
 *  so the number shown is the number the loadout checkout charges. */
function LoadoutPrice({
  item,
  interval,
  seats,
  perSeat,
}: {
  item: ResolvedCatalogItem
  interval: BillingInterval
  seats: number
  perSeat: boolean
}) {
  const amounts = interval === 'month' ? item.month : item.year
  const qty = perSeat ? Math.max(1, seats) : 1
  const founding = amounts.foundingCents * qty
  const list = amounts.listCents * qty
  const suffix = intervalSuffix(interval)
  return (
    <p className="mt-1 text-sm text-muted">
      {list > founding && <span className="text-subtle line-through">{formatLoadoutCents(list)}</span>}{' '}
      <span className="font-semibold text-text">{formatLoadoutCents(founding)}</span>
      <span className="text-2xs text-subtle">
        {suffix}
        {perSeat ? ` for ${qty} ${qty === 1 ? 'seat' : 'seats'}` : ''}
      </span>
    </p>
  )
}

/** A compact seat-count stepper for the per-seat Nonprofit plan. Clamps to the bundled floor (the
 *  minimum licensed seats a nonprofit pays for). Purely local state; the count threads into the loadout
 *  checkout on Upgrade. */
function SeatStepper({
  seats,
  min,
  onChange,
}: {
  seats: number
  min: number
  onChange: (n: number) => void
}) {
  return (
    <div>
      <p className="text-2xs font-semibold uppercase tracking-widest text-subtle">Operator seats</p>
      <div className="mt-1 inline-flex items-center gap-2 rounded-xl border border-border bg-surface p-1">
        <button
          type="button"
          disabled={seats <= min}
          onClick={() => onChange(Math.max(min, seats - 1))}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-text transition-colors hover:bg-surface-elevated disabled:opacity-40"
          aria-label="Remove a seat"
        >
          <Minus className="h-3.5 w-3.5" aria-hidden />
        </button>
        <span className="min-w-[2ch] text-center text-sm font-bold tabular-nums text-text">{seats}</span>
        <button
          type="button"
          onClick={() => onChange(seats + 1)}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-text transition-colors hover:bg-surface-elevated"
          aria-label="Add a seat"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
      <p className="mt-1 text-2xs text-subtle">Billed per operator seat. Minimum {min}.</p>
    </div>
  )
}
