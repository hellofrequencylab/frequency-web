'use client'

// UPDATE TO NEW LAYOUTS (BLD-205; LIVE-1860's per-page action in the builder). The outline says how many sections on
// this page can move to the new layouts; this sheet lists each one with its role version beside it, what carries over
// and what the theme now draws instead, and a checkbox to leave it out. "Update" applies the picked ones as one new
// document, so one undo takes the whole page back. Blocks whose lists do not fit a role are listed as staying.
// A modal: focus moves in, Tab stays inside, Esc closes and focus goes back to the opener.

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { LegacyPlan, LegacyRow } from '@/lib/builder/legacy'
import { Checkbox } from '@/components/ui/checkbox'
import styles from './update-layouts-sheet.module.css'

export function UpdateLayoutsSheet({ plan, pageLabel, preview, onApply, onClose, focusFallbackId }: {
  plan: LegacyPlan
  pageLabel: string
  /** Draws one block on this page's canvas. */
  preview: (block: LegacyRow['before'], key: string) => ReactNode
  onApply: (ids: Set<string>) => void
  onClose: () => void
  /** Applying every conversion removes the outline opener; restore focus to a stable builder control. */
  focusFallbackId?: string
}) {
  const [picked, setPicked] = useState(() => new Set(plan.rows.map((r) => r.id)))
  const [activeId, setActiveId] = useState(plan.rows[0]?.id ?? null)
  const active = useMemo(() => plan.rows.find((r) => r.id === activeId) ?? plan.rows[0] ?? null, [plan.rows, activeId])
  const dialog = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    dialog.current?.querySelector<HTMLElement>('input, button')?.focus()
    return () => {
      if (before?.isConnected && before !== document.body && before !== document.documentElement) {
        before.focus()
        if (document.activeElement === before) return
      }
      if (focusFallbackId) document.getElementById(focusFallbackId)?.focus()
    }
  }, [focusFallbackId])

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
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n })

  return (
    <div className={styles.scrim} onPointerDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div ref={dialog} className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={keys}>
        <header className={styles.head}>
          <h2 id={titleId}>Update {pageLabel} to the new layouts</h2>
          <p>Your words, buttons and photos come with each section. The theme draws the rest. You can undo it in one step.</p>
        </header>
        <div className={styles.body}>
          <div className={styles.list}>
            <ul role="list">
              {plan.rows.map((row) => (
                <li key={row.id} className={styles.row} aria-current={active?.id === row.id ? 'true' : undefined} onPointerEnter={() => setActiveId(row.id)}>
                  <Checkbox checked={picked.has(row.id)} onChange={() => toggle(row.id)} onFocus={() => setActiveId(row.id)} wrapperClassName={styles.pick}
                    label={<b>{row.from} <span aria-hidden>→</span><span className={styles.hidden}>becomes</span> {row.to}</b>}
                    hint={`${row.carried.length ? `Comes along: ${row.carried.join(', ')}` : 'Fills from your Space'}${row.dropped.length ? `. The theme now draws: ${row.dropped.join(', ')}` : ''}`} />
                </li>
              ))}
            </ul>
            {plan.kept.length > 0 && <>
              <h3 className={styles.cap}>Staying as they are</h3>
              <ul role="list">{plan.kept.map((k) => <li key={k.id} className={styles.kept}>{k.name}<small>its saved content does not fit a new layout yet</small></li>)}</ul>
            </>}
          </div>
          {active && <div className={styles.compare} aria-label={`Before and after: ${active.from}`} role="group">
            <figure><figcaption>Now</figcaption><div className={styles.frame} aria-hidden>{preview(active.before, `before-${active.id}`)}</div></figure>
            <figure><figcaption>New layout</figcaption><div className={styles.frame} aria-hidden>{preview(active.after, `after-${active.id}`)}</div></figure>
          </div>}
        </div>
        <footer className={styles.actions}>
          <button type="button" className={styles.quiet} onClick={onClose}>Not now</button>
          <button type="button" data-action="update-layouts-apply" className={styles.go} disabled={!picked.size} onClick={() => onApply(picked)}>
            Update {picked.size} {picked.size === 1 ? 'section' : 'sections'}
          </button>
        </footer>
      </div>
    </div>
  )
}
