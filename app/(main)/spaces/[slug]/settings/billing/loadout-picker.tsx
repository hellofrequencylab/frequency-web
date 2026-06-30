'use client'

import { useMemo, useState, useTransition } from 'react'
import { Check, Lock, Loader2, ArrowRight } from 'lucide-react'
import { isError } from '@/lib/action-result'
import { startSpaceLoadoutCheckout } from './actions'
import type { ResolvedCatalogItem } from '@/lib/pricing/catalog-config'
import type { AddonKey } from '@/lib/pricing/plans'
import type { BillingInterval, CatalogItemKey } from '@/lib/billing/pricing-keys'
import {
  computeLoadoutTotal,
  formatLoadoutCents,
  intervalSuffix,
} from '@/lib/pricing/loadout'

// SPACE PRO LOADOUT PICKER (client · ADR-463, docs/PRICING-LADDER-PLAN.md §4). The operator builds their
// Pro plan: the BASE plus the four toggle ADD-ONS, with a LIVE total that updates as they flip toggles
// and the monthly/yearly switch. The total math is PURE + client-side (computeLoadoutTotal), reading the
// operator-set catalog amounts the server passed. The founding price shows beneath the list anchor; the
// annual is two months free ("back the build"). A space already on a founding rate sees its locked price
// held (lockedHeld). While billing is OFF the whole picker is a DISABLED PREVIEW ("available soon") so
// nothing charges; the buy CTA wires to startSpaceLoadoutCheckout, dormant until live. No em dashes.

/** The four add-ons, in the picker's display order, with their plain blurb (CONTENT-VOICE: concrete,
 *  no narrating the reader's feelings). */
const ADDON_META: { key: AddonKey; catalogKey: CatalogItemKey; blurb: string }[] = [
  { key: 'marketing', catalogKey: 'addon_marketing', blurb: 'Email, automation, multiple pipelines, and reporting.' },
  { key: 'ai', catalogKey: 'addon_ai', blurb: 'The Resonance Engine: the graph, predictive alerts, and managed matching.' },
  { key: 'team', catalogKey: 'addon_team', blurb: 'Extra operator seats with roles. Billed per seat.' },
  { key: 'branding', catalogKey: 'addon_branding', blurb: 'Your own domain and Frequency branding removed.' },
]

const ADDON_LABEL: Record<AddonKey, string> = {
  marketing: 'Marketing',
  ai: 'AI Engine',
  team: 'Team',
  branding: 'Branding',
}

export function SpaceLoadoutPicker({
  slug,
  items,
  addonEnabled,
  activeAddons,
  sellable,
  trialDays,
  lockedHeld,
  seatFloor,
}: {
  slug: string
  /** The resolved catalog items (Pro base + the four add-ons), with the operator-set amounts. */
  items: ResolvedCatalogItem[]
  addonEnabled: Record<AddonKey, boolean>
  /** The add-ons the space already holds (so they read as on). */
  activeAddons: AddonKey[]
  /** Whether the loadout checkout is live (billingLive AND the per-plan switch). False while OFF. */
  sellable: boolean
  trialDays: number
  /** True when the space already holds a founding (grandfathered) locked price for the base. */
  lockedHeld: boolean
  /** The minimum licensed Team seats the picker starts at. */
  seatFloor: number
}) {
  const itemsByKey = useMemo(
    () => Object.fromEntries(items.map((i) => [i.key, i])) as Record<CatalogItemKey, ResolvedCatalogItem>,
    [items],
  )
  const [interval, setInterval] = useState<BillingInterval>('month')
  const [selected, setSelected] = useState<Set<AddonKey>>(() => new Set(activeAddons))
  const [seats, setSeats] = useState(Math.max(1, seatFloor))
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const total = useMemo(
    () => computeLoadoutTotal(itemsByKey, [...selected], interval, seats),
    [itemsByKey, selected, interval, seats],
  )

  function toggle(addon: AddonKey) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(addon)) next.delete(addon)
      else next.add(addon)
      return next
    })
  }

  function buy() {
    if (!sellable) return
    setError(null)
    start(async () => {
      const res = await startSpaceLoadoutCheckout(slug, {
        addons: [...selected],
        interval,
        seatQuantity: seats,
      })
      if (isError(res)) setError(res.error)
      else window.location.href = res.data.url
    })
  }

  const base = itemsByKey.pro_base
  const baseAmounts = interval === 'month' ? base?.month : base?.year
  const suffix = intervalSuffix(interval)

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-text">Build your Pro plan</h2>
          <p className="mt-0.5 text-sm text-muted">
            Start with Pro, then turn on the add-ons you need. Your total updates as you go.
          </p>
        </div>
        <IntervalSwitch interval={interval} onChange={setInterval} />
      </div>

      {!sellable && (
        <div className="flex items-start gap-3 rounded-2xl border border-dashed border-border bg-surface px-5 py-4">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-subtle" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-text">Available soon</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted">
              Paid plans are not live yet. You can see the prices and build a loadout here. Nothing is charged and your
              space keeps full access during the beta.
            </p>
          </div>
        </div>
      )}

      {lockedHeld && (
        <div className="flex items-start gap-3 rounded-2xl border border-signal/30 bg-signal-bg/20 px-5 py-4">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-signal-strong" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-text">Your founding price is held</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted">
              You joined at the founding price, so you keep it for as long as your plan stays active, even after the list
              price rises.
            </p>
          </div>
        </div>
      )}

      {/* Disable the whole control set while billing is OFF: a preview, never a live checkout. */}
      <fieldset disabled={!sellable} className="space-y-4">
        {/* The Pro base card (always included). */}
        <div className="rounded-2xl border border-primary bg-surface p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-text">Pro</h3>
                <span className="rounded-md bg-primary px-2 py-0.5 text-3xs font-bold uppercase tracking-wider text-on-primary">
                  Base
                </span>
              </div>
              <p className="mt-1 text-sm text-muted">
                Branded site, bookings, tickets, donations, memberships, and CRM.
              </p>
            </div>
            {baseAmounts && (
              <PriceAnchor listCents={baseAmounts.listCents} foundingCents={baseAmounts.foundingCents} suffix={suffix} />
            )}
          </div>
        </div>

        {/* The four add-on toggles. A disabled (operator-hidden) add-on is dropped. */}
        <div className="grid gap-3 @lg:grid-cols-2">
          {ADDON_META.filter((m) => addonEnabled[m.key]).map((meta) => {
            const item = itemsByKey[meta.catalogKey]
            if (!item) return null
            const amounts = interval === 'month' ? item.month : item.year
            const on = selected.has(meta.key)
            return (
              <AddonToggleCard
                key={meta.key}
                label={ADDON_LABEL[meta.key]}
                blurb={meta.blurb}
                perSeat={item.perSeat}
                listCents={amounts.listCents}
                foundingCents={amounts.foundingCents}
                suffix={suffix}
                on={on}
                onToggle={() => toggle(meta.key)}
                trialDays={trialDays}
              />
            )
          })}
        </div>

        {/* Team seat count, shown when Team is on. */}
        {selected.has('team') && (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface px-5 py-3">
            <span className="text-sm font-semibold text-text">Team seats</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSeats((s) => Math.max(1, s - 1))}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-text hover:bg-surface-elevated"
                aria-label="Fewer seats"
              >
                -
              </button>
              <span className="w-8 text-center text-sm font-semibold tabular-nums text-text">{seats}</span>
              <button
                type="button"
                onClick={() => setSeats((s) => s + 1)}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-text hover:bg-surface-elevated"
                aria-label="More seats"
              >
                +
              </button>
            </div>
          </div>
        )}
      </fieldset>

      {/* The live total + the buy CTA (or the disabled preview). */}
      <div className="rounded-2xl border border-border bg-surface-elevated p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-subtle">Your total</p>
            <div className="mt-1 flex items-baseline gap-2">
              {total.savingsCents > 0 && (
                <span className="text-lg font-bold text-subtle line-through">{formatLoadoutCents(total.listCents)}</span>
              )}
              <span className="text-3xl font-black text-text">{formatLoadoutCents(total.foundingCents)}</span>
              <span className="text-sm text-muted">{suffix}</span>
            </div>
            {total.savingsCents > 0 && (
              <p className="mt-0.5 text-2xs text-subtle">
                Founding price. {interval === 'year' ? 'Two months free on the year.' : 'The list price is the anchor it sits under.'}
              </p>
            )}
          </div>
          <div className="min-w-[12rem]">
            {sellable ? (
              <button
                type="button"
                onClick={buy}
                disabled={pending}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ArrowRight className="h-4 w-4" aria-hidden />}
                {pending ? 'Redirecting' : 'Start your plan'}
              </button>
            ) : (
              <div
                aria-disabled
                className="flex w-full cursor-default items-center justify-center gap-2 rounded-xl border border-dashed border-border px-4 py-3 text-xs font-semibold text-subtle"
              >
                <Lock className="h-3.5 w-3.5" aria-hidden /> Available soon
              </div>
            )}
            {trialDays > 0 && sellable && (
              <p className="mt-2 text-center text-2xs text-subtle">{trialDays}-day free trial. Cancel anytime.</p>
            )}
          </div>
        </div>
        {error && (
          <p className="mt-3 text-2xs font-medium text-danger" role="alert">
            {error}
          </p>
        )}
      </div>
    </section>
  )
}

function IntervalSwitch({ interval, onChange }: { interval: BillingInterval; onChange: (i: BillingInterval) => void }) {
  return (
    <div className="inline-flex items-center rounded-xl border border-border bg-surface p-1 text-xs font-semibold">
      <button
        type="button"
        onClick={() => onChange('month')}
        className={`rounded-lg px-3 py-1.5 transition-colors ${interval === 'month' ? 'bg-primary text-on-primary' : 'text-muted hover:text-text'}`}
      >
        Monthly
      </button>
      <button
        type="button"
        onClick={() => onChange('year')}
        className={`rounded-lg px-3 py-1.5 transition-colors ${interval === 'year' ? 'bg-primary text-on-primary' : 'text-muted hover:text-text'}`}
      >
        Yearly
        <span className="ml-1 text-2xs font-bold text-success">2 mo free</span>
      </button>
    </div>
  )
}

function PriceAnchor({ listCents, foundingCents, suffix }: { listCents: number; foundingCents: number; suffix: string }) {
  const discounted = listCents > foundingCents
  return (
    <div className="text-right">
      {discounted && <span className="block text-2xs text-subtle line-through">{formatLoadoutCents(listCents)}</span>}
      <span className="text-base font-bold text-text">{formatLoadoutCents(foundingCents)}</span>
      <span className="text-2xs text-muted">{suffix}</span>
    </div>
  )
}

function AddonToggleCard({
  label,
  blurb,
  perSeat,
  listCents,
  foundingCents,
  suffix,
  on,
  onToggle,
  trialDays,
}: {
  label: string
  blurb: string
  perSeat: boolean
  listCents: number
  foundingCents: number
  suffix: string
  on: boolean
  onToggle: () => void
  trialDays: number
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      className={`flex h-full flex-col items-start rounded-2xl border p-4 text-left transition-colors ${
        on ? 'border-primary bg-primary-bg/30' : 'border-border bg-surface hover:bg-surface-elevated'
      }`}
    >
      <div className="flex w-full items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-text">{label}</span>
          {trialDays > 0 && (
            <span className="rounded-md bg-success-bg/40 px-1.5 py-0.5 text-3xs font-bold uppercase tracking-wider text-success">
              {trialDays}-day trial
            </span>
          )}
        </div>
        <span
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
            on ? 'border-primary bg-primary text-on-primary' : 'border-border text-transparent'
          }`}
          aria-hidden
        >
          <Check className="h-3.5 w-3.5" />
        </span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted">{blurb}</p>
      <p className="mt-2 text-xs text-text">
        {listCents > foundingCents && <span className="text-subtle line-through">{formatLoadoutCents(listCents)}</span>}{' '}
        <span className="font-semibold">{formatLoadoutCents(foundingCents)}</span>
        <span className="text-subtle">
          {suffix}
          {perSeat ? ' / seat' : ''}
        </span>
      </p>
    </button>
  )
}
