'use client'

import { useTransition, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Plus, Pencil, X } from 'lucide-react'
import {
  updateEvent,
  cancelEvent,
  reinstateEvent,
  createTicketTier,
  updateTicketTier,
  setTicketTierActive,
} from '../actions'

type EventData = {
  id: string
  title: string
  slug: string
  description: string | null
  location: string | null
  starts_at: string
  ends_at: string | null
  is_cancelled: boolean | null
  price_cents: number | null
}

export type PricingMode = 'fixed' | 'free' | 'pwyc' | 'sliding_scale' | 'donation'

export type TierEditRow = {
  id: string
  name: string
  description: string | null
  pricing_mode: PricingMode
  price_cents: number | null
  min_cents: number | null
  suggested_cents: number | null
  quantity: number | null
  sold: number
  member_only: boolean
  sort_order: number
  active: boolean
}

const PRICING_MODE_LABEL: Record<PricingMode, string> = {
  fixed: 'Fixed price',
  free: 'Free',
  pwyc: 'Pay what you can',
  sliding_scale: 'Sliding scale',
  donation: 'Donation',
}

const centsToDollars = (c: number | null | undefined) => (c != null ? (c / 100).toFixed(2) : '')

const input = 'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-border-strong focus:ring-2 focus:ring-border-strong/30 disabled:opacity-50 placeholder:text-subtle'
const lbl   = 'block text-xs font-medium text-muted mb-1'

// ISO → the `YYYY-MM-DDTHH:mm` a <input type="datetime-local"> expects, in local time.
function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function EventEditClient({ event, tiers }: { event: EventData; tiers: TierEditRow[] }) {
  const router = useRouter()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isCancelPending, startCancelTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      try {
        await updateEvent(event.id, fd)
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save event.')
      }
    })
  }

  function handleCancel() {
    const msg = event.is_cancelled
      ? 'Reinstate this event? Members will see it as active again.'
      : 'Cancel this event? Members will see it as cancelled.'
    if (!confirm(msg)) return
    startCancelTransition(async () => {
      try {
        if (event.is_cancelled) {
          await reinstateEvent(event.id)
        } else {
          await cancelEvent(event.id)
        }
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Action failed.')
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Edit form */}
      <form onSubmit={handleSubmit} className="rounded-2xl border border-border bg-surface p-5 space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Event details</p>

        <div>
          <label className={lbl}>Title *</label>
          <input
            name="title"
            type="text"
            defaultValue={event.title}
            required
            disabled={isPending}
            className={input}
          />
        </div>

        <div>
          <label className={lbl}>Description <span className="font-normal text-subtle">(optional)</span></label>
          <textarea
            name="description"
            defaultValue={event.description ?? ''}
            rows={4}
            disabled={isPending}
            className={`${input} resize-y leading-relaxed`}
          />
        </div>

        <div>
          <label className={lbl}>Location <span className="font-normal text-subtle">(optional)</span></label>
          <input
            name="location"
            type="text"
            defaultValue={event.location ?? ''}
            placeholder="e.g. Balboa Park, San Diego"
            disabled={isPending}
            className={input}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={lbl}>Starts at *</label>
            <input
              name="starts_at"
              type="datetime-local"
              defaultValue={toLocalInput(event.starts_at)}
              required
              disabled={isPending}
              className={input}
            />
          </div>
          <div>
            <label className={lbl}>Ends at <span className="font-normal text-subtle">(optional)</span></label>
            <input
              name="ends_at"
              type="datetime-local"
              defaultValue={toLocalInput(event.ends_at)}
              disabled={isPending}
              className={input}
            />
          </div>
        </div>

        <div>
          <label className={lbl}>
            Ticket price <span className="font-normal text-subtle">(USD — leave blank for a free event)</span>
          </label>
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-subtle">$</span>
            <input
              name="price"
              type="number"
              min="0"
              step="0.01"
              defaultValue={event.price_cents ? (event.price_cents / 100).toFixed(2) : ''}
              placeholder="0.00"
              disabled={isPending}
              className={input}
            />
          </div>
          <p className="mt-1 text-xs text-subtle">
            Paid events require the host to have payouts set up. Frequency takes a small platform fee.
          </p>
        </div>

        {error && (
          <p className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>
        )}

        <div className="flex items-center gap-3 pt-1">
          {saved && (
            <span className="flex items-center gap-1 text-xs font-medium text-primary-strong">
              <Check className="h-3.5 w-3.5" /> Saved
            </span>
          )}
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-40 transition-colors"
          >
            {isPending ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>

      {/* Cancel / reinstate zone */}
      <div className="rounded-2xl border border-border bg-surface p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-subtle mb-3">Status</p>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-text">
              {event.is_cancelled ? 'This event is cancelled.' : 'This event is active.'}
            </p>
            <p className="text-xs text-subtle mt-0.5">
              {event.is_cancelled
                ? 'Reinstate to make it visible and bookable again.'
                : 'Cancelling notifies members and marks the event as cancelled.'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            disabled={isCancelPending}
            className={`shrink-0 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${
              event.is_cancelled
                ? 'border-success text-success hover:bg-success-bg'
                : 'border-danger text-danger hover:bg-danger-bg'
            }`}
          >
            {isCancelPending ? '…' : event.is_cancelled ? 'Reinstate' : 'Cancel event'}
          </button>
        </div>
      </div>

      {/* Ticket tiers (EVENTS-SYSTEM §2.2) */}
      <TierManager eventId={event.id} slug={event.slug} tiers={tiers} flatPriceCents={event.price_cents} />
    </div>
  )
}

// ── Ticket tier manager ──────────────────────────────────────────────────────────
// Create / edit / retire named tiers with richer pricing modes + inventory. The flat
// `Ticket price` field above remains the implicit single fixed tier when no tiers
// exist (backward compat); adding a tier takes over pricing for the event.

const tInput =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-border-strong focus:ring-2 focus:ring-border-strong/30 disabled:opacity-50 placeholder:text-subtle'
const tLbl = 'block text-xs font-medium text-muted mb-1'

function modeSummary(t: TierEditRow): string {
  switch (t.pricing_mode) {
    case 'free':
      return 'Free'
    case 'fixed':
      return `$${centsToDollars(t.price_cents)}`
    case 'pwyc':
    case 'sliding_scale':
    case 'donation':
      return `${PRICING_MODE_LABEL[t.pricing_mode]}${t.min_cents ? ` · min $${centsToDollars(t.min_cents)}` : ''}`
  }
}

function TierManager({
  eventId,
  slug,
  tiers,
  flatPriceCents,
}: {
  eventId: string
  slug: string
  tiers: TierEditRow[]
  flatPriceCents: number | null
}) {
  const router = useRouter()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function run(fn: () => Promise<void>, onDone?: () => void) {
    setError(null)
    startTransition(async () => {
      try {
        await fn()
        onDone?.()
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Action failed.')
      }
    })
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Ticket tiers</p>
          <p className="mt-1 text-xs text-subtle">
            Named tiers with fixed, free, pay-what-you-can, sliding-scale or donation pricing.
            {tiers.length === 0 && flatPriceCents
              ? ' Currently using the single flat price above.'
              : ''}
          </p>
        </div>
        {!adding && (
          <button
            type="button"
            onClick={() => {
              setAdding(true)
              setEditingId(null)
            }}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted hover:bg-surface-elevated transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> Add tier
          </button>
        )}
      </div>

      {error && <p className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

      {/* Existing tiers */}
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
                  run(() => updateTicketTier(t.id, eventId, slug, fd), () => setEditingId(null))
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
                      <span className="rounded-md bg-surface-elevated px-1.5 py-0.5 text-[11px] font-medium text-muted">
                        Members
                      </span>
                    )}
                    {!t.active && (
                      <span className="rounded-md bg-surface-elevated px-1.5 py-0.5 text-[11px] font-medium text-subtle">
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
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted hover:bg-surface-elevated transition-colors disabled:opacity-50"
                  >
                    <Pencil className="h-3 w-3" /> Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => run(() => setTicketTierActive(t.id, eventId, slug, !t.active))}
                    disabled={isPending}
                    className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted hover:bg-surface-elevated transition-colors disabled:opacity-50"
                  >
                    {t.active ? 'Retire' : 'Reactivate'}
                  </button>
                </div>
              </div>
            ),
          )}
        </div>
      )}

      {/* Add new tier */}
      {adding && (
        <TierForm
          disabled={isPending}
          onCancel={() => setAdding(false)}
          onSubmit={(fd) => run(() => createTicketTier(eventId, slug, fd), () => setAdding(false))}
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
  initial?: TierEditRow
  disabled: boolean
  onSubmit: (fd: FormData) => void
  onCancel: () => void
}) {
  const [mode, setMode] = useState<PricingMode>(initial?.pricing_mode ?? 'fixed')
  const buyerChosen = mode === 'pwyc' || mode === 'sliding_scale' || mode === 'donation'

  function handle(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    onSubmit(new FormData(e.currentTarget))
  }

  return (
    <form onSubmit={handle} className="rounded-xl border border-border-strong bg-surface-elevated p-4 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={tLbl}>Tier name *</label>
          <input name="name" type="text" defaultValue={initial?.name ?? ''} required disabled={disabled} className={tInput} placeholder="e.g. General, Supporter" />
        </div>
        <div>
          <label className={tLbl}>Pricing mode</label>
          <select
            name="pricing_mode"
            value={mode}
            onChange={(e) => setMode(e.target.value as PricingMode)}
            disabled={disabled}
            className={tInput}
          >
            {(Object.keys(PRICING_MODE_LABEL) as PricingMode[]).map((m) => (
              <option key={m} value={m}>
                {PRICING_MODE_LABEL[m]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={tLbl}>Description <span className="font-normal text-subtle">(optional)</span></label>
        <input name="description" type="text" defaultValue={initial?.description ?? ''} disabled={disabled} className={tInput} placeholder="What this tier includes" />
      </div>

      {/* Pricing fields depend on the mode. */}
      {mode === 'fixed' && (
        <div>
          <label className={tLbl}>Price (USD) *</label>
          <input name="price" type="number" min="0" step="0.01" defaultValue={centsToDollars(initial?.price_cents)} disabled={disabled} className={tInput} placeholder="0.00" />
        </div>
      )}
      {buyerChosen && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={tLbl}>Minimum (USD) <span className="font-normal text-subtle">(floor)</span></label>
            <input name="min" type="number" min="0" step="0.01" defaultValue={centsToDollars(initial?.min_cents)} disabled={disabled} className={tInput} placeholder="0.00" />
          </div>
          <div>
            <label className={tLbl}>Suggested (USD) <span className="font-normal text-subtle">(prefilled)</span></label>
            <input name="suggested" type="number" min="0" step="0.01" defaultValue={centsToDollars(initial?.suggested_cents)} disabled={disabled} className={tInput} placeholder="0.00" />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={tLbl}>Quantity <span className="font-normal text-subtle">(blank = unlimited)</span></label>
          <input name="quantity" type="number" min="0" step="1" defaultValue={initial?.quantity ?? ''} disabled={disabled} className={tInput} placeholder="Unlimited" />
        </div>
        <div>
          <label className={tLbl}>Sort order</label>
          <input name="sort_order" type="number" step="1" defaultValue={initial?.sort_order ?? 0} disabled={disabled} className={tInput} />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-text">
        <input name="member_only" type="checkbox" defaultChecked={initial?.member_only ?? false} disabled={disabled} className="h-4 w-4 rounded border-border" />
        Members only (Crew+)
      </label>

      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={disabled}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-40 transition-colors"
        >
          {initial ? 'Save tier' : 'Add tier'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={disabled}
          className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted hover:bg-surface transition-colors disabled:opacity-50"
        >
          <X className="h-3.5 w-3.5" /> Cancel
        </button>
      </div>
    </form>
  )
}
