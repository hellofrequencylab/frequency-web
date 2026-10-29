'use client'

import { useState } from 'react'
import { NkGlyph } from '@/components/sites/network-kit-glyph'

// The Network Theme Kit's filtered index: the design's Workshops and Journeys pages (ui_kits/site/WorkshopsPage.jsx,
// JourneysPage.jsx), a count and a row of tabs over a grid of entity cards. The only client piece of the inner pages:
// the cards arrive already worked out by the server block (live rows or the owner's own), and the tabs only hide the
// ones outside the chosen group. With no script every card shows. A tab appears only when a group has a card in it.

export interface InnerCard {
  image: string | null
  glyph: string
  eyebrow: string
  title: string
  meta: string
  body: string
  price: string
  note: string
  accent: boolean
  group: string
  href: string | null
}

const rel = (href: string) => (/^https?:\/\//.test(href) ? { target: '_blank', rel: 'noopener noreferrer' } : {})

function Card({ c }: { c: InnerCard }) {
  const inner = (
    <>
      {c.image && (
        <div className="nk-photo nk-entity-cover">
          {/* eslint-disable-next-line @next/next/no-img-element -- owner photo on an arbitrary host */}
          <img src={c.image} alt="" loading="lazy" />
        </div>
      )}
      <div className="nk-entity-body">
        {c.eyebrow && <div className="nk-entity-eyebrow"><NkGlyph name={c.glyph} size={16} />{c.eyebrow}</div>}
        <h3 className="nk-display nk-card-title">{c.title}</h3>
        {c.meta && <div className="nk-row-body">{c.meta}</div>}
        {c.body && <p className="nk-entity-text">{c.body}</p>}
        {(c.price || c.note) && (
          <div className="nk-card-foot">
            <span className="nk-mono">{c.price}</span>
            {c.note && <span className={c.accent ? 'nk-badge nk-badge--accent' : 'nk-badge'}>{c.note}</span>}
          </div>
        )}
      </div>
    </>
  )
  return c.href ? <a className="nk-card nk-card--lift nk-entity" href={c.href} {...rel(c.href)}>{inner}</a> : <div className="nk-card nk-card--lift nk-entity">{inner}</div>
}

export function NetworkKitInnerIndexList({ cards, tabs, allLabel, countNoun, empty }: { cards: InnerCard[]; tabs: string[]; allLabel: string; countNoun: string; empty: string }) {
  const [pick, setPick] = useState('')
  const shown = pick ? cards.filter((c) => c.group === pick) : cards
  const used = tabs.filter((t) => cards.some((c) => c.group === t))
  return (
    <>
      <div className="nki-bar">
        <span className="nk-eyebrow nk-eyebrow--bare" aria-live="polite">{shown.length} {countNoun}</span>
        {used.length > 0 && (
          <div className="nki-tabs" role="group" aria-label="Filter">
            {[allLabel, ...used].map((t, i) => {
              const on = (i === 0 && !pick) || t === pick
              return <button key={t} type="button" className="nki-tab" aria-pressed={on} onClick={() => setPick(i === 0 ? '' : t)}>{t}</button>
            })}
          </div>
        )}
      </div>
      {shown.length > 0 ? <div className="nki-cards">{shown.map((c, i) => <Card key={`${c.title}-${i}`} c={c} />)}</div> : empty ? <p className="nk-row-body nk-empty">{empty}</p> : null}
    </>
  )
}
