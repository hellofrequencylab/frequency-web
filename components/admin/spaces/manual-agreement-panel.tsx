'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { isError } from '@/lib/action-result'
import {
  createAgreementAction,
  recordPaymentAction,
  correctPaidThroughAction,
} from '@/app/(main)/admin/spaces/[id]/billing-agreement-actions'
import { Dialog } from '@/components/ui/dialog'
import { addInterval, type AgreementInterval } from '@/lib/billing/manual-agreement-dates'

import { Input, Textarea } from '@/components/ui/field'
// The MANUAL BILLING panel on /admin/spaces/[id] (ADR-872): the crew's no-SQL path for off-Stripe
// deals. No active agreement -> the record form (plan, cadence, locked amount, method, dates).
// Active agreement -> the receipt summary, a GUARDED "Record payment" button, and a correction path.
// Every write is a janitor-gated server action that re-checks authorization; this component only
// collects intent and surfaces the result. Token-only styling; no em dashes (CONTENT-VOICE).
//
// 🔴 BOTH GUARDS BELOW EXIST BECAUSE THIS SCREEN COST A YEAR (LIVE-050). On 2026-08-18 the owner
// pressed "Record payment" while asking whether they should, and it extended a paying member from
// 2027-07-27 to 2028-07-27, claiming a second $490 year nobody had paid. Two separate things were
// missing, and the smaller one is the one that would have stopped it:
//
//   1. NO CONFIRM. One click, on a field that is money, with no statement of what would change.
//      The dialog now names BOTH dates, and it computes the new one with `addInterval` — the same
//      pure function the server writes with — so the sentence a human reads and the value the
//      database takes cannot drift apart.
//   2. NO CORRECTION PATH. Once active, the panel was a read-only summary plus that one button; the
//      paid-through input existed only on the create form, unreachable forever after. The single
//      control on the screen was the one that could not be reversed, and the operator's only exit
//      was a person with database access.
//
// This is a once-a-year action per Space, so nobody builds a habit around it, and the failure is
// silent: no error, no email, just a wrong date that surfaces when a renewal reminder never arrives.
// A toast would NOT have been a fix. It tells you what happened without letting you undo it.

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
  // Both dialogs' open state, and the date the correction dialog is editing. Declared here rather
  // than inside the `if (agreement)` branch because hooks cannot sit behind a condition.
  const [confirming, setConfirming] = useState(false)
  const [correcting, setCorrecting] = useState(false)
  const [correctTo, setCorrectTo] = useState('')

  // What "Record payment" will actually write, by the server's own rule. Null only if the stored
  // date is unparseable, which also disables the confirm rather than showing a guess.
  const nextPaidThrough = agreement
    ? addInterval(agreement.paidThrough, agreement.interval as AgreementInterval)
    : null

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
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" disabled={pending} onClick={() => { setError(null); setConfirming(true) }}>
            Record payment
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => {
              setError(null)
              setCorrectTo(agreement.paidThrough)
              setCorrecting(true)
            }}
          >
            Correct date
          </Button>
          <p className="text-meta text-muted">
            Recording a payment extends paid-through by one {agreement.interval} and resets the reminders.
          </p>
        </div>
        {error && <p className="text-body-sm text-danger">{error}</p>}

        {/* THE CONFIRM. It states the before and the after as dates, not as "one interval", because
            "extends by one year" is the sentence that got clicked through. `nextPaidThrough` is
            computed by the SAME pure helper the server writes with. */}
        <Dialog open={confirming} onClose={() => setConfirming(false)} ariaLabel="Confirm this payment" className="max-w-md">
          <div className="rounded-card border border-border bg-surface p-5 space-y-4">
            <h3 className="text-body font-semibold text-text">Record a payment?</h3>
            <p className="text-body-sm text-muted">
              This moves paid-through from{' '}
              <span className="font-semibold text-text">{dateLabel(agreement.paidThrough)}</span> to{' '}
              <span className="font-semibold text-text">
                {nextPaidThrough ? dateLabel(nextPaidThrough) : 'a date we could not work out'}
              </span>
              , and clears the three reminder stamps. Only do this once the money has arrived.
            </p>
            <div className="flex items-center justify-end gap-3">
              <Button type="button" variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={pending || !nextPaidThrough}
                onClick={() => {
                  setError(null)
                  start(async () => {
                    const result = await recordPaymentAction(spaceId)
                    setConfirming(false)
                    if (isError(result)) setError(result.error)
                    else router.refresh()
                  })
                }}
              >
                {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
                Yes, record it
              </Button>
            </div>
          </div>
        </Dialog>

        {/* THE CORRECTION PATH. Deliberately unbounded: a repair is as likely to move the date a
            year back as a day forward, and a guessed "sensible range" would block the fix this
            exists for. */}
        <Dialog open={correcting} onClose={() => setCorrecting(false)} ariaLabel="Correct the paid-through date" className="max-w-md">
          <div className="rounded-card border border-border bg-surface p-5 space-y-4">
            <h3 className="text-body font-semibold text-text">Correct the paid-through date</h3>
            <p className="text-body-sm text-muted">
              Sets the date directly, for when a payment was recorded by mistake or the wrong date was
              entered. It currently reads {dateLabel(agreement.paidThrough)}. The reminder stamps clear,
              so a date moved backward can raise its reminders again.
            </p>
            <label className="flex flex-col gap-1 text-2xs font-semibold uppercase tracking-wide text-muted">
              Paid through
              <Input type="date" value={correctTo} onChange={(e) => setCorrectTo(e.target.value)} />
            </label>
            <div className="flex items-center justify-end gap-3">
              <Button type="button" variant="ghost" disabled={pending} onClick={() => setCorrecting(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={pending || !correctTo || correctTo === agreement.paidThrough}
                onClick={() => {
                  setError(null)
                  start(async () => {
                    const result = await correctPaidThroughAction(spaceId, correctTo)
                    setCorrecting(false)
                    if (isError(result)) setError(result.error)
                    else router.refresh()
                  })
                }}
              >
                {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
                Save the date
              </Button>
            </div>
          </div>
        </Dialog>
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
          <Select name="plan" defaultValue="collective" options={PLAN_OPTIONS} />
        </label>
        <label className="block text-body-sm">
          <span className="mb-1 block text-meta font-semibold text-subtle">Billed</span>
          <Select
            name="interval"
            defaultValue="year"
            options={[
              { value: 'year', label: 'Yearly' },
              { value: 'month', label: 'Monthly' },
            ]}
          />
        </label>
        <label className="block text-body-sm">
          <span className="mb-1 block text-meta font-semibold text-subtle">Amount per interval (dollars)</span>
          <Input name="amount" type="number" min="0" step="0.01" required placeholder="490" />
        </label>
        <label className="block text-body-sm">
          <span className="mb-1 block text-meta font-semibold text-subtle">Method</span>
          <Select name="method" defaultValue="cash" options={METHOD_OPTIONS} />
        </label>
        <label className="block text-body-sm">
          <span className="mb-1 block text-meta font-semibold text-subtle">Started</span>
          <Input name="started_at" type="date" required />
        </label>
        <label className="block text-body-sm">
          <span className="mb-1 block text-meta font-semibold text-subtle">Paid through</span>
          <Input name="paid_through" type="date" required />
        </label>
      </div>
      <label className="block text-body-sm">
        <span className="mb-1 block text-meta font-semibold text-subtle">Rate label (shown to the owner)</span>
        <Input
          name="label"
          type="text"
          placeholder="Grandfathered at $49/mo, normally $79"
        />
      </label>
      <label className="block text-body-sm">
        <span className="mb-1 block text-meta font-semibold text-subtle">Crew note (private)</span>
        <Textarea name="note" rows={2} />
      </label>
      <Button type="submit" disabled={pending}>
        {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
        Record agreement
      </Button>
      {error && <p className="text-body-sm text-danger">{error}</p>}
    </form>
  )
}
