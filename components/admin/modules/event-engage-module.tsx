'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Ticket } from 'lucide-react'
import { labelClasses } from '@/components/ui/field'
import { RailAutosaveForm } from '@/components/admin/rail/rail-autosave-form'
import { getEventEngageData, updateEventPricing, type EventEngageData } from '@/app/(main)/events/admin-actions'

// In-place "Engage" module (ENTITY-MANAGEMENT-OVERHAUL §4, the 'engage' spine cell) on /events/[slug].
// Sets the ticket price (a free RSVP event has none) and summarises sold tickets / revenue / check-in.
// The rail supplies the title; the price autosaves on blur and reflects live (RailAutosaveForm).

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

  // Adapt the {error}-returning pricing action to the throw-on-error autosave contract.
  const eventId = data?.eventId
  const action = useCallback(
    async (fd: FormData) => {
      const res = await updateEventPricing(eventId!, slug!, fd)
      if ('error' in res) throw new Error(res.error)
    },
    [eventId, slug],
  )

  if (!slug) return null
  if (loading) {
    return <div className="h-40 animate-pulse rounded-2xl border border-border bg-surface-elevated/50" />
  }
  if (!data) return null

  const isPaid = data.priceCents != null && data.priceCents > 0

  return (
    <div className="@container">
      {/* Ticket price — blank keeps the event a free RSVP. Autosaves on blur. */}
      <RailAutosaveForm action={action} className="space-y-3">
        <label className="block space-y-1.5">
          <span className={fieldLabel}>Ticket price</span>
          <span className="flex items-center rounded-lg border border-border bg-surface px-3 text-sm text-subtle">
            <span className="shrink-0 uppercase">{data.currency}</span>
            <input
              name="price"
              type="number"
              min={0}
              step="0.01"
              defaultValue={isPaid ? (data.priceCents! / 100).toString() : ''}
              placeholder="Free"
              className="min-w-0 flex-1 bg-transparent px-2 py-2 text-text outline-none"
            />
          </span>
          <span className="text-2xs text-subtle">
            Leave blank for a free RSVP event. Set a price to sell tickets.
          </span>
        </label>
      </RailAutosaveForm>

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
    </div>
  )
}
