'use client'

import type { ReactNode } from 'react'
import { Checkbox } from '@/components/ui/checkbox'

// VERA'S COMMAND BAR (Site Editor handoff): always at the bottom centre of the stage, never a collapsed
// toggle. The reply card and suggestion chips stack above the bar, all in one labelled region.
export function VeraDock({ children }: { children: ReactNode }) {
  return <section className="we-vera" aria-label="Vera writing assistant">{children}</section>
}

/** One proposed line as the person reads it, with whether it is ticked. */
interface VeraLayoutLine { line: string; ticked: boolean }

// VERA'S LAYOUT PROPOSAL (LIVE-2097): the lines she proposes, each a tickable box, default ticked; Apply puts
// only the ticked ones on the DRAFT as one undo step. Refused lines are listed so nothing is dropped silently.
// Preview on page (LIVE-2141) draws the ticked lines on the canvas, read-only, before anything is applied.
// The two editor layouts pass their own button classes; the list itself is the same.
export function VeraLayoutProposal({ className, note, lines, refused, onToggle, onApply, onDismiss, buttonClass, dismissClass, previewing, onPreview }: {
  className?: string
  note: string
  lines: VeraLayoutLine[]
  refused: string[]
  onToggle: (index: number) => void
  onApply: () => void
  onDismiss: () => void
  buttonClass: string
  dismissClass: string
  /** The ghost preview (LIVE-2141): the canvas draws the ticked section lines, read-only, until turned off. */
  previewing?: boolean
  onPreview?: () => void
}) {
  const count = lines.filter((l) => l.ticked).length
  return <div className={className} data-vera-layout>
    {note && <p>{note}</p>}
    {lines.length > 0 && <fieldset>
      <legend className="we-caption">Proposed changes to your draft</legend>
      {lines.map((l, i) => <Checkbox key={`${i}:${l.line}`} label={l.line} checked={l.ticked} onChange={() => onToggle(i)} />)}
    </fieldset>}
    {refused.length > 0 && <ul aria-label="Left out">{refused.map((r) => <li key={r}>{r}</li>)}</ul>}
    {lines.length > 0 && <p><small>Applies to your draft as one step you can undo. Nothing goes live until you publish.</small></p>}
    {lines.length > 0 && <button type="button" className={buttonClass} disabled={count === 0} onClick={onApply}>{count === lines.length ? 'Apply to draft' : `Apply ${count} to draft`}</button>}
    {lines.length > 0 && onPreview && <>{' '}<button type="button" className={dismissClass} aria-pressed={!!previewing} onClick={onPreview}>{previewing ? 'Hide preview' : 'Preview on page'}</button></>}
    {' '}<button type="button" className={dismissClass} onClick={onDismiss}>{lines.length > 0 ? 'Dismiss' : 'Not now'}</button>
  </div>
}
