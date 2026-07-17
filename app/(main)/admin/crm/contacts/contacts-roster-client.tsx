'use client'

import { useCallback, useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Building2, Mail, Search, Sparkles, UserRound, X } from 'lucide-react'
import { getInitials, cn } from '@/lib/utils'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusChip, type StatusTone } from '@/components/admin/status'
import { ROLE_LABEL } from '@/lib/community-roles'
import {
  relationshipKind,
  relationshipLabel,
  type RelationshipTone,
} from '@/lib/crm/relationships'
import {
  applyContactQuery,
  type ContactQuery,
  type ContactRosterRow,
  type ContactSort,
} from '@/lib/crm/contacts-roster'
import type { Facet } from '@/lib/people/member-viewer'

// THE CONTACTS ROSTER ISLAND: the thin interactive shell over the pure core (lib/crm/contacts-roster).
// It mirrors the member-viewer's HERO toolbar (live search + a prominent sort selector + facets) but
// renders the WHOLE contacts list (members + subscribers + leads) as a browse Index, each row tagged
// with the classifier's verdict (status / role / business / activity / Spaces / relationship kinds) and
// the R5 upgrade signal. All filter / sort / page math lives in the pure core; this island only holds
// the query state and paints rows. Semantic DAWN tokens only; copy plain, no em dashes.

const PAGE_SIZE = 25

type SortOption = { key: string; label: string; spec: ContactSort }

/** Map a relationship registry tone to the StatusChip vocabulary (primary has no chip tone → info). */
function toneToChip(tone: RelationshipTone): StatusTone {
  switch (tone) {
    case 'success':
      return 'success'
    case 'warning':
      return 'warning'
    case 'danger':
      return 'danger'
    case 'primary':
      return 'info'
    default:
      return 'neutral'
  }
}

/** The status chip tone: a member reads as info (a real account), everyone else neutral. */
const STATUS_TONE: Record<ContactRosterRow['status'], StatusTone> = {
  member: 'info',
  subscriber: 'neutral',
  lead: 'neutral',
}
const STATUS_LABEL: Record<ContactRosterRow['status'], string> = {
  member: 'Member',
  subscriber: 'Subscriber',
  lead: 'Lead',
}

export function ContactsRosterClient({
  rows,
  facets,
  sortOptions,
}: {
  rows: ContactRosterRow[]
  facets: Facet[]
  sortOptions: SortOption[]
}) {
  const [text, setText] = useState('')
  const [facetSel, setFacetSel] = useState<Record<string, string>>({})
  const [sortKey, setSortKey] = useState<string>(sortOptions[0]?.key ?? 'recent')
  const [page, setPage] = useState(1)

  const activeSort = sortOptions.find((o) => o.key === sortKey)?.spec
  const query: ContactQuery = useMemo(
    () => ({ text, facets: facetSel, sort: activeSort }),
    [text, facetSel, activeSort],
  )

  const { visible, total, hasMore } = useMemo(
    () => applyContactQuery(rows, query, page, PAGE_SIZE),
    [rows, query, page],
  )

  const setSearch = useCallback((next: string) => {
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

  const activeFacetCount = Object.values(facetSel).filter(Boolean).length

  return (
    <div className="flex flex-col gap-4">
      {/* HERO toolbar: live search + the sort selector. */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 basis-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
            <input
              value={text}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email"
              aria-label="Search by name or email"
              className="w-full rounded-xl border border-border bg-surface py-2.5 pl-10 pr-9 text-sm text-text placeholder:text-subtle transition-colors focus:border-border-strong focus:outline-none"
            />
            {text && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-subtle transition-colors hover:bg-surface-elevated hover:text-text"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {sortOptions.length > 0 && (
            <div
              role="group"
              aria-label="Sort contacts"
              className="inline-flex shrink-0 flex-wrap items-center gap-0.5 rounded-xl border border-border bg-surface p-0.5"
            >
              {sortOptions.map((o) => {
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

        {/* Quieter second line: the registry-driven facets. */}
        {facets.length > 0 && (
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
            {activeFacetCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  setFacetSel({})
                  setPage(1)
                }}
                className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface-elevated hover:text-text"
              >
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* The list. */}
      {visible.length === 0 ? (
        <EmptyState
          variant="no-results"
          title="No contacts match"
          description="Try a different search or clear the filters to see everyone."
        />
      ) : (
        <>
          <ul className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-sm">
            {visible.map((row) => (
              <ContactRow key={row.contactId} row={row} />
            ))}
          </ul>

          {hasMore && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-text transition-colors hover:border-border-strong hover:bg-surface-elevated"
              >
                Load more contacts
              </button>
            </div>
          )}
          <p className="text-center text-2xs text-subtle">
            Showing {visible.length} of {total}
          </p>
        </>
      )}
    </div>
  )
}

// ── One contact row ──────────────────────────────────────────────────────────────────────────────

function ContactRow({ row }: { row: ContactRosterRow }) {
  const roleLabel =
    row.status === 'member' && row.communityRole && row.communityRole in ROLE_LABEL
      ? ROLE_LABEL[row.communityRole as keyof typeof ROLE_LABEL]
      : null
  const spacesLabel =
    row.spaces.length > 0
      ? row.spaces.length === 1
        ? row.spaces[0].name
        : `${row.spaces.length} Spaces`
      : null

  return (
    <li className="flex items-start gap-3 px-4 py-3">
      {/* Avatar / initials. */}
      <div className="shrink-0">
        {row.avatarUrl ? (
          <Image
            src={row.avatarUrl}
            alt=""
            width={36}
            height={36}
            className="h-9 w-9 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-bg text-xs font-semibold text-primary-strong select-none">
            {getInitials(row.displayName)}
          </div>
        )}
      </div>

      {/* Identity + chips + meta. */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-sm font-bold text-text">{row.displayName}</span>
          <StatusChip tone={STATUS_TONE[row.status]} size="sm">
            {STATUS_LABEL[row.status]}
          </StatusChip>
          {roleLabel && (
            <StatusChip tone="neutral" size="sm">
              {roleLabel}
            </StatusChip>
          )}
          {row.isBusiness && (
            <StatusChip tone="info" size="sm">
              <Building2 className="h-2.5 w-2.5" aria-hidden />
              {relationshipLabel('business')}
            </StatusChip>
          )}
          {row.relationshipKinds.map((k) => {
            const def = relationshipKind(k)
            return (
              <StatusChip key={k} tone={toneToChip(def?.tone ?? 'neutral')} size="sm">
                {relationshipLabel(k)}
              </StatusChip>
            )
          })}
          {row.upgradeCandidate && (
            <StatusChip tone="success" size="sm">
              <Sparkles className="h-2.5 w-2.5" aria-hidden />
              Ready for Business
            </StatusChip>
          )}
        </div>

        {/* Email + a compact meta line (active dot, Spaces). */}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-subtle">
          {row.email && (
            <a
              href={`mailto:${row.email}`}
              className="inline-flex items-center gap-1.5 text-primary hover:underline"
            >
              <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="truncate">{row.email}</span>
            </a>
          )}
          {row.activeThisWeek && (
            <span className="inline-flex items-center gap-1 font-medium text-success">
              <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
              Active this week
            </span>
          )}
          {spacesLabel && (
            <span className="inline-flex items-center gap-1">
              <Building2 className="h-3 w-3" aria-hidden />
              {spacesLabel}
            </span>
          )}
        </div>

        {/* The upgrade "why", when this member is a candidate (transparent + tunable heuristic). */}
        {row.upgradeCandidate && row.upgradeReasons.length > 0 && (
          <p className="mt-1 text-2xs text-subtle">
            Upgrade score {row.upgradeScore}: {row.upgradeReasons.join(' · ')}
          </p>
        )}
      </div>

      {/* Profile link (members only). */}
      {row.handle && (
        <Link
          href={`/people/${row.handle}`}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover"
        >
          <UserRound className="h-3.5 w-3.5" aria-hidden />
          Profile
        </Link>
      )}
    </li>
  )
}
