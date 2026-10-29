'use client'

import { useState } from 'react'

// THE TEMPLE KIT SHELF BOARD (design: ShopPage and ResourcesPage). The one client piece of the Shop and Library
// blocks: a row of kind tabs that picks which items show. The items arrive from the server block already resolved
// (links through the site map). The tabs are not drawn when the items hold fewer than two kinds.

export interface ShelfItem {
  kind: string
  title: string
  meta: string
  price: string
  badge: string
  cover: string | null
  href: string | null
  ctaLabel: string
}

export function TempleKitShelfBoard({ items, mode, allLabel, freeLabel, countLabel }: { items: ShelfItem[]; mode: 'shop' | 'library'; allLabel: string; freeLabel: string; countLabel: string }) {
  const kinds = [...new Set(items.map((i) => i.kind).filter(Boolean))]
  const [pick, setPick] = useState('')
  const shown = pick ? items.filter((i) => i.kind === pick) : items
  return (
    <div className="tki-shelf">
      <div className="tki-shelf-bar">
        {kinds.length > 1 && (
          <div className="tki-tabs" role="group" aria-label="Filter">
            {[['', allLabel], ...kinds.map((k) => [k, k])].map(([v, label]) => (
              <button key={v} type="button" className="tki-tab" aria-pressed={pick === v} onClick={() => setPick(v)}>{label}</button>
            ))}
          </div>
        )}
        <span className="tki-eyebrow">{shown.length} {countLabel}</span>
      </div>
      {mode === 'shop' ? (
        <ul className="tki-products">
          {shown.map((p, i) => (
            <li key={i} className="tki-product">
              <div className={`tki-product-media${p.cover ? '' : ' tki-product-media--bare'}`} style={p.cover ? { backgroundImage: `url(${JSON.stringify(p.cover)})` } : undefined} aria-hidden="true">
                {p.badge && <span className="tki-badge tki-badge--soft">{p.badge}</span>}
              </div>
              <div className="tki-product-line">
                <h3 className="tki-card-title">{p.href ? <a href={p.href}>{p.title}</a> : p.title}</h3>
                <span>{p.price}</span>
              </div>
              {p.meta && <div className="tki-card-place">{p.meta}</div>}
            </li>
          ))}
        </ul>
      ) : (
        <ol className="tki-shelves">
          {shown.map((r, i) => (
            <li key={i} className="tki-shelf-row">
              <span className="tki-shelf-no">{String(i + 1).padStart(2, '0')}</span>
              <h3 className="tki-card-title">{r.title}</h3>
              <span className="tki-card-place">{r.meta}</span>
              <span>{r.price ? r.price : <span className="tki-badge tki-badge--soft">{freeLabel}</span>}</span>
              {r.href && r.ctaLabel && <a className={`hs-btn ${r.price ? 'hs-btn-primary' : 'hs-btn-soft'}`} href={r.href}>{r.ctaLabel}</a>}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
