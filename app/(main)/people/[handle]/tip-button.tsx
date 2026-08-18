'use client'

import { useState, useTransition } from 'react'
import { Heart, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/field'
import { startTip } from './tip-actions'
import { TIP_PRESETS_CENTS, TIP_MIN_CENTS, TIP_MAX_CENTS } from '@/lib/billing/tips-core'
import { isError } from '@/lib/action-result'

// "Tip" entry on a host/partner profile. Opens a small composer (preset chips +
// custom amount + optional note), then redirects to Stripe Checkout. Only rendered
// when the recipient is payouts-ready (the server decides; see page.tsx).
export function TipButton({ toProfileId, recipientName }: { toProfileId: string; recipientName: string }) {
  const [open, setOpen] = useState(false)
  const [amountCents, setAmountCents] = useState<number>(TIP_PRESETS_CENTS[1])
  const [custom, setCustom] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Custom field (in dollars) wins when non-empty.
  const effectiveCents = custom.trim() ? Math.round(parseFloat(custom) * 100) : amountCents
  const valid = Number.isFinite(effectiveCents) && effectiveCents >= TIP_MIN_CENTS && effectiveCents <= TIP_MAX_CENTS

  function send() {
    setError(null)
    if (!valid) {
      setError(`Enter an amount between $${TIP_MIN_CENTS / 100} and $${TIP_MAX_CENTS / 100}.`)
      return
    }
    startTransition(async () => {
      const r = await startTip(toProfileId, effectiveCents, message.trim() || undefined)
      if (isError(r)) setError(r.error)
      else window.location.href = r.data.url
    })
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-control border border-primary-bg bg-primary-bg px-3 py-1.5 text-body-sm font-medium text-primary-strong transition-colors hover:bg-primary-bg/70"
      >
        <Heart className="h-3.5 w-3.5" />
        Tip
      </button>
    )
  }

  return (
    <div className="w-full max-w-sm rounded-card border border-border bg-surface p-4 lift-1">
      <p className="text-body-sm font-bold text-text">Tip {recipientName}</p>
      <p className="mt-0.5 text-meta text-muted">Sends directly to them. Frequency takes a small fee.</p>

      <div className="mt-3 flex flex-wrap gap-2">
        {TIP_PRESETS_CENTS.map((c) => (
          <button
            key={c}
            onClick={() => { setAmountCents(c); setCustom('') }}
            className={`rounded-xl px-3 py-1.5 text-body-sm font-semibold transition-colors ${
              !custom.trim() && amountCents === c
                ? 'bg-primary text-on-primary'
                : 'border border-border text-text hover:bg-surface-elevated'
            }`}
          >
            ${c / 100}
          </button>
        ))}
        <div className="flex items-center gap-1 rounded-card border border-border px-2.5 py-1.5">
          <span className="text-body-sm text-subtle">$</span>
          <Input
            variant="seamless"
            type="number"
            inputMode="decimal"
            aria-label="Another tip amount, in dollars"
            min={TIP_MIN_CENTS / 100}
            max={TIP_MAX_CENTS / 100}
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="Other"
            className="w-16 text-body-sm text-text"
          />
        </div>
      </div>

      <Input
        type="text"
        aria-label="Add a note"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        maxLength={280}
        placeholder="Add a note (optional)"
        className="mt-3"
      />

      {error && <p className="mt-2 text-body-sm text-danger">{error}</p>}

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={send}
          disabled={isPending || !valid}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-body-sm font-bold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Heart className="h-4 w-4" />}
          Tip ${(effectiveCents / 100).toFixed(2)}
        </button>
        <button
          onClick={() => { setOpen(false); setError(null) }}
          className="rounded-control px-3 py-2 text-body-sm font-semibold text-muted transition-colors hover:bg-surface-elevated"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
