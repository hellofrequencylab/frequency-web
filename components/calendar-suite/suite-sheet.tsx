'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { FqIcon } from '@/components/frequency/icon'
import { IconButton } from '@/components/ui/icon-button'

// A SHEET over the calendar: a centred card on a wide screen, rising from the bottom on a narrow one.
// It lives inside the calendar's own box rather than in a portal, so the calendar's tokens reach it and
// its scrim covers the calendar and nothing else. Esc is the shell's (one key closes the top layer);
// this part moves focus in, keeps Tab inside, and hands focus back to what opened it.

export function SuiteSheet({
  title,
  line,
  onClose,
  children,
}: {
  title: string
  /** One soft line under the title. */
  line?: string
  onClose: () => void
  children: ReactNode
}) {
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    panel.current?.focus()
    return () => before?.focus?.()
  }, [])
  const trap = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !panel.current) return
    const items = [...panel.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }
  return (
    <div className="cal-sheet-wrap" data-cal-sheet>
      <div className="cal-sheet-scrim" onClick={onClose} aria-hidden />
      <div className="cal-sheet fq-panel" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={panel} onKeyDown={trap}>
        <header className="cal-sheet-head">
          <div>
            <h2 className="cal-sheet-title">{title}</h2>
            {line ? <p className="cal-serif">{line}</p> : null}
          </div>
          <IconButton label="Close" variant="tinted" onClick={onClose}>
            <FqIcon name="close" size={16} />
          </IconButton>
        </header>
        <div className="cal-sheet-body">{children}</div>
      </div>
    </div>
  )
}
