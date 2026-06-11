'use client'

import Link from 'next/link'
import { MessageSquare, Mail, MapPin } from 'lucide-react'
import { getInitials } from '@/lib/utils'
import { RoleBadge } from '@/lib/community-roles'
import { DemoBadge } from '@/components/ui/demo-badge'
import { DataTable, type ColumnDef } from '@/components/admin/data-table'
import type { CommunityRole } from '@/lib/core/roles'
import { StartDealButton } from './start-deal-button'

export type CrmContactRow = {
  id: string
  displayName: string
  handle: string
  avatarUrl: string | null
  role: CommunityRole
  email: string | null
  city: string | null
  joinedAt: string | null
  isDemo: boolean
}

// The CRM Contacts roster as the canonical operator table (ADR-233 §3 Index/Table).
// Whole-row link opens the member's public profile; per-row Message + Deal actions
// reveal on hover. Demo rows read a touch quieter (parity with the old card grid).
export function ContactsTable({ rows }: { rows: CrmContactRow[] }) {
  const columns: ColumnDef<CrmContactRow>[] = [
    {
      key: 'displayName',
      header: 'Contact',
      render: (m) => (
        <span className={`flex items-center gap-2.5 ${m.isDemo ? 'opacity-[0.72]' : ''}`}>
          {m.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={m.avatarUrl} alt="" className={`h-8 w-8 rounded-full object-cover ${m.isDemo ? 'grayscale-[0.5]' : ''}`} />
          ) : (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-bg text-xs font-semibold text-primary-strong select-none">
              {getInitials(m.displayName)}
            </span>
          )}
          <span className="min-w-0">
            <span className="flex items-center gap-1.5">
              <span className="truncate font-medium text-text">{m.displayName}</span>
              {m.role !== 'member' && <RoleBadge role={m.role} />}
              {m.isDemo && <DemoBadge />}
            </span>
            {m.handle && <span className="block truncate text-xs text-subtle">@{m.handle}</span>}
          </span>
        </span>
      ),
    },
    {
      key: 'email',
      header: 'Email',
      render: (m) =>
        m.email ? (
          <a
            href={`mailto:${m.email}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1.5 text-primary hover:underline"
          >
            <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden /> <span className="truncate">{m.email}</span>
          </a>
        ) : (
          <span className="text-subtle">–</span>
        ),
    },
    {
      key: 'city',
      header: 'City',
      render: (m) =>
        m.city ? (
          <span className="inline-flex items-center gap-1.5 text-muted">
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden /> {m.city}
          </span>
        ) : (
          <span className="text-subtle">–</span>
        ),
    },
    {
      key: 'joinedAt',
      header: 'Joined',
      type: 'date',
      align: 'right',
      render: (m) => (
        <span className="text-muted">
          {m.joinedAt ? new Date(m.joinedAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : '–'}
        </span>
      ),
    },
  ]

  return (
    <DataTable
      caption="CRM contacts"
      rows={rows}
      columns={columns}
      getRowId={(m) => m.id}
      rowHref={(m) => `/people/${m.handle}`}
      rowActions={(m) => (
        <div className="flex items-center gap-1.5">
          <Link
            href="/messages"
            onClick={(e) => e.stopPropagation()}
            aria-label={`Message ${m.displayName}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover"
          >
            <MessageSquare className="h-3.5 w-3.5" aria-hidden /> Message
          </Link>
          <StartDealButton profileId={m.id} name={m.displayName} />
        </div>
      )}
    />
  )
}
