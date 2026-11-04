'use client'

// THE PUBLISH RING (BLD-204; spec docs/design/frequency-builder-v3/block-editor-spec.md §2 top bar and §4). Publish with
// a ring and a count beside it: what is left before the page is the owner's. Clicking the count steps through each
// item (the section is selected and scrolled to, the page switched when it lives on another one). The ring reads the
// gate: a missing number holds Publish, sample words need an explicit keep, the rest are warnings.

import type { Readiness } from '@/lib/builder/readiness'
import styles from './readiness.module.css'

export function PublishRing({ readiness, dirty, saving, onStep, onPublish }: {
  readiness: Readiness
  dirty: boolean
  saving: boolean
  /** Show the next item. */
  onStep: () => void
  /** Publish, or open the sheet when something is left. */
  onPublish: () => void
}) {
  const { count, gate } = readiness
  const state = !dirty ? 'live' : gate === 'clear' ? 'clean' : 'issues'
  const said = gate === 'blocked' ? 'a number is missing, so Publish waits' : gate === 'keep' ? 'sample words need your keep before Publish' : 'Publish is ready'
  return (
    <span className={styles.ring} data-gate={gate}>
      {count > 0 && (
        <button type="button" data-action="readiness-next" className={styles.count} onClick={onStep}
          aria-label={`${count} ${count === 1 ? 'thing' : 'things'} to look at: ${said}. Show the next one.`} title="Show the next one">
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden><circle cx="12" cy="12" r="10" /></svg>
          <b aria-hidden>{count}</b>
        </button>
      )}
      <button type="button" data-action="publish" className={styles.publish} data-state={state} disabled={saving || !dirty}
        aria-haspopup={count > 0 ? 'dialog' : undefined} onClick={onPublish}>
        {dirty ? 'Publish' : 'Published'}
      </button>
    </span>
  )
}
