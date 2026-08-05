'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Plus, X } from 'lucide-react'
import { isError } from '@/lib/action-result'
import type { TicketTierRow } from '@/lib/events/ticket-tiers'
import {
  describePrice,
  priceToTicketPricingMode,
  ticketRowToPrice,
  validatePrice,
  type Offering,
} from '@/lib/commerce/types'
import { PriceModeEditor } from '@/components/commerce/price-mode-editor'
import { Select } from '@/components/ui/select'
import type { SpaceAccessContext } from '@/lib/events/ticket-space-access'
import {
  hostCreateTicketTier,
  hostUpdateTicketTier,
  hostSetTicketTierActive,
} from '../ticket-tier-actions'

// Host-facing ticket-tier manager (audit finding #9). Create / edit / retire named
// tiers with the full range of pricing modes right from the Manage dashboard, so a
// host no longer has to ask an operator to build anything past a single flat price.
// Same shared writers as the /admin console; these call the host-gated actions.
//
// PRICING (Pricing Options P1, ADR-607): the price portion is the shared PriceModeEditor. A tier is
// already one named option, so packages are off here; the tier's Price persists through the
// priceToTicketPricingMode adapter onto the existing columns (NO migration).

const centsToDollars = (c: number | null | undefined) => (c != null ? (c / 100).toFixed(2) : '')

const input =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-body-sm text-text outline-none focus:border-border-strong focus:ring-2 focus:ring-border-strong/30 disabled:opacity-50 placeholder:text-subtle'
const lbl = 'block text-meta font-medium text-muted mb-1'

function modeSummary(t: TicketTierRow): string {
  const summary = describePrice(ticketRowToPrice(t))
  return t.min_cents && t.pricing_mode !== 'fixed'
    ? `${summary} · min $${centsToDollars(t.min_cents)}`
    : summary
}

export function TicketTiersPanel({
  eventId,
  slug,
  tiers,
  spaceAccess,
}: {
  eventId: string
  slug: string
  tiers: TicketTierRow[]
  /** Hosting-space membership context (ADR-823); null = no hosting space, control hidden. */
  spaceAccess?: SpaceAccessContext | null
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
        <p className="text-body-sm text-muted">
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
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-meta font-semibold text-muted transition-colors hover:bg-surface-elevated"
          >
            <Plus className="h-3.5 w-3.5" /> Add tier
          </button>
        )}
      </div>

      {error && <p className="rounded-lg bg-danger-bg px-3 py-2 text-body-sm text-danger">{error}</p>}

      {tiers.length > 0 && (
        <div className="space-y-2">
          {tiers.map((t) =>
            editingId === t.id ? (
              <TierForm
                key={t.id}
                initial={t}
                spaceAccess={spaceAccess}
                disabled={isPending}
                onCancel={() => setEditingId(null)}
                onSubmit={(fd) =>
                  run(() => hostUpdateTicketTier(t.id, eventId, slug, fd), () => setEditingId(null))
                }
              />
            ) : (
              <div
                key={t.id}
                className={`flex items-start justify-between gap-3 rounded-card border border-border px-3.5 py-2.5 ${
                  t.active ? '' : 'opacity-60'
                }`}
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-body-sm font-semibold text-text">
                    {t.name}
                    {t.member_only && (
                      <span className="rounded-md bg-surface-elevated px-1.5 py-0.5 text-2xs font-medium text-muted">
                        Members
                      </span>
                    )}
                    {(t.space_members_only || t.space_tier_id) && (
                      <span className="rounded-md bg-surface-elevated px-1.5 py-0.5 text-2xs font-medium text-muted">
                        {spaceAccess
                          ? t.space_tier_id
                            ? `${spaceAccess.membershipTiers.find((mt) => mt.id === t.space_tier_id)?.name ?? 'Membership'} only`
                            : `${spaceAccess.spaceName} members`
                          : 'Space members'}
                      </span>
                    )}
                    {!t.active && (
                      <span className="rounded-md bg-surface-elevated px-1.5 py-0.5 text-2xs font-medium text-muted">
                        Retired
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-meta text-muted">
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
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-meta font-medium text-muted transition-colors hover:bg-surface-elevated disabled:opacity-50"
                  >
                    <Pencil className="h-3 w-3" /> Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => run(() => hostSetTicketTierActive(t.id, eventId, slug, !t.active))}
                    disabled={isPending}
                    className="rounded-lg border border-border px-2.5 py-1.5 text-meta font-medium text-muted transition-colors hover:bg-surface-elevated disabled:opacity-50"
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
          spaceAccess={spaceAccess}
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
  spaceAccess,
  disabled,
  onSubmit,
  onCancel,
}: {
  initial?: TicketTierRow
  spaceAccess?: SpaceAccessContext | null
  disabled: boolean
  onSubmit: (fd: FormData) => void
  onCancel: () => void
}) {
  const [offering, setOffering] = useState<Offering>(() => ({
    price: initial ? ticketRowToPrice(initial) : { mode: 'fixed' },
  }))
  const [priceError, setPriceError] = useState<string | null>(null)
  // "Who can buy" (ADR-823): '' = everyone, 'members' = any active membership of the hosting
  // Space, else a specific space_membership_tiers id. Mapped onto the two form fields on submit.
  const [audience, setAudience] = useState<string>(() =>
    initial?.space_tier_id ? initial.space_tier_id : initial?.space_members_only ? 'members' : '',
  )

  function handle(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const err = validatePrice(offering.price)
    if (err) {
      setPriceError(err)
      return
    }
    setPriceError(null)
    // Persist the Price through the adapter onto the columns the writer already reads (no migration).
    const fd = new FormData(e.currentTarget)
    const cols = priceToTicketPricingMode(offering.price)
    fd.set('pricing_mode', cols.pricing_mode)
    fd.set('price', cols.price_cents != null ? String(cols.price_cents / 100) : '')
    fd.set('min', cols.min_cents != null ? String(cols.min_cents / 100) : '')
    fd.set('suggested', cols.suggested_cents != null ? String(cols.suggested_cents / 100) : '')
    if (audience === 'members') {
      fd.set('space_members_only', 'on')
      fd.set('space_tier_id', '')
    } else {
      fd.delete('space_members_only')
      fd.set('space_tier_id', audience)
    }
    onSubmit(fd)
  }

  return (
    <form
      onSubmit={handle}
      className="space-y-3 rounded-card border border-border-strong bg-surface-elevated p-4"
    >
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

      {/* A tier is one named option, so packages are off; the Price maps onto the tier columns. */}
      <PriceModeEditor
        value={offering}
        onChange={setOffering}
        disabled={disabled}
        idPrefix={`tier-${initial?.id ?? 'new'}`}
        modes={['fixed', 'choose', 'free']}
        allowPackages={false}
      />
      {priceError && <p className="text-body-sm text-danger">{priceError}</p>}

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

      <label className="flex items-center gap-2 text-body-sm text-text">
        <input
          name="member_only"
          type="checkbox"
          defaultChecked={initial?.member_only ?? false}
          disabled={disabled}
          className="h-4 w-4 rounded border-border"
        />
        Members only (Crew+)
      </label>

      {/* Who can buy (ADR-823): restrict this ticket to the hosting Space's own membership.
          Renders only for a Space-hosted event; locked below the Collective plan. */}
      {spaceAccess &&
        (spaceAccess.allowed ? (
          <div>
            <label className={lbl} htmlFor={`audience-${initial?.id ?? 'new'}`}>
              Who can buy
            </label>
            <Select
              id={`audience-${initial?.id ?? 'new'}`}
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              disabled={disabled}
              emptyLabel="Everyone"
            >
              <option value="members">{spaceAccess.spaceName} members (any tier)</option>
              {spaceAccess.membershipTiers.map((mt) => (
                <option key={mt.id} value={mt.id}>
                  {spaceAccess.spaceName} · {mt.name} members
                </option>
              ))}
            </Select>
            {audience !== '' && spaceAccess.membershipTiers.length === 0 && (
              <p className="mt-1 text-meta text-muted">
                Tip: publish membership tiers on your space page so people have something to join.
              </p>
            )}
          </div>
        ) : (
          <p className="rounded-lg bg-surface px-3 py-2 text-meta text-muted">
            Members-only tickets, linked to your space membership, come with the Collective plan.
          </p>
        ))}

      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={disabled}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-body-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40"
        >
          {initial ? 'Save tier' : 'Add tier'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={disabled}
          className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-body-sm font-medium text-muted transition-colors hover:bg-surface disabled:opacity-50"
        >
          <X className="h-3.5 w-3.5" /> Cancel
        </button>
      </div>
    </form>
  )
}
