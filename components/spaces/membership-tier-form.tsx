'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowUp, Check, Loader2, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Label, Textarea, fieldClasses } from '@/components/ui/field'
import { isError } from '@/lib/action-result'
import { setMembershipTiers } from '@/lib/spaces/memberships-actions'
import type { MembershipInterval, MembershipTier } from '@/lib/spaces/memberships'
import { cn } from '@/lib/utils'

// OWNER TIER EDITOR (client). The Business owner defines one or more membership tiers (name, price,
// interval, description, benefits, active), saved through the canEditProfile-gated setMembershipTiers
// action as a replace-set. The price is entered in whole/decimal dollars and converted to cents on
// the wire; benefits are one-per-line. The server re-validates + normalizes, so this form is
// convenience, not the gate.
//
// HONESTY (CONTENT-VOICE skeptic test): the editor labels the price as what membership WILL cost,
// because v1 takes no payment. Plain labels, no narrated feelings, no em/en dashes (CONTENT-VOICE §10).

const INTERVALS: { value: MembershipInterval; label: string }[] = [
  { value: 'month', label: 'Per month' },
  { value: 'year', label: 'Per year' },
  { value: 'once', label: 'One time' },
]

/** A row in the editor (price as a dollar STRING for the input; benefits as one-per-line text). */
interface TierDraft {
  id?: string
  name: string
  price: string // dollars, e.g. "25" or "25.50"
  interval: MembershipInterval
  description: string
  benefitsText: string // one benefit per line
  isActive: boolean
}

/** Dollars string to integer cents, or null if malformed / negative. Empty reads as 0 (free). */
function dollarsToCents(price: string): number | null {
  const trimmed = price.trim()
  if (!trimmed) return 0
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null
  const cents = Math.round(Number(trimmed) * 100)
  return Number.isFinite(cents) && cents >= 0 ? cents : null
}

/** Integer cents to a plain dollars string for the input (whole dollars drop the cents). */
function centsToDollars(cents: number): string {
  if (cents === 0) return ''
  const dollars = cents / 100
  return Number.isInteger(dollars) ? String(dollars) : dollars.toFixed(2)
}

/** Map saved tiers back to editable drafts (for the initial form state). */
function toDrafts(tiers: MembershipTier[]): TierDraft[] {
  return tiers.map((t) => ({
    id: t.id,
    name: t.name,
    price: centsToDollars(t.priceCents),
    interval: t.interval,
    description: t.description ?? '',
    benefitsText: t.benefits.join('\n'),
    isActive: t.isActive,
  }))
}

function emptyDraft(): TierDraft {
  return { name: '', price: '', interval: 'month', description: '', benefitsText: '', isActive: true }
}

export function MembershipTierForm({
  spaceId,
  slug,
  initialTiers,
}: {
  spaceId: string
  slug: string
  initialTiers: MembershipTier[]
}) {
  const router = useRouter()
  const [rows, setRows] = useState<TierDraft[]>(() =>
    initialTiers.length > 0 ? toDrafts(initialTiers) : [emptyDraft()],
  )
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startSave] = useTransition()

  function update(index: number, patch: Partial<TierDraft>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
    setSaved(false)
  }

  function addRow() {
    setRows((prev) => [...prev, emptyDraft()])
    setSaved(false)
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index))
    setSaved(false)
  }

  function move(index: number, dir: -1 | 1) {
    setRows((prev) => {
      const next = [...prev]
      const target = index + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target]!, next[index]!]
      return next
    })
    setSaved(false)
  }

  function save() {
    setError(null)
    setSaved(false)

    // Convert + client-validate. The server is authoritative, but a clear inline message helps.
    const tiers: MembershipTier[] = []
    for (const r of rows) {
      const name = r.name.trim()
      if (!name) {
        setError('Give every tier a name.')
        return
      }
      const priceCents = dollarsToCents(r.price)
      if (priceCents == null) {
        setError('Use a price like 25 or 25.50 (or leave it blank for free).')
        return
      }
      const benefits = r.benefitsText
        .split('\n')
        .map((b) => b.trim())
        .filter(Boolean)
      tiers.push({
        id: r.id,
        name,
        priceCents,
        interval: r.interval,
        description: r.description.trim() || null,
        benefits,
        sort: tiers.length,
        isActive: r.isActive,
      })
    }

    startSave(async () => {
      const result = await setMembershipTiers(spaceId, tiers)
      if (isError(result)) {
        setError(result.error)
        return
      }
      setSaved(true)
      router.refresh()
    })
  }

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault()
        if (!pending) save()
      }}
    >
      <div className="space-y-4">
        {rows.length === 0 && (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted">
            No tiers yet. Add one to open membership.
          </p>
        )}
        {rows.map((r, i) => (
          <div
            key={i}
            className="space-y-4 rounded-2xl border border-border bg-surface p-5 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="text-xs font-semibold text-subtle">Tier {i + 1}</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label="Move tier up"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:border-border-strong hover:text-text disabled:opacity-40"
                >
                  <ArrowUp className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === rows.length - 1}
                  aria-label="Move tier down"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:border-border-strong hover:text-text disabled:opacity-40"
                >
                  <ArrowDown className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  aria-label="Remove this tier"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:border-danger/40 hover:text-danger"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </div>

            <div>
              <Label htmlFor={`tier-name-${i}`} className="font-semibold">
                Name
              </Label>
              <Input
                id={`tier-name-${i}`}
                value={r.name}
                onChange={(e) => update(i, { name: e.target.value })}
                placeholder="Unlimited"
                maxLength={80}
                className="mt-1"
              />
            </div>

            <div className="flex flex-wrap gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted">Price</span>
                <span className="flex items-center gap-1.5">
                  <span className="text-sm text-muted">$</span>
                  <input
                    inputMode="decimal"
                    value={r.price}
                    onChange={(e) => update(i, { price: e.target.value })}
                    placeholder="0"
                    className={cn(fieldClasses, 'w-28')}
                  />
                </span>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted">Interval</span>
                <select
                  value={r.interval}
                  onChange={(e) => update(i, { interval: e.target.value as MembershipInterval })}
                  className={cn(fieldClasses, 'w-40')}
                >
                  {INTERVALS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col justify-end gap-1">
                <span className="text-xs font-medium text-muted">Active</span>
                <span className="flex h-[38px] items-center gap-2">
                  <input
                    type="checkbox"
                    checked={r.isActive}
                    onChange={(e) => update(i, { isActive: e.target.checked })}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-border-strong/30"
                  />
                  <span className="text-sm text-muted">Show to members</span>
                </span>
              </label>
            </div>

            <div>
              <Label htmlFor={`tier-desc-${i}`} className="font-semibold">
                Description (optional)
              </Label>
              <Textarea
                id={`tier-desc-${i}`}
                value={r.description}
                onChange={(e) => update(i, { description: e.target.value })}
                placeholder="What this tier includes, in a line or two."
                rows={2}
                maxLength={500}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor={`tier-benefits-${i}`} className="font-semibold">
                Benefits (one per line)
              </Label>
              <Textarea
                id={`tier-benefits-${i}`}
                value={r.benefitsText}
                onChange={(e) => update(i, { benefitsText: e.target.value })}
                placeholder={'Unlimited classes\nMember events\nGuest passes'}
                rows={3}
                className="mt-1"
              />
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={addRow}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-strong transition-colors hover:text-primary"
        >
          <Plus className="h-4 w-4" aria-hidden /> Add a tier
        </button>
      </div>

      <p className="text-xs text-subtle">
        The price is what membership will cost. We do not take a payment when someone joins yet, so
        paid billing is coming later.
      </p>

      {error && (
        <p className="rounded-lg bg-danger-bg px-3 py-2 text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3 pt-1">
        <Button type="submit" disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Saving
            </>
          ) : (
            <>
              <Check className="h-4 w-4" aria-hidden /> Save tiers
            </>
          )}
        </Button>
        {saved && !pending && (
          <span className="inline-flex items-center gap-1 text-sm font-medium text-success" role="status">
            <Check className="h-4 w-4" aria-hidden /> Saved
          </span>
        )}
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.push(`/spaces/${slug}`)}
          disabled={pending}
        >
          View space
        </Button>
      </div>
    </form>
  )
}
