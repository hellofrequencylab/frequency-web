'use client'

import { useEffect, useState, useTransition, type FormEvent } from 'react'
import { usePathname } from 'next/navigation'
import { Check, Ticket } from 'lucide-react'
import { moduleById } from '@/lib/admin/modules/registry'
import { labelClasses } from '@/components/ui/field'
import { getEventEngageData, updateEventPricing, type EventEngageData } from '@/app/(main)/events/admin-actions'

// In-place "Engage" module (ENTITY-MANAGEMENT-OVERHAUL §4, the 'engage' spine cell). Renders in
// the page admin dock on /events/[slug]; the server returns null unless the caller holds
// event.editSettings. Sets the ticket price (a free RSVP event has none), summarises sold tickets
// and revenue where the event sells them, and shows the running check-in count.

const fieldLabel = labelClasses

function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency.toUpperCase() }).format(
      cents / 100,
    )
  } catch {
    return `$${(cents / 100).toFixed(2)}`
  }
}

export function EventEngageModule() {
  const pathname = usePathname()
  const slug = pathname.match(/^\/events\/([^/]+)/)?.[1] ?? null

  const [data, setData] = useState<EventEngageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (!slug) return
    let active = true
    getEventEngageData(slug)
      .then((d) => {
        if (active) {
          setData(d)
          setLoading(false)
        }
      })
      .catch(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [slug])

  if (!slug) return null
  if (loading) {
    return <div className="h-40 animate-pulse rounded-2xl border border-border bg-surface-elevated/50" />
  }
  if (!data) return null

  const mod = moduleById('event.engage')
  const Icon = mod?.Icon ?? Ticket
  const isPaid = data.priceCents != null && data.priceCents > 0

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const res = await updateEventPricing(data!.eventId, slug!, fd)
      if ('error' in res) {
        setError(res.error)
      } else {
        setError(null)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    })
  }

  return (
    <div className="@container space-y-6">
      <section>
        <header className="mb-4 space-y-1">
          <h3 className="flex items-center gap-2 text-sm font-bold text-text">
            {Icon && <Icon className="h-4 w-4 shrink-0 text-primary-strong" />}
            {mod?.label ?? 'Engage'}
          </h3>
          {mod?.desc && <p className="text-sm text-muted">{mod.desc}</p>}
        </header>

        {/* Ticket price — blank keeps the event a free RSVP. */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block space-y-1.5">
            <span className={fieldLabel}>Ticket price</span>
            <div className="flex items-center gap-2">
              <span className="flex flex-1 items-center rounded-lg border border-border bg-surface px-3 text-sm text-subtle">
                <span className="shrink-0 uppercase">{data.currency}</span>
                <input
                  name="price"
                  type="number"
                  min={0}
                  step="0.01"
                  defaultValue={isPaid ? (data.priceCents! / 100).toString() : ''}
                  placeholder="Free"
                  disabled={pending}
                  className="min-w-0 flex-1 bg-transparent px-2 py-2 text-text outline-none disabled:opacity-50"
                />
              </span>
              <button
                type="submit"
                disabled={pending}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40"
              >
                {saved ? <Check className="h-3.5 w-3.5" /> : null}
                {pending ? 'Saving…' : saved ? 'Saved' : 'Save'}
              </button>
            </div>
            <span className="text-2xs text-subtle">
              Leave blank for a free RSVP event. Set a price to sell tickets.
            </span>
          </label>
          {error && <p className="text-xs font-medium text-danger">{error}</p>}
        </form>

        {/* Sales + check-in summary — real where the event sells tickets, a clean line where not. */}
        <div className="mt-5 space-y-3">
          {isPaid ? (
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Sold', value: String(data.ticketsSold) },
                { label: 'Revenue', value: formatMoney(data.revenueCents, data.currency) },
                { label: 'Checked in', value: `${data.checkedIn}/${data.going}` },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border border-border bg-surface p-3">
                  <div className="truncate text-base font-bold text-text">{s.value}</div>
                  <div className="text-2xs font-medium uppercase tracking-wide text-subtle">{s.label}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-surface-elevated/40 p-4 text-center">
              <Ticket className="mx-auto mb-2 h-5 w-5 text-subtle" />
              <p className="text-sm font-medium text-text">This is a free RSVP event</p>
              <p className="mt-1 text-xs text-muted">
                {data.checkedIn > 0
                  ? `${data.checkedIn} of ${data.going} going have checked in.`
                  : 'Add a price above to sell tickets, or keep it free and track RSVPs in People.'}
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
