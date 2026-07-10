'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronDown, Dumbbell, Heart, Plus, Route } from 'lucide-react'
import { rateContent } from './actions'
import { isError } from '@/lib/action-result'
import type { ContentType } from '@/lib/library'

// A "love" toggle — the ratings signal that feeds the best-of score.
export function RateButton({ type, id, count, rated }: { type: ContentType; id: string; count: number; rated: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [on, setOn] = useState(rated)
  const [n, setN] = useState(count)
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const next = !on
          setOn(next)
          setN((v) => v + (next ? 1 : -1))
          const res = await rateContent(type, id)
          if (isError(res)) { setOn(!next); setN((v) => v + (next ? -1 : 1)) }
          else router.refresh()
        })
      }
      aria-pressed={on}
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-50 ${
        on ? 'border-primary bg-primary-bg text-primary-strong' : 'border-border text-muted hover:text-text'
      }`}
      title={on ? 'Remove your rating' : 'Rate this'}
    >
      <Heart className={`h-3.5 w-3.5 ${on ? 'fill-current' : ''}`} /> {n}
    </button>
  )
}

// The header "Create" menu — a small popover offering the two guided create flows.
// Links straight through: /practices/new and /journeys/new carry their own
// canCreate gates (a free member is redirected and sees the upgrade popup there,
// ADR-414), so the menu needs no gating of its own.
export function CreateMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const item =
    'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-text transition-colors hover:bg-surface-elevated'

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary-hover"
      >
        <Plus className="h-4 w-4" /> Create
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div role="menu" aria-label="Create" className="absolute right-0 top-full z-50 mt-1 w-44 rounded-xl border border-border bg-surface p-1 shadow-pop">
          <Link href="/practices/new" role="menuitem" className={item} onClick={() => setOpen(false)}>
            <Dumbbell className="h-4 w-4 text-primary-strong" /> Practice
          </Link>
          <Link href="/journeys/new" role="menuitem" className={item} onClick={() => setOpen(false)}>
            <Route className="h-4 w-4 text-primary-strong" /> Journey
          </Link>
        </div>
      )}
    </div>
  )
}
