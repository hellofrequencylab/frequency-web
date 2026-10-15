'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Search, X, Users, FileText, CalendarDays, Loader2, ArrowRight, ScanLine, Compass, Building2, CircleDot, Flower2 } from 'lucide-react'
import { getInitials, formatEventDate, eventDateBadge } from '@/lib/utils'
import { avatarSrc, avatarFocusStyle } from '@/lib/images/avatar-focus'
import { paletteDestinations, type NavViewer } from '@/lib/nav/registry'
import { railIconFor } from '@/components/layout/nav-icons'
import { useDialogFocusTrap } from '@/components/ui/use-dialog-focus-trap'
import { Input } from '@/components/ui/field'
import './search.css'
import { capsLabel } from '@/components/ui/caps-label'

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
type EventHit = { id: string; title: string; slug: string; category?: string; starts_at: string; location: string | null; is_cancelled: boolean; is_demo: boolean }
// A non-member person the viewer is entitled to find (someone they captured).
type Lead = { id: string; displayName: string; email: string | null; city: string | null; ownerName: string | null; href: string | null }
// The live-search results from /api/search. The navigable-destinations group ("Go to")
// is NOT fetched — the palette projects it from the registry client-side (see below).
type Entity = { id: string; name: string; slug: string; image_url?: string | null; brand_name?: string | null; brand_logo_url?: string | null; tagline?: string | null }
type Practice = { id: string; title: string; slug: string | null; summary: string | null; duration_min: number | null }
type Results = { people: Person[]; posts: Post[]; events: EventHit[]; leads: Lead[]; circles: Entity[]; spaces: Entity[]; practices: Practice[]; unavailable?: string[] }
const CATEGORIES = ['all', 'events', 'people', 'spaces', 'circles', 'practices', 'posts'] as const
type Category = (typeof CATEGORIES)[number]

const EMPTY: Results = { people: [], posts: [], events: [], leads: [], circles: [], spaces: [], practices: [] }

export function SearchOverlay({ onClose, viewer }: { onClose: () => void; viewer: NavViewer }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Results>(EMPTY)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [category, setCategory] = useState<Category>('all')
  const requestRef = useRef<AbortController | null>(null)
  const versionRef = useRef(0)
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

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    requestRef.current?.abort()
  }, [])

  const runSearch = useCallback((query: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    requestRef.current?.abort()
    const version = ++versionRef.current
    const trimmed = query.trim()
    setError(null)
    setResults(EMPTY)
    if (trimmed.length < 2) { setLoading(false); return }
    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController()
      requestRef.current = controller
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal })
        const json = await res.json()
        if (version !== versionRef.current) return
        if (!res.ok) throw new Error(res.status === 401 ? 'Your session has ended. Sign in again to search.' : res.status === 429 ? 'Please wait a moment, then try again.' : 'Search is temporarily unavailable. Please try again.')
        setResults({ ...EMPTY, ...json })
      } catch (reason) {
        if (version !== versionRef.current || controller.signal.aborted) return
        setError(reason instanceof Error ? reason.message : 'Search is temporarily unavailable. Please try again.')
      } finally {
        if (version === versionRef.current) setLoading(false)
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

  const visible = (kind: Category) => category === 'all' || category === kind
  const total = (category === 'all' ? pages.length + results.leads.length : 0) + CATEGORIES.filter((kind) => kind !== 'all' && visible(kind)).reduce((n, kind) => n + results[kind as Exclude<Category, 'all'>].length, 0)

  return (
    <div className="fq-search fixed inset-0 z-[60] flex flex-col sm:items-center sm:justify-start sm:p-6">
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
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
          const links = [...(panelRef.current?.querySelectorAll<HTMLAnchorElement>('.fq-search-result') ?? [])]
          if (!links.length) return
          event.preventDefault()
          const index = links.indexOf(document.activeElement as HTMLAnchorElement)
          links[(index + (event.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length]?.focus()
        }}
        className="fq-search-panel relative flex h-full w-full flex-col overflow-hidden bg-surface lift-3 outline-none sm:h-auto sm:max-h-[80vh] sm:w-full sm:max-w-2xl sm:rounded-card sm:border sm:border-border"
      >
        <div className="fq-search-intro"><span className="fq-search-eyebrow">Explore Frequency</span><h2>Find your <em>next connection.</em></h2><p>People, places and things worth showing up for.</p></div>
        {/* Search bar */}
        <form action="/search" method="GET" role="search"
          className="fq-search-input flex shrink-0 items-center gap-2 px-3"
          style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
        >
          <Search className="h-5 w-5 shrink-0 text-subtle" />
          <Input
            variant="seamless"
            ref={inputRef}
            aria-label="Search people, Spaces, events, Circles and practices"
            name="q"
            value={q}
            onChange={handleChange}
            placeholder="Search Frequency…"
            autoComplete="off"
            className="flex-1 py-3.5 text-body text-text"
          />
          {category !== 'all' && <input type="hidden" name="tab" value={category} />}
          {loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-subtle" />}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="shrink-0 rounded-control min-h-11 min-w-11 inline-flex items-center justify-center text-subtle hover:bg-surface-elevated hover:text-text transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </form>

        <div className="fq-search-categories" aria-label="Search categories">{CATEGORIES.map((kind) => <button type="button" key={kind} aria-pressed={category === kind} onClick={() => setCategory(kind)}>{kind === 'all' ? 'All' : kind.charAt(0).toUpperCase() + kind.slice(1)}</button>)}</div>
        <div role="status" aria-live="polite" className="fq-search-status">{loading ? 'Searching Frequency…' : error ? error : results.unavailable?.length ? `Some results are unavailable (${results.unavailable.join(', ')}). Try again.` : hasQuery ? `${total} results shown${category === 'all' ? '' : ` in ${category}`}` : 'One search across your community'}</div>
        {/* Results */}
        <div className="flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
          {!hasQuery ? (
            <div className="fq-search-start"><Compass aria-hidden /><h3>A good place to start.</h3><p>Search for a name, an event or a practice. Workshops appear with events.</p><div>{[['Events', '/events'], ['Spaces', '/spaces'], ['Practices', '/practices']].map(([label, href]) => <Link href={href} onClick={onClose} key={href}>{label}<ArrowRight aria-hidden /></Link>)}</div></div>
          ) : error ? (
            <div className="fq-search-start"><h3>Let’s try that again.</h3><p>{error}</p><button type="button" className="fq-search-retry" onClick={() => runSearch(q)}>Search again</button></div>
          ) : !loading && !error && !results.unavailable?.length && total === 0 ? (
            <p className="px-4 py-12 text-center text-body-sm text-subtle">No matches for “{trimmed}”. Try a shorter name or another category.</p>
          ) : (
            <div className="py-2">
              <ResultGroup hidden={category !== 'all'} label="Go to" icon={Compass} count={pages.length}>
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
                              <span className={capsLabel('shrink-0 rounded bg-surface-elevated px-1 py-0.5 text-3xs font-semibold text-muted')}>
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

              <ResultGroup hidden={!visible('people')} label="People" icon={Users} count={results.people.length}>
                {results.people.map((p) => (
                  <ResultRow key={p.id} href={`/people/${p.handle}`} onNavigate={onClose}
                    avatar={p.avatar_url} fallback={p.display_name}
                    title={p.display_name} subtitle={`@${p.handle}`} dimmed={p.is_demo} />
                ))}
              </ResultGroup>

              <ResultGroup hidden={category !== 'all'} label="People you’ve met" icon={ScanLine} count={results.leads.length}>
                {results.leads.map((l) => (
                  <ResultRow key={l.id} href={l.href ?? '#'} onNavigate={onClose}
                    fallback={l.displayName} title={l.displayName}
                    subtitle={[l.email, l.city, l.ownerName ? `shared by ${l.ownerName}` : null].filter(Boolean).join(' · ') || 'Saved contact'} />
                ))}
              </ResultGroup>

              <ResultGroup hidden={!visible('events')} label="Events" icon={CalendarDays} count={results.events.length}>
                {results.events.map((e) => (
                  <ResultRow key={e.id} href={`/events/${e.slug}`} onNavigate={onClose}
                    dateIso={e.starts_at} title={e.title} dimmed={e.is_demo}
                    subtitle={[formatEventDate(e.starts_at), e.location].filter(Boolean).join(' · ')}
                    badge={e.is_cancelled ? 'Cancelled' : e.category === 'learning' ? 'Learning' : undefined} />
                ))}
              </ResultGroup>

              <ResultGroup hidden={!visible('spaces')} label="Spaces" icon={Building2} count={results.spaces.length}>
                {results.spaces.map((space) => <ResultRow key={space.id} href={`/spaces/${space.slug}`} onNavigate={onClose} title={space.brand_name ?? space.name} subtitle={space.tagline ?? 'Space'} avatar={space.brand_logo_url} fallback={space.name} />)}
              </ResultGroup>
              <ResultGroup hidden={!visible('circles')} label="Circles" icon={CircleDot} count={results.circles.length}>
                {results.circles.map((circle) => <ResultRow key={circle.id} href={`/circles/${circle.slug}`} onNavigate={onClose} title={circle.name} subtitle="Circle" avatar={circle.image_url} fallback={circle.name} />)}
              </ResultGroup>
              <ResultGroup hidden={!visible('practices')} label="Practices" icon={Flower2} count={results.practices.length}>
                {results.practices.map((practice) => <ResultRow key={practice.id} href={`/practices/${practice.slug ?? practice.id}`} onNavigate={onClose} title={practice.title} subtitle={[practice.duration_min ? `${practice.duration_min} min` : null, practice.summary].filter(Boolean).join(' · ')} fallback={practice.title} />)}
              </ResultGroup>

              <ResultGroup hidden={!visible('posts')} label="Posts" icon={FileText} count={results.posts.length}>
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
            href={`/search?q=${encodeURIComponent(trimmed)}${category === 'all' ? '' : `&tab=${category}`}`}
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

function ResultGroup({ hidden = false, label, icon: Icon, count, children }: { hidden?: boolean; label: string; icon: typeof Users; count: number; children: React.ReactNode }) {
  if (hidden || count === 0) return null
  return (
    <div className="mb-1">
      <p className={capsLabel('flex items-center gap-1.5 px-4 pb-1 pt-3 text-2xs font-semibold text-muted', 'wider')}>
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
      className={`fq-search-result flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-elevated ${dimmed ? 'opacity-70' : ''}`}
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
