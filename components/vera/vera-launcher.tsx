'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Sparkles, Search, BookOpen, Mail, X, MessageSquare, LifeBuoy, Bug, Ticket } from 'lucide-react'
import type { HelpSearchEntry } from '@/lib/help/content'
import { searchHelp } from '@/lib/help/search'
import { CONTACT_EMAIL } from '@/lib/site'
import { VeraChat, COMPANION_OPENING } from '@/components/vera/vera-chat'
import { DockChat, prefetchDockSummary } from '@/components/messages/dock-chat'
import { getMessagesUnreadCount } from '@/app/(main)/messages/popover-actions'
import { openSupport } from '@/components/support/support-launcher'
import { EdgePill } from '@/components/layout/edge-pill'
import type { TeaseGate } from '@/lib/pricing/upsell-tease'

// The persistent dock (ADR-086 + messaging MVP, docs/MESSAGING-PLATFORM.md). ONE
// floating tab on every member page that opens a panel with THREE modes:
//   • Chat — member-to-member messaging (DMs + rooms), inbox-first.
//   • Vera — the AI companion (live loop + propose-and-confirm writes).
//   • Help — the deterministic tiers: article search → help center → a human.
// Mounted in the (main) layout, so it persists across navigation. It remembers the
// last mode (localStorage) and shows an unread badge for messages. Deterministic-first:
// with AI off, Vera degrades to the scripted concierge and Chat + Help still work, so
// the product is whole (the bridge doctrine, AI-VERA §3).

type Tab = 'chat' | 'vera' | 'help'

const TAB_KEY = 'fq_dock_tab'
function initialTab(): Tab {
  if (typeof window === 'undefined') return 'chat'
  try {
    const v = localStorage.getItem(TAB_KEY)
    if (v === 'vera' || v === 'help' || v === 'chat') return v
  } catch {}
  return 'chat'
}

export function VeraLauncher({ index, veraTease }: { index: HelpSearchEntry[]; veraTease?: TeaseGate }) {
  // Admin pages drop the edge tab (the page-admin dock owns that corner); the panel
  // still opens there via the command bar's open-vera event.
  const onAdmin = usePathname().startsWith('/admin')
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>(initialTab)
  const [q, setQ] = useState('')
  // Vera's own "unclosed chat" pulse (set by vera-chat, cleared when the panel opens).
  const [pulse, setPulse] = useState(() => typeof window !== 'undefined' && localStorage.getItem('fq_vera_unread') === '1')
  // Unread member-message count, for the tab + pill badges.
  const [unread, setUnread] = useState(0)
  const panelRef = useRef<HTMLDivElement>(null)
  const results = useMemo(() => searchHelp(index, q, 6), [q, index])

  // Remember the last mode across sessions.
  useEffect(() => {
    try { localStorage.setItem(TAB_KEY, tab) } catch {}
  }, [tab])

  // Unread message count for the badge (best-effort; refreshes each time the panel toggles).
  useEffect(() => {
    let alive = true
    getMessagesUnreadCount().then((n) => { if (alive) setUnread(n) }).catch(() => {})
    return () => { alive = false }
  }, [open])

  // Warm the messages summary once on mount so opening the Chat tab is instant
  // (the summary is a few RPCs — this is what felt slow on first open).
  useEffect(() => { prefetchDockSummary() }, [])

  useEffect(() => {
    const onActivity = () => setPulse(true)
    // Other surfaces open a specific mode via these events.
    const onOpenVera = () => {
      setTab('vera'); setOpen(true); setPulse(false)
      try { localStorage.removeItem('fq_vera_unread') } catch {}
    }
    const onOpenChat = () => { setTab('chat'); setOpen(true) }
    window.addEventListener('vera-activity', onActivity)
    window.addEventListener('open-vera', onOpenVera)
    window.addEventListener('open-chat', onOpenChat)
    return () => {
      window.removeEventListener('vera-activity', onActivity)
      window.removeEventListener('open-vera', onOpenVera)
      window.removeEventListener('open-chat', onOpenChat)
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
  const headerTitle = tab === 'vera' ? 'Vera' : tab === 'help' ? 'Help' : 'Messages'
  const headerSub =
    tab === 'vera'
      ? 'Vera is AI. Ask anything, or find your way.'
      : tab === 'help'
        ? 'Find an answer, or reach a human.'
        : 'Chat with members and your rooms.'
  const HeaderIcon = tab === 'vera' ? Sparkles : tab === 'help' ? LifeBuoy : MessageSquare

  return (
    <>
      {/* Right-edge dock tab: collapsed until hover (web) / tap (mobile), then a click
          opens the panel. Wiggles when a chat is unclosed OR messages are unread; shows a
          numeric unread badge. NOT on /admin (the page-admin dock owns that corner); the
          panel stays mounted so the admin "Ask Vera" bar (open-vera) still works. */}
      {!onAdmin && (
        <EdgePill
          side="right"
          glow="orange"
          label="Chat"
          icon={<MessageSquare className="h-[18px] w-[18px]" aria-hidden />}
          waiting={pulse || unread > 0}
          badgeCount={unread}
          onOpen={openPanel}
          ariaLabel="Open chat, Vera, and help"
        />
      )}

      {/* Non-modal floating dock: NO page overlay, so members keep navigating and using
          the site while chatting. Bottom sheet on mobile, anchored card on desktop.
          Persists across navigation (mounted in the (main) layout). Close via X or ESC. */}
      {open && (
        <div
          ref={panelRef}
          tabIndex={-1}
          role="dialog"
          aria-label="Chat, Vera and help"
          className="fixed inset-x-0 bottom-0 z-50 mx-auto flex h-[68vh] max-h-[640px] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-border bg-surface shadow-pop outline-none md:inset-x-auto md:bottom-6 md:right-6 md:h-[600px] md:rounded-2xl motion-safe:animate-[slideUp_0.25s_ease-out]"
        >
            {/* Header — reflects the active mode */}
            <div className="flex shrink-0 items-center gap-2.5 border-b border-border px-4 py-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-bg text-primary-strong">
                <HeaderIcon className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p id="vera-launcher-title" className="text-sm font-bold text-text">{headerTitle}</p>
                <p className="truncate text-xs text-subtle">{headerSub}</p>
              </div>
              <button type="button" onClick={close} aria-label="Close" className="rounded-lg p-1 text-muted transition-colors hover:text-text">
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex shrink-0 gap-1 border-b border-border px-2 py-1.5" role="tablist" aria-label="Dock modes">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'chat'}
                onClick={() => setTab('chat')}
                className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${tab === 'chat' ? 'bg-primary-bg text-primary-strong' : 'text-muted hover:text-text'}`}
              >
                <MessageSquare className="h-4 w-4" aria-hidden /> Chat
                {unread > 0 && (
                  <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-3xs font-bold text-on-primary">{unread > 9 ? '9+' : unread}</span>
                )}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'vera'}
                onClick={() => setTab('vera')}
                className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${tab === 'vera' ? 'bg-primary-bg text-primary-strong' : 'text-muted hover:text-text'}`}
              >
                <Sparkles className="h-4 w-4" aria-hidden /> Vera
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
              <DockChat onNavigate={close} />
            ) : tab === 'vera' ? (
              <VeraChat opening={COMPANION_OPENING} veraTease={veraTease} />
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
                      <li className="px-3 py-2 text-sm text-muted">No matches. Ask Vera.</li>
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
                  onClick={() => setTab('vera')}
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
      )}
    </>
  )
}
