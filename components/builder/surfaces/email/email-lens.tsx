'use client'

// THE EMAIL LENS (BLD-302; spec docs/EDITOR-NEXT.md#bld-302). The canvas for the email surface: the compiled email itself
// (compileEmailDoc, the send's own HTML) in a document of its own at 600 wide, with the inbox line above it (who it is
// from, the subject, the preheader) and, under it, what the send fixes and what the email cannot carry. The frame holds
// the send's bytes and nothing of the builder's styling reaches inside it; the chrome around it wears the Frequency
// design system. No script runs in the frame.

import { useCallback, useState } from 'react'
import type { EmailLensResult } from '@/lib/builder/email-lens'
import styles from './email-lens.module.css'

export function EmailLens({ lens, from, onSelect }: { lens: EmailLensResult; from: string; onSelect: (id: string) => void }) {
  const [height, setHeight] = useState(640)
  // The frame carries the same origin and no script, so the document's own height is readable once it has laid out.
  const fit = useCallback((frame: HTMLIFrameElement | null) => {
    const h = frame?.contentDocument?.documentElement?.scrollHeight
    if (h) setHeight(Math.max(320, h))
  }, [])
  const frozen = lens.sections.filter((s) => s.status === 'frozen')
  const hidden = lens.sections.filter((s) => s.status === 'hidden')
  return (
    <div className={styles.root} data-lens="email">
      <dl className={styles.inbox} aria-label="How it lands in the inbox">
        <div><dt>From</dt><dd>{from}</dd></div>
        <div><dt>Subject</dt><dd>{lens.subject}</dd></div>
        <div><dt>Preview</dt><dd>{lens.preheader || <span className={styles.muted}>No preview line yet</span>}</dd></div>
      </dl>
      <iframe className={styles.frame} title="Email preview" sandbox="allow-same-origin" srcDoc={lens.html} style={{ height }} onLoad={(e) => fit(e.currentTarget)} />
      {(frozen.length > 0 || hidden.length > 0) && (
        <div className={styles.notes}>
          {frozen.length > 0 && <EmailLensList heading="Fixed when it is sent" items={frozen} onSelect={onSelect} />}
          {hidden.length > 0 && <EmailLensList heading="Not in the email" items={hidden} onSelect={onSelect} />}
        </div>
      )}
      <details className={styles.text}>
        <summary>Plain text version</summary>
        <pre>{lens.text}</pre>
      </details>
    </div>
  )
}

function EmailLensList({ heading, items, onSelect }: { heading: string; items: EmailLensResult['sections']; onSelect: (id: string) => void }) {
  return (
    <details className={styles.list} open={items.length <= 3}>
      <summary>{heading} · {items.length}</summary>
      <ul>
        {items.map((s) => (
          <li key={s.id || s.type}>
            <button type="button" onClick={() => onSelect(s.id)}><b>{s.name}</b><span>{s.note}</span></button>
          </li>
        ))}
      </ul>
    </details>
  )
}
