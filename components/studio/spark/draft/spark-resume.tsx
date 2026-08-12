'use client'

// The three things autosave has to SAY: there is a draft waiting (with both answers offered at the
// same weight, so discarding is never the hidden one), two drafts disagree and only the author can
// settle it, and the current typing is safe.
//
// Deliberately NOT here: a completion meter. The point of this work is save-and-resume, which
// reduces abandonment; a "40% complete" ring is decoration that tells an author nothing they can
// act on. The shell's step count already says where they are.

import { History, Laptop } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { SaveState } from '../../kit/use-studio-draft'

/** The offer, shown above the stage when a Spark is opened with a saved draft waiting. */
export function SparkResumeOffer({
  savedLabel,
  fromAnotherDevice,
  onRestore,
  onDiscard,
}: {
  savedLabel: string
  fromAnotherDevice?: boolean
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
            {/* Neither line claims WHERE the answers are kept. Sync degrades to this device alone
                whenever the server is unreachable, and a cue that promised an account would be a
                lie exactly when it mattered. */}
            {fromAnotherDevice
              ? `You started this ${savedLabel} on another device. Your answers are saved, and nothing has been created yet.`
              : `You started this ${savedLabel}. Your answers are saved, and nothing has been created yet.`}
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

/**
 * Two drafts, and the newer one is not the one on this screen. The author decides, always.
 *
 * Both timestamps are on the card because they are the only fact that settles it, and both buttons
 * name what they keep rather than saying yes and no. Nothing is merged: half of one draft mixed
 * into half of another is a document nobody wrote.
 */
export function SparkDraftConflict({
  localLabel,
  otherLabel,
  onTakeOther,
  onKeepLocal,
}: {
  localLabel: string
  otherLabel: string
  onTakeOther: () => void
  onKeepLocal: () => void
}) {
  return (
    <section
      aria-label="Two saved drafts"
      className="mb-5 rounded-card border border-border-strong bg-surface px-4 py-3.5"
    >
      <div className="flex items-start gap-2.5">
        <Laptop className="mt-0.5 h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
        <div className="min-w-0">
          <p className="text-body-sm font-semibold text-text">You have a newer draft from another device</p>
          <p className="mt-0.5 text-meta leading-snug text-muted">
            This device saved answers {localLabel}. Another device saved a different set {otherLabel}. Pick
            the one to keep. The other is replaced, so take a copy first if you want both.
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="primary" onClick={onTakeOther}>
          Use the newer draft
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={onKeepLocal}>
          Keep this device&rsquo;s draft
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
        ? 'Saved'
        : null

  if (!message) return null

  return (
    <p className="mt-1.5 text-2xs text-muted" aria-live="polite">
      {message}
    </p>
  )
}
