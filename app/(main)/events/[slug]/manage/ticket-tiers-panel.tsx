'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, X } from 'lucide-react'
import { isError } from '@/lib/action-result'
import type { TicketTierRow, TicketPricingMode } from '@/lib/events/ticket-tiers'
import {
  hostCreateTicketTier,
  hostUpdateTicketTier,
  hostSetTicketTierActive,
} from '../ticket-tier-actions'

// Host-facing ticket-tier manager (audit finding #9). Create / edit / retire named
// tiers with the full range of pricing modes right from the Manage dashboard, so a
// host no longer has to ask an operator to build anything past a single flat price.
// Same shared writers as the /admin console; these call the host-gated actions.

const PRICING_MODE_LABEL: Record<TicketPricingMode, string> = {
  fixed: 'Fixed price',
  free: 'Free',
  pwyc: 'Pay what you can',
  sliding_scale: 'Sliding scale',
  donation: 'Donation',
}

const centsToDollars = (c: number | null | undefined) => (c != null ? (c / 100).toFixed(2) : '')

const input =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-border-strong focus:ring-2 focus:ring-border-strong/30 disabled:opacity-50 placeholder:text-subtle'
const lbl = 'block text-xs font-medium text-muted mb-1'

function modeSummary(t: TicketTierRow): string {
  switch (t.pricing_mode) {
    case 'free':
      return 'Free'
    case 'fixed':
      return `$${centsToDollars(t.price_cents)}`
    case 'pwyc':
    case 'sliding_scale':
    case 'donation':
      return `${PRICING_MODE_LABEL[t.pricing_mode]}${
        t.min_cents ? ` · min $${centsToDollars(t.min_cents)}` : ''
      }`
  }
}

export function TicketTiersPanel({
  eventId,
  slug,
  tiers,
}: {
  eventId: string
  slug: string
  tiers: TicketTierRow[]
}) {
  const router = useRouter()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function run(fn: () => Promise<{ error: string } | { data: unknown }>, onDone?: () => void) {
    setError(null)
    startTransition(async () => {
      const result = await fn()
      if (isError(result)) {
        setError(result.error)
        return
      }
      onDone?.()
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">
          Add named tiers with fixed, free, pay-what-you-can, sliding-scale, or donation pricing.
          {tiers.length === 0 ? ' You have not added any tiers yet.' : ''}
        </p>
        {!adding && (
          <button
            type="button"
            onClick={() => {
              setAdding(true)
              setEditingId(null)
            }}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:bg-surface-elevated"
          >
            <Plus className="h-3.5 w-3.5" /> Add tier
          </button>
        )}
      </div>

      {error && <p className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

      {tiers.length > 0 && (
        <div className="space-y-2">
          {tiers.map((t) =>
            editingId === t.id ? (
              <TierForm
                key={t.id}
                initial={t}
                disabled={isPending}
                onCancel={() => setEditingId(null)}
                onSubmit={(fd) =>
                  run(() => hostUpdateTicketTier(t.id, eventId, slug, fd), () => setEditingId(null))
                }
              />
            ) : (
              <div
                key={t.id}
                className={`flex items-start justify-between gap-3 rounded-xl border border-border px-3.5 py-2.5 ${
                  t.active ? '' : 'opacity-60'
                }`}
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-text">
                    {t.name}
                    {t.member_only && (
                      <span className="rounded-md bg-surface-elevated px-1.5 py-0.5 text-2xs font-medium text-muted">
                        Members
                      </span>
                    )}
                    {!t.active && (
                      <span className="rounded-md bg-surface-elevated px-1.5 py-0.5 text-2xs font-medium text-subtle">
                        Retired
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {modeSummary(t)}
                    {' · '}
                    {t.quantity == null ? 'Unlimited' : `${t.sold}/${t.quantity} sold`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(t.id)
                      setAdding(false)
                    }}
                    disabled={isPending}
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface-elevated disabled:opacity-50"
                  >
                    <Pencil className="h-3 w-3" /> Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => run(() => hostSetTicketTierActive(t.id, eventId, slug, !t.active))}
                    disabled={isPending}
                    className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface-elevated disabled:opacity-50"
                  >
                    {t.active ? 'Retire' : 'Reactivate'}
                  </button>
                </div>
              </div>
            ),
          )}
        </div>
      )}

      {adding && (
        <TierForm
          disabled={isPending}
          onCancel={() => setAdding(false)}
          onSubmit={(fd) => run(() => hostCreateTicketTier(eventId, slug, fd), () => setAdding(false))}
        />
      )}
    </div>
  )
}

function TierForm({
  initial,
  disabled,
  onSubmit,
  onCancel,
}: {
  initial?: TicketTierRow
  disabled: boolean
  onSubmit: (fd: FormData) => void
  onCancel: () => void
}) {
  const [mode, setMode] = useState<TicketPricingMode>(initial?.pricing_mode ?? 'fixed')
  const buyerChosen = mode === 'pwyc' || mode === 'sliding_scale' || mode === 'donation'

  function handle(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    onSubmit(new FormData(e.currentTarget))
  }

  return (
    <form
      onSubmit={handle}
      className="space-y-3 rounded-xl border border-border-strong bg-surface-elevated p-4"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={lbl}>Tier name *</label>
          <input
            name="name"
            type="text"
            defaultValue={initial?.name ?? ''}
            required
            disabled={disabled}
            className={input}
            placeholder="e.g. General, Supporter"
          />
        </div>
        <div>
          <label className={lbl}>Pricing mode</label>
          <select
            name="pricing_mode"
            value={mode}
            onChange={(e) => setMode(e.target.value as TicketPricingMode)}
            disabled={disabled}
            className={input}
          >
            {(Object.keys(PRICING_MODE_LABEL) as TicketPricingMode[]).map((m) => (
              <option key={m} value={m}>
                {PRICING_MODE_LABEL[m]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={lbl}>
          Description <span className="font-normal text-subtle">(optional)</span>
        </label>
        <input
          name="description"
          type="text"
          defaultValue={initial?.description ?? ''}
          disabled={disabled}
          className={input}
          placeholder="What this tier includes"
        />
      </div>

      {mode === 'fixed' && (
        <div>
          <label className={lbl}>Price (USD) *</label>
          <input
            name="price"
            type="number"
            min="0"
            step="0.01"
            defaultValue={centsToDollars(initial?.price_cents)}
            disabled={disabled}
            className={input}
            placeholder="0.00"
          />
        </div>
      )}
      {buyerChosen && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={lbl}>
              Minimum (USD) <span className="font-normal text-subtle">(floor)</span>
            </label>
            <input
              name="min"
              type="number"
              min="0"
              step="0.01"
              defaultValue={centsToDollars(initial?.min_cents)}
              disabled={disabled}
              className={input}
              placeholder="0.00"
            />
          </div>
          <div>
            <label className={lbl}>
              Suggested (USD) <span className="font-normal text-subtle">(prefilled)</span>
            </label>
            <input
              name="suggested"
              type="number"
              min="0"
              step="0.01"
              defaultValue={centsToDollars(initial?.suggested_cents)}
              disabled={disabled}
              className={input}
              placeholder="0.00"
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={lbl}>
            Quantity <span className="font-normal text-subtle">(blank = unlimited)</span>
          </label>
          <input
            name="quantity"
            type="number"
            min="0"
            step="1"
            defaultValue={initial?.quantity ?? ''}
            disabled={disabled}
            className={input}
            placeholder="Unlimited"
          />
        </div>
        <div>
          <label className={lbl}>Sort order</label>
          <input
            name="sort_order"
            type="number"
            step="1"
            defaultValue={initial?.sort_order ?? 0}
            disabled={disabled}
            className={input}
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-text">
        <input
          name="member_only"
          type="checkbox"
          defaultChecked={initial?.member_only ?? false}
          disabled={disabled}
          className="h-4 w-4 rounded border-border"
        />
        Members only (Crew+)
      </label>

      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={disabled}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40"
        >
          {initial ? 'Save tier' : 'Add tier'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={disabled}
          className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface disabled:opacity-50"
        >
          <X className="h-3.5 w-3.5" /> Cancel
        </button>
      </div>
    </form>
  )
}
