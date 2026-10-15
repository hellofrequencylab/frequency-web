'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { FqIcon } from '@/components/frequency/icon'

// THE EVENTS FILTER SHEET (SCAN-919, owner 2026-10-14 on Android: "Completely re think and condense this sort
// menu. Do best practice for mobile."). On a phone the page's toolbar carries one Filters button; this is the
// bottom sheet behind it. It is a native <dialog> opened with showModal(), so the page behind is inert, focus
// moves in and stays in, Escape closes it, and on close focus returns to the Filters button. A tap on the
// scrim closes it, and growing past the 768px breakpoint (where the filters sit inline) closes it too.
//
// NO SECOND FILTER LOGIC. The sheet is one GET form to /events: its radios are the same facets, option values
// and param keys the inline menus link to (the body renders them as children), and the server read does the
// filtering, so a link, a refresh and back / forward all keep working. Empty choices ("Any") are dropped
// before the form submits, so the URL stays as clean as hrefWith would write it. The Apply label counts the
// result when that is already known: nothing changed (the current total), or one facet changed (that option's
// real count from facetCounts, measured with the other facets as they stand). Two or more changes say
// "Show results" rather than guess.

/** Real per-option counts, `counts[paramKey][value]` (`''` = that facet cleared). */
type Counts = Record<string, Record<string, number> | undefined>

/** What the Apply button can honestly promise for the staged choices, or null when it cannot know. */
export function stagedCount(
  initial: Record<string, string>,
  staged: Record<string, string>,
  counts: Counts,
  total: number,
): number | null {
  const changed = Object.keys({ ...initial, ...staged }).filter(
    (k) => k !== 'sort' && (initial[k] ?? '') !== (staged[k] ?? ''),
  )
  if (changed.length === 0) return total
  if (changed.length > 1) return null
  const k = changed[0]
  const n = counts[k]?.[staged[k] ?? '']
  return typeof n === 'number' ? n : null
}

function readForm(form: HTMLFormElement, keys: string[]): Record<string, string> {
  const fd = new FormData(form)
  const out: Record<string, string> = {}
  for (const k of keys) out[k] = String(fd.get(k) ?? '')
  return out
}

export function FqEventsFilterSheet({
  action,
  active,
  initial,
  counts,
  total,
  clearHref,
  children,
}: {
  action: string
  /** How many filters are set now (the badge). */
  active: number
  /** The sheet's facet values as the URL has them (`''` = any). */
  initial: Record<string, string>
  counts: Counts
  total: number
  clearHref: string
  children: ReactNode
}) {
  const dlg = useRef<HTMLDialogElement>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const [n, setN] = useState<number | null>(total)
  const keys = Object.keys(initial)

  useEffect(() => {
    const d = dlg.current
    if (!d) return
    const mq = window.matchMedia('(min-width: 768px)')
    const wide = () => mq.matches && d.open && d.close()
    const back = () => btn.current?.focus()
    mq.addEventListener('change', wide)
    d.addEventListener('close', back)
    return () => {
      mq.removeEventListener('change', wide)
      d.removeEventListener('close', back)
    }
  }, [])

  function open() {
    const d = dlg.current
    if (!d || d.open) return
    const form = d.querySelector('form')
    // Back from a submitted sheet can restore the page with its empty choices still disabled.
    form?.querySelectorAll('input').forEach((el) => (el.disabled = false))
    form?.reset()
    setN(total)
    d.showModal()
  }

  return (
    <>
      <button
        ref={btn}
        type="button"
        className="evf-btn"
        onClick={open}
        aria-haspopup="dialog"
        aria-label={active ? `Filters, ${active} on` : 'Filters'}
      >
        <FqIcon name="filter" />
        <span className="evf-btn-t">Filters</span>
        {active > 0 && (
          <span className="evf-badge" aria-hidden="true">
            {active}
          </span>
        )}
      </button>
      <dialog
        ref={dlg}
        className="evf-sheet"
        aria-labelledby="evf-title"
        onClick={(e) => {
          // The dialog box itself is the scrim's only target: a tap outside the panel closes it.
          if (e.target === e.currentTarget) e.currentTarget.close()
        }}
      >
        <form
          method="GET"
          action={action}
          className="evf-form"
          onChange={(e) => setN(stagedCount(initial, readForm(e.currentTarget, keys), counts, total))}
          onSubmit={(e) => {
            for (const el of Array.from(e.currentTarget.elements)) {
              if (el instanceof HTMLInputElement && el.name && !el.value) el.disabled = true
            }
          }}
        >
          <div className="evf-head">
            <h2 id="evf-title" className="h3">
              Filters
            </h2>
            <button type="button" className="evf-x" aria-label="Close filters" onClick={() => dlg.current?.close()}>
              <FqIcon name="close" />
            </button>
          </div>
          <div className="evf-body">{children}</div>
          <div className="evf-foot">
            <a className="btn txt" href={clearHref}>
              Clear all
            </a>
            <button type="submit" className="btn pa evf-apply">
              {n == null ? 'Show results' : `Show ${n} ${n === 1 ? 'event' : 'events'}`}
            </button>
          </div>
        </form>
      </dialog>
    </>
  )
}
