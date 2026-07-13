'use client'

import { useState } from 'react'
import { Plus, Star, X } from 'lucide-react'
import { fieldClasses } from '@/components/ui/field'
import {
  MAX_PACKAGE_OPTIONS,
  MIN_PACKAGE_OPTIONS,
  type Offering,
  type OfferingOption,
  type Price,
  type PriceMode,
} from '@/lib/commerce/types'

// PRICE MODE EDITOR (Pricing Options P1, ADR-607). ONE reusable owner control for every sellable
// thing, with progressive disclosure: a first-timer sees a single price field; a power user reaches
// Choose-your-price (anchor + floor), the Donation checkbox (gift framing + quick-pick amounts), and
// Good / Better / Best packages, but only down a path they opt into. See
// docs/PRICING-OPTIONS-STRATEGY.md.
//
// This is a CONTROLLED component over an `Offering` (a single Price, or a package set). It is CONFIG
// ONLY: nothing here charges. The owning surface serializes the value and persists it (tickets route
// through the ticket-tier adapters; donations map pick amounts onto the stored fund). Copy follows
// CONTENT-VOICE: plain sentences, gift framing for donations, no em or en dashes.

const MODE_LABEL: Record<PriceMode, string> = {
  fixed: 'Fixed price',
  choose: 'Choose your price',
  free: 'Free',
  contact: 'Enquire',
}

const MODE_HINT: Record<PriceMode, string> = {
  fixed: 'One set price. Most offers use this.',
  choose: 'Buyers name the amount. You set a suggested amount to anchor them, and an optional floor.',
  free: 'No charge.',
  contact: 'No checkout. Buyers reach out first.',
}

const ALL_MODES: PriceMode[] = ['fixed', 'choose', 'free', 'contact']

// ── money helpers (plain dollars <-> integer cents) ──────────────────────────────────────────────

function centsToDollarStr(cents: number): string {
  const d = cents / 100
  return Number.isInteger(d) ? String(d) : d.toFixed(2)
}

function dollarsToCents(text: string): number | undefined {
  const t = text.trim()
  if (!t || !/^\d+(\.\d{1,2})?$/.test(t)) return undefined
  const c = Math.round(Number(t) * 100)
  return Number.isFinite(c) ? c : undefined
}

const LABEL = 'mb-1 block text-sm font-medium text-text'
const HINT = 'mt-1 text-xs text-subtle'

/** A dollars input that lifts integer cents (or undefined when blank/invalid). Keeps its own text so a
 *  mid-typed value like "25." round-trips; seeded once from the incoming cents. */
function DollarField({
  id,
  label,
  hint,
  cents,
  onCents,
  disabled,
  placeholder,
}: {
  id: string
  label: React.ReactNode
  hint?: string
  cents: number | undefined
  onCents: (c: number | undefined) => void
  disabled?: boolean
  placeholder?: string
}) {
  const [text, setText] = useState(cents != null ? centsToDollarStr(cents) : '')
  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <input
        id={id}
        type="number"
        min="0"
        step="0.01"
        inputMode="decimal"
        value={text}
        disabled={disabled}
        placeholder={placeholder ?? '0.00'}
        className={fieldClasses}
        onChange={(e) => {
          setText(e.target.value)
          onCents(dollarsToCents(e.target.value))
        }}
      />
      {hint && <p className={HINT}>{hint}</p>}
    </div>
  )
}

/** The quick-pick amounts editor (one amount per line), reused from the donations fund UX. */
function PickAmountsField({
  id,
  cents,
  onCents,
  disabled,
}: {
  id: string
  cents: number[]
  onCents: (c: number[]) => void
  disabled?: boolean
}) {
  const [text, setText] = useState(cents.map(centsToDollarStr).join('\n'))
  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        Quick-pick amounts (one per line)
      </label>
      <textarea
        id={id}
        rows={3}
        value={text}
        disabled={disabled}
        placeholder={'25\n50\n100'}
        className={fieldClasses}
        onChange={(e) => {
          setText(e.target.value)
          const out: number[] = []
          for (const line of e.target.value.split('\n')) {
            const c = dollarsToCents(line)
            if (c != null && c > 0) out.push(c)
          }
          onCents(out)
        }}
      />
      <p className={HINT}>Buyers see these as quick-pick amounts. Enter dollars, like 25 or 25.50.</p>
    </div>
  )
}

// ── the single-price control (one Price) ─────────────────────────────────────────────────────────

/** Optional fund fields rendered under the donation frame (the Donations surface wires these to the
 *  stored fund label + blurb; other surfaces omit them and the offer's own name carries the gift). */
export interface FundControl {
  label: string
  onLabelChange: (v: string) => void
  description?: string
  onDescriptionChange?: (v: string) => void
}

function PriceControl({
  value,
  onChange,
  disabled,
  idPrefix,
  modes = ALL_MODES,
  lockDonation = false,
  fund,
}: {
  value: Price
  onChange: (next: Price) => void
  disabled?: boolean
  idPrefix: string
  modes?: PriceMode[]
  /** Lock to a donation ask (choose + donation, no mode select). */
  lockDonation?: boolean
  fund?: FundControl
}) {
  const mode = lockDonation ? 'choose' : value.mode
  const donation = lockDonation || value.donation === true

  function setMode(next: PriceMode) {
    // Reset the fields that do not apply to the new mode so a stale amount never lingers.
    if (next === 'fixed') onChange({ mode: 'fixed', amountCents: value.amountCents })
    else if (next === 'choose')
      onChange({
        mode: 'choose',
        suggestedCents: value.suggestedCents,
        minCents: value.minCents,
        donation: value.donation,
        pickAmountsCents: value.pickAmountsCents,
      })
    else onChange({ mode: next })
  }

  return (
    <div className="space-y-4">
      {!lockDonation && (
        <div>
          <label htmlFor={`${idPrefix}-mode`} className={LABEL}>
            Pricing
          </label>
          <select
            id={`${idPrefix}-mode`}
            value={mode}
            disabled={disabled}
            className={fieldClasses}
            onChange={(e) => setMode(e.target.value as PriceMode)}
          >
            {modes.map((m) => (
              <option key={m} value={m}>
                {MODE_LABEL[m]}
              </option>
            ))}
          </select>
          <p className={HINT}>{MODE_HINT[mode]}</p>
        </div>
      )}

      {mode === 'fixed' && (
        <DollarField
          id={`${idPrefix}-amount`}
          label="Price (USD)"
          cents={value.amountCents}
          disabled={disabled}
          onCents={(c) => onChange({ mode: 'fixed', amountCents: c })}
        />
      )}

      {mode === 'choose' && (
        <div className="space-y-4 rounded-xl border border-border/70 bg-surface p-3">
          <DollarField
            id={`${idPrefix}-suggested`}
            label={
              <>
                {donation ? 'Suggested gift (USD)' : 'Suggested price (USD)'}{' '}
                <span className="font-normal text-subtle">(required)</span>
              </>
            }
            hint="Buyers see this filled in first. Required, so nobody starts from a blank box."
            cents={value.suggestedCents}
            disabled={disabled}
            onCents={(c) => onChange({ ...value, mode: 'choose', suggestedCents: c })}
          />
          <DollarField
            id={`${idPrefix}-min`}
            label={
              <>
                Minimum (USD) <span className="font-normal text-subtle">(optional floor)</span>
              </>
            }
            hint={
              donation
                ? 'The least a buyer can give. Leave blank so any gift is welcome.'
                : 'The least a buyer can pay. Leave blank to let them choose any amount.'
            }
            cents={value.minCents}
            disabled={disabled}
            onCents={(c) => onChange({ ...value, mode: 'choose', minCents: c })}
          />

          {!lockDonation && (
            <label className="flex items-center gap-2 text-sm text-text">
              <input
                type="checkbox"
                checked={donation}
                disabled={disabled}
                className="h-4 w-4 rounded border-border text-primary focus:ring-border-strong/30"
                onChange={(e) =>
                  onChange({ ...value, mode: 'choose', donation: e.target.checked || undefined })
                }
              />
              Donation based
            </label>
          )}
          {!lockDonation && (
            <p className={HINT}>Frame this as a gift and show a range of quick-pick amounts.</p>
          )}

          {donation && (
            <div className="space-y-4 rounded-xl border border-border/70 bg-surface-elevated p-3">
              {fund && (
                <>
                  <div>
                    <label htmlFor={`${idPrefix}-fund`} className={LABEL}>
                      Fund label
                    </label>
                    <input
                      id={`${idPrefix}-fund`}
                      type="text"
                      maxLength={80}
                      value={fund.label}
                      disabled={disabled}
                      placeholder="General fund"
                      className={fieldClasses}
                      onChange={(e) => fund.onLabelChange(e.target.value)}
                    />
                    <p className={HINT}>Name the fund. Buyers see where their gift goes.</p>
                  </div>
                  {fund.onDescriptionChange && (
                    <div>
                      <label htmlFor={`${idPrefix}-fund-desc`} className={LABEL}>
                        Where gifts go <span className="font-normal text-subtle">(optional)</span>
                      </label>
                      <textarea
                        id={`${idPrefix}-fund-desc`}
                        rows={2}
                        maxLength={500}
                        value={fund.description ?? ''}
                        disabled={disabled}
                        placeholder="Where gifts go, in a line or two."
                        className={fieldClasses}
                        onChange={(e) => fund.onDescriptionChange?.(e.target.value)}
                      />
                    </div>
                  )}
                </>
              )}
              <PickAmountsField
                id={`${idPrefix}-picks`}
                cents={value.pickAmountsCents ?? []}
                disabled={disabled}
                onCents={(c) =>
                  onChange({
                    ...value,
                    mode: 'choose',
                    donation: true,
                    pickAmountsCents: c.length ? c : undefined,
                  })
                }
              />
            </div>
          )}
        </div>
      )}

      {mode === 'free' && <p className="text-sm text-muted">No charge. This offer shows as Free.</p>}
      {mode === 'contact' && (
        <p className="text-sm text-muted">No checkout. Buyers see an Enquire button and reach out.</p>
      )}
    </div>
  )
}

// ── the full editor (single price OR Good / Better / Best packages) ──────────────────────────────

/** Seed a fresh package option (a plain fixed price). */
function blankOption(name: string): OfferingOption {
  return { name, price: { mode: 'fixed' } }
}

export function PriceModeEditor({
  value,
  onChange,
  disabled,
  idPrefix = 'price',
  modes,
  allowPackages = true,
  lockDonation = false,
  fund,
}: {
  value: Offering
  onChange: (next: Offering) => void
  disabled?: boolean
  idPrefix?: string
  /** Restrict the mode dropdown (e.g. tickets never enquire). Defaults to all four. */
  modes?: PriceMode[]
  /** Show the "Add option" packages affordance. Default true. */
  allowPackages?: boolean
  /** Lock the whole control to a donation ask (no mode select, no packages). Used by Donations. */
  lockDonation?: boolean
  /** Fund label + blurb fields for the donation frame (the Donations surface wires these). */
  fund?: FundControl
}) {
  const options = value.options
  const packagesOn = !lockDonation && allowPackages && !!options && options.length > 0

  function setRecommended(idx: number) {
    if (!options) return
    onChange({
      ...value,
      options: options.map((o, i) => ({ ...o, recommended: i === idx })),
    })
  }

  function updateOption(idx: number, patch: Partial<OfferingOption>) {
    if (!options) return
    const next = options.map((o, i) => (i === idx ? { ...o, ...patch } : o))
    onChange({ ...value, price: next[0].price, options: next })
  }

  function addOption() {
    if (!options || options.length >= MAX_PACKAGE_OPTIONS) return
    onChange({ ...value, options: [...options, blankOption('')] })
  }

  function removeOption(idx: number) {
    if (!options || options.length <= MIN_PACKAGE_OPTIONS) return
    const next = options.filter((_, i) => i !== idx)
    // Keep exactly one recommended option.
    if (!next.some((o) => o.recommended)) next[Math.min(1, next.length - 1)].recommended = true
    onChange({ ...value, price: next[0].price, options: next })
  }

  function promoteToPackages() {
    // Turn the single offer into two named options; mark the second ("better") as Most popular.
    onChange({
      ...value,
      options: [
        { name: 'Standard', price: value.price, recommended: false },
        { ...blankOption('Premium'), recommended: true },
      ],
    })
  }

  function backToSingle() {
    onChange({ price: options?.[0]?.price ?? value.price })
  }

  if (packagesOn && options) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted">
            Offer a few named options. The one marked Most popular is highlighted for buyers.
          </p>
          <button
            type="button"
            onClick={backToSingle}
            disabled={disabled}
            className="shrink-0 text-xs font-medium text-muted underline underline-offset-2 hover:text-text disabled:opacity-50"
          >
            Use a single price
          </button>
        </div>

        {options.map((opt, idx) => (
          <div
            key={idx}
            className="space-y-3 rounded-xl border border-border-strong bg-surface-elevated p-4"
          >
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={opt.name}
                disabled={disabled}
                maxLength={60}
                placeholder="Option name"
                aria-label={`Option ${idx + 1} name`}
                className={fieldClasses}
                onChange={(e) => updateOption(idx, { name: e.target.value })}
              />
              {options.length > MIN_PACKAGE_OPTIONS && (
                <button
                  type="button"
                  onClick={() => removeOption(idx)}
                  disabled={disabled}
                  aria-label={`Remove option ${idx + 1}`}
                  className="shrink-0 rounded-lg border border-border p-2 text-muted transition-colors hover:bg-surface disabled:opacity-50"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <PriceControl
              value={opt.price}
              disabled={disabled}
              idPrefix={`${idPrefix}-opt${idx}`}
              modes={modes}
              onChange={(price) => updateOption(idx, { price })}
            />

            <label className="flex items-center gap-2 text-sm text-text">
              <input
                type="radio"
                name={`${idPrefix}-recommended`}
                checked={opt.recommended === true}
                disabled={disabled}
                className="h-4 w-4 border-border text-primary focus:ring-border-strong/30"
                onChange={() => setRecommended(idx)}
              />
              <Star className="h-3.5 w-3.5" aria-hidden /> Most popular
            </label>
          </div>
        ))}

        {options.length < MAX_PACKAGE_OPTIONS && (
          <button
            type="button"
            onClick={addOption}
            disabled={disabled}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:bg-surface-elevated disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" /> Add option
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <PriceControl
        value={value.price}
        disabled={disabled}
        idPrefix={idPrefix}
        modes={modes}
        lockDonation={lockDonation}
        fund={fund}
        onChange={(price) => onChange({ ...value, price })}
      />

      {!lockDonation && allowPackages && (
        <button
          type="button"
          onClick={promoteToPackages}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:bg-surface-elevated disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" /> Add option
        </button>
      )}
    </div>
  )
}
