'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { ArrowLeft, LayoutGrid, List as ListIcon, Search, X } from 'lucide-react'
import { PersonCard } from '@/components/cards/person-card'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { getInitials, cn } from '@/lib/utils'
import {
  applyQuery,
  type MemberDetail,
  type MemberQuery,
  type MemberSummary,
  type SortSpec,
} from '@/lib/people/member-viewer'
import { MemberDetailCard } from './member-detail-card'
import { CrmMemberDetailPane } from './crm-member-detail'
import type { CrmMemberDetail, ListView, MemberViewerProps, SortOption } from './types'

// THE MEMBER-VIEWER BLOCK: a reusable master-detail member browser (list left, viewer right).
// One presentation-neutral client island (ADR-017/018) reused/reconfigured by many surfaces, not a
// one-off page. All list logic (filter + facet + sort + paginate) lives in the PURE core
// (lib/people/member-viewer, unit-tested); this island is the thin interactive shell over it:
// the HERO toolbar (live search + a prominent sort selector) + facets + view toggle + selection +
// keyboard nav + the lazy, fail-safe right pane.
//
// Self-contained on screen: the two panes each scroll within their OWN column (the left list caps
// its height and scrolls; the right detail scrolls independently), so the block never overflows its
// host and depends on nothing beyond min-w-0. Responsive: desktop = two panes (left ~2/5, right
// ~3/5); mobile = list is primary, selecting opens the detail as an overlay with a Back control.
// Keyboard: up/down move the selection, Enter opens (mobile overlay / focuses the pane), a visible
// focus ring, motion-reduce honored. Semantic DAWN tokens only; copy plain, no em dashes.

type DetailState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; detail: MemberDetail }
  | { status: 'error' }

/** How long the lazy detail fetch may run before the pane gives up and shows the retryable error
 *  instead of an endless skeleton (guards a hung server read / stalled transport). */
const DETAIL_TIMEOUT_MS = 20_000

/** Pick the initial sort option key: the one whose spec deep-equals `sort`, else the first option. */
function initialSortKey(options: SortOption[], sort: SortSpec | undefined): string | null {
  if (options.length === 0) return null
  if (sort) {
    const match = options.find((o) => o.spec.key === sort.key && o.spec.direction === sort.direction)
    if (match) return match.key
  }
  return options[0].key
}

export function MemberViewer({
  members,
  loadDetail,
  detailMode = 'full',
  detailVariant = 'card',
  defaultView = 'list',
  pageSize,
  initialSelectedId,
  search,
  sortOptions,
  sort,
  selectedId: controlledSelectedId,
  onSelectedChange,
  onQueryChange,
  emptyState,
}: MemberViewerProps) {
  const options = useMemo(() => sortOptions ?? [], [sortOptions])

  // The batch size: how many rows show up front and grow by each time the infinite-scroll sentinel
  // comes into view (default 12). Positive `pageSize` overrides it (the cockpit passes 24).
  const batch = pageSize && pageSize > 0 ? Math.floor(pageSize) : 12

  const [view, setView] = useState<ListView>(defaultView)
  const [text, setText] = useState('')
  const [facetSel, setFacetSel] = useState<Record<string, string>>({})
  const [page, setPage] = useState(1)
  const [overlayOpen, setOverlayOpen] = useState(false) // mobile detail overlay
  // The selected hero sort option (the visible control). Seeded from `sort` (if it matches an
  // option) or the first option. The block's effective sort is this option's spec, else the bare
  // `sort` prop (a host with no visible control still sorts).
  const [sortKey, setSortKey] = useState<string | null>(() => initialSortKey(options, sort))

  // Selection: controlled when the host passes selectedId, else internal (seeded from a deep link).
  const isControlled = controlledSelectedId !== undefined
  const [internalSelected, setInternalSelected] = useState<string | null>(initialSelectedId ?? null)
  const selectedId = isControlled ? controlledSelectedId : internalSelected

  const activeSort: SortSpec | undefined =
    options.find((o) => o.key === sortKey)?.spec ?? sort

  const query: MemberQuery = useMemo(
    () => ({ text, facets: facetSel, sort: activeSort }),
    [text, facetSel, activeSort],
  )

  // Filter / sort changes reset paging at the SOURCE (the handlers below call these), so there is no
  // render-time mutation and no reset effect to cascade.
  const setSearchText = useCallback((next: string) => {
    setText(next)
    setPage(1)
  }, [])
  const setFacet = useCallback((key: string, value: string) => {
    setFacetSel((prev) => ({ ...prev, [key]: value }))
    setPage(1)
  }, [])
  const chooseSort = useCallback((key: string) => {
    setSortKey(key)
    setPage(1)
  }, [])

  // Filter + sort via the pure core (we take its full `filtered` set and do our own batch/cap so the
  // list can grow past the core's 10..20 page clamp via infinite scroll).
  const { filtered } = useMemo(() => applyQuery(members, query, 1, 20), [members, query])
  const visible = useMemo(() => filtered.slice(0, page * batch), [filtered, page, batch])
  const total = filtered.length
  const hasMore = total > visible.length

  // Server-driven hosts get every query change (debounced text is fine raw here; the host throttles).
  useEffect(() => {
    onQueryChange?.(query)
  }, [query, onQueryChange])

  const select = useCallback(
    (id: string | null) => {
      if (!isControlled) setInternalSelected(id)
      onSelectedChange?.(id)
    },
    [isControlled, onSelectedChange],
  )

  // The DERIVED selection: the host's / internal pick, else the first visible row (desktop
  // preselect) — computed, never written, so there is no preselect effect to cascade.
  const effectiveSelectedId =
    (selectedId != null && visible.some((m) => m.id === selectedId) ? selectedId : null) ??
    visible[0]?.id ??
    null

  // ── Lazy, fail-safe right pane ──────────────────────────────────────────────
  const selectedMember = useMemo(
    () => members.find((m) => m.id === effectiveSelectedId) ?? null,
    [members, effectiveSelectedId],
  )

  // The embedded-detail / no-loader cases are DERIVED (no fetch, no state). Only a real lazy fetch
  // drives `fetchState`; the rendered pane prefers an embedded detail, then the fetch, then identity.
  const [fetchState, setFetchState] = useState<DetailState>({ status: 'idle' })

  // PIN the loader in a ref so the fetch effect depends ONLY on the selected member id, never on the
  // loader's identity. `loadDetail` is usually a Server Action passed down through an async Server
  // Component; a route refresh (e.g. one the detail pane's own composer triggers when it creates a
  // draft) hands the client a FRESH action reference every render. If the effect keyed on that, it
  // would re-fetch on every refresh, flip the pane back to its skeleton, unmount + remount the detail
  // (and the composer), whose mount fires another draft-create action, which refreshes again: an
  // endless load loop. Keying on the id alone breaks that cycle. (bug: CRM email box glitch loop)
  const loadDetailRef = useRef(loadDetail)
  useEffect(() => {
    loadDetailRef.current = loadDetail
  }, [loadDetail])

  const needsFetch = !!selectedMember && !selectedMember.detail && !!loadDetail
  const fetchKey = needsFetch ? selectedMember!.id : null

  useEffect(() => {
    const loader = loadDetailRef.current
    if (!fetchKey || !loader) return
    let cancelled = false
    // Enter the loading state as the fetch (an external system) starts — the legitimate
    // subscribe-to-external pattern, not a derived-state cascade.
    setFetchState({ status: 'loading' })
    // A hard timeout so a server read that never settles (a hung query, a transport stall) can NEVER
    // leave the pane spinning on the skeleton forever: after DETAIL_TIMEOUT_MS we surface the
    // retryable error state (re-selecting the member re-runs the fetch). The .catch already covers a
    // thrown/rejected action; this covers a PENDING one.
    const timer = setTimeout(() => {
      if (!cancelled) setFetchState({ status: 'error' })
    }, DETAIL_TIMEOUT_MS)
    loader(fetchKey)
      .then((detail) => {
        if (!cancelled) setFetchState({ status: 'ready', detail })
      })
      .catch(() => {
        if (!cancelled) setFetchState({ status: 'error' })
      })
      .finally(() => clearTimeout(timer))
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // Intentionally keyed on fetchKey ALONE (the selected member id). loadDetail is read from a ref so a
    // new action reference on a route refresh cannot re-run this effect and remount the pane (see above).
  }, [fetchKey])

  // ── Infinite scroll: a sentinel at the foot of the list grows the batch as it comes into view. ──
  const listRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const node = sentinelRef.current
    if (!node || !hasMore) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setPage((p) => p + 1)
      },
      // Observe within the list's own scroll column; a little rootMargin so it prefetches just before.
      { root: listRef.current ?? null, rootMargin: '200px' },
    )
    io.observe(node)
    return () => io.disconnect()
  }, [hasMore, visible.length])

  // ── Keyboard navigation on the list ─────────────────────────────────────────
  const onListKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (visible.length === 0) return
      const idx = visible.findIndex((m) => m.id === effectiveSelectedId)
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        const next = visible[Math.min(idx + 1, visible.length - 1)] ?? visible[0]
        select(next.id)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        const prev = visible[Math.max(idx - 1, 0)] ?? visible[0]
        select(prev.id)
      } else if (e.key === 'Enter' && effectiveSelectedId) {
        e.preventDefault()
        setOverlayOpen(true) // opens the mobile overlay; on desktop the pane already shows
      }
    },
    [visible, effectiveSelectedId, select],
  )

  function chooseRow(id: string) {
    select(id)
    setOverlayOpen(true)
  }

  const empty =
    emptyState ?? (
      <EmptyState
        variant="no-results"
        title="No members match"
        description="Try a different search or clear the filters to see everyone."
      />
    )

  const facets = search?.facets ?? []

  // The right-pane body for a loaded detail: the CRM master-detail pane, or the generic card.
  const detailBody = (detail: MemberDetail) =>
    detailVariant === 'crm' ? (
      // Key by profileId so selecting a different member REMOUNTS the pane — resetting its compose
      // popup + remembered draft cleanly, no reset effect needed.
      <CrmMemberDetailPane key={(detail as CrmMemberDetail).profileId} detail={detail as CrmMemberDetail} />
    ) : (
      <MemberDetailCard detail={detail} mode={detailMode} />
    )

  // ── The detail pane (shared by desktop pane + mobile overlay) ────────────────
  const detailPane = (() => {
    if (!selectedMember) {
      return (
        <div className="flex h-full items-center justify-center p-8 text-center text-sm text-subtle">
          Pick a member to see their details.
        </div>
      )
    }
    // Embedded detail wins (no fetch).
    if (selectedMember.detail) {
      return detailBody(selectedMember.detail)
    }
    // A real lazy fetch is in flight / done / failed.
    if (needsFetch) {
      if (fetchState.status === 'loading') return <DetailSkeleton />
      if (fetchState.status === 'error') {
        return (
          <EmptyState
            variant="error"
            title="Could not load this member"
            description="The details did not load. Pick the member again to retry."
          />
        )
      }
      if (fetchState.status === 'ready') {
        return detailBody(fetchState.detail)
      }
      return <DetailSkeleton />
    }
    // No detail source: show the minimal identity we already have.
    return detailBody({
      displayName: selectedMember.displayName,
      handle: selectedMember.handle,
      avatarUrl: selectedMember.avatarUrl,
    })
  })()

  return (
    <div className="flex flex-col gap-4">
      {/* HERO toolbar: live search + the sort selector are the headline of the block. Search spans the
          row; the sort segmented control sits right beside it. Facets + the view toggle follow on a
          quieter second line so the two primary affordances read first. */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {search && (
            <div className="relative min-w-0 flex-1 basis-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
              <input
                value={text}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder={search.placeholder ?? 'Search members'}
                aria-label={search.placeholder ?? 'Search members'}
                className="w-full rounded-xl border border-border bg-surface py-2.5 pl-10 pr-9 text-sm text-text placeholder:text-subtle transition-colors focus:border-border-strong focus:outline-none"
              />
              {text && (
                <button
                  type="button"
                  onClick={() => setSearchText('')}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-subtle transition-colors hover:bg-surface-elevated hover:text-text"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}

          {options.length > 0 && (
            <div
              role="group"
              aria-label="Sort members"
              className="inline-flex shrink-0 flex-wrap items-center gap-0.5 rounded-xl border border-border bg-surface p-0.5"
            >
              {options.map((o) => {
                const active = o.key === sortKey
                return (
                  <button
                    key={o.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => chooseSort(o.key)}
                    className={cn(
                      'rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors',
                      active
                        ? 'bg-primary text-on-primary'
                        : 'text-muted hover:bg-surface-elevated hover:text-text',
                    )}
                  >
                    {o.label}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Quieter second line: facets refine the set; the view toggle flips list / card. */}
        <div className="flex flex-wrap items-center gap-2">
            {facets.map((f) => (
              <label key={f.key} className="sr-only" htmlFor={`facet-${f.key}`}>
                {f.label}
              </label>
            ))}
            {facets.map((f) => (
              <select
                key={f.key}
                id={`facet-${f.key}`}
                value={facetSel[f.key] ?? ''}
                onChange={(e) => setFacet(f.key, e.target.value)}
                className={cn(
                  'rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors focus:outline-none',
                  facetSel[f.key]
                    ? 'border-primary bg-primary-bg text-primary-strong'
                    : 'border-border bg-surface text-muted hover:border-primary',
                )}
              >
                <option value="">{f.label}</option>
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ))}

            <div className="ml-auto inline-flex rounded-lg border border-border bg-surface p-0.5">
              <ViewToggleButton active={view === 'list'} onClick={() => setView('list')} label="List view">
                <ListIcon className="h-4 w-4" aria-hidden />
              </ViewToggleButton>
              <ViewToggleButton active={view === 'card'} onClick={() => setView('card')} label="Card view">
                <LayoutGrid className="h-4 w-4" aria-hidden />
              </ViewToggleButton>
            </div>
        </div>
      </div>

      {/* Two-pane (desktop) / list-primary (mobile). Each column scrolls within ITSELF (self-contained,
          no host overflow): the left list caps its height and scrolls; the right pane scrolls too. */}
      <div className="flex min-w-0 items-start gap-5">
        {/* LEFT: the list, a skinny column that scrolls within itself. Kept narrow (w-64) so the detail
            pane + its composer get the most room on desktop. */}
        <div className="min-w-0 flex-1 lg:w-64 lg:flex-none">
          {visible.length === 0 ? (
            empty
          ) : (
            <>
              <div
                ref={listRef}
                role="listbox"
                aria-label="Members"
                tabIndex={0}
                onKeyDown={onListKeyDown}
                className="max-h-[calc(100vh-2rem)] overflow-y-auto overflow-x-hidden rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                {view === 'card' ? (
                  <div className="grid grid-cols-1 gap-3 @lg:grid-cols-2">
                    {visible.map((m) => (
                      <div
                        key={m.id}
                        role="option"
                        aria-selected={m.id === effectiveSelectedId}
                        // Card view repurposes the click for SELECTION (open the detail pane), so
                        // intercept PersonCard's internal navigation; Open Profile lives in the pane.
                        onClickCapture={(e) => {
                          e.preventDefault()
                          chooseRow(m.id)
                        }}
                        className={cn(
                          'cursor-pointer rounded-2xl transition-shadow',
                          m.id === effectiveSelectedId && 'ring-2 ring-primary/50',
                        )}
                      >
                        <PersonCard
                          handle={m.handle}
                          displayName={m.displayName}
                          avatarUrl={m.avatarUrl}
                          online={m.online}
                          context={m.headline ? m.headline : `@${m.handle}`}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <ul className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-sm">
                    {visible.map((m) => (
                      <ListRow
                        key={m.id}
                        member={m}
                        selected={m.id === effectiveSelectedId}
                        onSelect={() => chooseRow(m.id)}
                      />
                    ))}
                  </ul>
                )}

                {/* Infinite-scroll sentinel: sits inside the scroll column so the observer roots to it.
                    A no-JS / motion-reduce fallback button is kept for keyboard + non-observer paths. */}
                {hasMore && (
                  <div ref={sentinelRef} className="mt-3 flex justify-center">
                    <button
                      type="button"
                      onClick={() => setPage((p) => p + 1)}
                      className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-text transition-colors hover:border-border-strong hover:bg-surface-elevated"
                    >
                      Load more members
                    </button>
                  </div>
                )}
              </div>

              <p className="mt-2 text-center text-2xs text-subtle">
                Showing {visible.length} of {total}
              </p>
            </>
          )}
        </div>

        {/* RIGHT: the wide detail pane (desktop only; mobile uses the overlay). Opens FULLY — no inner
            scroll or sticky cap, so the member's stats stretch to their natural height and the page
            (not this panel) scrolls. The email editor opens in a popup, so this pane never has to hold it. */}
        <div className="hidden min-w-0 flex-1 lg:block">
          <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
            {detailPane}
          </div>
        </div>
      </div>

      {/* MOBILE overlay */}
      {overlayOpen && selectedMember && (
        <div className="fixed inset-0 z-50 flex flex-col bg-canvas lg:hidden">
          <div className="flex items-center gap-2 border-b border-border bg-surface px-4 py-3">
            <button
              type="button"
              onClick={() => setOverlayOpen(false)}
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-semibold text-muted transition-colors hover:bg-surface-elevated hover:text-text"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Back
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-5">{detailPane}</div>
        </div>
      )}
    </div>
  )
}

function ViewToggleButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean
  onClick: () => void
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      className={cn(
        'rounded-md p-1.5 transition-colors',
        active ? 'bg-primary-bg text-primary-strong' : 'text-subtle hover:text-text',
      )}
    >
      {children}
    </button>
  )
}

function ListRow({
  member,
  selected,
  onSelect,
}: {
  member: MemberSummary
  selected: boolean
  onSelect: () => void
}) {
  return (
    <li>
      <button
        type="button"
        role="option"
        aria-selected={selected}
        onClick={onSelect}
        className={cn(
          'flex w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-surface-elevated/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50',
          selected && 'bg-primary-bg/40',
        )}
      >
        <div className="relative shrink-0">
          {member.avatarUrl ? (
            <Image
              src={member.avatarUrl}
              alt={member.displayName}
              width={32}
              height={32}
              className="h-8 w-8 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-bg text-xs font-semibold text-primary-strong select-none">
              {getInitials(member.displayName)}
            </div>
          )}
          {member.online && (
            <span
              aria-label="Online now"
              className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-success ring-2 ring-surface"
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-text">{member.displayName}</p>
          <p className="truncate text-xs text-subtle">{member.headline ?? `@${member.handle}`}</p>
        </div>
      </button>
    </li>
  )
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-4">
        <Skeleton className="h-16 w-16 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-24" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
    </div>
  )
}
