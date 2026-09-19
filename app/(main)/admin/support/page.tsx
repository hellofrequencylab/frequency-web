import { LifeBuoy } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import { FilterBar } from '@/components/admin/filter-bar'
import { SupportTable } from './support-table'
import { listTickets, ticketStatusCounts } from '@/lib/support/store'
import {
  TYPE_LABELS,
  STATUS_LABELS,
  TICKET_TYPES,
  type TicketStatus,
  type TicketType,
} from '@/lib/support/types'

export const dynamic = 'force-dynamic'

const STATUS_KEYS = ['open_all', 'all', ...Object.keys(STATUS_LABELS)] as const

function parseStatus(raw: string | undefined): TicketStatus | 'all' | 'open_all' {
  if (!raw || raw === 'open_all') return 'open_all'
  if (raw === 'all') return 'all'
  if (raw in STATUS_LABELS) return raw as TicketStatus
  return 'open_all'
}

function parseType(raw: string | undefined): TicketType | undefined {
  if (raw && (TICKET_TYPES as readonly string[]).includes(raw)) return raw as TicketType
  return undefined
}

function statusOptionLabel(key: string, counts: Record<string, number>, openCount: number): string {
  if (key === 'open_all') return `Open (${openCount})`
  if (key === 'all') return 'All'
  if (key === 'open') return `New (${counts.open ?? 0})`
  const base = STATUS_LABELS[key as TicketStatus] ?? key
  return `${base} (${counts[key] ?? 0})`
}

// Support console (ADR-159) — the staff triage queue. Wired to the reporter's profile
// (and from there, the CRM). Gate (ADR-223): community host+ OR a staff role with the
// `members` domain (write) — Support/Operations do member assist (docs/ROLES.md
// §System 3). The floor matches the sections.ts link gate exactly (host + `members`).
//
// SCAN-639: filters go through the kit FilterBar (ADR-233), not a local chip row.
// The page already read `status`, `type`, and `q`; type and search had no control.
export default async function AdminSupportPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; type?: string; q?: string }>
}) {
  await requireAdmin('host', { staff: 'members' })

  const raw = await searchParams
  const status = parseStatus(raw.status)
  const type = parseType(raw.type)
  const q = raw.q
  const [tickets, counts] = await Promise.all([
    listTickets({ status, type, q }),
    ticketStatusCounts(),
  ])

  const openCount = (counts.open ?? 0) + (counts.in_progress ?? 0) + (counts.waiting ?? 0)

  return (
    <AdminTemplate
      title="Support"
      icon={LifeBuoy}
      eyebrow="Studio"
      description="Bug reports and support requests from members. Triage, reply, and track them to resolution."
      width="wide"
    >
      <AdminSection title={`${tickets.length} ticket${tickets.length === 1 ? '' : 's'}`}>
        <FilterBar
          search="q"
          searchPlaceholder="Search tickets"
          filters={[
            {
              key: 'status',
              label: 'Status',
              defaultValue: 'open_all',
              options: STATUS_KEYS.map((key) => ({
                value: key,
                label: statusOptionLabel(key, counts, openCount),
              })),
            },
            {
              key: 'type',
              label: 'Type',
              options: TICKET_TYPES.map((value) => ({
                value,
                label: TYPE_LABELS[value],
              })),
            },
          ]}
        />
        <SupportTable
          tickets={tickets}
          empty={
            <EmptyState
              variant={status === 'all' ? 'first-use' : 'no-results'}
              title={status === 'all' ? 'No tickets yet' : 'Nothing in this view'}
              description={
                status === 'all'
                  ? 'Member bug reports and support requests will appear here.'
                  : 'Try All to see every ticket.'
              }
            />
          }
        />
      </AdminSection>
    </AdminTemplate>
  )
}
