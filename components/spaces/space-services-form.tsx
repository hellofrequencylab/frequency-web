'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Eye, EyeOff, Loader2, Plus, Trash2 } from 'lucide-react'
import { isError } from '@/lib/action-result'
import { setSpaceServices } from '@/app/(main)/spaces/[slug]/manage/layout/actions'
import {
  formatServicePrice,
  formatServiceDuration,
  formatServiceDeposit,
  formatServicePackage,
  type ServicePriceModel,
  type ServiceRecurring,
  type ServiceVisibility,
  type SpaceOffering,
} from '@/lib/spaces/profile-data'

// THE SERVICES EDITOR — the operator's CRUD surface for their storefront store items. Each service
// carries its full pricing (fixed / from / free / contact, plus deposit, duration, recurring cadence,
// multi-session package, and a pay-what-you-can sliding scale) and a visibility toggle: LISTED shows
// on the public space storefront, PRIVATE is reachable by direct link only. Saved through the
// owner-gated setSpaceServices action (re-normalized server-side), so this client is fast inline
// feedback only. DAWN semantic tokens only (no hex), sentence-case copy, no em dashes (CONTENT-VOICE §10).

/** The editable row state. Numeric inputs are held as strings so a field can be blank while typing. */
interface Row {
  title: string
  blurb: string
  priceModel: ServicePriceModel
  price: string
  currency: string
  durationMinutes: string
  deposit: string
  recurring: ServiceRecurring
  packageCount: string
  slidingScaleMin: string
  slidingScaleMax: string
  visibility: ServiceVisibility
}

const PRICE_MODEL_OPTIONS: { value: ServicePriceModel; label: string }[] = [
  { value: 'fixed', label: 'Fixed price' },
  { value: 'from', label: 'Starting price' },
  { value: 'free', label: 'Free' },
  { value: 'contact', label: 'Contact for pricing' },
]

const RECURRING_OPTIONS: { value: ServiceRecurring; label: string }[] = [
  { value: 'once', label: 'One time' },
  { value: 'weekly', label: 'Per week' },
  { value: 'monthly', label: 'Per month' },
]

const inputClass =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-subtle focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60'
const labelClass = 'mb-1 block text-2xs font-semibold text-subtle'

/** Seed an editable row from a stored service (numbers become strings; defaults fill the gaps). */
function toRow(o: SpaceOffering): Row {
  return {
    title: o.title,
    blurb: o.blurb ?? '',
    priceModel: o.priceModel ?? 'fixed',
    price: o.price != null ? String(o.price) : '',
    currency: o.currency ?? 'USD',
    durationMinutes: o.durationMinutes != null ? String(o.durationMinutes) : '',
    deposit: o.deposit != null ? String(o.deposit) : '',
    recurring: o.recurring ?? 'once',
    packageCount: o.packageCount != null ? String(o.packageCount) : '',
    slidingScaleMin: o.slidingScaleMin != null ? String(o.slidingScaleMin) : '',
    slidingScaleMax: o.slidingScaleMax != null ? String(o.slidingScaleMax) : '',
    visibility: o.visibility ?? 'listed',
  }
}

const EMPTY_ROW: Row = {
  title: '',
  blurb: '',
  priceModel: 'fixed',
  price: '',
  currency: 'USD',
  durationMinutes: '',
  deposit: '',
  recurring: 'once',
  packageCount: '',
  slidingScaleMin: '',
  slidingScaleMax: '',
  visibility: 'listed',
}

/** A non-negative number from a string field, else undefined. */
function numOr(v: string): number | undefined {
  const s = v.trim()
  if (s === '') return undefined
  const n = Number(s)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

/** Build a clean SpaceOffering from a row for saving + live preview (server re-normalizes on save). */
function toService(r: Row): SpaceOffering {
  const out: SpaceOffering = { title: r.title.trim() }
  const blurb = r.blurb.trim()
  if (blurb) out.blurb = blurb
  out.priceModel = r.priceModel
  const currency = r.currency.trim().toUpperCase()
  if (currency) out.currency = currency
  if (r.priceModel === 'fixed' || r.priceModel === 'from') {
    const price = numOr(r.price)
    if (price !== undefined) out.price = price
    const min = numOr(r.slidingScaleMin)
    const max = numOr(r.slidingScaleMax)
    if (min !== undefined && max !== undefined) {
      out.slidingScaleMin = min
      out.slidingScaleMax = max
    }
    if (r.recurring !== 'once') out.recurring = r.recurring
  }
  const duration = numOr(r.durationMinutes)
  if (duration !== undefined) out.durationMinutes = Math.round(duration)
  const deposit = numOr(r.deposit)
  if (deposit !== undefined) out.deposit = deposit
  const pkg = numOr(r.packageCount)
  if (pkg !== undefined) out.packageCount = Math.round(pkg)
  out.visibility = r.visibility
  return out
}

export function SpaceServicesForm({
  slug,
  initial,
  readOnly = false,
}: {
  slug: string
  /** The Space's current services catalog (from the central profile data). */
  initial: SpaceOffering[]
  readOnly?: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [rows, setRows] = useState<Row[]>(() => initial.map(toRow))

  const set = (i: number, patch: Partial<Row>) => {
    setStatus('idle')
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  }
  const addRow = () => {
    setStatus('idle')
    setRows((rs) => [...rs, { ...EMPTY_ROW }])
  }
  const removeRow = (i: number) => {
    setStatus('idle')
    setRows((rs) => rs.filter((_, j) => j !== i))
  }

  function save() {
    if (pending || readOnly) return
    const services = rows.map(toService).filter((s) => s.title)
    start(async () => {
      const result = await setSpaceServices(slug, services)
      if (isError(result)) {
        setStatus('error')
        return
      }
      setStatus('saved')
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">
          The services you offer, with their pricing. Listed services show on your space page storefront;
          private ones stay hidden and open only from a direct link.
        </p>
        {!readOnly && (
          <button
            type="button"
            onClick={addRow}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-text transition-colors hover:bg-surface-elevated"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add service
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-surface/60 px-4 py-8 text-center text-sm text-subtle">
          No services yet. Add one to start your storefront.
        </p>
      ) : (
        <ul className="space-y-4">
          {rows.map((r, i) => (
            <ServiceRow
              key={i}
              index={i}
              row={r}
              readOnly={readOnly}
              onChange={(patch) => set(i, patch)}
              onRemove={() => removeRow(i)}
            />
          ))}
        </ul>
      )}

      {!readOnly && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-70"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : status === 'saved' ? (
              <Check className="h-4 w-4" aria-hidden />
            ) : null}
            {pending ? 'Saving' : status === 'saved' ? 'Saved' : 'Save services'}
          </button>
          {status === 'error' && (
            <span className="text-sm font-medium text-danger">Could not save. Try again.</span>
          )}
        </div>
      )}
    </div>
  )
}

/** One service card: identity, pricing, timing, and the visibility toggle, with a live price preview. */
function ServiceRow({
  index,
  row,
  readOnly,
  onChange,
  onRemove,
}: {
  index: number
  row: Row
  readOnly: boolean
  onChange: (patch: Partial<Row>) => void
  onRemove: () => void
}) {
  const n = index + 1
  const service = useMemo(() => toService(row), [row])
  const price = formatServicePrice(service)
  const meta = [
    formatServiceDuration(service.durationMinutes),
    formatServicePackage(service),
    formatServiceDeposit(service),
  ].filter(Boolean)
  const showPrice = row.priceModel === 'fixed' || row.priceModel === 'from'
  const listed = row.visibility === 'listed'

  return (
    <li className="rounded-xl border border-border bg-surface/60 p-4">
      <div className="mb-3 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <label className={labelClass} htmlFor={`svc-${index}-title`}>
            Service name
          </label>
          <input
            id={`svc-${index}-title`}
            value={row.title}
            onChange={(e) => onChange({ title: e.target.value })}
            disabled={readOnly}
            placeholder="Deep tissue session"
            className={inputClass}
          />
        </div>
        {!readOnly && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove service ${n}`}
            className="mt-5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-danger-bg hover:text-danger"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>

      <div className="mb-3">
        <label className={labelClass} htmlFor={`svc-${index}-blurb`}>
          Description
        </label>
        <textarea
          id={`svc-${index}-blurb`}
          rows={2}
          value={row.blurb}
          onChange={(e) => onChange({ blurb: e.target.value })}
          disabled={readOnly}
          placeholder="Short description (optional)"
          className={inputClass}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor={`svc-${index}-model`}>
            Pricing
          </label>
          <select
            id={`svc-${index}-model`}
            value={row.priceModel}
            onChange={(e) => onChange({ priceModel: e.target.value as ServicePriceModel })}
            disabled={readOnly}
            className={inputClass}
          >
            {PRICE_MODEL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        {showPrice && (
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className={labelClass} htmlFor={`svc-${index}-price`}>
                Price
              </label>
              <input
                id={`svc-${index}-price`}
                inputMode="decimal"
                value={row.price}
                onChange={(e) => onChange({ price: e.target.value })}
                disabled={readOnly}
                placeholder="120"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor={`svc-${index}-currency`}>
                Currency
              </label>
              <input
                id={`svc-${index}-currency`}
                value={row.currency}
                onChange={(e) => onChange({ currency: e.target.value })}
                disabled={readOnly}
                placeholder="USD"
                maxLength={3}
                className={inputClass}
              />
            </div>
          </div>
        )}
      </div>

      {showPrice && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor={`svc-${index}-recurring`}>
              Billing cadence
            </label>
            <select
              id={`svc-${index}-recurring`}
              value={row.recurring}
              onChange={(e) => onChange({ recurring: e.target.value as ServiceRecurring })}
              disabled={readOnly}
              className={inputClass}
            >
              {RECURRING_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass} htmlFor={`svc-${index}-sliding-min`}>
                Sliding scale min
              </label>
              <input
                id={`svc-${index}-sliding-min`}
                inputMode="decimal"
                value={row.slidingScaleMin}
                onChange={(e) => onChange({ slidingScaleMin: e.target.value })}
                disabled={readOnly}
                placeholder="40"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor={`svc-${index}-sliding-max`}>
                Sliding scale max
              </label>
              <input
                id={`svc-${index}-sliding-max`}
                inputMode="decimal"
                value={row.slidingScaleMax}
                onChange={(e) => onChange({ slidingScaleMax: e.target.value })}
                disabled={readOnly}
                placeholder="80"
                className={inputClass}
              />
            </div>
          </div>
        </div>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div>
          <label className={labelClass} htmlFor={`svc-${index}-duration`}>
            Duration (minutes)
          </label>
          <input
            id={`svc-${index}-duration`}
            inputMode="numeric"
            value={row.durationMinutes}
            onChange={(e) => onChange({ durationMinutes: e.target.value })}
            disabled={readOnly}
            placeholder="60"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor={`svc-${index}-deposit`}>
            Deposit to book
          </label>
          <input
            id={`svc-${index}-deposit`}
            inputMode="decimal"
            value={row.deposit}
            onChange={(e) => onChange({ deposit: e.target.value })}
            disabled={readOnly}
            placeholder="40"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor={`svc-${index}-package`}>
            Sessions in a package
          </label>
          <input
            id={`svc-${index}-package`}
            inputMode="numeric"
            value={row.packageCount}
            onChange={(e) => onChange({ packageCount: e.target.value })}
            disabled={readOnly}
            placeholder="6"
            className={inputClass}
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <div className="min-w-0 text-xs text-muted">
          <span className="font-semibold text-text">Preview: </span>
          {price ?? 'No price set'}
          {meta.length > 0 && <span className="text-subtle"> · {meta.join(' · ')}</span>}
        </div>
        <button
          type="button"
          onClick={() => onChange({ visibility: listed ? 'private' : 'listed' })}
          disabled={readOnly}
          aria-pressed={listed}
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-60 ${
            listed
              ? 'border-primary bg-primary-bg text-primary-strong'
              : 'border-border text-muted hover:border-border-strong'
          }`}
        >
          {listed ? <Eye className="h-3.5 w-3.5" aria-hidden /> : <EyeOff className="h-3.5 w-3.5" aria-hidden />}
          {listed ? 'Listed' : 'Private'}
        </button>
      </div>
    </li>
  )
}
