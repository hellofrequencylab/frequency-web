import Link from 'next/link'
import { CircleDot } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'

// A page-layout module (ADR-270): active circles filling up. Self-fetching RSC;
// returns null when there's nothing to show. Public aggregate data only.
export async function TopCircles() {
  const db = createAdminClient()
  const { data, error } = await db
    .from('circles')
    .select('id, name, slug, member_count')
    .eq('status', 'active')
    .order('member_count', { ascending: false })
    .limit(6)

  if (error || !data || data.length === 0) return null

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">Active circles</p>
      <ul className="mt-3 space-y-1">
        {data.map((circle) => (
          <li key={circle.id}>
            <Link
              href={`/circles/${circle.slug}`}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-text hover:bg-border"
            >
              <CircleDot className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
              <span className="truncate">{circle.name}</span>
              <span className="ml-auto shrink-0 tabular-nums text-2xs text-muted">
                {(circle.member_count ?? 0).toLocaleString()}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
