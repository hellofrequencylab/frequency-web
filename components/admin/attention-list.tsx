import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { SeverityChip } from '@/components/admin/dash'

// The "needs attention now" spine (ADR-233 §7). One ranked, actionable feed per
// dashboard: each item is risk/watch and one click from its next action. Only
// actionable, role-relevant items belong here (suppress noise → no alert fatigue).
// Presentational — the caller ranks + filters by role before passing items in.
//
//   <AttentionList items={[
//     { id:'mod', severity:'risk', title:'6 reports waiting',
//       finding:'Oldest is 2 days old.', action:{label:'Review', href:'/admin/moderation'} },
//   ]} />

export interface AttentionItem {
  id: string
  severity: 'risk' | 'watch' | 'good'
  title: React.ReactNode
  finding?: React.ReactNode
  action?: { label: string; href: string }
}

export function AttentionList({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted">Nothing needs attention right now.</p>
  }
  return (
    <ul className="space-y-2.5">
      {items.map((i) => (
        <li key={i.id} className="flex items-start gap-3">
          <SeverityChip severity={i.severity} />
          <div className="min-w-0 flex-1 text-sm leading-snug">
            <span className="font-semibold text-text">{i.title}</span>
            {i.finding && <span className="text-muted"> {i.finding}</span>}
          </div>
          {i.action && (
            <Link
              href={i.action.href}
              className="inline-flex shrink-0 items-center gap-0.5 text-sm font-semibold text-primary-strong hover:underline"
            >
              {i.action.label}
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          )}
        </li>
      ))}
    </ul>
  )
}
