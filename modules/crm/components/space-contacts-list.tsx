'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronRight, Mail, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog } from '@/components/ui/dialog'
import { SpaceMemberComposer } from './space-member-composer'

// THE SPACE CRM ROSTER with "Email selected" (SCAN-1221). The People list the owner already had, plus a
// checkbox per person and a calm bar that appears once anyone is picked. "Email selected" opens the SAME
// composer the member viewer uses, pre-filled with the picked people as removable chips, so a designed email
// can go to a handful of contacts as 1:1 conversations. Nothing sends on its own: the owner writes the note
// and presses Send now, which asks to confirm, and the server re-gates the Space editor + consent per person.
// Editors only (`canEmail`); everyone else keeps the plain linked list. No em or en dashes (voice canon).

export interface RosterContact {
  id: string
  email: string
  displayName: string | null
}

export function SpaceContactsList({
  spaceId,
  slug,
  contacts,
  selectedContactId,
  base,
  canEmail,
}: {
  spaceId: string
  slug: string
  contacts: RosterContact[]
  selectedContactId: string | null
  base: string
  canEmail: boolean
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState(false)
  const [draftId, setDraftId] = useState<string | null>(null)

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  // Only people with an email can be mailed; a contact without one is simply not offered a box.
  const chosen = contacts.filter((c) => picked.has(c.id) && c.email)
  const recipients = chosen.map((c) => ({ email: c.email, label: c.displayName || c.email }))

  return (
    <>
      {canEmail && picked.size > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface px-4 py-2 lift-1">
          <span className="text-body-sm font-medium text-text">{picked.size} selected</span>
          <Button size="sm" onClick={() => setOpen(true)} disabled={chosen.length === 0}>
            <Mail className="h-3.5 w-3.5" aria-hidden /> Email selected
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setPicked(new Set())}>
            <X className="h-3.5 w-3.5" aria-hidden /> Clear
          </Button>
        </div>
      )}

      <ul className="divide-y divide-border rounded-card border border-border bg-surface lift-1">
        {contacts.map((c) => {
          const selected = c.id === selectedContactId
          const label = c.displayName || c.email || 'Unnamed contact'
          return (
            <li key={c.id} className={`flex items-center gap-2 pl-4 ${selected ? 'bg-surface-elevated' : ''}`}>
              {canEmail && c.email && (
                <Checkbox
                  aria-label={`Select ${label}`}
                  checked={picked.has(c.id)}
                  onChange={() => toggle(c.id)}
                />
              )}
              <Link
                href={`${base}?contact=${c.id}`}
                aria-current={selected ? 'true' : undefined}
                className="flex min-w-0 flex-1 items-center justify-between gap-4 py-3 pr-4 transition-colors hover:bg-surface-elevated"
              >
                <div className="min-w-0">
                  <p className="truncate text-body-sm font-semibold text-text">{label}</p>
                  {c.displayName && c.email && <p className="truncate text-meta text-muted">{c.email}</p>}
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
              </Link>
            </li>
          )
        })}
      </ul>

      {canEmail && (
        <Dialog open={open} onClose={() => setOpen(false)} ariaLabel="Email selected people" className="max-w-3xl">
          <div className="max-h-[85vh] overflow-y-auto rounded-card bg-surface p-4">
            <SpaceMemberComposer
              spaceId={spaceId}
              slug={slug}
              profileId=""
              email={recipients[0]?.email ?? ''}
              initialRecipients={recipients}
              initialCampaignId={draftId ?? undefined}
              onDraftReady={setDraftId}
              onSent={() => {
                setDraftId(null)
                setPicked(new Set())
              }}
            />
          </div>
        </Dialog>
      )}
    </>
  )
}
