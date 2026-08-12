'use client'

// The two things autosave has to SAY: there is a draft waiting (with both answers offered at the
// same weight, so discarding is never the hidden one), and the current typing is safe.
//
// Deliberately NOT here: a completion meter. The point of this work is save-and-resume, which
// reduces abandonment; a "40% complete" ring is decoration that tells an author nothing they can
// act on. The shell's step count already says where they are.

import { History } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { SaveState } from '../../kit/use-studio-draft'

/** The offer, shown above the stage when a Spark is opened with a saved draft waiting. */
export function SparkResumeOffer({
  savedLabel,
  onRestore,
  onDiscard,
}: {
  savedLabel: string
  onRestore: () => void
  onDiscard: () => void
}) {
  return (
    <section
      aria-label="Saved draft"
      className="mb-5 rounded-card border border-border bg-surface px-4 py-3.5"
    >
      <div className="flex items-start gap-2.5">
        <History className="mt-0.5 h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
        <div className="min-w-0">
          <p className="text-body-sm font-semibold text-text">Pick up where you left off</p>
          <p className="mt-0.5 text-meta leading-snug text-muted">
            You started this {savedLabel}. Your answers are saved on this device, and nothing has been created yet.
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="primary" onClick={onRestore}>
          Restore answers
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={onDiscard}>
          Start fresh
        </Button>
      </div>
    </section>
  )
}

/** The quiet cue under the progress: what autosave just did, and what it did NOT do. */
export function SparkDraftCue({ saveState, restored }: { saveState: SaveState; restored: boolean }) {
  const message = restored
    ? 'Restored. Your saved answers fill in as you reach each step.'
    : saveState === 'saving'
      ? 'Saving your answers'
      : saveState === 'saved'
        ? 'Saved on this device'
        : null

  if (!message) return null

  return (
    <p className="mt-1.5 text-2xs text-subtle" aria-live="polite">
      {message}
    </p>
  )
}
