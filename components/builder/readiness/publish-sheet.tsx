'use client'

// THE PUBLISH SHEET (BLD-204; spec docs/design/frequency-builder-v3/block-editor-spec.md §3 "Publish"). Opens from
// Publish when anything is left: the title states the count, each item is a button that goes to the fix. The way out
// follows the gate: a missing number has no publish button at all; sample words publish only through "Keep the
// sample words and publish", said in so many words; warnings publish through "Publish anyway". A modal: focus moves
// in, Tab stays inside, Esc closes and focus goes back to Publish.

import { useId, useRef, type KeyboardEvent } from 'react'
import { useDialogFocusTrap } from '@/components/ui/use-dialog-focus-trap'
import type { Readiness, ReadinessItem } from '@/lib/builder/readiness'
import styles from './readiness.module.css'

export function PublishSheet({ readiness, onFix, onPublish, onClose }: {
  readiness: Readiness
  onFix: (item: ReadinessItem) => void
  /** Publish now; `keep` is true when the owner chose to keep the sample words. */
  onPublish: (keep: boolean) => void
  onClose: () => void
}) {
  const { items, count, gate } = readiness
  const dialog = useRef<HTMLDivElement>(null)
  const titleId = useId()
  // The kit trap moves focus to the first button, keeps Tab inside and hands focus back to Publish.
  useDialogFocusTrap(true, dialog)

  function keys(e: KeyboardEvent<HTMLDivElement>) {
    // Tab goes on to the kit trap; every other key stops here so the builder's shortcuts stay quiet.
    if (e.key !== 'Tab') e.stopPropagation()
    if (e.key === 'Escape') { e.preventDefault(); onClose() }
  }

  const lead = gate === 'blocked'
    ? 'A figure with no number reads as a gap. Fill it in, then publish.'
    : gate === 'keep'
      ? 'Some sections still have the starter kit’s words. You can keep them on purpose, or make them yours first.'
      : 'Nothing here stops you. Each one makes the page a little better.'

  return (
    <div className={styles.scrim} onPointerDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div ref={dialog} className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={keys}>
        <h2 id={titleId}>{count} {count === 1 ? 'thing' : 'things'} to look at before you publish</h2>
        <p className={styles.lead}>{lead}</p>
        <ul className={styles.items} role="list">
          {items.map((item, i) => (
            <li key={`${item.pageSlug}-${item.sectionId ?? 'page'}-${item.kind}-${i}`}>
              <span className={styles.kind} data-kind={item.kind} aria-hidden />
              <span className={styles.say}>{item.say}</span>
              <button type="button" className={styles.fix} onClick={() => onFix(item)} aria-label={`Fix: ${item.say}`}>Fix</button>
            </li>
          ))}
        </ul>
        <div className={styles.actions}>
          <button type="button" className={styles.quiet} onClick={onClose}>Back to editing</button>
          {gate === 'keep' && <button type="button" data-action="publish-keep" className={styles.go} onClick={() => onPublish(true)}>Keep the sample words and publish</button>}
          {gate === 'warn' && <button type="button" data-action="publish-anyway" className={styles.go} onClick={() => onPublish(false)}>Publish anyway</button>}
        </div>
      </div>
    </div>
  )
}
