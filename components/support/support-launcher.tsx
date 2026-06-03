'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { LifeBuoy, Search, Sparkles, BookOpen, Mail, X } from 'lucide-react'
import type { HelpSearchEntry } from '@/lib/help/content'
import { searchHelp } from '@/lib/help/search'
import { CONTACT_EMAIL } from '@/lib/site'

// App-wide support menu (docs/SUPPORT-SYSTEM.md §1). Three tiers in priority
// order: instant article search (free, now) → Ask Vera (Phase 1) → talk to a
// human. The "Ask Vera" tier is a deliberate, disabled placeholder until the AI
// core ships — the cheap/no-AI path is the default by design (the bridge doctrine).
export function SupportLauncher({ index }: { index: HelpSearchEntry[] }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const results = useMemo(() => searchHelp(index, q, 6), [q, index])

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => inputRef.current?.focus(), 50)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(t)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  function close() {
    setOpen(false)
    setQ('')
  }

  return (
    <>
      {/* Floating launcher — raised on mobile to clear the bottom nav. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Help and support"
        aria-haspopup="dialog"
        aria-expanded={open}
        className="fixed right-4 bottom-20 z-40 inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary text-on-primary shadow-pop transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] md:bottom-6"
      >
        <LifeBuoy className="h-5 w-5" aria-hidden />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="support-title"
        >
          {/* Click-away overlay */}
          <button
            type="button"
            aria-label="Close support menu"
            onClick={close}
            className="absolute inset-0 bg-black/40"
            tabIndex={-1}
          />

          {/* Panel: bottom sheet on mobile, anchored card on desktop */}
          <div className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-md rounded-t-2xl border border-border bg-surface p-4 shadow-pop md:inset-x-auto md:bottom-6 md:right-6 md:rounded-2xl">
            <div className="flex items-center justify-between">
              <h2 id="support-title" className="text-sm font-bold text-text">
                How can we help?
              </h2>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="rounded-lg p-1 text-muted transition-colors hover:text-text"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            {/* Tier 1 — instant search */}
            <div className="relative mt-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
              <input
                ref={inputRef}
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search help…"
                aria-label="Search help articles"
                className="w-full rounded-lg border border-border bg-surface-elevated py-2 pl-9 pr-3 text-sm text-text placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)]"
              />
            </div>

            {q.trim().length >= 2 && (
              <ul className="mt-2 max-h-60 divide-y divide-border overflow-y-auto rounded-lg border border-border">
                {results.length === 0 ? (
                  <li className="px-3 py-2 text-sm text-muted">No results for &ldquo;{q.trim()}&rdquo;.</li>
                ) : (
                  results.map((r) => (
                    <li key={r.href}>
                      <Link href={r.href} onClick={close} className="block px-3 py-2 hover:bg-surface-elevated">
                        <span className="block text-sm font-medium text-text">{r.title}</span>
                        <span className="block text-xs text-muted">{r.categoryTitle}</span>
                      </Link>
                    </li>
                  ))
                )}
              </ul>
            )}

            {/* Tier 2 — Ask Vera (Phase 1) */}
            <div className="mt-3 flex items-center gap-3 rounded-lg border border-dashed border-border px-3 py-2.5 opacity-70">
              <Sparkles className="h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-text">Ask Vera</p>
                <p className="text-xs text-muted">A direct answer in plain language.</p>
              </div>
              <span className="shrink-0 rounded-full bg-surface-elevated px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-subtle">
                Soon
              </span>
            </div>

            {/* Tier 3 — browse / human */}
            <div className="mt-2 space-y-1">
              <Link href="/help" onClick={close} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-text hover:bg-surface-elevated">
                <BookOpen className="h-4 w-4 text-muted" aria-hidden /> Browse the help center
              </Link>
              <a href={`mailto:${CONTACT_EMAIL}`} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-text hover:bg-surface-elevated">
                <Mail className="h-4 w-4 text-muted" aria-hidden /> Talk to a human
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
