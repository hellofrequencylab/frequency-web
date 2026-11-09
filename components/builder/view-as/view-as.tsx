'use client'

import { SegmentedControl } from '@/components/ui/segmented-control'
import { VIEW_AS, type HostOnlySection, type ViewAs } from '@/lib/builder/view-as'
import styles from './view-as.module.css'

// VIEW AS (BLD-304): Host, Member, Visitor in the top bar as one kit segmented control, each segment carrying its action
// id so ⌘K lists the same three. Under the canvas in a visitor or member view: the sections that view never meets, each
// with the reason and a way to select it (the Tune rail still edits it; the document keeps it).

export function ViewAsSwitch({ view, onChange }: { view: ViewAs; onChange: (view: ViewAs) => void }) {
  return (
    <SegmentedControl<ViewAs> label="View as" value={view} onChange={onChange} size="sm"
      segments={VIEW_AS.map((v) => ({ value: v.id, label: v.label, data: { 'data-action': `view-${v.id}` } }))} />
  )
}

export function ViewAsNotes({ view, hostOnly, onSelect }: { view: ViewAs; hostOnly: HostOnlySection[]; onSelect: (id: string) => void }) {
  if (view === 'host' || !hostOnly.length) return null
  const who = VIEW_AS.find((v) => v.id === view)?.label.toLowerCase() ?? view
  return (
    <details className={styles.notes} open data-view-as-notes>
      <summary>Not shown to a {who} · {hostOnly.length}</summary>
      <ul aria-label={`Sections a ${who} does not see`}>
        {hostOnly.map((h) => <li key={h.id}><button type="button" onClick={() => onSelect(h.id)}>{h.type}</button> <span>{h.reason}</span></li>)}
      </ul>
    </details>
  )
}
