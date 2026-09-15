'use client'

import { useCallback, useMemo, useState, useTransition } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Ban, Building2, Loader2, Mail, MailCheck, Search, Sparkles, UserRound, X } from 'lucide-react'
import { getInitials, cn } from '@/lib/utils'
import { avatarSrc, avatarFocusStyle } from '@/lib/images/avatar-focus'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusChip, type StatusTone } from '@/components/admin/status'
import { ROLE_LABEL } from '@/lib/community-roles'
import {
  assignableKinds,
  isAssignableKind,
  relationshipKind,
  relationshipLabel,
  type RelationshipKind,
  type RelationshipTone,
} from '@/lib/crm/relationship-kinds'
import {
  applyContactQuery,
  sourceLabel,
  type ContactQuery,
  type ContactRosterRow,
  type ContactSort,
} from '@/lib/crm/contacts-roster-core'
import type { ContactConsentState } from '@/lib/crm/contact-consent'
import type { Facet } from '@/lib/people/member-viewer'
import { assignRelationship, removeRelationship } from '../relationship-actions'
import { bulkSetContactConsent, setContactConsent } from './actions'
import { isError, type ActionResult } from '@/lib/action-result'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/field'
import { Select } from '@/components/ui/select'

// THE CONTACTS ROSTER ISLAND: the thin interactive shell over the pure core (lib/crm/contacts-roster-core).
// It mirrors the member-viewer's HERO toolbar (live search + a prominent sort selector + facets) but
// renders the WHOLE contacts list (members + subscribers + leads) as a browse Index, each row tagged
// with the classifier's verdict (status / role / business / activity / Spaces / relationship kinds) and
// the R5 upgrade signal. All filter / sort / page math lives in the pure core; this island only holds
// the query state and paints rows. Semantic DAWN tokens only; copy plain, no em dashes.
//
// It also holds the two CONSENT writes that came here when /admin/marketing/contacts retired
// (LIVE-239): a per-row optimistic toggle, and the multi-select bulk action (ADR-379). Selection is
// scoped to what the current query SHOWS, not to every loaded row, because this roster filters and the
// retired table did not: "select all" on a faceted view that silently wrote 500 rows would be the
// power action's worst possible reading. Both actions re-gate on the server.

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
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkPending, startBulk] = useTransition()
  const [bulkMsg, setBulkMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const activeSort = sortOptions.find((o) => o.key === sortKey)?.spec
  const query: ContactQuery = useMemo(
    () => ({ text, facets: facetSel, sort: activeSort }),
    [text, facetSel, activeSort],
  )

  const { visible, total, hasMore } = useMemo(
    () => applyContactQuery(rows, query, page, PAGE_SIZE),
    [rows, query, page],
  )

  // Narrowing the view drops the selection: a checked row the operator can no longer see must never
  // ride along into a bulk write. Paging (Load more) only ADDS rows, so it keeps the selection.
  const clearSelection = useCallback(() => {
    setSelected(new Set())
    setBulkMsg(null)
  }, [])
  const setSearch = useCallback((next: string) => {
    setText(next)
    setPage(1)
    clearSelection()
  }, [clearSelection])
  const setFacet = useCallback((key: string, value: string) => {
    setFacetSel((prev) => ({ ...prev, [key]: value }))
    setPage(1)
    clearSelection()
  }, [clearSelection])
  const chooseSort = useCallback((key: string) => {
    setSortKey(key)
    setPage(1)
  }, [])

  const toggleOne = useCallback((contactId: string) => {
    setBulkMsg(null)
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(contactId)) next.delete(contactId)
      else next.add(contactId)
      return next
    })
  }, [])

  // The visible ids, and whether every one of them is picked (the header checkbox's state).
  const visibleIds = useMemo(() => visible.map((r) => r.contactId), [visible])
  const allVisiblePicked = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id))
  const toggleAllVisible = useCallback(() => {
    setBulkMsg(null)
    setSelected((prev) => {
      const everyPicked = visibleIds.length > 0 && visibleIds.every((id) => prev.has(id))
      if (everyPicked) return new Set()
      return new Set(visibleIds)
    })
  }, [visibleIds])

  // Only ever write ids that are still on screen (see the header note).
  const pickedOnScreen = useMemo(
    () => visibleIds.filter((id) => selected.has(id)),
    [visibleIds, selected],
  )

  const runBulk = useCallback(
    (state: 'subscribed' | 'unsubscribed') => {
      const ids = pickedOnScreen
      if (ids.length === 0) return
      setBulkMsg(null)
      startBulk(async () => {
        const res = await bulkSetContactConsent(ids, state)
        setSelected(new Set())
        // updated:0 against a non-empty selection means the write failed. Say so rather than
        // reporting a confident "Marked 0 contacts".
        setBulkMsg(
          res.updated === 0
            ? {
                ok: false,
                text: `Could not update ${ids.length === 1 ? 'that contact' : 'those contacts'}. Please try again.`,
              }
            : {
                ok: true,
                text: `Marked ${res.updated} contact${res.updated === 1 ? '' : 's'} ${state}.`,
              },
        )
      })
    },
    [pickedOnScreen],
  )

  const activeFacetCount = Object.values(facetSel).filter(Boolean).length

  return (
    <div className="flex flex-col gap-4">
      {/* HERO toolbar: live search + the sort selector. */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 basis-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
            <Input
              value={text}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email"
              aria-label="Search by name or email"
              className="py-2.5 pl-10 pr-9"
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
              className="inline-flex shrink-0 flex-wrap items-center gap-0.5 rounded-card border border-border bg-surface p-0.5"
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
                      'rounded-lg px-3 py-1.5 text-body-sm font-semibold transition-colors',
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
              // `tone` rather than a className tint: `cn` is a plain join, so a `border-primary`
              // passed in would land BESIDE the primitive's own `border-border` and Tailwind's
              // emit order — not this call site — would pick the winner.
              <Select
                key={f.key}
                id={`facet-${f.key}`}
                value={facetSel[f.key] ?? ''}
                onChange={(e) => setFacet(f.key, e.target.value)}
                tone={facetSel[f.key] ? 'active' : 'default'}
                emptyLabel={f.label}
                options={f.options}
                wrapperClassName="inline-block w-max max-w-full"
                className="text-meta font-medium"
              />
            ))}
            {activeFacetCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  setFacetSel({})
                  setPage(1)
                }}
                className="rounded-lg px-2.5 py-1.5 text-meta font-medium text-muted transition-colors hover:bg-surface-elevated hover:text-text"
              >
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* The bulk consent bar (ADR-379), only once something is picked. It names the count it will
          actually write, which is the picked rows STILL ON SCREEN. */}
      {pickedOnScreen.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface-elevated/50 px-3 py-2">
          <span className="text-body-sm font-medium text-text">
            {pickedOnScreen.length} selected
          </span>
          <span aria-hidden className="text-subtle">
            ·
          </span>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => runBulk('subscribed')}
            disabled={bulkPending}
          >
            {bulkPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MailCheck className="h-4 w-4" />
            )}
            Mark subscribed
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => runBulk('unsubscribed')}
            disabled={bulkPending}
          >
            {bulkPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
            Mark unsubscribed
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={clearSelection} disabled={bulkPending}>
            Clear
          </Button>
        </div>
      )}
      {bulkMsg && !bulkPending && pickedOnScreen.length === 0 && (
        <p
          role={bulkMsg.ok ? undefined : 'alert'}
          className={cn('text-meta', bulkMsg.ok ? 'text-success' : 'text-danger')}
        >
          {bulkMsg.text}
        </p>
      )}

      {/* The list. */}
      {visible.length === 0 ? (
        <EmptyState
          variant="no-results"
          title="No contacts match"
          description="Try a different search or clear the filters to see everyone."
        />
      ) : (
        <>
          {/* The visible text IS the label, so the control carries no duplicate aria-label. */}
          <label className="flex w-max items-center gap-3 px-1">
            <Checkbox checked={allVisiblePicked} onChange={toggleAllVisible} />
            <span className="text-meta text-muted">Select every contact shown</span>
          </label>

          <ul className="divide-y divide-border rounded-2xl border border-border bg-surface lift-1">
            {visible.map((row) => (
              <ContactRow
                key={row.contactId}
                row={row}
                picked={selected.has(row.contactId)}
                onPick={toggleOne}
              />
            ))}
          </ul>

          {hasMore && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border border-border bg-surface px-4 py-2 text-body-sm font-semibold text-text transition-colors hover:border-border-strong hover:bg-surface-elevated"
              >
                Load more contacts
              </button>
            </div>
          )}
          <p className="text-center text-2xs text-muted">
            Showing {visible.length} of {total}
          </p>
        </>
      )}
    </div>
  )
}

// ── One contact row ──────────────────────────────────────────────────────────────────────────────

function ContactRow({
  row,
  picked,
  onPick,
}: {
  row: ContactRosterRow
  picked: boolean
  onPick: (contactId: string) => void
}) {
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
      {/* The selection checkbox for the bulk consent action. */}
      <div className="shrink-0 pt-2.5">
        <Checkbox
          aria-label={`Select ${row.displayName}`}
          checked={picked}
          onChange={() => onPick(row.contactId)}
        />
      </div>

      {/* Avatar / initials. */}
      <div className="shrink-0">
        {row.avatarUrl ? (
          <Image
            src={avatarSrc(row.avatarUrl)}
            alt=""
            width={36}
            height={36}
            className="h-9 w-9 rounded-pill object-cover"
            style={avatarFocusStyle(row.avatarUrl)}
          />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-pill bg-primary-bg text-meta font-semibold text-primary-strong select-none">
            {getInitials(row.displayName)}
          </div>
        )}
      </div>

      {/* Identity + chips + meta. */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-body-sm font-bold text-text">{row.displayName}</span>
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
          <ConsentEditor contactId={row.contactId} initialState={row.consentState} />
          <RelationshipEditor contactId={row.contactId} initialKinds={row.relationshipKinds} />
          {row.upgradeCandidate && (
            <StatusChip tone="success" size="sm">
              <Sparkles className="h-2.5 w-2.5" aria-hidden />
              Ready for Business
            </StatusChip>
          )}
        </div>

        {/* Email + a compact meta line (active dot, Spaces). */}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-meta text-subtle">
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
              <span className="h-1.5 w-1.5 rounded-pill bg-success" aria-hidden />
              Active this week
            </span>
          )}
          {spacesLabel && (
            <span className="inline-flex items-center gap-1">
              <Building2 className="h-3 w-3" aria-hidden />
              {spacesLabel}
            </span>
          )}
          {/* Where they came in from. Shown because the Source facet filters on it, and a filter whose
              value is invisible on the row is a filter the operator cannot trust. */}
          {row.source && <span>From {sourceLabel(row.source)}</span>}
        </div>

        {/* The upgrade "why", when this member is a candidate (transparent + tunable heuristic). */}
        {row.upgradeCandidate && row.upgradeReasons.length > 0 && (
          <p className="mt-1 text-2xs text-muted">
            Upgrade score {row.upgradeScore}: {row.upgradeReasons.join(' · ')}
          </p>
        )}
      </div>

      {/* Profile link (members only). */}
      {row.handle && (
        <Link
          href={`/people/${row.handle}`}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1.5 text-meta font-semibold text-on-primary transition-colors hover:bg-primary-hover"
        >
          <UserRound className="h-3.5 w-3.5" aria-hidden />
          Profile
        </Link>
      )}
    </li>
  )
}

// ── The assign-a-relationship write surface (the CRM "small sliver") ───────────────────────────────
// The one WRITER for the assignable-relationship read path: it paints a contact's stored kinds as
// removable chips and offers an "Add relationship" menu of the assignable registry (voice-safe labels)
// that has not been assigned yet. Both edits are OPTIMISTIC — the chip changes on click, and the server
// action revalidates the roster on success so the change also flows into the "Relationship" facet; a
// rejected write rolls the chip back and shows the friendly error. Semantic tokens only, no hex.

function RelationshipEditor({
  contactId,
  initialKinds,
}: {
  contactId: string
  initialKinds: RelationshipKind[]
}) {
  const [kinds, setKinds] = useState<RelationshipKind[]>(initialKinds)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // The "Add relationship" menu: every assignable kind this contact does not already hold (registry order).
  const available = useMemo(
    () => assignableKinds().filter((k) => !kinds.includes(k.key as RelationshipKind)),
    [kinds],
  )

  // Optimistically paint `next`, run the gated action, and roll back to `prev` with the error on reject.
  const run = useCallback(
    (next: RelationshipKind[], action: () => Promise<ActionResult>) => {
      const prev = kinds
      setError(null)
      setKinds(next)
      startTransition(async () => {
        const res = await action()
        if (isError(res)) {
          setKinds(prev)
          setError(res.error)
        }
      })
    },
    [kinds],
  )

  const add = (kind: RelationshipKind) =>
    run([...kinds, kind], () => assignRelationship(contactId, kind))
  const remove = (kind: RelationshipKind) =>
    run(kinds.filter((k) => k !== kind), () => removeRelationship(contactId, kind))

  return (
    <>
      {kinds.map((k) => {
        const def = relationshipKind(k)
        const label = relationshipLabel(k)
        return (
          <StatusChip key={k} tone={toneToChip(def?.tone ?? 'neutral')} size="sm">
            {label}
            <button
              type="button"
              onClick={() => remove(k)}
              disabled={pending}
              aria-label={`Remove ${label} relationship`}
              className="-mr-0.5 ml-0.5 rounded-pill p-0.5 transition-colors hover:bg-text/10 disabled:opacity-50"
            >
              <X className="h-2.5 w-2.5" aria-hidden />
            </button>
          </StatusChip>
        )
      })}

      {available.length > 0 && (
        <label className="inline-flex shrink-0 items-center">
          <span className="sr-only">Add a relationship for this contact</span>
          <select
            value=""
            disabled={pending}
            onChange={(e) => {
              const value = e.target.value
              if (isAssignableKind(value)) add(value)
            }}
            className="rounded-pill border border-dashed border-border bg-surface px-2 py-0.5 text-2xs font-medium text-muted transition-colors hover:border-primary hover:text-primary focus:outline-none disabled:opacity-50"
          >
            <option value="">+ Add relationship</option>
            {available.map((k) => (
              <option key={k.key} value={k.key}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {error && <span className="basis-full text-2xs text-danger">{error}</span>}
    </>
  )
}

// ── The consent write surface (moved here with LIVE-239) ───────────────────────────────────────────
// The per-row half of what /admin/marketing/contacts carried: the chip that says where this address
// stands, and the one control that changes it. OPTIMISTIC like RelationshipEditor above: the chip flips
// on click, and a write the server refused (or that matched no row) rolls it back with a plain line.
//
// 'unknown' is a real state, not a blank: it means nobody ever asked, which a marketing send treats as
// "not opted in" (evaluateContactConsent). So the chip renders for it too, and its only offer is to
// subscribe, since unsubscribing someone who never opted in records a decision nobody made.

const CONSENT_TONE: Record<ContactConsentState, StatusTone> = {
  subscribed: 'success',
  unsubscribed: 'danger',
  unknown: 'neutral',
}
const CONSENT_LABEL: Record<ContactConsentState, string> = {
  subscribed: 'Subscribed',
  unsubscribed: 'Unsubscribed',
  unknown: 'Never asked',
}

function ConsentEditor({
  contactId,
  initialState,
}: {
  contactId: string
  initialState: ContactConsentState
}) {
  const [state, setState] = useState<ContactConsentState>(initialState)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // An unsubscribed or never-asked contact can be subscribed; a subscribed one can be unsubscribed.
  const next: 'subscribed' | 'unsubscribed' = state === 'subscribed' ? 'unsubscribed' : 'subscribed'
  const actionLabel = state === 'subscribed' ? 'Unsubscribe' : 'Subscribe'
  const actionHint =
    state === 'subscribed'
      ? 'Unsubscribe this contact from marketing email'
      : 'Subscribe this contact to marketing email'

  function flip() {
    const prev = state
    setError(null)
    setState(next)
    startTransition(async () => {
      const res = await setContactConsent(contactId, next)
      if (res.updated === 0) {
        setState(prev)
        setError('That did not save. Please try again.')
      }
    })
  }

  return (
    <>
      <StatusChip tone={CONSENT_TONE[state]} size="sm">
        {CONSENT_LABEL[state]}
        <button
          type="button"
          onClick={flip}
          disabled={pending}
          aria-label={actionHint}
          className="-mr-0.5 ml-1 rounded-pill px-1 text-2xs font-semibold underline transition-colors hover:bg-text/10 disabled:opacity-50"
        >
          {actionLabel}
        </button>
      </StatusChip>
      {error && <span className="basis-full text-2xs text-danger">{error}</span>}
    </>
  )
}
