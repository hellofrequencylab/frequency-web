'use client'

import { useTransition, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check } from 'lucide-react'
import { updateEvent, cancelEvent, reinstateEvent } from '../actions'

type EventData = {
  id: string
  title: string
  slug: string
  description: string | null
  location: string | null
  starts_at: string
  ends_at: string | null
  is_cancelled: boolean | null
}

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

export function EventEditClient({ event }: { event: EventData }) {
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
    </div>
  )
}
