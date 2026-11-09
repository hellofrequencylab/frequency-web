'use client'

// VERA'S RAIL (BLD-402). Opened from ⌘K, the Vera button or the Add sheet; she never opens it herself except on a
// page with no sections yet, where her one opening line sits here and asks what the page is for. A proposal is a list
// of groups, one per section. Each group can be previewed as a ghost on the canvas and accepted on its own: one group,
// one edit, one undo. Nothing here publishes.

import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Input } from '@/components/ui/field'
import type { VeraGroup, VeraProposal } from '@/lib/builder/vera'
import styles from './vera-rail.module.css'

export function VeraRail({ opening, proposal, groups, previewing, busy, status, seed, onAsk, onPreview, onAccept, onAcceptAll, onDismiss }: {
  opening: string | null
  proposal: VeraProposal | null
  groups: VeraGroup[]
  /** The group id being ghosted on the canvas, 'all', or null. */
  previewing: string | null
  busy: boolean
  status: string
  /** A question carried in from ⌘K or the Add sheet. */
  seed: string
  onAsk: (request: string) => void
  onPreview: (key: string | null) => void
  onAccept: (groupId: string) => void
  onAcceptAll: () => void
  onDismiss: () => void
}) {
  const [typed, setTyped] = useState<string | null>(null)
  const text = typed ?? seed
  const submit = () => { if (text.trim() && !busy) { onAsk(text.trim()); setTyped('') } }
  return (
    <section className={styles.root} aria-label="Vera" data-vera-rail>
      <h2><Sparkles size={16} aria-hidden /> Vera</h2>
      {opening && !proposal && <p className={styles.say}>{opening}</p>}
      <form onSubmit={(e) => { e.preventDefault(); submit() }}>
        <Input aria-label="Ask Vera" placeholder="Ask Vera to rearrange, add or restyle a section" value={text} onChange={(e) => setTyped(e.target.value)} />
        <button type="submit" className={styles.btn} disabled={busy || !text.trim()}>{busy ? 'Thinking…' : 'Ask'}</button>
      </form>
      <p className={styles.status} role="status" aria-live="polite">{status}</p>
      {proposal && <div data-vera-proposal>
        {proposal.note && <p className={styles.say}>{proposal.note}</p>}
        {groups.map((g) => (
          <fieldset key={g.id} className={styles.group} data-vera-group={g.id}>
            <legend>{g.title}</legend>
            <ul>{g.lines.map((l) => <li key={l.index}>{l.line}</li>)}</ul>
            <div className={styles.actions}>
              <button type="button" className={styles.btn} aria-pressed={previewing === g.id} onClick={() => onPreview(previewing === g.id ? null : g.id)}>{previewing === g.id ? 'Hide preview' : 'Preview'}</button>
              <button type="button" className={`${styles.btn} ${styles.primary}`} onClick={() => onAccept(g.id)}>Accept</button>
            </div>
          </fieldset>
        ))}
        {proposal.refused.length > 0 && <ul className={styles.refused} aria-label="Left out">{proposal.refused.map((r) => <li key={r}>{r}</li>)}</ul>}
        <div className={styles.actions}>
          {groups.length > 1 && <button type="button" className={styles.btn} aria-pressed={previewing === 'all'} onClick={() => onPreview(previewing === 'all' ? null : 'all')}>{previewing === 'all' ? 'Hide preview' : 'Preview all'}</button>}
          {groups.length > 1 && <button type="button" className={`${styles.btn} ${styles.primary}`} onClick={onAcceptAll}>Accept all</button>}
          <button type="button" className={styles.btn} onClick={onDismiss}>{groups.length ? 'Dismiss' : 'Close'}</button>
        </div>
        {groups.length > 0 && <p className={styles.status}>Each Accept is one step on your draft, and Undo takes it back. Nothing goes live until you publish.</p>}
      </div>}
    </section>
  )
}
