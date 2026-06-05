'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { LifeBuoy, Search, Sparkles, BookOpen, Mail, X, Loader2, ArrowRight } from 'lucide-react'
import type { HelpSearchEntry } from '@/lib/help/content'
import { searchHelp } from '@/lib/help/search'
import { CONTACT_EMAIL } from '@/lib/site'

// App-wide support menu (docs/SUPPORT-SYSTEM.md §1). Three tiers in priority
// order: instant article search (free) → Ask Vera (grounded RAG) → talk to a
// human. The cheap/no-AI search stays the default; Vera fires only on an explicit
// ask, and gracefully deflects to a human when she's unsure or AI is off (the
// bridge doctrine — see docs/AI-VERA.md).

interface AskResult {
  answer: string | null
  citations: { category: string; slug: string; heading: string; href: string }[]
  confidence: number
  deflected: boolean
}

export function SupportLauncher({ index }: { index: HelpSearchEntry[] }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [asking, setAsking] = useState(false)
  const [result, setResult] = useState<AskResult | null>(null)
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
    setResult(null)
    setAsking(false)
  }

  async function ask(e?: React.FormEvent) {
    e?.preventDefault()
    const question = q.trim()
    if (question.length < 2 || asking) return
    setAsking(true)
    setResult(null)
    try {
      const res = await fetch('/help/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      })
      setResult((await res.json()) as AskResult)
    } catch {
      setResult({ answer: null, citations: [], confidence: 0, deflected: true })
    } finally {
      setAsking(false)
    }
  }

  const canAsk = q.trim().length >= 2 && !asking
  const showInstant = q.trim().length >= 2 && !asking && !result

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
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="support-title">
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

            {/* Tier 1 — instant search (Enter asks Vera) */}
            <form onSubmit={ask} className="relative mt-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
              <input
                ref={inputRef}
                type="search"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value)
                  if (result) setResult(null)
                }}
                placeholder="Search help, or ask a question…"
                aria-label="Search help or ask Vera"
                className="w-full rounded-lg border border-border bg-surface-elevated py-2 pl-9 pr-3 text-sm text-text placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-[var(--color-border-strong)]"
              />
            </form>

            {showInstant && (
              <ul className="mt-2 max-h-52 divide-y divide-border overflow-y-auto rounded-lg border border-border">
                {results.length === 0 ? (
                  <li className="px-3 py-2 text-sm text-muted">No matches — try asking Vera below.</li>
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

            {/* Tier 2 — Ask Vera */}
            <button
              type="button"
              onClick={() => ask()}
              disabled={!canAsk}
              className="mt-3 flex w-full items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-left transition-colors hover:border-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Sparkles className="h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-text">Ask Vera</span>
                <span className="block truncate text-xs text-muted">
                  {q.trim() ? `“${q.trim()}”` : 'Type a question, then ask for a plain-language answer.'}
                </span>
              </span>
              {asking ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted" aria-hidden />
              ) : (
                <ArrowRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
              )}
            </button>

            {/* Vera's answer (or graceful deflect) */}
            {(asking || result) && (
              <div className="mt-3 rounded-lg border border-border bg-surface-elevated p-3">
                {asking ? (
                  <p className="flex items-center gap-2 text-sm text-muted">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Vera is thinking…
                  </p>
                ) : result?.answer ? (
                  <>
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary-strong">
                      <Sparkles className="h-3.5 w-3.5" aria-hidden /> Vera
                    </span>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-text">{result.answer}</p>
                    {result.citations.length > 0 && (
                      <div className="mt-2 border-t border-border pt-2">
                        <p className="text-[11px] uppercase tracking-wide text-subtle">Sources</p>
                        <ul className="mt-1 space-y-0.5">
                          {result.citations.map((c) => (
                            <li key={c.href}>
                              <Link href={c.href} onClick={close} className="text-xs text-primary-strong hover:underline">
                                {c.heading || c.slug.replace(/-/g, ' ')}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <p className="mt-2 text-[11px] text-subtle">AI answer — double-check anything important.</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-text">I couldn&rsquo;t find a sure answer to that one.</p>
                    {result && result.citations.length > 0 && (
                      <ul className="mt-1.5 space-y-0.5">
                        {result.citations.map((c) => (
                          <li key={c.href}>
                            <Link href={c.href} onClick={close} className="text-xs text-primary-strong hover:underline">
                              {c.heading || c.slug.replace(/-/g, ' ')}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="mt-1.5 text-xs text-muted">Browse the help center or talk to a human below.</p>
                  </>
                )}
              </div>
            )}

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
