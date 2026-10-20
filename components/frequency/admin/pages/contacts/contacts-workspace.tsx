'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { FqIcon } from '@/components/frequency/icon'
import { CrmMemberDetailPane } from '@/components/people/member-viewer/crm-member-detail'
import type { CrmMemberDetail } from '@/components/people/member-viewer'
import { applyQuery, type Facet, type MemberDetail, type MemberSummary, type SortOption } from '@/lib/people/member-viewer'
import { Input } from '@/components/ui/field'
import { Select } from '@/components/ui/select'
import { Av } from '../shared'

// THE CONTACTS WORKSPACE under Frequency (templates/admin/Contacts.html idiom: chips, one round search pill,
// kit rows). The same roster and the same detail the DAWN master-detail shows, drawn in the console's own
// kit: the people on the left, the selected person's card (stats, timeline, deal stage, notes, win-back and
// the message composer: CrmMemberDetailPane) on the right, stacked under the list on a phone. The detail is
// read lazily through the server action the page binds to this Space, exactly as the DAWN viewer does.

type Tone = 'ok' | 'warn' | 'bad' | 'n'
const TIER_TONE: Record<string, Tone> = { resonant: 'ok', cooling: 'warn', at_risk: 'bad' }
const TIER_LABEL: Record<string, string> = { resonant: 'Resonant', cooling: 'Cooling', at_risk: 'At risk' }

const CHIPS = [
  { key: '', label: 'All' },
  { key: 'resonant', label: 'Resonant' },
  { key: 'cooling', label: 'Cooling' },
  { key: 'at_risk', label: 'At risk' },
] as const

const PAGE = 40

type Loaded = { id: string; detail: MemberDetail | null }

export function ContactsWorkspace({
  members,
  loadDetail,
  messageScope,
  facets,
  sortOptions,
}: {
  members: MemberSummary[]
  /** The roster's other filters (Role, Business, Activity, Lifecycle), opened from the Filters pill. */
  facets: Facet[]
  /** The sort choices; the first is the default (Most complete, so filled-out contacts surface first). */
  sortOptions: SortOption[]
  loadDetail: (id: string) => Promise<MemberDetail>
  messageScope: { spaceId: string; slug: string }
}) {
  const [chip, setChip] = useState('')
  const [q, setQ] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const [facetSel, setFacetSel] = useState<Record<string, string>>({})
  const [sortKey, setSortKey] = useState(() => (sortOptions.find((o) => o.spec.key === 'completeness') ?? sortOptions[0])?.key ?? '')
  const [picked, setPicked] = useState<string | null>(null)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const paneRef = useRef<HTMLDivElement>(null)

  const counts = useMemo(
    () => Object.fromEntries(CHIPS.map((c) => [c.key, c.key ? members.filter((m) => m.badges?.includes(c.key)).length : members.length])),
    [members],
  )
  const shown = useMemo(
    () =>
      applyQuery(
        members,
        { text: q, facets: { ...facetSel, ...(chip ? { tier: chip } : {}) }, sort: sortOptions.find((o) => o.key === sortKey)?.spec },
        1,
        20,
      ).filtered,
    [members, q, chip, facetSel, sortKey, sortOptions],
  )
  const activeFilters = Object.values(facetSel).filter(Boolean).length
  const selectedId = shown.some((m) => m.id === picked) ? picked : (shown[0]?.id ?? null)
  const selected = shown.find((m) => m.id === selectedId) ?? null

  const loadRef = useRef(loadDetail)
  useEffect(() => {
    loadRef.current = loadDetail
  }, [loadDetail])
  const needsFetch = !!selected && !selected.detail
  useEffect(() => {
    if (!selectedId || !needsFetch) return
    let cancelled = false
    loadRef.current(selectedId).then(
      (detail) => !cancelled && (setFailed(null), setLoaded({ id: selectedId, detail })),
      () => !cancelled && setFailed(selectedId),
    )
    return () => {
      cancelled = true
    }
  }, [selectedId, needsFetch])

  const mounted = useRef(false)
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      return
    }
    if (window.matchMedia('(max-width: 900px)').matches) paneRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [picked])

  const detail: MemberDetail | null = !selected
    ? null
    : (selected.detail ?? (loaded?.id === selected.id ? loaded.detail : null))

  return (
    <div className="adp-ws">
      <div className="row wrap adp-filters">
        <div className="chips" role="group" aria-label="Filter people">
          {CHIPS.map((c) => (
            <button
              key={c.key || 'all'}
              type="button"
              className={chip === c.key ? 'chip on' : 'chip'}
              aria-pressed={chip === c.key}
              onClick={() => {
                setChip(c.key)
                setLimit(PAGE)
              }}
            >
              {c.label} {(counts[c.key] ?? 0).toLocaleString('en-US')}
            </button>
          ))}
        </div>
        <details className="adp-ws-filters">
          <summary className={activeFilters ? 'chip on' : 'chip'}>
            <FqIcon name="filter" />
            Filters{activeFilters ? ` ${activeFilters}` : ''}
          </summary>
          <div className="panel adp-ws-menu">
            {facets.map((f) => (
              <Select
                key={f.key}
                aria-label={f.label}
                value={facetSel[f.key] ?? ''}
                onChange={(e) => {
                  setFacetSel((prev) => ({ ...prev, [f.key]: e.target.value }))
                  setLimit(PAGE)
                }}
                tone={facetSel[f.key] ? 'active' : 'default'}
                emptyLabel={f.label}
                options={f.options}
              />
            ))}
            {sortOptions.length > 1 ? (
              <Select
                aria-label="Sort"
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value)}
                options={sortOptions.map((o) => ({ value: o.key, label: `Sort: ${o.label}` }))}
              />
            ) : null}
          </div>
        </details>
        <span className="ap-sp" />
        <Input
          className="adp-search"
          type="search"
          placeholder="Search people"
          aria-label="Search people"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setLimit(PAGE)
          }}
        />
      </div>

      <div className="adp-ws-grid">
        <div className="panel adp-ws-list" role="listbox" aria-label="People">
          {shown.length === 0 ? (
            <p className="t2 adp-ws-empty">{members.length === 0 ? 'No members or contacts yet.' : 'No one matches. Try another filter.'}</p>
          ) : (
            shown.slice(0, limit).map((m) => {
              const tier = m.badges?.find((b) => b in TIER_TONE)
              return (
                <button
                  key={m.id}
                  type="button"
                  role="option"
                  aria-selected={m.id === selectedId}
                  className={m.id === selectedId ? 'adp-ws-row on' : 'adp-ws-row'}
                  onClick={() => setPicked(m.id)}
                >
                  <Av url={m.avatarUrl} />
                  <span className="grow">
                    <span className="t1 adp-block">{m.displayName}</span>
                    <span className="t2">{m.headline ?? `@${m.handle}`}</span>
                  </span>
                  {tier ? <span className={`st ${TIER_TONE[tier]}`}>{TIER_LABEL[tier]}</span> : null}
                </button>
              )
            })
          )}
          {shown.length > limit ? (
            <button type="button" className="btn sm adp-ws-more" onClick={() => setLimit((l) => l + PAGE)}>
              Show more
            </button>
          ) : null}
        </div>

        <div className="panel adp-ws-pane" ref={paneRef} aria-live="polite">
          {!selected ? (
            <p className="t2 adp-ws-empty">Pick a person to see their card.</p>
          ) : detail ? (
            <CrmMemberDetailPane key={(detail as CrmMemberDetail).profileId ?? selected.id} detail={detail as CrmMemberDetail} messageScope={messageScope} />
          ) : failed === selected.id ? (
            <p className="t2 adp-ws-empty">
              <FqIcon name="nudge" /> Could not load this person. Pick them again to retry.
            </p>
          ) : (
            <p className="t2 adp-ws-empty">Loading their card</p>
          )}
        </div>
      </div>
    </div>
  )
}
