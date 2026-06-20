'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Label, Textarea } from '@/components/ui/field'
import { isError } from '@/lib/action-result'
import { setDonationAsk } from '@/lib/spaces/donations-actions'
import type { DonationAsk } from '@/lib/spaces/donations'

// OWNER DONATION ASK EDITOR (client). The Organization owner configures a single donation ask: a fund
// label, a short description, and a set of suggested amounts. Saved through the canEditProfile-gated
// setDonationAsk action as a replace-by-space. Amounts are entered in whole / decimal dollars and
// converted to cents on the wire (one per line); the server re-validates + normalizes, so this form
// is convenience, not the gate.
//
// HONESTY (CONTENT-VOICE skeptic test): v1 takes no payment and there is no Stripe path. The editor
// labels the amounts as what an owner SUGGESTS and states plainly that giving is not yet wired. Plain
// labels, no narrated feelings, no em or en dashes (CONTENT-VOICE §10).

/** Dollars string to integer cents, or null if malformed. A non-positive value reads as invalid (a
 *  "$0" suggested amount is not a meaningful chip). */
function dollarsToCents(price: string): number | null {
  const trimmed = price.trim()
  if (!trimmed) return null
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null
  const cents = Math.round(Number(trimmed) * 100)
  return Number.isFinite(cents) && cents > 0 ? cents : null
}

/** Integer cents to a plain dollars string for the textarea (whole dollars drop the cents). */
function centsToDollars(cents: number): string {
  const dollars = cents / 100
  return Number.isInteger(dollars) ? String(dollars) : dollars.toFixed(2)
}

export function DonationAskForm({
  spaceId,
  slug,
  initialAsk,
}: {
  spaceId: string
  slug: string
  initialAsk: DonationAsk | null
}) {
  const router = useRouter()
  const [fundLabel, setFundLabel] = useState(initialAsk?.fundLabel ?? '')
  const [description, setDescription] = useState(initialAsk?.description ?? '')
  const [amountsText, setAmountsText] = useState(
    (initialAsk?.suggestedAmountsCents ?? []).map(centsToDollars).join('\n'),
  )
  const [isActive, setIsActive] = useState(initialAsk?.isActive ?? true)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startSave] = useTransition()

  function markDirty<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v)
      setSaved(false)
    }
  }

  function save() {
    setError(null)
    setSaved(false)

    const label = fundLabel.trim()
    if (!label) {
      setError('Give your fund a label.')
      return
    }

    // Convert + client-validate the suggested amounts (one per line). The server is authoritative,
    // but a clear inline message helps.
    const suggestedAmountsCents: number[] = []
    for (const line of amountsText.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      const cents = dollarsToCents(trimmed)
      if (cents == null) {
        setError('Use amounts like 25 or 25.50, one per line.')
        return
      }
      suggestedAmountsCents.push(cents)
    }

    const ask: DonationAsk = {
      id: initialAsk?.id,
      fundLabel: label,
      description: description.trim() || null,
      suggestedAmountsCents,
      isActive,
    }

    startSave(async () => {
      const result = await setDonationAsk(spaceId, ask)
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
      <div className="space-y-4 rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <div>
          <Label htmlFor="fund-label" className="font-semibold">
            Fund label
          </Label>
          <Input
            id="fund-label"
            value={fundLabel}
            onChange={(e) => markDirty(setFundLabel)(e.target.value)}
            placeholder="General fund"
            maxLength={80}
            className="mt-1"
          />
        </div>

        <div>
          <Label htmlFor="fund-description" className="font-semibold">
            Description (optional)
          </Label>
          <Textarea
            id="fund-description"
            value={description}
            onChange={(e) => markDirty(setDescription)(e.target.value)}
            placeholder="Where gifts go, in a line or two."
            rows={2}
            maxLength={500}
            className="mt-1"
          />
        </div>

        <div>
          <Label htmlFor="fund-amounts" className="font-semibold">
            Suggested amounts (one per line)
          </Label>
          <Textarea
            id="fund-amounts"
            value={amountsText}
            onChange={(e) => markDirty(setAmountsText)(e.target.value)}
            placeholder={'25\n50\n100'}
            rows={3}
            className="mt-1"
          />
          <p className="mt-1 text-xs text-subtle">
            Members see these as quick-pick amounts. Enter dollars, like 25 or 25.50.
          </p>
        </div>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => markDirty(setIsActive)(e.target.checked)}
            className="h-4 w-4 rounded border-border text-primary focus:ring-border-strong/30"
          />
          <span className="text-sm text-muted">Show this ask to members</span>
        </label>
      </div>

      <p className="text-xs text-subtle">
        This sets up your ask. We do not take a payment yet, so giving is not wired and no money
        changes hands. Paid giving and tax receipts come later.
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
              <Check className="h-4 w-4" aria-hidden /> Save ask
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
