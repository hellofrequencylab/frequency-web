'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { Loader2, MailCheck, Ban } from 'lucide-react'
import { DataTable, type ColumnDef } from '@/components/admin/data-table'
import { StatusChip, type StatusTone } from '@/components/admin/status'
import { Button } from '@/components/ui/button'
import type { ContactCore } from '@/lib/crm/person'
import { setContactConsent, bulkSetContactConsent } from './actions'

const CONSENT_TONE: Record<string, StatusTone> = {
  subscribed: 'success',
  unsubscribed: 'danger',
  unknown: 'neutral',
}

// The unified CRM Contacts roster as the canonical operator table (ADR-233 §3). Email
// drills to the person's User Stats; consent speaks the one StatusChip vocabulary (the
// old CONSENT_STYLE dict is retired). The subscribe/unsubscribe toggle is a server-action
// form in the actions column.
//
// Staff power actions (ADR-379): multi-select rows for bulk consent. The DataTable is a
// presentational Server-safe component, so selection lives here in the client wrapper (a
// leading checkbox column + a bulk action bar). The contacts entity has no tag table, so
// bulk tagging is intentionally not shipped (see ADR-379).
export function ContactsTable({ contacts }: { contacts: ContactCore[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  const allIds = useMemo(() => contacts.map((c) => c.id), [contacts])
  const allSelected = selected.size > 0 && selected.size === allIds.length

  function toggleOne(id: string) {
    setMsg(null)
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setMsg(null)
    setSelected((prev) => (prev.size === allIds.length ? new Set() : new Set(allIds)))
  }

  function bulkConsent(state: 'subscribed' | 'unsubscribed') {
    const ids = [...selected]
    if (ids.length === 0) return
    setMsg(null)
    start(async () => {
      const res = await bulkSetContactConsent(ids, state)
      setSelected(new Set())
      setMsg(`Marked ${res.updated} contact${res.updated === 1 ? '' : 's'} ${state}.`)
    })
  }

  const columns: ColumnDef<ContactCore>[] = [
    {
      key: 'select',
      width: '2.5rem',
      header: (
        <input
          type="checkbox"
          aria-label="Select all contacts"
          checked={allSelected}
          onChange={toggleAll}
          className="h-4 w-4 cursor-pointer rounded border-border-strong accent-primary"
        />
      ),
      render: (c) => (
        <input
          type="checkbox"
          aria-label={`Select ${c.email}`}
          checked={selected.has(c.id)}
          onChange={() => toggleOne(c.id)}
          onClick={(e) => e.stopPropagation()}
          className="h-4 w-4 cursor-pointer rounded border-border-strong accent-primary"
        />
      ),
    },
    {
      key: 'email',
      header: 'Email',
      render: (c) => (
        <Link
          href={`/admin/marketing/contacts/${c.id}`}
          onClick={(e) => e.stopPropagation()}
          className="font-medium text-primary-strong hover:underline"
        >
          {c.email}
        </Link>
      ),
    },
    { key: 'displayName', header: 'Name', render: (c) => <span className="text-muted">{c.displayName ?? '–'}</span> },
    { key: 'member', header: 'Member', render: (c) => <span className="text-muted">{c.profileId ? 'Yes' : 'No'}</span> },
    { key: 'source', header: 'Source', render: (c) => <span className="text-muted">{c.source ?? '–'}</span> },
    {
      key: 'consentState',
      header: 'Consent',
      type: 'tag',
      render: (c) => (
        <StatusChip tone={CONSENT_TONE[c.consentState] ?? 'neutral'}>
          <span className="capitalize">{c.consentState}</span>
        </StatusChip>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      align: 'right',
      render: (c) =>
        c.consentState === 'subscribed' ? (
          <form action={setContactConsent.bind(null, c.id, 'unsubscribed')} className="inline" onClick={(e) => e.stopPropagation()}>
            <button type="submit" className="text-xs font-semibold text-danger hover:underline">Unsubscribe</button>
          </form>
        ) : c.consentState === 'unsubscribed' ? (
          <form action={setContactConsent.bind(null, c.id, 'subscribed')} className="inline" onClick={(e) => e.stopPropagation()}>
            <button type="submit" className="text-xs font-semibold text-muted hover:text-text hover:underline">Resubscribe</button>
          </form>
        ) : (
          <span className="text-xs text-subtle">–</span>
        ),
    },
  ]

  return (
    <div className="space-y-3">
      {/* Bulk action bar — only when something is picked. */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface-elevated/50 px-3 py-2">
          <span className="text-sm font-medium text-text">{selected.size} selected</span>
          <span className="text-subtle">·</span>
          <Button type="button" size="sm" variant="secondary" onClick={() => bulkConsent('subscribed')} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MailCheck className="h-4 w-4" />}
            Mark subscribed
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => bulkConsent('unsubscribed')} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
            Mark unsubscribed
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(new Set())} disabled={pending}>
            Clear
          </Button>
        </div>
      )}
      {msg && !pending && selected.size === 0 && <p className="text-xs text-success">{msg}</p>}

      <DataTable caption="CRM contacts" rows={contacts} columns={columns} getRowId={(c) => c.id} />
    </div>
  )
}
