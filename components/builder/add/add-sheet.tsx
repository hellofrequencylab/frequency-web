'use client'

// ADD A SECTION BY INTENT (BLD-202; spec docs/design/frequency-builder-v3/block-editor-spec.md §3). The + on the canvas, the
// outline and the phone's Add button open this sheet: "What should this part do?", a search, up to three suggestions
// for this page, then the roles grouped Welcome, Show up, Trust, Answer, More. The card under the pointer or the focus
// shows a preview beside the list: the role's default variant on this theme, with the Space's own rows when it has
// them, else the flagged sample (the shell draws it, so the preview wears the same canvas as the page). Picking a
// card inserts it where the + was, selects it, and is one undo step. A modal: focus stays inside and goes back on close.

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Input } from '@/components/ui/field'
import { FqIcon } from '@/components/frequency/icon'
import { addSheet, type AddCard } from '@/lib/builder/add'
import type { Data } from '@/lib/page-editor/types'
import styles from './add-sheet.module.css'

export function AddSheet({ cards, doc, at, onPick, onAsk, onClose, preview }: {
  cards: AddCard[]
  doc: Data
  /** Where the section goes: 0 is the top of the page. */
  at: number
  onPick: (type: string) => void
  onAsk: (question: string) => void
  onClose: () => void
  /** Draws a card's preview on this page's canvas. */
  preview: (card: AddCard) => ReactNode
}) {
  const [query, setQuery] = useState('')
  const { suggested, groups } = useMemo(() => addSheet(cards, doc, query), [cards, doc, query])
  const first = suggested[0] ?? groups[0]?.cards.find((c) => !c.disabled) ?? null
  const [active, setActive] = useState<AddCard | null>(null)
  const shown = active && (suggested.includes(active) || groups.some((g) => g.cards.includes(active))) ? active : first
  const dialog = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const titleId = useId()
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    input.current?.focus()
    return () => { before?.focus?.() }
  }, [])

  function keys(e: KeyboardEvent<HTMLDivElement>) {
    e.stopPropagation()
    if (e.key === 'Escape') { e.preventDefault(); onClose() }
    else if (e.key === 'Tab') {
      const focusable = [...(dialog.current?.querySelectorAll<HTMLElement>('input, button:not([disabled])') ?? [])]
      if (!focusable.length) return
      const i = focusable.indexOf(document.activeElement as HTMLElement)
      const next = e.shiftKey ? (i <= 0 ? focusable.length - 1 : i - 1) : (i === focusable.length - 1 ? 0 : i + 1)
      e.preventDefault()
      focusable[next].focus()
    }
  }

  const card = (c: AddCard, key: string) => (
    <li key={key}>
      <button type="button" className={styles.card} data-role={c.role} disabled={c.disabled} aria-describedby={c.disabled ? `${key}-why` : undefined}
        aria-current={shown === c ? 'true' : undefined}
        onPointerEnter={() => setActive(c)} onFocus={() => setActive(c)} onClick={() => onPick(c.type)}>
        <span className={styles.tile} aria-hidden><FqIcon name={c.icon} size={20} /></span>
        <span className={styles.text}>
          <b>{c.intent}{c.live && <span className={styles.live}>Live</span>}</b>
          <small id={`${key}-why`}>{c.disabled ? c.reason : c.why}</small>
        </span>
      </button>
    </li>
  )

  return (
    <div className={styles.scrim} onPointerDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div ref={dialog} className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={keys}>
        <header className={styles.head}>
          <h2 id={titleId}>What should this part do?</h2>
          <p>Adding at {at + 1} of {doc.content.length + 1}</p>
          <button type="button" className={styles.close} onClick={onClose}>Close</button>
        </header>
        <Input ref={input} className={styles.search} type="search" aria-label="Search sections" placeholder="Search, like photos or questions" value={query} onChange={(e) => { setQuery(e.target.value); setActive(null) }} />
        <div className={styles.body}>
          <div className={styles.list}>
            {suggested.length > 0 && <section aria-label="Suggested for this page"><h3 className={styles.cap}>Suggested for this page</h3><ul role="list">{suggested.map((c) => card(c, `s-${c.role}`))}</ul></section>}
            {groups.map((g) => <section key={g.group} aria-label={g.group}><h3 className={styles.cap}>{g.group}</h3><ul role="list">{g.cards.map((c) => card(c, `g-${c.role}`))}</ul></section>)}
            {groups.length === 0 && <div className={styles.empty}>
              <p>Nothing matches “{query}”. Vera can help you work out what this part should do.</p>
              <button type="button" className={styles.close} onClick={() => onAsk(query)}>Ask Vera</button>
            </div>}
          </div>
          {shown && <figure className={styles.preview} aria-label={`Preview: ${shown.intent}`}>
            <figcaption>{shown.live ? 'Preview with your Space’s own details where it has them' : 'Preview with sample words you will replace'}</figcaption>
            <div className={styles.frame} aria-hidden>{preview(shown)}</div>
          </figure>}
        </div>
      </div>
    </div>
  )
}
