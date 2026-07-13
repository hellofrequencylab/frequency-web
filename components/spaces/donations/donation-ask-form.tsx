'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { isError } from '@/lib/action-result'
import { PriceModeEditor } from '@/components/commerce/price-mode-editor'
import type { Offering } from '@/lib/commerce/types'
import { setDonationAsk } from '@/lib/spaces/donations-actions'
import type { DonationAsk } from '@/lib/spaces/donations'

// OWNER DONATION ASK EDITOR (client). The Organization owner configures a single donation ask: a fund
// label, a short description, and a set of quick-pick amounts. Saved through the canEditProfile-gated
// setDonationAsk action as a replace-by-space.
//
// UNIFIED PRICE MODE (Pricing Options P1, ADR-607): the fund ask is a `choose` + donation instance of
// the shared PriceModeEditor (lockDonation). The fund label + blurb ride the editor's fund control;
// the quick-pick amounts map onto the stored `suggestedAmountsCents` (NO schema change). Persistence
// through setDonationAsk is unchanged.
//
// HONESTY (CONTENT-VOICE skeptic test): v1 takes no payment and there is no Stripe path. The editor
// states plainly that giving is not yet wired. Plain labels, no narrated feelings, no em or en dashes.

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
  const [offering, setOffering] = useState<Offering>(() => ({
    price: {
      mode: 'choose',
      donation: true,
      pickAmountsCents: initialAsk?.suggestedAmountsCents ?? [],
    },
  }))
  const [isActive, setIsActive] = useState(initialAsk?.isActive ?? true)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startSave] = useTransition()

  function save() {
    setError(null)
    setSaved(false)

    const label = fundLabel.trim()
    if (!label) {
      setError('Give your fund a label.')
      return
    }

    const ask: DonationAsk = {
      id: initialAsk?.id,
      fundLabel: label,
      description: description.trim() || null,
      suggestedAmountsCents: offering.price.pickAmountsCents ?? [],
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
        <PriceModeEditor
          value={offering}
          onChange={(next) => {
            setOffering(next)
            setSaved(false)
          }}
          idPrefix="donation"
          lockDonation
          fund={{
            label: fundLabel,
            onLabelChange: (v) => {
              setFundLabel(v)
              setSaved(false)
            },
            description,
            onDescriptionChange: (v) => {
              setDescription(v)
              setSaved(false)
            },
          }}
        />

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => {
              setIsActive(e.target.checked)
              setSaved(false)
            }}
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
