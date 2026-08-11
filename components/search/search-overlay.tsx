'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Search, X, Users, FileText, CalendarDays, Loader2, ArrowRight, ScanLine, Compass } from 'lucide-react'
import { getInitials, formatEventDate, eventDateBadge } from '@/lib/utils'
import { avatarSrc, avatarFocusStyle } from '@/lib/images/avatar-focus'
import { paletteDestinations, type NavViewer } from '@/lib/nav/registry'
import { railIconFor } from '@/components/layout/nav-icons'
import { useDialogFocusTrap } from '@/components/ui/use-dialog-focus-trap'
import { Input } from '@/components/ui/field'

// Live, full-screen search overlay. Opens from the header search affordance (and
// ⌘K); types → debounced fetch to /api/search → results appear without a page
// reload. The full /search page is the "see all" destination. Mobile-first; the
// panel fills the screen on a phone and centers on desktop.
//
// Mounted only while open (the parent gates with `{searchOpen && …}`), so state
// resets naturally each time it opens — no reset effect needed.

type Person = { id: string; display_name: string; handle: string; avatar_url: string | null; is_demo: boolean }
type Post = {
  id: string; body: string; created_at: string; is_demo: boolean
  author: { display_name: string; handle: string; avatar_url: string | null } | null
}
type EventHit = { id: string; title: string; slug: string; starts_at: string; location: string | null; is_cancelled: boolean; is_demo: boolean }
// A non-member person the viewer is entitled to find (someone they captured).
type Lead = { id: string; displayName: string; email: string | null; city: string | null; ownerName: string | null; href: string | null }
// The live-search results from /api/search. The navigable-destinations group ("Go to")
// is NOT fetched — the palette projects it from the registry client-side (see below).
type Results = { people: Person[]; posts: Post[]; events: EventHit[]; leads: Lead[] }

const EMPTY: Results = { people: [], posts: [], events: [], leads: [] }

export function SearchOverlay({ onClose, viewer }: { onClose: () => void; viewer: NavViewer }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Results>(EMPTY)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Focus the input on mount.
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 50)
    return () => clearTimeout(t)
  }, [])

  // Keep Tab inside the palette and restore focus to the trigger on close. This overlay owns
  // its backdrop, ESC and scroll-lock already but was not a dialog to assistive tech: Tab walked
  // straight out into the page behind it, and closing dropped focus to <body> so a keyboard user
  // restarted from the top of the document. The hook is purely additive alongside what is here —
  // it respects the input's own mount focus above rather than stealing it.
  useDialogFocusTrap(true, panelRef)

  // Esc closes + body scroll-lock while open. (Full-screen search palette keeps its
  // own mobile-fills-the-screen layout, which the centered ui/Dialog can't express.)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose])

  const runSearch = useCallback((query: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setResults(EMPTY)
      setLoading(false)
      return
    }
    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`)
        const json = (await res.json()) as Results
        setResults({ people: json.people ?? [], posts: json.posts ?? [], events: json.events ?? [], leads: json.leads ?? [] })
      } catch {
        setResults(EMPTY)
      } finally {
        setLoading(false)
      }
    }, 200)
  }, [])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value
    setQ(v)
    runSearch(v)
  }

  const trimmed = q.trim()
  const hasQuery = trimmed.length >= 2

  // The "Go to" group: EVERY registry destination the viewer can reach, across BOTH
  // spines (Calm + Studio), ranked (startsWith > contains) against the query. Projected
  // from the ONE registry through the same canSee gate as every other surface — so an
  // operator can jump to a Studio page from a Calm one without switching modes, and the
  // list never drifts from a hand-maintained catalog. Computed client-side (the registry
  // + gate are framework-free); no round-trip. Capped so the palette stays scannable.
  const pages = useMemo(
    () => (hasQuery ? paletteDestinations(viewer, trimmed).slice(0, 6) : []),
    [viewer, trimmed, hasQuery],
  )

  const total = pages.length + results.people.length + results.posts.length + results.events.length + results.leads.length

  return (
    <div className="fixed inset-0 z-[60] flex flex-col sm:items-center sm:justify-start sm:p-6">
      {/* Backdrop */}
      <div onClick={onClose} className="absolute inset-0 bg-ink/40 backdrop-blur-sm" aria-hidden />

      {/* Panel. role/aria-modal name it as a modal dialog (the backdrop already hides the page
          visually, but nothing told assistive tech this was a dialog); tabIndex={-1} gives the
          focus trap somewhere to park focus when the panel holds no focusable yet. */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        tabIndex={-1}
        className="relative flex h-full w-full flex-col overflow-hidden bg-surface lift-3 outline-none sm:h-auto sm:max-h-[80vh] sm:w-full sm:max-w-xl sm:rounded-2xl sm:border sm:border-border"
      >
        {/* Search bar */}
        <div
          className="flex shrink-0 items-center gap-2 border-b border-border px-3"
          style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
        >
          <Search className="h-5 w-5 shrink-0 text-subtle" />
          <Input
            variant="seamless"
            ref={inputRef}
            value={q}
            onChange={handleChange}
            placeholder="Search people, posts, events…"
            autoComplete="off"
            className="flex-1 py-3.5 text-body text-text"
          />
          {loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-subtle" />}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="shrink-0 rounded-lg p-1.5 text-subtle hover:bg-surface-elevated hover:text-text transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
          {!hasQuery ? (
            <p className="px-4 py-12 text-center text-body-sm text-subtle">Type at least 2 characters to search.</p>
          ) : !loading && total === 0 ? (
            <p className="px-4 py-12 text-center text-body-sm text-subtle">No results for “{trimmed}”.</p>
          ) : (
            <div className="py-2">
              <ResultGroup label="Go to" icon={Compass} count={pages.length}>
                {pages.map((pg) => {
                  const Icon = railIconFor(pg.icon)
                  return (
                    <Link
                      key={pg.href}
                      href={pg.href}
                      onClick={onClose}
                      className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-elevated"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-bg text-primary-strong">
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-body-sm font-semibold text-text">{pg.label}</span>
                        {(pg.group || pg.mode === 'studio') && (
                          <span className="mt-0.5 flex items-center gap-1.5 truncate text-meta text-subtle">
                            {pg.mode === 'studio' && (
                              <span className="shrink-0 rounded bg-surface-elevated px-1 py-0.5 text-3xs font-semibold uppercase tracking-wide text-muted">
                                Studio
                              </span>
                            )}
                            {pg.group && <span className="truncate">{pg.group}</span>}
                          </span>
                        )}
                      </span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
                    </Link>
                  )
                })}
              </ResultGroup>

              <ResultGroup label="People" icon={Users} count={results.people.length}>
                {results.people.map((p) => (
                  <ResultRow key={p.id} href={`/people/${p.handle}`} onNavigate={onClose}
                    avatar={p.avatar_url} fallback={p.display_name}
                    title={p.display_name} subtitle={`@${p.handle}`} dimmed={p.is_demo} />
                ))}
              </ResultGroup>

              <ResultGroup label="People you’ve met" icon={ScanLine} count={results.leads.length}>
                {results.leads.map((l) => (
                  <ResultRow key={l.id} href={l.href ?? '#'} onNavigate={onClose}
                    fallback={l.displayName} title={l.displayName}
                    subtitle={[l.email, l.city, l.ownerName ? `shared by ${l.ownerName}` : null].filter(Boolean).join(' · ') || 'Saved contact'} />
                ))}
              </ResultGroup>

              <ResultGroup label="Events" icon={CalendarDays} count={results.events.length}>
                {results.events.map((e) => (
                  <ResultRow key={e.id} href={`/events/${e.slug}`} onNavigate={onClose}
                    dateIso={e.starts_at} title={e.title} dimmed={e.is_demo}
                    subtitle={[formatEventDate(e.starts_at), e.location].filter(Boolean).join(' · ')}
                    badge={e.is_cancelled ? 'Cancelled' : undefined} />
                ))}
              </ResultGroup>

              <ResultGroup label="Posts" icon={FileText} count={results.posts.length}>
                {results.posts.map((post) => (
                  <ResultRow key={post.id} href={post.author ? `/people/${post.author.handle}` : '/feed'} onNavigate={onClose}
                    avatar={post.author?.avatar_url ?? null} fallback={post.author?.display_name ?? '?'}
                    title={post.author?.display_name ?? 'Unknown'} subtitle={post.body} clampSubtitle dimmed={post.is_demo} />
                ))}
              </ResultGroup>
            </div>
          )}
        </div>

        {/* See all */}
        {hasQuery && (
          <Link
            href={`/search?q=${encodeURIComponent(trimmed)}`}
            onClick={onClose}
            className="flex shrink-0 items-center justify-center gap-1.5 border-t border-border py-3 text-body-sm font-semibold text-primary-strong hover:bg-surface-elevated transition-colors"
          >
            See all results
            <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>
    </div>
  )
}

function ResultGroup({ label, icon: Icon, count, children }: { label: string; icon: typeof Users; count: number; children: React.ReactNode }) {
  if (count === 0) return null
  return (
    <div className="mb-1">
      <p className="flex items-center gap-1.5 px-4 pb-1 pt-3 text-2xs font-semibold uppercase tracking-wider text-muted">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </p>
      {children}
    </div>
  )
}

function ResultRow({
  href, onNavigate, avatar, fallback, dateIso, title, subtitle, clampSubtitle = false, badge, dimmed = false,
}: {
  href: string
  onNavigate: () => void
  avatar?: string | null
  fallback?: string
  dateIso?: string
  title: string
  subtitle?: string
  clampSubtitle?: boolean
  badge?: string
  dimmed?: boolean
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={`flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-elevated ${dimmed ? 'opacity-70' : ''}`}
    >
      {dateIso ? (
        <span className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl bg-primary-bg text-primary-strong">
          {/* eventDateBadge, not a hand-rolled toLocaleDateString: this is a CLIENT component, so
              formatting without an explicit UTC zone rendered the viewer's local day and could be
              one behind the same event on /search and on the event page. See lib/utils.ts. */}
          <span className="text-3xs font-semibold uppercase leading-none">{eventDateBadge(dateIso).month}</span>
          <span className="text-body-sm font-bold leading-tight">{eventDateBadge(dateIso).day}</span>
        </span>
      ) : avatar ? (
        <Image src={avatarSrc(avatar)} alt="" width={40} height={40} style={avatarFocusStyle(avatar)} className="h-10 w-10 shrink-0 rounded-pill object-cover" />
      ) : (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-pill bg-primary-bg text-body-sm font-semibold text-primary-strong select-none">
          {getInitials(fallback ?? '?')}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-body-sm font-semibold text-text">{title}</span>
          {badge && <span className="shrink-0 rounded-md bg-danger-bg px-1.5 py-0.5 text-3xs font-medium text-danger">{badge}</span>}
        </span>
        {subtitle && (
          <span className={`mt-0.5 block text-meta text-subtle ${clampSubtitle ? 'line-clamp-1' : 'truncate'}`}>{subtitle}</span>
        )}
      </span>
    </Link>
  )
}
