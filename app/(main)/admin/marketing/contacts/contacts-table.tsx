'use client'

import Link from 'next/link'
import { DataTable, type ColumnDef } from '@/components/admin/data-table'
import { StatusChip, type StatusTone } from '@/components/admin/status'
import type { ContactCore } from '@/lib/crm/person'
import { setContactConsent } from './actions'

const CONSENT_TONE: Record<string, StatusTone> = {
  subscribed: 'success',
  unsubscribed: 'danger',
  unknown: 'neutral',
}

// The unified CRM Contacts roster as the canonical operator table (ADR-233 §3). Email
// drills to the person's User Stats; consent speaks the one StatusChip vocabulary (the
// old CONSENT_STYLE dict is retired). The subscribe/unsubscribe toggle is a server-action
// form in the actions column.
export function ContactsTable({ contacts }: { contacts: ContactCore[] }) {
  const columns: ColumnDef<ContactCore>[] = [
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

  return <DataTable caption="CRM contacts" rows={contacts} columns={columns} getRowId={(c) => c.id} />
}
