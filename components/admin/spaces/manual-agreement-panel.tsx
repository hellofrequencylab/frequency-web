'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { isError } from '@/lib/action-result'
import {
  createAgreementAction,
  recordPaymentAction,
} from '@/app/(main)/admin/spaces/[id]/billing-agreement-actions'

// The MANUAL BILLING panel on /admin/spaces/[id] (ADR-872): the crew's no-SQL path for off-Stripe
// deals. No active agreement -> the record form (plan, cadence, locked amount, method, dates).
// Active agreement -> the receipt summary + one "Record payment" button that extends paid_through
// by an interval and re-arms the reminder ladder. Every write is a janitor-gated server action
// that re-checks authorization; this component only collects intent and surfaces the result.
// Token-only styling; no em dashes (CONTENT-VOICE).

/** The serializable slice of a ManualAgreement the panel renders. */
export interface AgreementSummary {
  plan: string
  interval: string
  amountCents: number
  method: string
  label: string | null
  startedAt: string
  paidThrough: string
}

const PLAN_OPTIONS = [
  { value: 'business', label: 'Business' },
  { value: 'collective', label: 'Collective' },
  { value: 'nonprofit', label: 'Non Profit' },
  { value: 'independent', label: 'Independent' },
]

const METHOD_OPTIONS = [
  { value: 'cash', label: 'Cash' },
  { value: 'check', label: 'Check' },
  { value: 'transfer', label: 'Bank transfer' },
  { value: 'other', label: 'Other' },
]

const inputClass =
  'w-full rounded-card border border-border bg-surface px-3 py-2 text-body-sm text-text focus:outline-none focus:ring-2 focus:ring-primary'

function dateLabel(dateISO: string): string {
  return new Date(`${dateISO}T00:00:00Z`).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

export function ManualAgreementPanel({
  spaceId,
  agreement,
}: {
  spaceId: string
  agreement: AgreementSummary | null
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  if (agreement) {
    const amount = agreement.amountCents / 100
    const rate = `$${Number.isInteger(amount) ? amount : amount.toFixed(2)} a ${agreement.interval}`
    const methodLabel = METHOD_OPTIONS.find((m) => m.value === agreement.method)?.label ?? 'Other'
    const planLabel = PLAN_OPTIONS.find((p) => p.value === agreement.plan)?.label ?? agreement.plan
    return (
      <div className="space-y-4">
        <dl className="grid gap-x-6 gap-y-2 text-body-sm sm:grid-cols-2">
          <div>
            <dt className="text-meta text-subtle">Plan</dt>
            <dd className="font-medium text-text">
              {planLabel}, billed {agreement.interval === 'year' ? 'yearly' : 'monthly'}
            </dd>
          </div>
          <div>
            <dt className="text-meta text-subtle">Locked rate</dt>
            <dd className="font-medium text-text">{agreement.label ?? rate}</dd>
          </div>
          <div>
            <dt className="text-meta text-subtle">Paid through</dt>
            <dd className="font-medium text-text">{dateLabel(agreement.paidThrough)}</dd>
          </div>
          <div>
            <dt className="text-meta text-subtle">Method</dt>
            <dd className="font-medium text-text">{methodLabel}</dd>
          </div>
        </dl>
        <div className="flex items-center gap-3">
          <Button
            type="button"
            disabled={pending}
            onClick={() => {
              setError(null)
              start(async () => {
                const result = await recordPaymentAction(spaceId)
                if (isError(result)) setError(result.error)
                else router.refresh()
              })
            }}
          >
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
            Record payment
          </Button>
          <p className="text-meta text-muted">
            Extends paid-through by one {agreement.interval} and resets the reminders.
          </p>
        </div>
        {error && <p className="text-body-sm text-danger">{error}</p>}
      </div>
    )
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        const form = e.currentTarget
        const data = new FormData(form)
        setError(null)
        start(async () => {
          const result = await createAgreementAction({
            spaceId,
            plan: String(data.get('plan') ?? ''),
            interval: String(data.get('interval') ?? ''),
            amountDollars: String(data.get('amount') ?? ''),
            method: String(data.get('method') ?? ''),
            label: String(data.get('label') ?? ''),
            startedAt: String(data.get('started_at') ?? ''),
            paidThrough: String(data.get('paid_through') ?? ''),
            note: String(data.get('note') ?? ''),
          })
          if (isError(result)) setError(result.error)
          else router.refresh()
        })
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-body-sm">
          <span className="mb-1 block text-meta font-semibold text-subtle">Plan</span>
          <select name="plan" defaultValue="collective" className={inputClass}>
            {PLAN_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-body-sm">
          <span className="mb-1 block text-meta font-semibold text-subtle">Billed</span>
          <select name="interval" defaultValue="year" className={inputClass}>
            <option value="year">Yearly</option>
            <option value="month">Monthly</option>
          </select>
        </label>
        <label className="block text-body-sm">
          <span className="mb-1 block text-meta font-semibold text-subtle">Amount per interval (dollars)</span>
          <input name="amount" type="number" min="0" step="0.01" required className={inputClass} placeholder="490" />
        </label>
        <label className="block text-body-sm">
          <span className="mb-1 block text-meta font-semibold text-subtle">Method</span>
          <select name="method" defaultValue="cash" className={inputClass}>
            {METHOD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-body-sm">
          <span className="mb-1 block text-meta font-semibold text-subtle">Started</span>
          <input name="started_at" type="date" required className={inputClass} />
        </label>
        <label className="block text-body-sm">
          <span className="mb-1 block text-meta font-semibold text-subtle">Paid through</span>
          <input name="paid_through" type="date" required className={inputClass} />
        </label>
      </div>
      <label className="block text-body-sm">
        <span className="mb-1 block text-meta font-semibold text-subtle">Rate label (shown to the owner)</span>
        <input
          name="label"
          type="text"
          className={inputClass}
          placeholder="Grandfathered at $49/mo, normally $79"
        />
      </label>
      <label className="block text-body-sm">
        <span className="mb-1 block text-meta font-semibold text-subtle">Crew note (private)</span>
        <textarea name="note" rows={2} className={inputClass} />
      </label>
      <Button type="submit" disabled={pending}>
        {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
        Record agreement
      </Button>
      {error && <p className="text-body-sm text-danger">{error}</p>}
    </form>
  )
}
