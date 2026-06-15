import { Users, CircleDot } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'

// A page-layout module (ADR-270): community totals at a glance. Self-fetching RSC; returns
// null when there's nothing to show. Aggregate counts only — no individual/private data.
export async function CommunityPulse() {
  const db = createAdminClient()
  const [{ count: members }, { count: circles }] = await Promise.all([
    db.from('profiles').select('id', { count: 'exact', head: true }),
    db.from('circles').select('id', { count: 'exact', head: true }).eq('status', 'active'),
  ])
  if (!members && !circles) return null

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">Community pulse</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <p className="text-2xl font-bold tabular-nums text-text">{(members ?? 0).toLocaleString()}</p>
          <p className="inline-flex items-center gap-1 text-xs text-muted">
            <Users className="h-3.5 w-3.5" aria-hidden /> members
          </p>
        </div>
        <div>
          <p className="text-2xl font-bold tabular-nums text-text">{(circles ?? 0).toLocaleString()}</p>
          <p className="inline-flex items-center gap-1 text-xs text-muted">
            <CircleDot className="h-3.5 w-3.5" aria-hidden /> active circles
          </p>
        </div>
      </div>
    </div>
  )
}
