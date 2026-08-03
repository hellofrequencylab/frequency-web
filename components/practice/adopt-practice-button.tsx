'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Plus, Check, X } from 'lucide-react'
import { adoptPracticeAction, dropPracticeAction } from '@/app/(main)/practices/actions'
import { TERM_PRESETS } from '@/lib/practices/adoption'

// Toggle a practice in/out of your personal practices — with the COMMITMENT picker (ADR-920).
// Tapping Adopt opens a small panel: four term chips (2 / 4 / 8 weeks / Ongoing; 4 is the
// default focus, 8 carries the "makes it stick" hint) and an optional "When will you do it?"
// field. Tapping a chip adopts immediately with that term — the fast yes stays one tap after
// open. Adopted reads as ORANGE (the primary fill); clicking it removes. `fullWidth` is the
// card-footer variant.
//
// The panel is position:FIXED and anchored to the button's rect at open, because the cards
// this button lives in (EntityCard) are overflow-hidden — an absolute popover would clip.
// Fixed positioning escapes every ancestor clip; the position is computed once on open
// (scroll/resize close the panel rather than tracking it). Focus moves to the default chip
// on open and back to the button on close; Escape and click-outside close.
export function AdoptPracticeButton({
  practiceId,
  adopted,
  fullWidth = false,
}: {
  practiceId: string
  adopted: boolean
  fullWidth?: boolean
}) {
  const [pending, start] = useTransition()
  const [panel, setPanel] = useState<{ top: number; left: number } | null>(null)
  const [cue, setCue] = useState('')
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const defaultChipRef = useRef<HTMLButtonElement>(null)

  const PANEL_W = 256
  const PANEL_H = 230 // approximate; clamped against the viewport below

  const openPanel = () => {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return
    // Prefer above the button; fall below when there is no room. Clamp horizontally.
    const top = rect.top >= PANEL_H + 12 ? rect.top - PANEL_H - 8 : Math.min(rect.bottom + 8, window.innerHeight - PANEL_H - 8)
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - PANEL_W - 8))
    setPanel({ top: Math.max(8, top), left })
  }

  useEffect(() => {
    if (!panel) return
    defaultChipRef.current?.focus()
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (!panelRef.current?.contains(t) && !buttonRef.current?.contains(t)) setPanel(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPanel(null)
        buttonRef.current?.focus()
      }
    }
    const onScrollOrResize = () => setPanel(null)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScrollOrResize, true)
    window.addEventListener('resize', onScrollOrResize)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScrollOrResize, true)
      window.removeEventListener('resize', onScrollOrResize)
    }
  }, [panel])

  const base = `inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors disabled:opacity-60 ${
    fullWidth ? 'w-full' : ''
  }`

  if (adopted) {
    return (
      <button
        type="button"
        disabled={pending}
        title="Remove from your practices"
        onClick={() => start(async () => void (await dropPracticeAction(practiceId)))}
        className={`${base} bg-primary text-on-primary hover:bg-primary-hover`}
      >
        {pending ? (
          <>
            <X className="h-4 w-4 shrink-0" /> Removing…
          </>
        ) : (
          <>
            <Check className="h-4 w-4 shrink-0" /> Adopted
          </>
        )}
      </button>
    )
  }

  const adoptWith = (termWeeks: number | null) => {
    setPanel(null)
    start(async () => {
      await adoptPracticeAction(practiceId, { termWeeks, cue: cue.trim() || null })
    })
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        disabled={pending}
        aria-expanded={!!panel}
        aria-haspopup="dialog"
        onClick={() => (panel ? setPanel(null) : openPanel())}
        className={`${base} border border-border bg-surface text-text hover:border-primary hover:text-primary-strong ${fullWidth ? 'w-full' : ''}`}
      >
        <Plus className="h-4 w-4 shrink-0" /> {pending ? 'Adding…' : 'Adopt'}
      </button>

      {panel && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="How long will you take it on for?"
          style={{ position: 'fixed', top: panel.top, left: panel.left, width: PANEL_W }}
          className="z-50 rounded-xl border border-border bg-surface-elevated p-3 shadow-lg"
        >
          <p className="text-xs font-semibold text-text">How long will you take it on for?</p>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {TERM_PRESETS.map((p) => (
              <button
                key={p.label}
                ref={p.default ? defaultChipRef : undefined}
                type="button"
                title={p.hint}
                onClick={() => adoptWith(p.weeks)}
                className={`rounded-lg border px-2 py-1.5 text-xs font-semibold transition-colors ${
                  p.default
                    ? 'border-primary bg-primary-bg/40 text-text hover:bg-primary-bg/60'
                    : 'border-border text-muted hover:border-primary hover:text-text'
                }`}
              >
                {p.label}
                {p.recommended && <span className="block text-2xs font-normal text-subtle">makes it stick</span>}
                {p.default && <span className="block text-2xs font-normal text-subtle">most pick this</span>}
              </button>
            ))}
          </div>
          <label className="mt-2.5 block">
            <span className="text-2xs text-subtle">
              When will you do it? Optional. Tying it to something you already do makes it far more likely to happen.
            </span>
            <input
              type="text"
              value={cue}
              maxLength={140}
              onChange={(e) => setCue(e.target.value)}
              placeholder="After my morning coffee"
              className="mt-1 w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-xs text-text placeholder:text-subtle focus:border-primary focus:outline-none"
            />
          </label>
        </div>
      )}
    </>
  )
}
