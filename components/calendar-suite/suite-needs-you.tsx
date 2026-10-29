'use client'

import { useState } from 'react'
import { FqIcon, type FqIconName } from '@/components/frequency/icon'
import type { needsYou } from '@/lib/calendar/planner/needs-you'

// THE NEEDS-YOU ROW (README 1.2): the count as a pill with a breathing dot, then the things waiting on
// a person as chips that scroll sideways. Hide folds the row away and the pill stays to bring it back.
// Every chip opens its record in Details, because the answer to it is made there.

type Entry = ReturnType<typeof needsYou>[number]

export function SuiteNeedsYou({ entries, onOpen }: { entries: readonly Entry[]; onOpen: (entry: Entry) => void }) {
  const [open, setOpen] = useState(true)
  if (entries.length === 0) return null
  return (
    <div className="cal-needs">
      <button type="button" className="cal-needs-pill" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="cal-dot cal-dot-live fq-breathe" aria-hidden />
        {entries.length} need{entries.length === 1 ? 's' : ''} you
        <span className="cal-needs-toggle">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open ? (
        <ul className="cal-plain cal-needs-row" aria-label="Waiting on you">
          {entries.map((entry) => (
            <li key={entry.id} className="cal-need">
              <span className="cal-need-disc" style={{ color: entry.tone }} aria-hidden>
                <FqIcon name={entry.icon as FqIconName} size={14} />
              </span>
              <span className="cal-need-text">
                <span className="cal-need-t">{entry.text}</span>
                <span className="cal-as">{entry.sub}</span>
              </span>
              <button type="button" className="cal-need-act" onClick={() => onOpen(entry)}>
                {entry.op === 'inbox' ? 'Show' : 'Open'}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
