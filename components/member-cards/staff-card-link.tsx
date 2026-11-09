'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { findConsoleMembers } from '@/lib/devices/tag-actions'
import { readMemberCardLink, setMemberCardLink, type StaffCardLink } from '@/lib/member-cards/staff-actions'
import { CardLinkPicker } from './card-link-picker'

// CARD LINKS in the CyberUnicorn console (CARD-STAFF-LINK): find a member, see where their tap card
// opens, then search for a page on the site or paste any https link and save. Staff only; the server
// actions hold the gate. Copy obeys CONTENT-VOICE.

export function StaffCardLinkBox() {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<{ name: string; handle: string }[]>([])
  const [card, setCard] = useState<StaffCardLink | null>(null)
  const [url, setUrl] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const seq = useRef(0)

  useEffect(() => {
    const q = query.trim().replace(/^@/, '')
    const mine = ++seq.current
    if (q.length < 2) return
    const t = window.setTimeout(() => {
      void findConsoleMembers(q).then((out) => {
        if (mine === seq.current) setHits('error' in out ? [] : out.data)
      })
    }, 250)
    return () => window.clearTimeout(t)
  }, [query])

  const shownHits = query.trim().length < 2 ? [] : hits

  function open(handle: string) {
    setNote(null)
    start(async () => {
      const out = await readMemberCardLink(handle)
      if ('error' in out) return setNote(out.error)
      setCard(out.data)
      setUrl(out.data.linkUrl ?? '')
      setQuery('')
      setHits([])
    })
  }

  function save(next: string) {
    if (!card) return
    start(async () => {
      const out = await setMemberCardLink(card.handle, next)
      if ('error' in out) return setNote(out.error)
      setCard(out.data)
      setUrl(out.data.linkUrl ?? '')
      setNote(out.data.linkUrl ? `Saved. ${out.data.name}'s card now opens that link.` : `Saved. ${out.data.name}'s card opens their page.`)
    })
  }

  return (
    <div className="space-y-4">
      <Field label="Member" hint="Search by name or handle.">
        <Input type="search" placeholder="Find a member" value={query} onChange={(e) => setQuery(e.target.value)} />
      </Field>
      {shownHits.length > 0 && (
        <ul className="space-y-1 rounded-card border border-border bg-surface p-1">
          {shownHits.map((h) => (
            <li key={h.handle}>
              <button type="button" className="w-full rounded-control-nested px-2 py-1.5 text-left text-body-sm hover:bg-surface-elevated" onClick={() => open(h.handle)}>
                {h.name} <span className="text-muted">@{h.handle}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {card && (
        <div className="space-y-3">
          <p className="text-body-sm text-text">
            {card.name}&apos;s card {card.mode === 'link' && card.linkUrl ? `opens ${card.linkUrl}` : card.mode === 'card' ? 'shows their card.' : 'opens their page.'}
          </p>
          <CardLinkPicker onPick={setUrl} disabled={pending} />
          <Field label="Link" hint="Any page on Frequency, or any https link. Leave empty to open their page.">
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" disabled={pending} />
          </Field>
          <Button type="button" onClick={() => save(url)} disabled={pending}>
            Save link
          </Button>
        </div>
      )}
      {note && <p role="status" className="text-meta text-muted">{note}</p>}
    </div>
  )
}
