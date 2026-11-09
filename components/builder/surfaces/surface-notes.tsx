'use client'

import { surfaceSpec, type BuilderSurface, type SurfaceSections } from '@/lib/builder/surfaces'
import styles from './surfaces.module.css'

// WHAT THIS SURFACE CANNOT SHOW (BLD-301). Above the canvas: the sections the surface hides, each with its reason and a
// way to select it (the Tune rail still edits it; the document keeps it), and the sections shown with a note (a door on
// Spotlight, rows fixed at send in an email). Nothing on the site surface, where every section shows.

export function SurfaceNotes({ surface, sections, onSelect }: { surface: BuilderSurface; sections: SurfaceSections; onSelect: (id: string) => void }) {
  const { hidden, notes } = sections
  if (!hidden.length && !notes.length) return null
  const label = surfaceSpec(surface).label
  return (
    <details className={styles.notes} open={hidden.length > 0} data-surface-notes>
      <summary>{hidden.length ? `Not shown on ${label} · ${hidden.length}` : `On ${label} · ${notes.length} ${notes.length === 1 ? 'note' : 'notes'}`}</summary>
      {hidden.length > 0 && (
        <ul aria-label={`Sections not shown on ${label}`}>
          {hidden.map((h) => <li key={h.id}><button type="button" onClick={() => onSelect(h.id)}>{h.name}</button> <span>{h.reason}</span></li>)}
        </ul>
      )}
      {notes.length > 0 && (
        <ul aria-label={`Notes for ${label}`}>
          {notes.map((n) => <li key={n.id}><span>{n.note}</span></li>)}
        </ul>
      )}
    </details>
  )
}
