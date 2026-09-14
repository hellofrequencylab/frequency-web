'use client'

import { Banner } from '@/components/admin/status'
import { openAdminBar } from '@/components/admin/open-admin-bar'

// THE DATES A RULE CHANGE LEFT BEHIND (LIVE-279). When a host changes how often a series repeats,
// `retireStaleOccurrences` removes the future dates the new rule no longer produces, and REFUSES
// to remove one that somebody has RSVP'd to, bought a ticket for, been invited to, or posted an
// update on. That refusal is right: taking such a date away is a cancellation, with refunds and
// notices behind it, and it is the host's call. What was missing was the telling. The count came
// back from the save as `occurrencesKept` and reached nothing but a log line, so a host who moved
// a series from weekly to fortnightly had no idea three Wednesdays were still taking RSVPs.
//
// This is that telling: one plain line under the settings form, rendered only when the count is
// above zero, that names the number and points at the EXISTING series-cancel flow. It never ends a
// date itself. The series-cancel control lives in the event Danger zone (`EventDangerZone`), which
// the settings rail mounts under its "More" disclosure, so the pointer REVEALS that control rather
// than inventing a second way to cancel: open the rail if it is closed, open "More", scroll to it.

/** The DOM id the series-cancel block in `EventDangerZone` carries, so this notice can find it. */
export const SERIES_CANCEL_ANCHOR_ID = 'event-series-cancel'

/** The copy, as a pure function so the words can be pinned. Null when there is nothing to say:
 *  a zero renders nothing, by design (a save that kept no date needs no line about dates). */
export function keptDatesCopy(kept: number): { title: string; body: string } | null {
  if (!Number.isFinite(kept) || kept <= 0) return null
  if (kept === 1) {
    return {
      title: '1 date is still on the calendar',
      body: 'The new schedule does not include it, but people already signed up for it, so it stays until you cancel it. Open that date to cancel just the one, or cancel the rest of the series.',
    }
  }
  return {
    title: `${kept} dates are still on the calendar`,
    body: 'The new schedule does not include them, but people already signed up for them, so they stay until you cancel them. Open a date to cancel just that one, or cancel the rest of the series.',
  }
}

const REVEAL_TRIES = 20
const REVEAL_INTERVAL_MS = 150

/**
 * Bring the existing series-cancel control into view. The Danger zone sits inside the rail's
 * "More" `<details>`, which is always mounted but closed by default, and on the Manage hub the
 * rail itself is closed until asked. So: look for the block; when it is there, open every
 * disclosure above it and scroll to it; when it is not, open the rail and look again for a few
 * seconds while its modules load. Fails quiet: a host who ends up with the rail open and the
 * Danger zone one disclosure away is no worse off than before this notice existed.
 */
export function revealSeriesCancel(doc: Document = document): void {
  const reveal = (): boolean => {
    const el = doc.getElementById(SERIES_CANCEL_ANCHOR_ID)
    if (!el) return false
    let details = el.closest('details')
    while (details) {
      // Setting the DOM property fires `toggle`, which the rail listens to and mirrors into state.
      if (!details.open) details.open = true
      details = details.parentElement?.closest('details') ?? null
    }
    el.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
    el.focus?.()
    return true
  }
  if (reveal()) return
  openAdminBar()
  let tries = 0
  const tick = () => {
    if (reveal() || ++tries >= REVEAL_TRIES) return
    setTimeout(tick, REVEAL_INTERVAL_MS)
  }
  setTimeout(tick, REVEAL_INTERVAL_MS)
}

/** The line itself. Renders nothing for zero. */
export function KeptDatesNotice({ kept, onReveal = revealSeriesCancel }: { kept: number; onReveal?: () => void }) {
  const copy = keptDatesCopy(kept)
  if (!copy) return null
  return (
    <div data-kept-dates={kept}>
      <Banner
        tone="warning"
        title={copy.title}
        action={
          <button
            type="button"
            onClick={() => onReveal()}
            className="inline-flex items-center rounded-control border border-border bg-surface px-3 py-1.5 text-meta font-semibold text-text transition-colors hover:border-border-strong"
          >
            Cancel the rest of this series
          </button>
        }
      >
        {copy.body}
      </Banner>
    </div>
  )
}
