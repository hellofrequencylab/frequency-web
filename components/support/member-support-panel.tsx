import Link from 'next/link'
import { LifeBuoy, ChevronRight } from 'lucide-react'
import { listTicketsForProfile } from '@/lib/support/store'
import {
  TYPE_LABELS, STATUS_LABELS, statusChipClass, isOpenStatus,
} from '@/lib/support/types'

// Staff-only panel on a member's profile (ADR-159): their support history wired into
// the console — the ticket ↔ member-record integration. Renders nothing if they've
// never filed a ticket, so it's invisible noise-free until there's something to see.
export async function MemberSupportPanel({ profileId }: { profileId: string }) {
  const tickets = await listTicketsForProfile(profileId)
  if (tickets.length === 0) return null
  const open = tickets.filter((t) => isOpenStatus(t.status)).length

  return (
    <div className="mb-6 rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-bold text-text">
          <LifeBuoy className="h-4 w-4 text-primary-strong" /> Support history
        </p>
        <span className="text-2xs font-medium text-subtle">{tickets.length} total · {open} open</span>
      </div>
      <ul className="space-y-1.5">
        {tickets.slice(0, 6).map((t) => (
          <li key={t.id}>
            <Link
              href={`/admin/support/${t.id}`}
              className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 transition-colors hover:bg-surface-elevated"
            >
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-2xs font-semibold ${statusChipClass(t.status)}`}>
                {STATUS_LABELS[t.status]}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-text">{t.subject}</span>
              <span className="shrink-0 text-2xs text-subtle">{TYPE_LABELS[t.type]} · #{t.ref}</span>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-subtle" />
            </Link>
          </li>
        ))}
      </ul>
      {tickets.length > 6 && (
        <Link href="/admin/support" className="mt-2 inline-block text-2xs font-semibold text-primary-strong hover:underline">
          {tickets.length - 6} more in the support queue →
        </Link>
      )}
    </div>
  )
}
