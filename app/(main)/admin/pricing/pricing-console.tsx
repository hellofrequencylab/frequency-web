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
import {
  setPricingFlag,
  savePrice,
  saveTakeRate,
  saveKnobs,
  saveFeatureGate,
  setFoundingMember,
  syncStripeProducts,
} from './actions'

// The /admin/pricing operator console (ADR-362, docs/PRICING.md). EVERYTHING SHIPS OFF: the master
// switch defaults off, no tier/plan is enabled, and no value here charges anyone. Sections: the
// switches (master prominent), plans & prices, the feature-gate matrix, the founder lock, and a
// read-only Stripe status. Plain operator copy, no em dashes (docs/CONTENT-VOICE.md).

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
      {/* The OFF banner sets the whole page's frame: nothing is live. */}
      <Banner tone={data.stripe.live ? 'warning' : 'info'} title={data.stripe.live ? 'Billing is LIVE' : 'Billing is OFF'}>
        {data.stripe.live
          ? 'The master switch is on and Stripe is configured. Charges can happen. Turn the master switch off to stop all billing.'
          : 'Nothing charges. The master switch is off, so members and spaces keep their current access exactly as today. Editing values here is safe.'}
      </Banner>

      <SwitchesSection flags={data.flags} />
      <PlansSection values={data.values} />
      <FeatureGatesSection gates={data.gates} />
      <FounderSection />
      <StripeStatusSection stripe={data.stripe} />
    </>
  )
}

// ── Switches: master billing_live (prominent) + per-tier/plan + per-role gamification ─────

const TIER_FLAGS: { key: PricingFlagKey; label: string }[] = [
  { key: 'tier_crew_enabled', label: 'Crew' },
  { key: 'tier_supporter_enabled', label: 'Supporter' },
]
const PLAN_FLAGS: { key: PricingFlagKey; label: string }[] = [
  { key: 'plan_practitioner_enabled', label: 'Practitioner' },
  { key: 'plan_business_enabled', label: 'Business' },
  { key: 'plan_organization_enabled', label: 'Organization' },
  { key: 'plan_whitelabel_enabled', label: 'White-label' },
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

const TIER_PRICE_ROWS: { key: string; label: string }[] = [
  { key: 'tier.crew', label: 'Crew' },
  { key: 'tier.supporter', label: 'Supporter' },
]
const PLAN_PRICE_ROWS: { key: string; label: string; setup?: boolean }[] = [
  { key: 'plan.practitioner', label: 'Practitioner' },
  { key: 'plan.business', label: 'Business' },
  { key: 'plan.organization', label: 'Organization' },
  { key: 'plan.whitelabel', label: 'White-label', setup: true },
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
              price={values.tier[r.key.split('.')[1] as 'crew' | 'supporter']}
            />
          ))}
        </div>
      </FormSection>

      <FormSection title="Space plans" description="The plans a space (practitioner, business, organization) pays for.">
        <div className="space-y-4">
          {PLAN_PRICE_ROWS.map((r) => (
            <PriceRow
              key={r.key}
              settingKey={r.key}
              label={r.label}
              showSetup={r.setup}
              price={values.plan[r.key.split('.')[1] as 'practitioner' | 'business' | 'organization' | 'whitelabel']}
            />
          ))}
        </div>
      </FormSection>

      <FormSection title="Take-rate" description="The platform share of a space's sales, as a percent.">
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
}: {
  settingKey: string
  label: string
  price: TierPrice
  showSetup?: boolean
}) {
  const [monthly, setMonthly] = useState(centsToDollars(price.monthly_cents))
  const [annual, setAnnual] = useState(centsToDollars(price.annual_cents))
  const [setup, setSetup] = useState(centsToDollars(price.setup_cents))
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
        <Field label="Monthly $" value={monthly} onChange={setMonthly} />
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
  const [p, setP] = useState(String(rate.practitioner_bps / 100))
  const [b, setB] = useState(String(rate.business_bps / 100))
  const [o, setO] = useState(String(rate.organization_bps / 100))
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function save() {
    setError(null)
    setSaved(false)
    start(async () => {
      const res = await saveTakeRate({
        practitioner_bps: Math.round((Number(p) || 0) * 100),
        business_bps: Math.round((Number(b) || 0) * 100),
        organization_bps: Math.round((Number(o) || 0) * 100),
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
        <Field label="Practitioner %" value={p} onChange={setP} />
        <Field label="Business %" value={b} onChange={setB} />
        <Field label="Organization %" value={o} onChange={setO} />
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
const PLAN_OPTIONS = ['free', 'practitioner', 'business', 'organization', 'whitelabel']

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
        title="Sync products to Stripe"
        description="Create or update one Stripe product per plan and a price for each billing period from the values above. Run this after you change a price. It is idempotent, so running it again is safe."
      >
        <SyncRow configured={stripe.configured} syncedCount={stripe.syncedCount} total={stripe.prices.length} />
      </FormSection>

      <FormSection title="Resolved prices" description="The Stripe price each plan resolves to. Founder prices are kept for price-locked members and are not shown publicly.">
        <PriceMapTable prices={stripe.prices} />
      </FormSection>
    </AdminSection>
  )
}

function SyncRow({ configured, syncedCount, total }: { configured: boolean; syncedCount: number; total: number }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  function sync() {
    setError(null)
    setDone(null)
    start(async () => {
      const res = await syncStripeProducts()
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
          {pending ? 'Syncing…' : 'Sync products to Stripe'}
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

function PriceMapTable({ prices }: { prices: PricingConsoleData['stripe']['prices'] }) {
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
                  founder
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
