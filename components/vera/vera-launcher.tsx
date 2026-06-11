'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Sparkles, Search, BookOpen, Mail, X, MessageCircle, LifeBuoy, Bug, Ticket } from 'lucide-react'
import type { HelpSearchEntry } from '@/lib/help/content'
import { searchHelp } from '@/lib/help/search'
import { CONTACT_EMAIL } from '@/lib/site'
import { VeraChat, COMPANION_OPENING } from '@/components/vera/vera-chat'
import { openSupport } from '@/components/support/support-launcher'
import { EdgePill } from '@/components/layout/edge-pill'

// The persistent companion launcher (AI-VERA §4.0, ADR-086). ONE floating bubble
// on every member page that opens Vera's panel — unifying what used to be two
// bubbles. The panel has two tabs:
//   • Chat — the multi-turn companion (live loop + propose-and-confirm writes).
//   • Help — the deterministic tiers folded in: instant article search (free) →
//     browse the help center → talk to a human. "Ask Vera" is no longer a separate
//     one-shot — you just talk to her in Chat.
// Deterministic-first: with AI off, Chat degrades to the scripted concierge and
// Help still works, so the product is whole (the bridge doctrine, AI-VERA §3).

type Tab = 'chat' | 'help'

export function VeraLauncher({ index }: { index: HelpSearchEntry[] }) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('chat')
  const [q, setQ] = useState('')
  // The tab stays open + clickable (no edge-tuck). It PULSES when there's an unclosed
  // chat — a conversation the member started and hasn't reopened/resolved (the flag is
  // set by vera-chat on each turn, cleared when they reopen the panel).
  const [pulse, setPulse] = useState(() => typeof window !== 'undefined' && localStorage.getItem('fq_vera_unread') === '1')
  const panelRef = useRef<HTMLDivElement>(null)
  const results = useMemo(() => searchHelp(index, q, 6), [q, index])

  useEffect(() => {
    const onActivity = () => setPulse(true)
    // Other surfaces (the admin "Ask Vera" bar) open the panel via this event.
    const onOpen = () => {
      setOpen(true)
      setPulse(false)
      try { localStorage.removeItem('fq_vera_unread') } catch {}
    }
    window.addEventListener('vera-activity', onActivity)
    window.addEventListener('open-vera', onOpen)
    return () => {
      window.removeEventListener('vera-activity', onActivity)
      window.removeEventListener('open-vera', onOpen)
    }
  }, [])

  const openPanel = () => {
    setOpen(true)
    setPulse(false)
    try { localStorage.removeItem('fq_vera_unread') } catch {}
  }

  // ESC closes; focus moves into the panel when it opens.
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => panelRef.current?.focus(), 50)
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

  const showInstant = tab === 'help' && q.trim().length >= 2

  return (
    <>
      {/* Vera — right-edge pill: collapsed until hover (web) / tap (mobile), then a
          click opens the chat. Pulses an orange glow when a chat is left unclosed. */}
      <EdgePill
        side="right"
        glow="orange"
        label="Vera"
        icon={<Sparkles className="h-5 w-5" aria-hidden />}
        waiting={pulse}
        onOpen={openPanel}
        ariaLabel="Open Vera"
      />

      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="vera-launcher-title">
          {/* Click-away overlay */}
          <button type="button" aria-label="Close" onClick={close} className="absolute inset-0 bg-black/40" tabIndex={-1} />

          {/* Panel: bottom sheet on mobile, anchored card on desktop */}
          <div
            ref={panelRef}
            tabIndex={-1}
            className="absolute inset-x-0 bottom-0 mx-auto flex h-[80vh] max-h-[640px] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-border bg-surface shadow-pop outline-none md:inset-x-auto md:bottom-6 md:right-6 md:h-[600px] md:rounded-2xl motion-safe:animate-[slideUp_0.25s_ease-out]"
          >
            {/* Header: Vera identity + close */}
            <div className="flex shrink-0 items-center gap-2.5 border-b border-border px-4 py-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-bg text-primary-strong">
                <Sparkles className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p id="vera-launcher-title" className="text-sm font-bold text-text">Vera</p>
                <p className="truncate text-xs text-subtle">Your companion here. Ask anything, or find your way.</p>
              </div>
              <button type="button" onClick={close} aria-label="Close" className="rounded-lg p-1 text-muted transition-colors hover:text-text">
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex shrink-0 gap-1 border-b border-border px-2 py-1.5" role="tablist" aria-label="Vera modes">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'chat'}
                onClick={() => setTab('chat')}
                className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${tab === 'chat' ? 'bg-primary-bg text-primary-strong' : 'text-muted hover:text-text'}`}
              >
                <MessageCircle className="h-4 w-4" aria-hidden /> Chat
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'help'}
                onClick={() => setTab('help')}
                className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${tab === 'help' ? 'bg-primary-bg text-primary-strong' : 'text-muted hover:text-text'}`}
              >
                <LifeBuoy className="h-4 w-4" aria-hidden /> Help
              </button>
            </div>

            {tab === 'chat' ? (
              <VeraChat opening={COMPANION_OPENING} />
            ) : (
              /* ── Help tab — the deterministic tiers (no AI needed) ───────────── */
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
                  <input
                    type="search"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search help…"
                    aria-label="Search help"
                    className="w-full rounded-lg border border-border bg-surface-elevated py-2 pl-9 pr-3 text-sm text-text placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-[var(--color-border-strong)]"
                  />
                </div>

                {showInstant && (
                  <ul className="mt-2 divide-y divide-border overflow-hidden rounded-lg border border-border">
                    {results.length === 0 ? (
                      <li className="px-3 py-2 text-sm text-muted">No matches. Ask Vera in Chat.</li>
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

                <button
                  type="button"
                  onClick={() => setTab('chat')}
                  className="mt-3 flex w-full items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-left transition-colors hover:border-primary"
                >
                  <Sparkles className="h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-text">Ask Vera</span>
                    <span className="block truncate text-xs text-muted">Get a plain-language answer in a real conversation.</span>
                  </span>
                </button>

                <div className="mt-auto space-y-1 pt-3">
                  <button
                    type="button"
                    onClick={() => { close(); openSupport('bug') }}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-text hover:bg-surface-elevated"
                  >
                    <Bug className="h-4 w-4 text-muted" aria-hidden /> Report a bug
                  </button>
                  <Link href="/support" onClick={close} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-text hover:bg-surface-elevated">
                    <Ticket className="h-4 w-4 text-muted" aria-hidden /> Your support tickets
                  </Link>
                  <Link href="/help" onClick={close} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-text hover:bg-surface-elevated">
                    <BookOpen className="h-4 w-4 text-muted" aria-hidden /> Browse the help center
                  </Link>
                  <a href={`mailto:${CONTACT_EMAIL}`} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-text hover:bg-surface-elevated">
                    <Mail className="h-4 w-4 text-muted" aria-hidden /> Talk to a human
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
