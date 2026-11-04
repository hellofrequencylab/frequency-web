'use client'

// THE COMMAND BAR (BLD-106; spec docs/EDITOR-NEXT.md#bld-106). ⌘K or Ctrl+K, or the Find button on touch. Three
// groups from lib/builder/commands.ts: Go to (sections and pages), Do (every action in the registry) and Ask Vera.
// Recent commands come first. A modal dialog: focus stays inside while it is open and goes back to what had it
// when it closes.

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Input } from '@/components/ui/field'
import { commandRows, rememberCommand, type CommandRow } from '@/lib/builder/commands'
import styles from './command-bar.module.css'

const RECENT_KEY = 'frequency.builder.commands.recent.v1'

function readRecent(): string[] {
  try { const v = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [] } catch { return [] }
}

export function CommandBar({ sections, pages, selected, onRun, onClose }: {
  sections: { id: string; name: string; title: string }[]
  pages: { slug: string; label: string }[]
  selected: boolean
  onRun: (id: string) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [recent] = useState(readRecent)
  const rows = useMemo(() => commandRows({ sections, pages, selected, recent, query }), [sections, pages, selected, recent, query])
  const dialog = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const listId = useId()
  // Remember who had focus, take it, and give it back on close.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    input.current?.focus()
    return () => { before?.focus?.() }
  }, [])

  const run = (row: CommandRow | undefined) => {
    if (!row) return
    try { window.localStorage.setItem(RECENT_KEY, JSON.stringify(rememberCommand(recent, row.id))) } catch { /* private mode */ }
    onRun(row.id)
  }
  const at = Math.min(active, Math.max(0, rows.length - 1))

  function keys(e: KeyboardEvent<HTMLDivElement>) {
    e.stopPropagation()
    if (e.key === 'Escape') { e.preventDefault(); onClose() }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, rows.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); run(rows[at]) }
    else if (e.key === 'Tab') {
      // The trap: Tab cycles inside the dialog.
      const focusable = [...(dialog.current?.querySelectorAll<HTMLElement>('input, button') ?? [])]
      if (!focusable.length) return
      const i = focusable.indexOf(document.activeElement as HTMLElement)
      const next = e.shiftKey ? (i <= 0 ? focusable.length - 1 : i - 1) : (i === focusable.length - 1 ? 0 : i + 1)
      e.preventDefault()
      focusable[next].focus()
    }
  }

  return (
    <div className={styles.scrim} onPointerDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div ref={dialog} className={styles.dialog} role="dialog" aria-modal="true" aria-label="Find, do or ask" onKeyDown={keys}>
        <Input ref={input} className={styles.input} role="combobox" aria-label="Find, do or ask" aria-expanded="true" aria-controls={listId} aria-activedescendant={rows[at] ? `${listId}-${at}` : undefined} placeholder="Find a section, do something, or ask Vera" value={query} onChange={(e) => { setQuery(e.target.value); setActive(0) }} />
        <ul id={listId} className={styles.list} role="listbox" aria-label="Commands">
          {rows.map((row, i) => {
            const head = i === 0 || rows[i - 1].group !== row.group ? row.group : null
            return (
              <li key={row.id} role="presentation">
                {head && <div className={styles.group} role="presentation">{head}</div>}
                <button id={`${listId}-${i}`} type="button" role="option" tabIndex={-1} aria-selected={i === at} className={styles.row} onPointerMove={() => setActive(i)} onClick={() => run(row)}>
                  <span>{row.label}</span>{row.keys && <kbd className={styles.kbd}>{row.keys}</kbd>}
                </button>
              </li>
            )
          })}
          {rows.length === 0 && <li className={styles.empty}>Nothing here yet. Type a question to ask Vera.</li>}
        </ul>
        <button type="button" className={styles.close} onClick={onClose}>Close</button>
      </div>
    </div>
  )
}
