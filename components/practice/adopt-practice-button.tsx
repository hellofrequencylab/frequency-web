'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Plus, Check, X } from 'lucide-react'
import { adoptPracticeAction, dropPracticeAction } from '@/app/(main)/practices/actions'
import { TERM_PRESETS } from '@/lib/practices/adoption'

// Toggle a practice in/out of your personal practices — now with the COMMITMENT picker
// (ADR-920). Tapping Adopt opens a small panel: four term chips (2 / 4 / 8 weeks / Ongoing;
// 4 is the default focus, 8 carries the "builds it for good" hint) and an optional cue field
// ("After my morning coffee"). Tapping a chip adopts immediately with that term — the fast
// yes stays one tap after open. Adopted reads as ORANGE (the primary fill); clicking it
// removes. `fullWidth` is the card-footer variant.
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
  const [open, setOpen] = useState(false)
  const [cue, setCue] = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)

  // Click-outside + Escape close the picker (no dependency; the panel is small and local).
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

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
    setOpen(false)
    start(async () => {
      await adoptPracticeAction(practiceId, { termWeeks, cue: cue.trim() || null })
    })
  }

  return (
    <div ref={wrapRef} className={`relative ${fullWidth ? 'w-full' : 'inline-block'}`}>
      <button
        type="button"
        disabled={pending}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
        className={`${base} border border-border bg-surface text-text hover:border-primary hover:text-primary-strong`}
      >
        <Plus className="h-4 w-4 shrink-0" /> {pending ? 'Adding…' : 'Adopt'}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="How long will you take it on for?"
          className="absolute bottom-full left-0 z-20 mb-2 w-64 rounded-xl border border-border bg-surface-elevated p-3 shadow-lg"
        >
          <p className="text-xs font-semibold text-text">How long will you take it on for?</p>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {TERM_PRESETS.map((p) => (
              <button
                key={p.label}
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
            <span className="text-2xs text-subtle" title="A cue tied to something you already do makes the practice far more likely to happen.">
              When will you do it? Optional.
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
    </div>
  )
}
