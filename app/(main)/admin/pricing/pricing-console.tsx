'use client'

import { useState, useTransition } from 'react'
import { Check } from 'lucide-react'
import { AdminSection } from '@/components/templates'
import { FormSection } from '@/components/admin/form-section'
import { Banner, StatusChip } from '@/components/admin/status'
import { Toggle } from '@/components/admin/toggle'
import { Button } from '@/components/ui/button'
import { isError } from '@/lib/action-result'
import type { PricingConsoleData, FeatureGateRow } from './load'
import type { PricingDefaults, PricingFlagKey } from '@/lib/pricing/settings'
import { formatCents } from '@/lib/pricing/display'
import type { CatalogConfig, ResolvedCatalogItem } from '@/lib/pricing/catalog-config'
import type { AddonKey } from '@/lib/pricing/plans'
import { addonKeyForCatalogItem } from '@/lib/billing/pricing-keys'
import {
  setPricingFlag,
  saveTakeRate,
  saveKnobs,
  saveFeatureGate,
  syncStripeProducts,
  syncStripeCatalog,
  saveCatalogItem,
  saveSeatConfig,
  savePwywConfig,
  saveAddonEnabled,
  saveFoundingConfig,
  setOperatorSeatActive,
  setBetaFlag,
  saveBetaEndsAt,
  saveBetaGrace,
} from './actions'
import type { FoundingConfig } from '@/lib/pricing/founding'

// The /admin/pricing operator console (ADR-362/463, docs/PRICING.md). EVERYTHING SHIPS OFF: the master
// switch defaults off, no tier/plan is enabled, and no value here charges anyone. Sections: the
// switches (master prominent), the clean catalog editor (Pro base + add-ons + seat + org, with the
// list anchor and the founding price), the seat + Supporter PWYW config, the legacy plans & prices, the
// feature-gate matrix, the founder lock, and the Stripe status + catalog sync. Plain operator copy, no
// em dashes (docs/CONTENT-VOICE.md).

const inputCls =
  'w-28 rounded-md border border-border bg-canvas px-2 py-1 text-body-sm text-text text-right tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30'

function centsToDollars(cents: number | null | undefined): string {
  if (cents == null) return ''
  return (cents / 100).toFixed(2)
}
function dollarsToCents(v: string): number {
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

export function PricingConsole({ data }: { data: PricingConsoleData }) {
  return (
    <>
      {/* The OFF banner sets the whole page's frame: nothing is live. OFF = everything granted,
          nothing charged. */}
      <Banner tone={data.stripe.live ? 'warning' : 'info'} title={data.stripe.live ? 'Billing is LIVE' : 'Billing is OFF'}>
        {data.stripe.live
          ? 'The master switch is on and Stripe is configured. Charges can happen. Turn the master switch off to stop all billing.'
          : 'Off means everything granted, nothing charged. While the master switch is off, every member and space keeps full access exactly as today and no card is ever charged. Editing prices here is safe: nothing goes live until you flip the master switch.'}
      </Banner>

      <GatingReadout gating={data.gating} />

      <SwitchesSection flags={data.flags} />
      <CatalogSection catalog={data.catalog} operatorSeatActive={data.flags.catalog_operator_seat_active} />
      <PlansSection values={data.values} />
      <FoundingConfigSection founding={data.founding} />
      <BetaControlsSection beta={data.beta} gating={data.gating} />
      <FeatureGatesSection gates={data.gates} />
      <StripeStatusSection stripe={data.stripe} />
    </>
  )
}

// ── The clean catalog editor (Pro base + add-ons + seat + org · ADR-463) ───────────────────────────
// Each item shows the LIST anchor and the lower FOUNDING price the member is charged, with the monthly
// amount the headline and the yearly derived two months free (overridable). Plus the per-add-on enable
// toggles, the seat bundled floor, and the Supporter PWYW config.

function CatalogSection({
  catalog,
  operatorSeatActive,
}: {
  catalog: CatalogConfig
  operatorSeatActive: boolean
}) {
  const byKey = Object.fromEntries(catalog.items.map((i) => [i.key, i])) as Record<string, ResolvedCatalogItem>
  const addonItems = catalog.items.filter((i) => addonKeyForCatalogItem(i.key) !== null)
  return (
    <AdminSection
      title="Catalog"
      description="Every base (Business, Collective, Non Profit, Independent) plus the Vera AI add-on and the seats. Each price shows a list anchor and the Opening Beta price under it, monthly AND yearly, every field populated. The Opening Beta price is what is charged today; the list price is the anchor it sits under (where there is no beta discount, the two match). The yearly stays two months free as you change the monthly, unless you type a different yearly."
    >
      <FormSection
        title="Business base"
        description="The run-your-practice base (ADR-811): CRM, email, reporting, your own website. Free-vs-paid is a usage state within Business, not a separate plan."
      >
        <div className="space-y-4">
          <CatalogItemRow item={byKey.business_base} />
        </div>
      </FormSection>

      <FormSection
        title="Collective base"
        description="Everything in Business plus automations, team roles, multiple pipelines, and hosting collaborators (ADR-811). The Opening Beta price is the anchor charged today; run the catalog sync after changing it."
      >
        <div className="space-y-4">
          <CatalogItemRow item={byKey.collective_base} />
        </div>
      </FormSection>

      {/* TODO(ADR-472 surfaces): the catalog editor still lists add-ons generically; only AI Engine
          remains a metered add-on. The full Tier x Mode console rebuild lands in the surface PR. */}
      <FormSection
        title="Vera AI (metered add-on)"
        description="The sole cross-tier add-on, listed publicly as Vera AI. Toggle it off here to hide it from the picker entirely. It is usage-priced and available on any paid tier."
      >
        <div className="space-y-4">
          {addonItems.map((item) => (
            <CatalogItemRow
              key={item.key}
              item={item}
              addon={addonKeyForCatalogItem(item.key) ?? undefined}
              addonEnabled={catalog.addonEnabled}
            />
          ))}
        </div>
      </FormSection>

      <FormSection
        title="Non Profit"
        description="The flat Non Profit plan (never per seat, ADR-811). Verified 501(c)(3) organizations get the full Collective toolkit, discounted."
      >
        <div className="space-y-4">
          <CatalogItemRow item={byKey.nonprofit_seat} />
        </div>
      </FormSection>

      <FormSection
        title="Independent base"
        description="The standalone white-label base, off the network (ADR-811). NOT sold or listed publicly right now (its plan switch is off); the price stays editable so the machinery is ready if it ever opens."
      >
        <div className="space-y-4">
          <CatalogItemRow item={byKey.independent_base} />
        </div>
      </FormSection>

      <FormSection
        title="Seats"
        description="The minimum licensed seats a seat plan bills. A Non Profit pays for at least this many seats even with fewer members."
      >
        <SeatConfigRow bundledFloor={catalog.seat.bundledFloor} seatItem={byKey.nonprofit_seat} />
      </FormSection>

      <FormSection
        title="Operator seat"
        description="Each operator beyond the owner (editor, moderator, admin) bills one seat on a paid plan. The seat ships as a placeholder that the catalog sync skips, so no price is minted. Set the price, then turn the seat on to mint the live Stripe price on the next sync. Nothing charges until billing goes live."
      >
        <OperatorSeatRow item={byKey.operator_seat} active={operatorSeatActive} />
      </FormSection>

      {/* THIS IS THE CREW PRICE CONTROL, not an extras box. It was labelled "Supporter (pay what you
          want)" back when Supporter was a contribution ON TOP of a fixed $9 Crew. Crew itself is now
          PWYW, so these two fields ARE the membership price: the floor is what /upgrade offers and what
          the checkout re-validates, and the suggested amount is pre-selected on the picker and is the
          line at which a member earns the Supporter mark. Mislabelling them hid the most consequential
          pricing control in the console inside a section that read as optional. */}
      <FormSection
        title="Member pricing (pay what you want)"
        description="Crew is pay what you want. The minimum is the lowest a member can choose and the floor every price display quotes as 'from'. The suggested amount is pre-selected on the picker, and a member paying it or more earns the Supporter badge."
      >
        <PwywConfigRow minCents={catalog.pwyw.minCents} suggestedCents={catalog.pwyw.suggestedCents} />
      </FormSection>
    </AdminSection>
  )
}

function CatalogItemRow({
  item,
  addon,
  addonEnabled,
}: {
  item: ResolvedCatalogItem
  addon?: AddonKey
  addonEnabled?: Record<AddonKey, boolean>
}) {
  const [monthlyList, setMonthlyList] = useState(centsToDollars(item.monthlyListCents))
  const [monthlyFounding, setMonthlyFounding] = useState(centsToDollars(item.monthlyFoundingCents))
  // The yearly fields show the EFFECTIVE charged numbers, always populated (owner directive
  // 2026-07-25: every price visible, including yearly). item.year is the resolved amount (the
  // explicit override when one is stored, else the derived two months free), so the field never
  // sits empty. Save keeps the derive-unless-changed semantics below.
  const [yearlyList, setYearlyList] = useState(centsToDollars(item.year.listCents))
  const [yearlyFounding, setYearlyFounding] = useState(centsToDollars(item.year.foundingCents))
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  // The yearly we would charge for display: the field's number, else the derived two months free.
  const derivedYearlyFounding =
    yearlyFounding.trim() === '' ? Math.round(dollarsToCents(monthlyFounding) * 10) : dollarsToCents(yearlyFounding)

  function save() {
    setError(null)
    setSaved(false)
    start(async () => {
      // Derive-unless-changed: a yearly equal to the two-months-free derivation of the SAVED monthly
      // stores NO override (null), so a later monthly edit keeps reflowing the yearly. Only a yearly
      // that genuinely differs is pinned as an explicit override.
      const ml = dollarsToCents(monthlyList)
      const mf = dollarsToCents(monthlyFounding)
      const yl = yearlyList.trim() === '' ? null : dollarsToCents(yearlyList)
      const yf = yearlyFounding.trim() === '' ? null : dollarsToCents(yearlyFounding)
      const res = await saveCatalogItem(item.key, {
        monthlyListCents: ml,
        monthlyFoundingCents: mf,
        yearlyListCents: yl === Math.round(ml * 10) ? null : yl,
        yearlyFoundingCents: yf === Math.round(mf * 10) ? null : yf,
      })
      if (isError(res)) setError(res.error)
      else {
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    })
  }

  const enabled = addon && addonEnabled ? addonEnabled[addon] : true

  return (
    <div className="space-y-3 border-b border-border/60 pb-4 last:border-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-body-sm font-semibold text-text">{item.label}</span>
          {item.perSeat && (
            <StatusChip tone="info" size="sm">
              per seat
            </StatusChip>
          )}
        </div>
        {addon && addonEnabled && <AddonEnableToggle addon={addon} initial={addonEnabled[addon]} />}
      </div>

      <div className={`flex flex-wrap items-end gap-3 ${enabled ? '' : 'opacity-50'}`}>
        <Field label="List $ / mo" value={monthlyList} onChange={setMonthlyList} />
        <Field label="Opening Beta $ / mo" value={monthlyFounding} onChange={setMonthlyFounding} />
        <Field label="List $ / yr" value={yearlyList} onChange={setYearlyList} placeholder="2 mo free" />
        <Field label="Opening Beta $ / yr" value={yearlyFounding} onChange={setYearlyFounding} placeholder="2 mo free" />
        <div className="flex items-center gap-2">
          <SaveCue pending={pending} saved={saved} />
          <Button size="sm" variant="secondary" onClick={save} disabled={pending}>
            Save
          </Button>
        </div>
      </div>
      <p className="text-2xs text-muted">
        Member is charged {centsToDollars(dollarsToCents(monthlyFounding)) && formatDollars(monthlyFounding)} a month
        {' '}({formatDollars(monthlyList)} list), or {formatCentsLabel(derivedYearlyFounding)} a year.
      </p>
      {error && <p className="text-meta text-danger">{error}</p>}
    </div>
  )
}

function AddonEnableToggle({ addon, initial }: { addon: AddonKey; initial: boolean }) {
  const [on, setOn] = useState(initial)
  const [pending, start] = useTransition()
  const [saved, setSaved] = useState(false)
  function toggle() {
    const next = !on
    setOn(next)
    setSaved(false)
    start(async () => {
      const res = await saveAddonEnabled(addon, next)
      if (isError(res)) setOn(!next)
      else {
        setSaved(true)
        setTimeout(() => setSaved(false), 1500)
      }
    })
  }
  return (
    <div className="flex items-center gap-2">
      <span className={`text-2xs font-semibold uppercase tracking-wide ${on ? 'text-success' : 'text-muted'}`}>
        {on ? 'Offered' : 'Hidden'}
      </span>
      <Toggle
        checked={on}
        onChange={toggle}
        ariaLabel={`${addon} add-on offered`}
        disabled={pending}
        saveState={pending ? 'saving' : saved ? 'saved' : 'idle'}
      />
    </div>
  )
}

function SeatConfigRow({ bundledFloor, seatItem }: { bundledFloor: number; seatItem: ResolvedCatalogItem }) {
  const [floor, setFloor] = useState(String(bundledFloor))
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  function save() {
    setError(null)
    setSaved(false)
    start(async () => {
      const res = await saveSeatConfig({ bundledFloor: Math.max(1, Math.round(Number(floor) || 1)) })
      if (isError(res)) setError(res.error)
      else {
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    })
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Bundled floor (seats)" value={floor} onChange={setFloor} />
        <div className="flex items-center gap-2">
          <SaveCue pending={pending} saved={saved} />
          <Button size="sm" variant="secondary" onClick={save} disabled={pending}>
            Save
          </Button>
        </div>
      </div>
      <p className="text-2xs text-muted">
        Each seat is {formatCentsLabel(seatItem.monthlyFoundingCents)} a month ({formatCentsLabel(seatItem.monthlyListCents)}{' '}
        list). The floor bills at least {floor || '1'} seats.
      </p>
      {error && <p className="text-meta text-danger">{error}</p>}
    </div>
  )
}

function PwywConfigRow({ minCents, suggestedCents }: { minCents: number; suggestedCents: number }) {
  const [min, setMin] = useState(centsToDollars(minCents))
  const [suggested, setSuggested] = useState(centsToDollars(suggestedCents))
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  function save() {
    setError(null)
    setSaved(false)
    start(async () => {
      const res = await savePwywConfig({
        minCents: dollarsToCents(min),
        suggestedCents: dollarsToCents(suggested),
      })
      if (isError(res)) setError(res.error)
      else {
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    })
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Minimum $" value={min} onChange={setMin} />
        <Field label="Suggested $" value={suggested} onChange={setSuggested} />
        <div className="flex items-center gap-2">
          <SaveCue pending={pending} saved={saved} />
          <Button size="sm" variant="secondary" onClick={save} disabled={pending}>
            Save
          </Button>
        </div>
      </div>
      <p className="text-2xs text-muted">The suggested amount is raised to the minimum if you set it lower.</p>
      {error && <p className="text-meta text-danger">{error}</p>}
    </div>
  )
}

// ── Operator seat (per-seat add-on · ADR-799/803) ──────────────────────────────────────────────────
// The seat ships as a PLACEHOLDER: the catalog sync skips it so no Stripe price is minted. The operator
// sets the seat price (the same monthly list + founding fields as any catalog item), then flips the
// activation switch on to drop the placeholder. Only then does the next sync mint the live seat price.

function OperatorSeatRow({ item, active }: { item: ResolvedCatalogItem; active: boolean }) {
  const [on, setOn] = useState(active)
  const [pending, start] = useTransition()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggle() {
    const next = !on
    if (next) {
      // Guard against minting a live $0 seat price: the card says "set the price first," so enforce it.
      if (item.monthlyFoundingCents <= 0) {
        setError('Set the seat price above 0 before turning it on.')
        return
      }
      if (!window.confirm('Turn the operator seat on? The next catalog sync mints its live Stripe price from the amount below.')) {
        return
      }
    }
    setOn(next)
    setError(null)
    setSaved(false)
    start(async () => {
      const res = await setOperatorSeatActive(next)
      if (isError(res)) {
        setOn(!next)
        setError(res.error)
      } else {
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-body-sm font-semibold text-text">Seat activation</span>
            <StatusChip tone={on ? 'success' : 'neutral'} size="sm">
              {on ? 'Active' : 'Placeholder'}
            </StatusChip>
          </div>
          <p className="mt-1 text-2xs text-muted">
            {on
              ? 'The seat is active. The next catalog sync will mint its Stripe price from the amount below.'
              : 'The seat is a placeholder. The catalog sync skips it, so no Stripe price is minted. Set the price first, then turn it on.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {error && <span className="text-meta text-danger">{error}</span>}
          <Toggle
            checked={on}
            onChange={toggle}
            ariaLabel="Operator seat active"
            disabled={pending}
            saveState={pending ? 'saving' : saved ? 'saved' : 'idle'}
          />
        </div>
      </div>
      <CatalogItemRow item={item} />
    </div>
  )
}

// ── Founding config (Founding Businesses · ADR-599/803) ─────────────────────────────────────────────
// The Founding BUSINESS locked monthly rate, bought-down marketplace take-rate, and per-city cap. These
// are locked DISPLAY values: nothing here charges (the money flip is the master switch). Amounts in
// dollars; the take-rate as a percent; caps as counts.
//
// 🔴 THE FOUNDERS ROUND (personal) EDITOR IS GONE, with the purchase path it configured (owner
// directive, 2026-07-30). Its two fields priced a one-time $250 founding MEMBERSHIP locked for life,
// and Crew is pay-what-you-want: there is no fixed member price to lock, nothing sold that round, and
// zero profiles carry is_founding_member. Leaving an editor for it would keep an operator tuning the
// terms of an offer that cannot be bought. The Founding BUSINESS cohort is a different offer (a Space,
// per city, fee buydown) and is untouched.

function FoundingConfigSection({ founding }: { founding: FoundingConfig }) {
  return (
    <AdminSection
      title="Founding rates"
      description="The Founding Businesses cohort. These are locked reference rates: a Founding Business is grandfathered at its rate for as long as it keeps the plan. Nothing here charges."
    >
      <FormSection
        title="Founding Businesses"
        description="The locked monthly a Founding Business pays, its bought-down marketplace fee, and the per-city cap. The monthly matches the live Business plan; the fee is bought down from the standard ladder."
      >
        <FoundingBusinessRow founding={founding} />
      </FormSection>
    </AdminSection>
  )
}

function FoundingBusinessRow({ founding }: { founding: FoundingConfig }) {
  const [monthly, setMonthly] = useState(centsToDollars(founding.business_monthly_cents))
  const [takePct, setTakePct] = useState(String(founding.business_take_bps / 100))
  const [cityCap, setCityCap] = useState(String(founding.business_city_cap))
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function save() {
    setError(null)
    setSaved(false)
    start(async () => {
      // Send ONLY this row's fields; the action merges them over the current stored config, so this
      // never clobbers the member row's fields (which the `...founding` prop snapshot could be stale on).
      const res = await saveFoundingConfig({
        business_monthly_cents: dollarsToCents(monthly),
        business_take_bps: Math.round((Number(takePct) || 0) * 100),
        business_city_cap: Math.max(0, Math.round(Number(cityCap) || 0)),
      })
      if (isError(res)) setError(res.error)
      else {
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    })
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Monthly $" value={monthly} onChange={setMonthly} />
        <Field label="Take-rate %" value={takePct} onChange={setTakePct} />
        <Field label="Per-city cap" value={cityCap} onChange={setCityCap} />
        <div className="flex items-center gap-2">
          <SaveCue pending={pending} saved={saved} />
          <Button size="sm" variant="secondary" onClick={save} disabled={pending}>
            Save
          </Button>
        </div>
      </div>
      <p className="text-2xs text-muted">
        A Founding Business pays {formatDollars(monthly)} a month with a {takePct || '0'}% marketplace fee, up to{' '}
        {cityCap || '0'} per city.
      </p>
      {error && <p className="text-meta text-danger">{error}</p>}
    </div>
  )
}

// ── Beta controls (invite gate, host prompts, countdown · ADR-803) ──────────────────────────────────
// The invite gate and the host-prompt surface are audited platform flags. The countdown date is a text
// setting that is DISPLAY-ONLY: it feeds the countdown banner and grants no access.

function BetaControlsSection({
  beta,
  gating,
}: {
  beta: PricingConsoleData['beta']
  gating: PricingConsoleData['gating']
}) {
  return (
    <AdminSection
      title="Beta controls"
      description="The beta switches. Host prompts change behavior; the countdown date is display only and grants no access. All off or unset by default."
    >
      <FormSection
        title="Host prompts"
        description="When on, the feed shows the graduation nudges that invite a ready member to start a Circle. Off keeps the feed quiet."
      >
        <BetaFlagRow flagKey="beta_host_prompts" initial={beta.hostPrompts} label="Host prompts" />
      </FormSection>

      <FormSection
        title="Countdown date"
        description="The date the in-product countdown banner (Summer of Frequency) counts down to. Display only: it changes no access on its own. Leave it blank to hide the banner."
      >
        <BetaEndsAtRow initial={beta.endsAt} />
      </FormSection>

      <FormSection
        title="Paid gates start"
        description="The date the paid feature gates start blocking. This one DOES change access. Until it arrives, billing can be live and plans can sell while every member and Space keeps paid features. Clear it to make the gates follow the master billing switch instead, which locks paid features the moment billing goes live."
      >
        <BetaGraceRow initial={gating.graceUntil} />
      </FormSection>
    </AdminSection>
  )
}

// ── The two switches, stated apart (ADR-874) ────────────────────────────────────────────────────────
// Selling and gating are different decisions on different dates. One line so an operator never has to
// infer the second from the first: can we charge, do the paid gates bite, and when the grace ends.

function GatingReadout({ gating }: { gating: PricingConsoleData['gating'] }) {
  const graceLabel = gating.graceUntil
    ? `${graceDay(gating.graceUntil)}${gating.graceOpen ? '' : ' (passed)'}`
    : 'None set'
  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-card border border-border bg-surface-elevated px-4 py-3">
      <span className="inline-flex items-center gap-2 text-body-sm text-text">
        <span className="text-2xs font-semibold uppercase tracking-wide text-muted">Billing</span>
        <StatusChip tone={gating.billingLive ? 'success' : 'neutral'}>
          {gating.billingLive ? 'Live, checkout sells' : 'Off, nothing charges'}
        </StatusChip>
      </span>
      <span className="inline-flex items-center gap-2 text-body-sm text-text">
        <span className="text-2xs font-semibold uppercase tracking-wide text-muted">Paid gates</span>
        <StatusChip tone={gating.gatesLive ? 'warning' : 'neutral'}>
          {gating.gatesLive ? 'Enforced' : 'Not enforced, everyone keeps access'}
        </StatusChip>
      </span>
      <span className="inline-flex items-center gap-2 text-body-sm text-text">
        <span className="text-2xs font-semibold uppercase tracking-wide text-muted">Beta grace ends</span>
        <span className="text-body-sm font-semibold tabular-nums text-text">{graceLabel}</span>
      </span>
      <p className="w-full text-2xs text-muted">
        Two switches, not one. Billing decides whether anyone can be charged. The beta grace date decides
        when the paid feature gates start blocking. Turning billing on sells plans without taking anything
        away; the gates begin on the grace date at 00:00 UTC. Edit the date under Beta controls.
      </p>
    </div>
  )
}

/** The calendar day (YYYY-MM-DD) of a stored grace value, for display. Falls back to the raw string. */
function graceDay(raw: string): string {
  const bare = raw.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(bare)) return bare
  const ms = Date.parse(bare)
  return Number.isNaN(ms) ? bare : new Date(ms).toISOString().slice(0, 10)
}

function BetaFlagRow({ flagKey, initial, label }: { flagKey: string; initial: boolean; label: string }) {
  const [on, setOn] = useState(initial)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function toggle() {
    const next = !on
    setOn(next)
    setError(null)
    setSaved(false)
    start(async () => {
      const res = await setBetaFlag(flagKey, next)
      if (isError(res)) {
        setOn(!next)
        setError(res.error)
      } else {
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    })
  }

  return (
    <div className="flex items-center justify-between gap-4">
      <span className={`text-sm font-semibold ${on ? 'text-success' : 'text-subtle'}`}>{label}</span>
      <div className="flex items-center gap-3">
        {error && <span className="text-meta text-danger">{error}</span>}
        <Toggle
          checked={on}
          onChange={toggle}
          ariaLabel={`${label} enabled`}
          disabled={pending}
          saveState={pending ? 'saving' : saved ? 'saved' : 'idle'}
        />
      </div>
    </div>
  )
}

/** The days remaining until an ISO date, at UTC day granularity (matches the countdown banner). null when
 *  unset/unparseable/past. Pure display math. */
function daysUntil(iso: string): number | null {
  const raw = iso.trim()
  if (!raw) return null
  const ms = Date.parse(raw)
  if (Number.isNaN(ms)) return null
  const days = Math.ceil((ms - Date.now()) / 86_400_000)
  return days > 0 ? days : 0
}

function BetaEndsAtRow({ initial }: { initial: string }) {
  // Prefill the date input with the calendar day (YYYY-MM-DD) of the stored ISO value.
  const initialDay = (() => {
    const ms = Date.parse(initial)
    return Number.isNaN(ms) ? '' : new Date(ms).toISOString().slice(0, 10)
  })()
  const [value, setValue] = useState(initialDay)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const days = daysUntil(value ? `${value}T00:00:00.000Z` : '')

  function save() {
    setError(null)
    setSaved(false)
    start(async () => {
      const res = await saveBetaEndsAt(value.trim() ? `${value.trim()}T00:00:00.000Z` : '')
      if (isError(res)) setError(res.error)
      else {
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    })
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-2xs font-semibold uppercase tracking-wide text-muted">
          End date
          <input
            type="date"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="rounded-md border border-border bg-canvas px-2 py-1 text-body-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          />
        </label>
        <div className="flex items-center gap-2">
          <SaveCue pending={pending} saved={saved} />
          <Button size="sm" variant="secondary" onClick={save} disabled={pending}>
            Save
          </Button>
          {value.trim() && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setValue('')
                start(async () => {
                  const res = await saveBetaEndsAt('')
                  if (isError(res)) setError(res.error)
                  else {
                    setSaved(true)
                    setTimeout(() => setSaved(false), 2000)
                  }
                })
              }}
              disabled={pending}
            >
              Clear
            </Button>
          )}
        </div>
      </div>
      <p className="text-2xs text-muted">
        {days == null
          ? 'No date set. The countdown banner is hidden.'
          : days === 0
            ? 'The date is here or past. The banner is hidden.'
            : `The banner counts down: ${days} day${days === 1 ? '' : 's'} left. Display only, no access changes.`}
      </p>
      {error && <p className="text-meta text-danger">{error}</p>}
    </div>
  )
}

/** A dollar string -> a clean "$X" / "$X.YY" label (for the helper lines). */
function formatDollars(v: string): string {
  return formatCentsLabel(dollarsToCents(v))
}
function formatCentsLabel(cents: number): string {
  const dollars = cents / 100
  const whole = Number.isInteger(dollars)
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(dollars)
}

// ── Switches: master billing_live (prominent) + per-tier/plan + per-role gamification ─────

// Crew is the only sellable member tier (ADR-878), so it is the only sell switch here. There is
// deliberately NO Supporter row: `tier_supporter_enabled` is inert (memberTierSellable refuses
// regardless of it), and a toggle that changes nothing is worse than no toggle at all.
const TIER_FLAGS: { key: PricingFlagKey; label: string }[] = [
  { key: 'tier_crew_enabled', label: 'Crew' },
]
const PLAN_FLAGS: { key: PricingFlagKey; label: string }[] = [
  { key: 'plan_business_enabled', label: 'Business' },
  { key: 'plan_collective_enabled', label: 'Collective' },
  { key: 'plan_nonprofit_enabled', label: 'Non Profit' },
  { key: 'plan_independent_enabled', label: 'Independent' },
]
const GAMIFICATION_FLAGS: { key: PricingFlagKey; label: string }[] = [
  { key: 'gamification_full_member', label: 'Member (free)' },
  { key: 'gamification_full_crew', label: 'Crew' },
  { key: 'gamification_full_supporter', label: 'Supporter' },
]

function SwitchesSection({ flags }: { flags: Record<PricingFlagKey, boolean> }) {
  return (
    <AdminSection title="Switches" description="The master switch and every plan. All off by default.">
      <FormSection
        title="Billing master switch"
        description="The one switch that turns billing on. While it is off, nothing charges and everyone keeps their current access. Leave it off until Stripe is wired and you are ready to go live."
      >
        <FlagRow flagKey="billing_live" initial={flags.billing_live} onLabel="Billing is ON" offLabel="Billing is OFF" />
      </FormSection>

      <FormSection
        title="Member plans"
        description="Show and sell each member plan. Turning one on here only makes it available once the master switch is on too."
      >
        <div className="space-y-3">
          {TIER_FLAGS.map((f) => (
            <FlagRow key={f.key} flagKey={f.key} initial={flags[f.key]} label={f.label} />
          ))}
        </div>
      </FormSection>

      <FormSection
        title="Space plans"
        description="Show and sell each space plan. Same rule: nothing sells until the master switch is on."
      >
        <div className="space-y-3">
          {PLAN_FLAGS.map((f) => (
            <FlagRow key={f.key} flagKey={f.key} initial={flags[f.key]} label={f.label} />
          ))}
        </div>
        <div className="mt-4 space-y-2 border-t border-border/60 pt-4 text-meta text-subtle">
          <p>
            <span className="font-semibold text-text">Partner</span> is comped, assigned by arrangement with a revenue
            share. Not sold here, so it has no switch.
          </p>
          <p>
            <span className="font-semibold text-text">Free</span> is a usage state within Business, not a separate plan.
            A free Space keeps every tool, capped by usage, and goes Business to lift the caps.
          </p>
        </div>
      </FormSection>

      <FormSection
        title="Full gamification by tier"
        description="Who gets the full game (claim, spend, compete) rather than earn only. By default this follows the plan: free members earn only, paid members get the full loop. Use these to grant or hold it independently."
      >
        <div className="space-y-3">
          {GAMIFICATION_FLAGS.map((f) => (
            <FlagRow key={f.key} flagKey={f.key} initial={flags[f.key]} label={f.label} />
          ))}
        </div>
      </FormSection>
    </AdminSection>
  )
}

function FlagRow({
  flagKey,
  initial,
  label,
  onLabel,
  offLabel,
}: {
  flagKey: string
  initial: boolean
  label?: string
  onLabel?: string
  offLabel?: string
}) {
  const [on, setOn] = useState(initial)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function toggle() {
    const next = !on
    // Turning billing ON is the single most consequential flip in the product: real charges can happen
    // from that moment. Confirm it, matching the house pattern for far smaller destructive actions.
    if (
      flagKey === 'billing_live' &&
      next &&
      !window.confirm('Turn billing ON? Real charges can happen from this moment. Every priced, enabled plan becomes live.')
    ) {
      return
    }
    setOn(next)
    setError(null)
    setSaved(false)
    start(async () => {
      const res = await setPricingFlag(flagKey, next)
      if (isError(res)) {
        setOn(!next)
        setError(res.error)
      } else {
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    })
  }

  return (
    <div className="flex items-center justify-between gap-4">
      <span className={`text-sm font-semibold ${on ? 'text-success' : 'text-subtle'}`}>
        {label ?? (on ? onLabel ?? 'On' : offLabel ?? 'Off')}
      </span>
      <div className="flex items-center gap-3">
        {error && <span className="text-meta text-danger">{error}</span>}
        <Toggle
          checked={on}
          onChange={toggle}
          ariaLabel={`${label ?? flagKey} enabled`}
          disabled={pending}
          saveState={pending ? 'saving' : saved ? 'saved' : 'idle'}
        />
      </div>
    </div>
  )
}

// ── Plans & prices ────────────────────────────────────────────────────────────────────

function PlansSection({ values }: { values: PricingDefaults }) {
  return (
    <AdminSection title="Plans and prices" description="Every price in dollars. Leave an annual price blank for a monthly only plan.">
      {/* CREW HAS NO PRICE FIELD, ON PURPOSE. It is pay-what-you-want, so the only number behind it is
          the floor, and that lives in ONE control: "Member pricing (pay what you want)" in the Catalog
          section above. A second editable `tier.crew` row here is how an operator could set the floor to
          one amount and leave every price display quoting another. This section states what it resolves
          to and sends the operator to the single control. */}
      <FormSection
        title="Member plans"
        description="Member is free. Crew is pay what you want, so it has no fixed price: the member picks any monthly amount at or above your floor and every amount buys the same Crew. Set the floor, the suggested amount, and the presets in Member pricing above."
      >
        <p className="text-body-sm text-muted">
          Crew currently reads <span className="font-semibold text-text">from {formatCents(values.tier.crew.monthly_cents)} a month</span>
          {values.tier.crew.annual_cents ? <> (from {formatCents(values.tier.crew.annual_cents)} a year)</> : null} everywhere it is shown.
        </p>
      </FormSection>

      <FormSection
        title="Space plans"
        description="Space plans are priced in the Catalog section above (Business, Collective, Non Profit, Independent), which is what the checkout charges. This legacy per-plan store is retired from editing here so there is exactly one place to set a Space price."
      >
        <p className="text-body-sm text-muted">
          Edit Business, Collective, Non Profit, and Independent in the Catalog above, then run the
          catalog sync. The member plan (Crew) stays here.
        </p>
      </FormSection>

      <FormSection
        title="Take-rate"
        description="The share Frequency takes on a sale the network sourced, as a percent. A sale to the seller's own audience is always 0%, and tips carry no fee. Crew member is the rate an individual seller pays; the rest are Space plans, and a plan buys the rate down. Independent Spaces are off the network, so their rate stays 0%."
      >
        <TakeRateRow rate={values.take_rate} />
      </FormSection>

      <FormSection
        title="Caps and offers"
        description="The free Vera daily message cap, the free trial length, and how many months an annual plan saves."
      >
        <KnobsRow
          vera={values.vera_free_daily_cap.messages}
          trial={values.trial.days}
          annual={values.annual_discount.months_free}
        />
      </FormSection>
    </AdminSection>
  )
}

function SaveCue({ pending, saved }: { pending: boolean; saved: boolean }) {
  if (pending) return <span className="text-meta text-subtle">Saving…</span>
  if (saved)
    return (
      <span className="inline-flex items-center gap-1 text-meta text-success">
        <Check className="h-3.5 w-3.5" aria-hidden /> Saved
      </span>
    )
  return null
}

// 🔴 THE GENERIC `PriceRow` EDITOR IS GONE, along with the `savePrice` action behind it. It had exactly
// one caller left, the Crew price row, and Crew is pay-what-you-want: its floor is set by the PWYW
// control above and derived everywhere else, so a second editable price for it could only ever produce
// a number the checkout would not honor. The Space plans were already retired from editing here in
// favour of the Catalog. `savePrice` also took an arbitrary settings KEY with no allowlist, so leaving
// it exported would have kept a writable path into any pricing_settings row with no surface using it.

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <label className="flex flex-col gap-1 text-2xs font-semibold uppercase tracking-wide text-muted">
      {label}
      <input
        type="text"
        inputMode="decimal"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls}
      />
    </label>
  )
}

/** The take-rate editor. These six fields are the ones that ACTUALLY CHARGE: `take_rate.network_bps` per
 *  Space tier (what lib/billing/fees.ts spaceTakeRateCents applies) plus the two individual seller rungs,
 *  `member_free_bps` and `member_bps`, which memberTakeRateCents picks between on the payee's real tier.
 *
 *  🔴 The FREE MEMBER field is the reference rate the whole ladder descends from (ADR-914) and the single
 *  most-charged number in the product, since selling is free on every tier. It was absent from this
 *  console until the rung came back; an operator could move every rate except the one most sales use.
 *
 *  It deliberately does NOT edit the legacy flat trio (free_bps / business_bps / nonprofit_bps). That was
 *  the bug this row shipped with: the console wrote those four fields, no charging path read them, and the
 *  write dropped the stored network vector on the way past. An operator was editing numbers that never
 *  reached a charge (fixed ADR-913). Independent is not rendered either: a disconnected Space is off the
 *  network, so its network rate is 0 by definition, and the action preserves whatever is stored.
 *
 *  Percent in, basis points out (8 → 800). */
function TakeRateRow({ rate }: { rate: PricingDefaults['take_rate'] }) {
  const pct = (bps: number) => String(bps / 100)
  const bps = (v: string) => Math.round((Number(v) || 0) * 100)
  const [memberFree, setMemberFree] = useState(pct(rate.member_free_bps))
  const [crew, setCrew] = useState(pct(rate.member_bps))
  const [free, setFree] = useState(pct(rate.network_bps.free))
  const [business, setBusiness] = useState(pct(rate.network_bps.business))
  const [collective, setCollective] = useState(pct(rate.network_bps.collective))
  const [nonprofit, setNonprofit] = useState(pct(rate.network_bps.nonprofit))
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function save() {
    setError(null)
    setSaved(false)
    start(async () => {
      const res = await saveTakeRate({
        member_free_bps: bps(memberFree),
        member_bps: bps(crew),
        network_bps: {
          free: bps(free),
          business: bps(business),
          collective: bps(collective),
          nonprofit: bps(nonprofit),
        },
      })
      if (isError(res)) setError(res.error)
      else {
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Free member %" value={memberFree} onChange={setMemberFree} />
        <Field label="Crew member %" value={crew} onChange={setCrew} />
        <Field label="Free Space %" value={free} onChange={setFree} />
        <Field label="Business %" value={business} onChange={setBusiness} />
        <Field label="Collective %" value={collective} onChange={setCollective} />
        <Field label="Non Profit %" value={nonprofit} onChange={setNonprofit} />
        <div className="flex items-center gap-2">
          <SaveCue pending={pending} saved={saved} />
          <Button size="sm" variant="secondary" onClick={save} disabled={pending}>
            Save
          </Button>
        </div>
      </div>
      {error && <p className="text-meta text-danger">{error}</p>}
    </div>
  )
}

function KnobsRow({ vera, trial, annual }: { vera: number; trial: number; annual: number }) {
  const [v, setV] = useState(String(vera))
  const [t, setT] = useState(String(trial))
  const [a, setA] = useState(String(annual))
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function save() {
    setError(null)
    setSaved(false)
    start(async () => {
      const res = await saveKnobs({
        vera_messages: Number(v) || 0,
        trial_days: Number(t) || 0,
        annual_months_free: Number(a) || 0,
      })
      if (isError(res)) setError(res.error)
      else {
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Vera free / day" value={v} onChange={setV} />
        <Field label="Trial days" value={t} onChange={setT} />
        <Field label="Annual months free" value={a} onChange={setA} />
        <div className="flex items-center gap-2">
          <SaveCue pending={pending} saved={saved} />
          <Button size="sm" variant="secondary" onClick={save} disabled={pending}>
            Save
          </Button>
        </div>
      </div>
      {error && <p className="text-meta text-danger">{error}</p>}
    </div>
  )
}

// ── Feature gates ─────────────────────────────────────────────────────────────────────

const TIER_OPTIONS = ['free', 'crew', 'supporter']
// The space-tier ladder a feature gate ranks on (ADR-552): free < business ~ nonprofit.
const PLAN_OPTIONS = ['free', 'business', 'nonprofit']

function FeatureGatesSection({ gates }: { gates: FeatureGateRow[] }) {
  return (
    <AdminSection
      title="Feature gates"
      description="Which plan each feature needs. These take effect only once the master switch is on. While billing is off, every feature stays available exactly as today."
    >
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 border-b border-border bg-surface-elevated px-4 py-2 text-2xs font-bold uppercase tracking-wide text-muted">
          <span>Feature</span>
          <span>Axis</span>
          <span>Needs</span>
          <span className="text-right">Gate</span>
        </div>
        <div className="divide-y divide-border">
          {gates.map((g) => (
            <GateRow key={g.feature} gate={g} />
          ))}
        </div>
      </div>
    </AdminSection>
  )
}

function prettyFeature(feature: string): string {
  return feature.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function GateRow({ gate }: { gate: FeatureGateRow }) {
  const [min, setMin] = useState(gate.minEntitlement)
  const [enabled, setEnabled] = useState(gate.enabled)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const options = gate.axis === 'plan' ? PLAN_OPTIONS : TIER_OPTIONS

  function save(patch: { minEntitlement?: string; enabled?: boolean }) {
    setError(null)
    setSaved(false)
    start(async () => {
      const res = await saveFeatureGate(gate.feature, patch)
      if (isError(res)) {
        setError(res.error)
        // revert optimistic state on failure
        if (patch.minEntitlement !== undefined) setMin(gate.minEntitlement)
        if (patch.enabled !== undefined) setEnabled(gate.enabled)
      } else {
        setSaved(true)
        setTimeout(() => setSaved(false), 1500)
      }
    })
  }

  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 px-4 py-2.5">
      <div className="min-w-0">
        <span className="text-body-sm font-semibold text-text">{prettyFeature(gate.feature)}</span>
        {gate.overridden && (
          <StatusChip tone="info" size="sm">
            customized
          </StatusChip>
        )}
        <p className="truncate text-2xs text-muted">{gate.feature}</p>
      </div>
      <span className="text-2xs font-semibold uppercase tracking-wide text-muted">{gate.axis}</span>
      <select
        value={min}
        disabled={pending}
        onChange={(e) => {
          setMin(e.target.value)
          save({ minEntitlement: e.target.value })
        }}
        className="rounded-md border border-border bg-canvas px-2 py-1 text-body-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <div className="flex items-center justify-end gap-2">
        <SaveCue pending={pending} saved={saved} />
        <Toggle
          checked={enabled}
          onChange={(next) => {
            setEnabled(next)
            save({ enabled: next })
          }}
          ariaLabel={`${gate.feature} gate enabled`}
          disabled={pending}
        />
      </div>
      {error && <p className="col-span-4 text-meta text-danger">{error}</p>}
    </div>
  )
}

// ── Founder lock: REMOVED ─────────────────────────────────────────────────────────────
// The "Founder price lock" console section is gone with the founding-member purchase path (owner
// directive, 2026-07-30). It set profiles.is_founding_member and promised the operator that the lock
// would be "honored at checkout when billing goes live" — and after the PWYW rework it would not have
// been: createMembershipCheckout charges the amount the member picks and reads no locked price. A
// control that quietly stopped doing what its own description says is worse than no control. The
// grandfathered SPACE rates (founding_members rows, lib/founding/status.ts) are a different mechanism
// and are untouched.

// ── Stripe status + product sync (Pricing P2) ─────────────────────────────────────────────

function StripeStatusSection({ stripe }: { stripe: PricingConsoleData['stripe'] }) {
  return (
    <AdminSection
      title="Stripe products"
      description="Connect Stripe, then sync your prices to Stripe products. Syncing is safe while billing is off: it only creates the products and prices, it does not charge anyone."
    >
      <FormSection title="Status" description="Whether Stripe is connected and billing is live.">
        <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
          <dl className="grid gap-3 sm:grid-cols-3">
            <StatusItem label="Stripe keys" ok={stripe.configured} okText="Configured" offText="Not configured" />
            <StatusItem label="Master switch" ok={stripe.masterLive} okText="On" offText="Off" />
            <StatusItem label="Billing" ok={stripe.live} okText="Live" offText="Off" />
          </dl>
          {!stripe.configured && (
            <p className="mt-4 text-body-sm text-muted">
              Stripe is not connected. Set the Stripe env keys to enable syncing. Until then, nothing charges and
              everyone keeps their current access.
            </p>
          )}
        </div>
      </FormSection>

      <FormSection
        title="Sync the catalog to Stripe"
        description="Create or update one Stripe product per catalog item (the Business base, the AI Engine add-on, and the Non Profit seat), each with its list and founding prices for monthly and yearly. Run this after you change a catalog price. It is idempotent and safe while billing is off: it only creates products and prices, it never charges anyone."
      >
        <SyncRow
          configured={stripe.configured}
          syncedCount={stripe.catalogSyncedCount}
          total={stripe.catalogPrices.length}
          action="catalog"
          label="Sync the catalog to Stripe"
        />
      </FormSection>

      <FormSection title="Catalog prices" description="The Stripe price each catalog key resolves to. The founding price is what a member is charged; the list price is the anchor shown beneath it.">
        <PriceMapTable prices={stripe.catalogPrices} foundingLabel />
      </FormSection>

      <FormSection
        title="Legacy prices (kept resolvable)"
        description="The pre-ladder per-plan prices. These are no longer sold but are kept so a price-locked member still resolves. Sync the legacy products only if you maintain a legacy price-locked member."
      >
        <SyncRow
          configured={stripe.configured}
          syncedCount={stripe.syncedCount}
          total={stripe.prices.length}
          action="legacy"
          label="Sync legacy products"
        />
        <div className="mt-3">
          <PriceMapTable prices={stripe.prices} />
        </div>
      </FormSection>
    </AdminSection>
  )
}

function SyncRow({
  configured,
  syncedCount,
  total,
  action = 'legacy',
  label,
}: {
  configured: boolean
  syncedCount: number
  total: number
  action?: 'catalog' | 'legacy'
  label?: string
}) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const btnLabel = label ?? (action === 'catalog' ? 'Sync the catalog to Stripe' : 'Sync legacy products')

  function sync() {
    // This writes real Products + Prices to the live Stripe account. Idempotent and safe while billing
    // is off, but still an external mutation on click, so confirm it like every other write of this weight.
    if (!window.confirm('Create or update Stripe products and prices now? This writes to your live Stripe account.')) {
      return
    }
    setError(null)
    setDone(null)
    start(async () => {
      const res = action === 'catalog' ? await syncStripeCatalog() : await syncStripeProducts()
      if (isError(res)) setError(res.error)
      else {
        const { synced, errors } = res.data
        setDone(
          errors.length > 0
            ? `Synced ${synced} price${synced === 1 ? '' : 's'}. ${errors.length} had a problem: ${errors[0].message}`
            : `Synced ${synced} price${synced === 1 ? '' : 's'}.`,
        )
      }
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="secondary" onClick={sync} disabled={pending || !configured}>
          {pending ? 'Syncing…' : btnLabel}
        </Button>
        <StatusChip tone={syncedCount === total && total > 0 ? 'success' : 'neutral'}>
          {syncedCount} of {total} synced
        </StatusChip>
      </div>
      {!configured && (
        <p className="text-meta text-subtle">Connect Stripe first. Syncing is disabled until the env keys are set.</p>
      )}
      {done && <p className="text-meta text-success">{done}</p>}
      {error && <p className="text-meta text-danger">{error}</p>}
    </div>
  )
}

function PriceMapTable({ prices, foundingLabel }: { prices: PricingConsoleData['stripe']['prices']; foundingLabel?: boolean }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-border bg-surface-elevated px-4 py-2 text-2xs font-bold uppercase tracking-wide text-muted">
        <span>Key</span>
        <span>Price id</span>
        <span className="text-right">State</span>
      </div>
      <div className="divide-y divide-border">
        {prices.map((p) => (
          <div key={p.key} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-2 text-body-sm">
            <span className="font-mono text-meta text-text">
              {p.key}
              {p.founder && (
                <StatusChip tone="info" size="sm">
                  {foundingLabel ? 'founding' : 'founder'}
                </StatusChip>
              )}
            </span>
            <span className="truncate font-mono text-2xs text-muted">{p.priceId ?? '—'}</span>
            <span className="text-right">
              <StatusChip tone={p.synced ? 'success' : 'neutral'} size="sm">
                {p.synced ? 'synced' : 'not synced'}
              </StatusChip>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** The BETA GRACE date editor (ADR-874): the day the paid feature gates start blocking. Mirrors
 *  BetaEndsAtRow's shape (date input, Save, Clear), but this one is NOT display-only, so its helper copy
 *  says plainly what changes. Blank = no grace window = the gates follow the master billing switch. */
function BetaGraceRow({ initial }: { initial: string | null }) {
  const initialDay = (() => {
    const raw = (initial ?? '').trim()
    if (!raw) return ''
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
    const ms = Date.parse(raw)
    return Number.isNaN(ms) ? '' : new Date(ms).toISOString().slice(0, 10)
  })()
  const [value, setValue] = useState(initialDay)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function persist(next: string) {
    setError(null)
    setSaved(false)
    start(async () => {
      const res = await saveBetaGrace(next)
      if (isError(res)) setError(res.error)
      else {
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    })
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-2xs font-semibold uppercase tracking-wide text-muted">
          Gates start
          <input
            type="date"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="rounded-md border border-border bg-canvas px-2 py-1 text-body-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          />
        </label>
        <div className="flex items-center gap-2">
          <SaveCue pending={pending} saved={saved} />
          <Button size="sm" variant="secondary" onClick={() => persist(value.trim())} disabled={pending}>
            Save
          </Button>
          {value.trim() && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setValue('')
                persist('')
              }}
              disabled={pending}
            >
              Clear
            </Button>
          )}
        </div>
      </div>
      <p className="text-2xs text-muted">
        {value.trim()
          ? `Paid features stay open to everyone through the day before, and the gates begin on ${value.trim()} at 00:00 UTC.`
          : 'No grace window. The paid gates follow the master billing switch, so they start blocking as soon as billing goes live.'}
      </p>
      {error && <p className="text-meta text-danger">{error}</p>}
    </div>
  )
}

function StatusItem({ label, ok, okText, offText }: { label: string; ok: boolean; okText: string; offText: string }) {
  return (
    <div>
      <dt className="text-2xs font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-1">
        <StatusChip tone={ok ? 'success' : 'neutral'}>{ok ? okText : offText}</StatusChip>
      </dd>
    </div>
  )
}
