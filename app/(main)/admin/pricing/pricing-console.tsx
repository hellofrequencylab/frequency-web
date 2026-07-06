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
import type { TierPrice, PricingDefaults, PricingFlagKey } from '@/lib/pricing/settings'
import type { CatalogConfig, ResolvedCatalogItem } from '@/lib/pricing/catalog-config'
import type { AddonKey } from '@/lib/pricing/plans'
import { addonKeyForCatalogItem } from '@/lib/billing/pricing-keys'
import {
  setPricingFlag,
  savePrice,
  saveTakeRate,
  saveKnobs,
  saveFeatureGate,
  setFoundingMember,
  syncStripeProducts,
  syncStripeCatalog,
  saveCatalogItem,
  saveSeatConfig,
  savePwywConfig,
  saveAddonEnabled,
} from './actions'

// The /admin/pricing operator console (ADR-362/463, docs/PRICING.md). EVERYTHING SHIPS OFF: the master
// switch defaults off, no tier/plan is enabled, and no value here charges anyone. Sections: the
// switches (master prominent), the clean catalog editor (Pro base + add-ons + seat + org, with the
// list anchor and the founding price), the seat + Supporter PWYW config, the legacy plans & prices, the
// feature-gate matrix, the founder lock, and the Stripe status + catalog sync. Plain operator copy, no
// em dashes (docs/CONTENT-VOICE.md).

const inputCls =
  'w-28 rounded-md border border-border bg-canvas px-2 py-1 text-sm text-text text-right tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30'

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

      <SwitchesSection flags={data.flags} />
      <CatalogSection catalog={data.catalog} />
      <PlansSection values={data.values} />
      <FeatureGatesSection gates={data.gates} />
      <FounderSection />
      <StripeStatusSection stripe={data.stripe} />
    </>
  )
}

// ── The clean catalog editor (Pro base + add-ons + seat + org · ADR-463) ───────────────────────────
// Each item shows the LIST anchor and the lower FOUNDING price the member is charged, with the monthly
// amount the headline and the yearly derived two months free (overridable). Plus the per-add-on enable
// toggles, the seat bundled floor, and the Supporter PWYW config.

function CatalogSection({ catalog }: { catalog: CatalogConfig }) {
  const byKey = Object.fromEntries(catalog.items.map((i) => [i.key, i])) as Record<string, ResolvedCatalogItem>
  const addonItems = catalog.items.filter((i) => addonKeyForCatalogItem(i.key) !== null)
  return (
    <AdminSection
      title="Catalog"
      description="The Business base, the AI Engine add-on, and the Non Profit seat. Each price shows a list anchor and a lower founding price. The founding price is what a member is charged today; the list price is the anchor it sits under. Set the monthly amounts; the yearly is two months free unless you override it."
    >
      <FormSection
        title="Business base"
        description="The single paid base (the full-depth tier). CRM, marketing, team roles, and branding all come with Business. Free-vs-paid is a usage state within Business, not a separate plan."
      >
        <div className="space-y-4">
          <CatalogItemRow item={byKey.business_base} />
        </div>
      </FormSection>

      {/* TODO(ADR-472 surfaces): the catalog editor still lists add-ons generically; only AI Engine
          remains a metered add-on. The full Tier x Mode console rebuild lands in the surface PR. */}
      <FormSection
        title="AI Engine (metered add-on)"
        description="The sole cross-tier add-on. Toggle it off here to hide it from the picker entirely. It is usage-priced and available on any paid tier."
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
        description="The Non Profit licensed seat (per seat). Verified 501(c)(3) organizations get the full Business depth, discounted."
      >
        <div className="space-y-4">
          <CatalogItemRow item={byKey.nonprofit_seat} />
        </div>
      </FormSection>

      <FormSection
        title="Seats"
        description="The minimum licensed seats a seat plan bills. A Non Profit pays for at least this many seats even with fewer members."
      >
        <SeatConfigRow bundledFloor={catalog.seat.bundledFloor} seatItem={byKey.nonprofit_seat} />
      </FormSection>

      <FormSection
        title="Supporter (pay what you want)"
        description="A Crew member can add a Supporter contribution on top of membership. Set the minimum they can give and the amount you suggest."
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
  const [yearlyList, setYearlyList] = useState(item.yearlyListCents == null ? '' : centsToDollars(item.yearlyListCents))
  const [yearlyFounding, setYearlyFounding] = useState(
    item.yearlyFoundingCents == null ? '' : centsToDollars(item.yearlyFoundingCents),
  )
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  // The yearly we would charge for display: the explicit override, else the derived two months free.
  const derivedYearlyFounding =
    yearlyFounding.trim() === '' ? Math.round(dollarsToCents(monthlyFounding) * 10) : dollarsToCents(yearlyFounding)

  function save() {
    setError(null)
    setSaved(false)
    start(async () => {
      const res = await saveCatalogItem(item.key, {
        monthlyListCents: dollarsToCents(monthlyList),
        monthlyFoundingCents: dollarsToCents(monthlyFounding),
        yearlyListCents: yearlyList.trim() === '' ? null : dollarsToCents(yearlyList),
        yearlyFoundingCents: yearlyFounding.trim() === '' ? null : dollarsToCents(yearlyFounding),
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
          <span className="text-sm font-semibold text-text">{item.label}</span>
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
        <Field label="Founding $ / mo" value={monthlyFounding} onChange={setMonthlyFounding} />
        <Field label="List $ / yr" value={yearlyList} onChange={setYearlyList} placeholder="2 mo free" />
        <Field label="Founding $ / yr" value={yearlyFounding} onChange={setYearlyFounding} placeholder="2 mo free" />
        <div className="flex items-center gap-2">
          <SaveCue pending={pending} saved={saved} />
          <Button size="sm" variant="secondary" onClick={save} disabled={pending}>
            Save
          </Button>
        </div>
      </div>
      <p className="text-2xs text-subtle">
        Member is charged {centsToDollars(dollarsToCents(monthlyFounding)) && formatDollars(monthlyFounding)} a month
        {' '}({formatDollars(monthlyList)} list), or {formatCentsLabel(derivedYearlyFounding)} a year.
      </p>
      {error && <p className="text-xs text-danger">{error}</p>}
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
      <span className={`text-2xs font-semibold uppercase tracking-wide ${on ? 'text-success' : 'text-subtle'}`}>
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
      <p className="text-2xs text-subtle">
        Each seat is {formatCentsLabel(seatItem.monthlyFoundingCents)} a month ({formatCentsLabel(seatItem.monthlyListCents)}{' '}
        list). The floor bills at least {floor || '1'} seats.
      </p>
      {error && <p className="text-xs text-danger">{error}</p>}
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
      <p className="text-2xs text-subtle">The suggested amount is raised to the minimum if you set it lower.</p>
      {error && <p className="text-xs text-danger">{error}</p>}
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

const TIER_FLAGS: { key: PricingFlagKey; label: string }[] = [
  { key: 'tier_crew_enabled', label: 'Crew' },
  { key: 'tier_supporter_enabled', label: 'Supporter' },
]
const PLAN_FLAGS: { key: PricingFlagKey; label: string }[] = [
  { key: 'plan_business_enabled', label: 'Business' },
  { key: 'plan_nonprofit_enabled', label: 'Non Profit' },
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
        <div className="mt-4 space-y-2 border-t border-border/60 pt-4 text-xs text-subtle">
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
        {error && <span className="text-xs text-danger">{error}</span>}
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

// Crew shows a MONTHLY list anchor (the founding price sits under it, ADR-463). Supporter is retired as
// a tier (now the PWYW badge) but its row stays editable so a legacy price-locked member still resolves.
const TIER_PRICE_ROWS: { key: string; label: string; list?: boolean }[] = [
  { key: 'tier.crew', label: 'Crew', list: true },
  { key: 'tier.supporter', label: 'Supporter (retired tier)' },
]
const PLAN_PRICE_ROWS: { key: string; label: string; setup?: boolean }[] = [
  { key: 'plan.business', label: 'Business' },
  { key: 'plan.nonprofit', label: 'Non Profit' },
]

function PlansSection({ values }: { values: PricingDefaults }) {
  return (
    <AdminSection title="Plans and prices" description="Every price in dollars. Leave an annual price blank for a monthly only plan.">
      <FormSection title="Member plans" description="The personal membership tiers.">
        <div className="space-y-4">
          {TIER_PRICE_ROWS.map((r) => (
            <PriceRow
              key={r.key}
              settingKey={r.key}
              label={r.label}
              showList={r.list}
              price={values.tier[r.key.split('.')[1] as 'crew' | 'supporter']}
            />
          ))}
        </div>
      </FormSection>

      <FormSection title="Space plans" description="The plans a space (Business, Non Profit) pays for.">
        <div className="space-y-4">
          {PLAN_PRICE_ROWS.map((r) => (
            <PriceRow
              key={r.key}
              settingKey={r.key}
              label={r.label}
              showSetup={r.setup}
              price={values.plan[r.key.split('.')[1] as 'business' | 'nonprofit']}
            />
          ))}
        </div>
      </FormSection>

      <FormSection
        title="Take-rate"
        description="The platform share of a space's sales, as a percent. Free usage pays the higher rate; a paying Business and Non Profit pay the lower one."
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
  if (pending) return <span className="text-xs text-subtle">Saving…</span>
  if (saved)
    return (
      <span className="inline-flex items-center gap-1 text-xs text-success">
        <Check className="h-3.5 w-3.5" aria-hidden /> Saved
      </span>
    )
  return null
}

function PriceRow({
  settingKey,
  label,
  price,
  showSetup,
  showList,
}: {
  settingKey: string
  label: string
  price: TierPrice
  showSetup?: boolean
  /** Show a MONTHLY list-anchor field (the founding monthly sits under it, ADR-463). */
  showList?: boolean
}) {
  const [monthly, setMonthly] = useState(centsToDollars(price.monthly_cents))
  const [annual, setAnnual] = useState(centsToDollars(price.annual_cents))
  const [setup, setSetup] = useState(centsToDollars(price.setup_cents))
  const [list, setList] = useState(centsToDollars(price.list_cents))
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function save() {
    setError(null)
    setSaved(false)
    start(async () => {
      const next: TierPrice = {
        monthly_cents: dollarsToCents(monthly),
        annual_cents: annual.trim() === '' ? null : dollarsToCents(annual),
      }
      if (showSetup) next.setup_cents = setup.trim() === '' ? 0 : dollarsToCents(setup)
      if (showList) next.list_cents = list.trim() === '' ? 0 : dollarsToCents(list)
      const res = await savePrice(settingKey, next)
      if (isError(res)) setError(res.error)
      else {
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    })
  }

  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border/60 pb-4 last:border-0 last:pb-0">
      <div className="text-sm font-semibold text-text">{label}</div>
      <div className="flex flex-wrap items-end gap-3">
        {showList && <Field label="List $ / mo" value={list} onChange={setList} placeholder="no anchor" />}
        <Field label={showList ? 'Founding $ / mo' : 'Monthly $'} value={monthly} onChange={setMonthly} />
        <Field label="Annual $" value={annual} onChange={setAnnual} placeholder="monthly only" />
        {showSetup && <Field label="Setup $" value={setup} onChange={setSetup} />}
        <div className="flex items-center gap-2">
          <SaveCue pending={pending} saved={saved} />
          <Button size="sm" variant="secondary" onClick={save} disabled={pending}>
            Save
          </Button>
        </div>
      </div>
      {error && <p className="w-full text-xs text-danger">{error}</p>}
    </div>
  )
}

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
    <label className="flex flex-col gap-1 text-2xs font-semibold uppercase tracking-wide text-subtle">
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

function TakeRateRow({ rate }: { rate: PricingDefaults['take_rate'] }) {
  const [f, setF] = useState(String(rate.free_bps / 100))
  const [b, setB] = useState(String(rate.business_bps / 100))
  const [n, setN] = useState(String(rate.nonprofit_bps / 100))
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function save() {
    setError(null)
    setSaved(false)
    start(async () => {
      const res = await saveTakeRate({
        free_bps: Math.round((Number(f) || 0) * 100),
        business_bps: Math.round((Number(b) || 0) * 100),
        nonprofit_bps: Math.round((Number(n) || 0) * 100),
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
        <Field label="Free %" value={f} onChange={setF} />
        <Field label="Business %" value={b} onChange={setB} />
        <Field label="Non Profit %" value={n} onChange={setN} />
        <div className="flex items-center gap-2">
          <SaveCue pending={pending} saved={saved} />
          <Button size="sm" variant="secondary" onClick={save} disabled={pending}>
            Save
          </Button>
        </div>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
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
      {error && <p className="text-xs text-danger">{error}</p>}
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
        <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 border-b border-border bg-surface-elevated px-4 py-2 text-2xs font-bold uppercase tracking-wide text-subtle">
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
        <span className="text-sm font-semibold text-text">{prettyFeature(gate.feature)}</span>
        {gate.overridden && (
          <StatusChip tone="info" size="sm">
            customized
          </StatusChip>
        )}
        <p className="truncate text-2xs text-subtle">{gate.feature}</p>
      </div>
      <span className="text-2xs font-semibold uppercase tracking-wide text-subtle">{gate.axis}</span>
      <select
        value={min}
        disabled={pending}
        onChange={(e) => {
          setMin(e.target.value)
          save({ minEntitlement: e.target.value })
        }}
        className="rounded-md border border-border bg-canvas px-2 py-1 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
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
      {error && <p className="col-span-4 text-xs text-danger">{error}</p>}
    </div>
  )
}

// ── Founder lock ──────────────────────────────────────────────────────────────────────

function FounderSection() {
  const [id, setId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function set(value: boolean) {
    setError(null)
    setDone(null)
    start(async () => {
      const res = await setFoundingMember(id, value)
      if (isError(res)) setError(res.error)
      else setDone(value ? 'Marked as a founding member.' : 'Founding member lock removed.')
    })
  }

  return (
    <AdminSection
      title="Founding members"
      description="Lock a member to their current price. This is a reference for now and is honored at checkout when billing goes live."
    >
      <FormSection
        title="Founder price lock"
        description="Paste a member id to set or clear their founding-member lock. The locked price is recorded and applied at checkout in a later phase."
      >
        <div className="space-y-3">
          <input
            type="text"
            value={id}
            placeholder="member profile id"
            onChange={(e) => setId(e.target.value)}
            className="w-full rounded-md border border-border bg-canvas px-3 py-2 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          />
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => set(true)} disabled={pending || !id.trim()}>
              Mark founding
            </Button>
            <Button size="sm" variant="ghost" onClick={() => set(false)} disabled={pending || !id.trim()}>
              Remove lock
            </Button>
          </div>
          {done && <p className="text-xs text-success">{done}</p>}
          {error && <p className="text-xs text-danger">{error}</p>}
        </div>
      </FormSection>
    </AdminSection>
  )
}

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
            <p className="mt-4 text-sm text-muted">
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
        <p className="text-xs text-subtle">Connect Stripe first. Syncing is disabled until the env keys are set.</p>
      )}
      {done && <p className="text-xs text-success">{done}</p>}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  )
}

function PriceMapTable({ prices, foundingLabel }: { prices: PricingConsoleData['stripe']['prices']; foundingLabel?: boolean }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-border bg-surface-elevated px-4 py-2 text-2xs font-bold uppercase tracking-wide text-subtle">
        <span>Key</span>
        <span>Price id</span>
        <span className="text-right">State</span>
      </div>
      <div className="divide-y divide-border">
        {prices.map((p) => (
          <div key={p.key} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-2 text-sm">
            <span className="font-mono text-xs text-text">
              {p.key}
              {p.founder && (
                <StatusChip tone="info" size="sm">
                  {foundingLabel ? 'founding' : 'founder'}
                </StatusChip>
              )}
            </span>
            <span className="truncate font-mono text-2xs text-subtle">{p.priceId ?? '—'}</span>
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

function StatusItem({ label, ok, okText, offText }: { label: string; ok: boolean; okText: string; offText: string }) {
  return (
    <div>
      <dt className="text-2xs font-semibold uppercase tracking-wide text-subtle">{label}</dt>
      <dd className="mt-1">
        <StatusChip tone={ok ? 'success' : 'neutral'}>{ok ? okText : offText}</StatusChip>
      </dd>
    </div>
  )
}
