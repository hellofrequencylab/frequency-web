'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowUpRight, CalendarDays, Clock, MapPin, Ticket, Users, X } from 'lucide-react'

// THE NETWORK PREVIEW CARD. Every event, circle and chapter on a Network website opens one on-page card instead
// of navigating: the photo, when and where, the words, the next dates, and one button that finishes the job on
// Frequency (a labelled Frequency door, the only kind a stand-alone site draws). The server builds each item
// from the Space's own rows (components/page-editor/blocks/network.tsx); this island only shows the one picked.
//
// A native <dialog> opened with showModal(): the browser supplies the focus trap, Escape, and inertness of the
// page behind. It is rendered where the block sits, inside the site root, so the Network tokens still reach it.

export type PreviewIcon = 'calendar' | 'clock' | 'pin' | 'ticket' | 'users'

export interface PreviewItem {
  id: string
  kicker: string
  title: string
  image: string | null
  focus?: string
  /** The icon tile that stands in for a photo, and its tone. */
  tone: string
  facts: { icon: PreviewIcon; text: string; note?: string }[]
  body: string
  tags: string[]
  upcoming: { id: string; title: string; when: string; href: string | null }[]
  upcomingLabel: string
  primary: { label: string; href: string } | null
  note: string
}

const ICON = { calendar: CalendarDays, clock: Clock, pin: MapPin, ticket: Ticket, users: Users } as const

const Ctx = createContext<((id: string) => void) | null>(null)

/** Open the preview card for an item, from any island under a provider. A no-op outside one. */
export function usePreview(): (id: string) => void {
  return useContext(Ctx) ?? (() => {})
}

/** The invisible link or button that stretches over a card and opens its preview. The card keeps its own look. */
export function PreviewHit({ id, label, href }: { id: string; label: string; href?: string | null }) {
  const open = usePreview()
  // A real link when the card has a door, so without script the card still goes where its button would.
  if (href) return <a className="nw-hit" href={href} aria-haspopup="dialog" aria-label={label} onClick={(e) => { e.preventDefault(); open(id) }} />
  return <button type="button" className="nw-hit" aria-haspopup="dialog" aria-label={label} onClick={() => open(id)} />
}

export function NetworkPreviewProvider({ items, children }: { items: PreviewItem[]; children: ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const ref = useRef<HTMLDialogElement>(null)
  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])
  const open = useCallback((id: string) => setOpenId(id), [])
  const item = openId ? byId.get(openId) ?? null : null

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (item && !dialog.open) dialog.showModal()
    if (!item && dialog.open) dialog.close()
  }, [item])

  return (
    <Ctx.Provider value={open}>
      {/* Cards that carry only plain markup mark their hit with data-preview; one listener opens them. */}
      <div style={{ display: 'contents' }} onClick={(e) => { const hit = (e.target as Element).closest('[data-preview]'); if (hit) setOpenId(hit.getAttribute('data-preview')) }}>{children}</div>
      <dialog
        ref={ref}
        className="nw-preview"
        aria-labelledby={item ? `nw-preview-${item.id}` : undefined}
        onClose={() => setOpenId(null)}
        onClick={(e) => {
          // A press on the backdrop (the dialog element itself, outside the card) closes it.
          if (e.target === ref.current) setOpenId(null)
        }}
      >
        {item && <PreviewBody key={item.id} item={item} onClose={() => setOpenId(null)} />}
      </dialog>
    </Ctx.Provider>
  )
}

function PreviewBody({ item, onClose }: { item: PreviewItem; onClose: () => void }) {
  const external = item.primary ? /^https?:\/\//.test(item.primary.href) : false
  return (
    <div className="nw-preview-card" style={{ ['--c' as string]: item.tone }}>
      <button type="button" className="nw-preview-x" onClick={onClose} aria-label="Close"><X aria-hidden /></button>
      {item.image ? (
        <div className="nw-preview-photo nw-graded">
          {/* eslint-disable-next-line @next/next/no-img-element -- owner or event photo on an arbitrary host */}
          <img src={item.image} alt="" style={item.focus ? { objectPosition: item.focus } : undefined} />
        </div>
      ) : (
        <div className="nw-preview-photo nw-preview-plain" aria-hidden />
      )}
      <div className="nw-preview-body">
        <span className="nw-eyebrow"><i aria-hidden />{item.kicker}</span>
        <h3 id={`nw-preview-${item.id}`} className="nw-preview-title">{item.title}</h3>
        {item.tags.length > 0 && <span className="nw-tags">{item.tags.map((t) => <span key={t} className="nw-tag nw-tag-quiet">{t}</span>)}</span>}
        {item.facts.length > 0 && (
          <ul className="nw-preview-facts">
            {item.facts.map((f) => {
              const Icon = ICON[f.icon]
              return <li key={f.text}><Icon className="nw-i" strokeWidth={1.75} aria-hidden /><span>{f.text}{f.note && <small>{f.note}</small>}</span></li>
            })}
          </ul>
        )}
        {item.body && <p className="nw-preview-text">{item.body}</p>}
        {item.upcoming.length > 0 && (
          <div className="nw-preview-next">
            <h4>{item.upcomingLabel}</h4>
            <ul>
              {item.upcoming.map((u) => <li key={u.id}>{u.href ? <a href={u.href} target="_blank" rel="noopener noreferrer"><b>{u.title}</b><small>{u.when}</small></a> : <span><b>{u.title}</b><small>{u.when}</small></span>}</li>)}
            </ul>
          </div>
        )}
        <div className="nw-preview-actions">
          {item.primary && (
            <a className="hs-btn hs-btn-primary" href={item.primary.href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
              {item.primary.label}<ArrowUpRight className="nw-arr" strokeWidth={2} aria-hidden />
            </a>
          )}
          <button type="button" className="hs-btn hs-btn-soft" onClick={onClose}>Close</button>
        </div>
        {item.primary && item.note && <p className="nw-preview-note">{item.note}</p>}
      </div>
    </div>
  )
}
