'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Sparkles, Search, BookOpen, X, MessageSquare, LifeBuoy, Bug, ArrowLeft } from 'lucide-react'
import type { HelpSearchEntry } from '@/lib/help/content'
import { searchHelp } from '@/lib/help/search'
import { VeraChat, COMPANION_OPENING } from '@/components/vera/vera-chat'
import { SupportConversationsPanel } from '@/components/support/support-conversations-panel'
import { DockChat, prefetchDockSummary } from '@/components/messages/dock-chat'
import { getMessagesUnreadCount } from '@/app/(main)/messages/popover-actions'
import { openSupport } from '@/components/support/support-launcher'
import { EdgePill } from '@/components/layout/edge-pill'
import type { TeaseGate } from '@/lib/pricing/upsell-tease'

// The persistent dock (ADR-086 + messaging MVP; unified shell per docs/CHAT-SHELL-PLAN.md C1).
// ONE floating tab on every member page that opens a panel in the site's popup-shell language:
//   • Messages — member-to-member messaging (DMs + rooms), inbox-first. THE FRONT TAB.
//   • Vera — the AI companion (live loop + propose-and-confirm writes). The second tab.
//   • Help & support — NOT a tab: a full-panel SECTION pushed by the footer link (owner
//     directive: direct support is one tap away, never up front). Holds the help search,
//     Ask Vera, Report a bug / tickets / help center / email.
// Mounted in the (main) layout, so it persists across navigation. It remembers the last tab
// (localStorage) and shows an unread badge for messages. Deterministic-first: with AI off,
// Vera degrades to the scripted concierge and Messages + Help still work (AI-VERA §3).

type Tab = 'chat' | 'vera'

const TAB_KEY = 'fq_dock_tab'
function initialTab(): Tab {
  if (typeof window === 'undefined') return 'chat'
  try {
    const v = localStorage.getItem(TAB_KEY)
    if (v === 'vera' || v === 'chat') return v
    // MIGRATION (CHAT-SHELL-PLAN C1): 'help' was a top-level tab in the old dock; it is now the
    // link-opened section, so a remembered 'help' lands on Messages (the front tab).
  } catch {}
  return 'chat'
}

export function VeraLauncher({ index, veraTease }: { index: HelpSearchEntry[]; veraTease?: TeaseGate }) {
  // Admin pages drop the edge tab (the page-admin dock owns that corner); the panel
  // still opens there via the command bar's open-vera event.
  const onAdmin = usePathname().startsWith('/admin')
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>(initialTab)
  // The Help & support SECTION overlays the tabs when open (a pushed view with Back).
  const [helpOpen, setHelpOpen] = useState(false)
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

  // Warm the messages summary once on mount so opening the Messages tab is instant
  // (the summary is a few RPCs — this is what felt slow on first open).
  useEffect(() => { prefetchDockSummary() }, [])

  useEffect(() => {
    const onActivity = () => setPulse(true)
    // Other surfaces open a specific mode via these events (the site-wide open API,
    // CHAT-SHELL-PLAN §2): open-chat → Messages; open-vera → Vera; open-help → the section.
    const onOpenVera = () => {
      setTab('vera'); setHelpOpen(false); setOpen(true); setPulse(false)
      try { localStorage.removeItem('fq_vera_unread') } catch {}
    }
    const onOpenChat = () => { setTab('chat'); setHelpOpen(false); setOpen(true) }
    const onOpenHelp = () => { setHelpOpen(true); setOpen(true) }
    window.addEventListener('vera-activity', onActivity)
    window.addEventListener('open-vera', onOpenVera)
    window.addEventListener('open-chat', onOpenChat)
    window.addEventListener('open-help', onOpenHelp)
    return () => {
      window.removeEventListener('vera-activity', onActivity)
      window.removeEventListener('open-vera', onOpenVera)
      window.removeEventListener('open-chat', onOpenChat)
      window.removeEventListener('open-help', onOpenHelp)
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
    setHelpOpen(false)
    setQ('')
  }

  const showInstant = helpOpen && q.trim().length >= 2
  const headerTitle = helpOpen ? 'Help & support' : tab === 'vera' ? 'Vera' : 'Messages'
  const headerSub = helpOpen
    ? 'Find an answer, or reach a human.'
    : tab === 'vera'
      ? 'Vera is AI. Ask anything, or find your way.'
      : 'Chat with members and your rooms.'
  const HeaderIcon = helpOpen ? LifeBuoy : tab === 'vera' ? Sparkles : MessageSquare

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
          ariaLabel="Open messages, Vera, and help"
        />
      )}

      {/* Non-modal floating dock in the site popup-shell language (CHAT-SHELL-PLAN §1): NO page
          overlay, so members keep navigating while chatting. Bottom sheet on mobile, anchored
          card on desktop. Persists across navigation (mounted in the (main) layout). */}
      {open && (
        <div
          ref={panelRef}
          tabIndex={-1}
          role="dialog"
          aria-label="Messages, Vera and help"
          className="fixed inset-x-0 bottom-0 z-50 mx-auto flex h-[68vh] max-h-[640px] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-border bg-surface shadow-pop outline-none print:hidden md:inset-x-auto md:bottom-6 md:right-6 md:h-[600px] md:w-[24rem] md:rounded-2xl motion-safe:animate-[slideUp_0.25s_ease-out]"
        >
            {/* Header — reflects the active view; the Help section gets a Back affordance. */}
            <div className="flex shrink-0 items-center gap-2.5 border-b border-border px-4 py-3">
              {helpOpen ? (
                <button
                  type="button"
                  onClick={() => { setHelpOpen(false); setQ('') }}
                  aria-label="Back"
                  className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-elevated hover:text-text"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden />
                </button>
              ) : (
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-bg text-primary-strong">
                  <HeaderIcon className="h-4 w-4" aria-hidden />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p id="vera-launcher-title" className="text-sm font-bold text-text">{headerTitle}</p>
                <p className="truncate text-xs text-subtle">{headerSub}</p>
              </div>
              <button type="button" onClick={close} aria-label="Close" className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-elevated hover:text-text">
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            {/* Tabs — Messages front, Vera second. Hidden while the Help section is pushed. */}
            {!helpOpen && (
              <div className="flex shrink-0 gap-1 border-b border-border px-2 py-1.5" role="tablist" aria-label="Dock modes">
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === 'chat'}
                  onClick={() => setTab('chat')}
                  className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${tab === 'chat' ? 'bg-primary-bg text-primary-strong' : 'text-muted hover:text-text'}`}
                >
                  <MessageSquare className="h-4 w-4" aria-hidden /> Messages
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
              </div>
            )}

            {helpOpen ? (
              /* ── Help & support SECTION (link-opened, never a tab) — the deterministic
                    tiers: article search → Ask Vera → the help center → a human. ─────────── */
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
                  onClick={() => { setHelpOpen(false); setTab('vera') }}
                  className="mt-3 flex w-full items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-left transition-colors hover:border-primary"
                >
                  <Sparkles className="h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-text">Ask Vera</span>
                    <span className="block truncate text-xs text-muted">Get a plain-language answer in a real conversation.</span>
                  </span>
                </button>

                {/* The member's own support CONVERSATIONS (chat consolidation): send us a message, and it
                    threads back here as a ticketed conversation. Report-a-bug + help center stay below. */}
                <div className="mt-3 -mx-4 border-t border-border">
                  <SupportConversationsPanel />
                </div>

                <div className="mt-auto space-y-1 border-t border-border pt-3">
                  <button
                    type="button"
                    onClick={() => { close(); openSupport('bug') }}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-text hover:bg-surface-elevated"
                  >
                    <Bug className="h-4 w-4 text-muted" aria-hidden /> Report a bug
                  </button>
                  <Link href="/help" onClick={close} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-text hover:bg-surface-elevated">
                    <BookOpen className="h-4 w-4 text-muted" aria-hidden /> Browse the help center
                  </Link>
                </div>
              </div>
            ) : tab === 'chat' ? (
              <DockChat onNavigate={close} />
            ) : (
              <VeraChat opening={COMPANION_OPENING} veraTease={veraTease} />
            )}

            {/* Footer link — the ONE doorway to Help & support (owner: support is never a tab). */}
            {!helpOpen && (
              <button
                type="button"
                onClick={() => setHelpOpen(true)}
                className="flex shrink-0 items-center justify-center gap-1.5 border-t border-border px-4 py-2 text-xs font-medium text-muted transition-colors hover:bg-surface-elevated hover:text-text"
              >
                <LifeBuoy className="h-3.5 w-3.5" aria-hidden /> Help &amp; support
              </button>
            )}
        </div>
      )}
    </>
  )
}
