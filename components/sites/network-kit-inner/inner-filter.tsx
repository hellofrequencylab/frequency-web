'use client'

import { useState, type ReactNode } from 'react'
import { Input } from '@/components/ui/field'

// The Network Theme Kit's filtered catalog: the design's Shop and Library pages (ui_kits/site ShopPage.jsx,
// ResourcesPage.jsx), a row of tabs (and, for the library, a search) over tiles or ruled rows. The server block works
// out every item (the owner's cards) and hands it over drawn; the tabs and the search only hide the ones that do not
// match. With no script every item shows. A tab appears only when a group has an item in it.

export interface FilterItem {
  group: string
  /** The words the search looks through, lower case. */
  haystack: string
  node: ReactNode
}

export function NetworkKitInnerFilter({ items, allLabel, search, empty, note, layout }: {
  items: FilterItem[]
  allLabel: string
  /** The search field's hint. Empty draws no search. */
  search: string
  empty: string
  /** A small line beside the tabs. */
  note: string
  layout: 'tiles' | 'rows'
}) {
  const [pick, setPick] = useState('')
  const [q, setQ] = useState('')
  const groups = [...new Set(items.map((i) => i.group).filter(Boolean))]
  const needle = q.trim().toLowerCase()
  const shown = items.filter((i) => (!pick || i.group === pick) && (!needle || i.haystack.includes(needle)))
  return (
    <>
      <div className="nki-bar">
        {groups.length > 0 ? (
          <div className="nki-tabs" role="group" aria-label="Filter">
            {[allLabel, ...groups].map((t, i) => {
              const on = (i === 0 && !pick) || t === pick
              return <button key={t} type="button" className="nki-tab" aria-pressed={on} onClick={() => setPick(i === 0 ? '' : t)}>{t}</button>
            })}
          </div>
        ) : <span />}
        {search ? <Input variant="seamless" className="nk-input nki-search" type="search" value={q} placeholder={search} aria-label={search} onChange={(e) => setQ(e.target.value)} /> : note ? <span className="nk-eyebrow nk-eyebrow--bare">{note}</span> : null}
      </div>
      {shown.length > 0 ? (
        <div className={layout === 'tiles' ? 'nki-tiles' : 'nki-rows'} role={layout === 'rows' ? 'list' : undefined}>{shown.map((i, k) => <div key={k} className="nki-cell" role={layout === 'rows' ? 'listitem' : undefined}>{i.node}</div>)}</div>
      ) : empty ? <p className="nk-row-body nk-empty">{empty}</p> : null}
    </>
  )
}
