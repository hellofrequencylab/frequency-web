'use client'

import { useEffect, useId, useRef, type KeyboardEvent } from 'react'
import { X } from 'lucide-react'
import { useDialogFocusTrap } from '@/components/ui/use-dialog-focus-trap'
import { prefetchTheme } from '@/components/sites/theme-preview-swap'
import { websiteThemeVars } from '@/lib/sites/editor/theme'
import { themeCards } from '@/lib/builder/theme-lens'
import type { WebsiteSnapshot } from '@/lib/sites/editor/state'
import type { SiteThemeId } from '@/lib/theme/site-style'
import styles from './theme-lens.module.css'

// THE THEME LENS SHEET (BLD-303). A side sheet of theme cards. The card under the pointer or the focus is tried on: the
// shell swaps the canvas's theme tokens and `data-website-theme` in one commit (lib/builder/theme-lens.ts lensStyle) and
// the contract skin module is prefetched the moment the pointer reaches a card, so the swap waits for no request. Leaving
// the cards puts the draft's own theme back. Picking a card commits it as one undo step. Focus stays in the sheet and
// returns to the opener on close.

export function ThemeLens({ draft, trying, onTry, onPick, onClose }: {
  draft: WebsiteSnapshot
  trying: SiteThemeId | null
  onTry: (id: SiteThemeId | null) => void
  onPick: (id: SiteThemeId) => void
  onClose: () => void
}) {
  const cards = themeCards(draft)
  const sheet = useRef<HTMLDivElement>(null)
  const titleId = useId()
  // The kit trap first (it remembers the opener and keeps Tab inside), then the current theme's card takes focus.
  useDialogFocusTrap(true, sheet)
  useEffect(() => {
    sheet.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus()
    return () => { onTry(null) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') { e.stopPropagation(); onClose() }
  }
  return (
    <div className={styles.scrim} onPointerDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div ref={sheet} className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={onKey}>
        <div className={styles.head}>
          <h2 id={titleId}>Theme</h2>
          <button type="button" className={styles.close} aria-label="Close" onClick={onClose}><X size={16} aria-hidden /></button>
          <p>Hover a theme to see your page wear it. Your words and photos stay; layouts you picked stay pinned. Picking one is one undo step, and your live site keeps its look until you publish.</p>
        </div>
        <ul className={styles.list} role="list" onPointerLeave={() => onTry(null)}>
          {cards.map((c) => (
            <li key={c.id}>
              <button type="button" className={styles.card} aria-pressed={c.current} data-trying={trying === c.id || undefined} data-theme-card={c.id}
                onPointerEnter={() => { void prefetchTheme(); onTry(c.id) }}
                onFocus={() => { void prefetchTheme(); onTry(c.id) }}
                onBlur={(e) => { if (!e.currentTarget.parentElement?.parentElement?.contains(e.relatedTarget as Node | null)) onTry(null) }}
                onClick={() => { onPick(c.id); onClose() }}>
                <span className={styles.swatch} style={websiteThemeVars(c.theme)} aria-hidden><i /></span>
                <span className={styles.text}>
                  <b>{c.label}{c.current && <em> · Current</em>}</b>
                  <small>{c.description}{c.foreign > 0 && ` ${c.foreign === 1 ? '1 section was' : `${c.foreign} sections were`} drawn for another theme and ${c.foreign === 1 ? 'keeps' : 'keep'} its shape in this one.`}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
