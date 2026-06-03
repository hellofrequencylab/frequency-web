import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ClipboardList } from 'lucide-react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Janitor-only: the demand side of the living-docs loop (docs/SUPPORT-SYSTEM.md §6).
// What members ask Vera that she can't confidently answer — the "to-write" list.
export const dynamic = 'force-dynamic'

export default async function HelpGapsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('community_role')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!profile || profile.community_role !== 'janitor') notFound()

  const since = new Date()
  since.setDate(since.getDate() - 30)
  const db = admin as unknown as SupabaseClient
  const { data } = await db
    .from('ai_help_queries')
    .select('question, deflected, confidence, created_at')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false })
    .limit(2000)
  const rows = (data ?? []) as { question: string; deflected: boolean; confidence: number }[]

  const total = rows.length
  const deflected = rows.filter((r) => r.deflected)
  const deflectRate = total === 0 ? 0 : Math.round((deflected.length / total) * 100)

  const norm = (q: string) => q.trim().toLowerCase().replace(/\s+/g, ' ')
  const grouped = new Map<string, { sample: string; count: number }>()
  for (const r of deflected) {
    const key = norm(r.question)
    const e = grouped.get(key) ?? { sample: r.question.trim(), count: 0 }
    e.count += 1
    grouped.set(key, e)
  }
  const gaps = [...grouped.values()].sort((a, b) => b.count - a.count).slice(0, 50)

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="flex items-center gap-2 text-2xl font-bold text-text">
        <ClipboardList className="h-5 w-5 text-primary-strong" />
        Help gaps
      </h1>
      <p className="mb-6 mt-1 text-sm text-muted">
        What members asked Vera that she couldn&rsquo;t confidently answer in the last 30 days — the
        to-write list for the help center.{' '}
        <Link href="/admin" className="text-primary-strong hover:underline">Back to admin</Link>.
      </p>

      <div className="mb-6 flex gap-6">
        <div>
          <div className="text-xl font-bold tabular-nums text-text">{total.toLocaleString()}</div>
          <div className="text-xs text-subtle">questions asked</div>
        </div>
        <div>
          <div className="text-xl font-bold tabular-nums text-text">{deflectRate}%</div>
          <div className="text-xs text-subtle">deflected (no sure answer)</div>
        </div>
      </div>

      {total === 0 ? (
        <p className="rounded-2xl border border-border bg-surface p-5 text-sm text-muted">
          No questions logged yet. Once AI search is live (see SUPPORT-SYSTEM §13), unanswered
          questions show up here, ranked by how often they&rsquo;re asked.
        </p>
      ) : gaps.length === 0 ? (
        <p className="rounded-2xl border border-success-bg bg-success-bg/20 p-5 text-sm text-text">
          ✅ Nothing deflected — Vera answered everything from the help center.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
          {gaps.map((g, i) => (
            <li key={i} className="flex items-start justify-between gap-3 px-4 py-3">
              <span className="min-w-0 text-sm text-text">{g.sample}</span>
              <span className="shrink-0 rounded-full bg-surface-elevated px-2 py-0.5 text-xs font-semibold tabular-nums text-muted">
                ×{g.count}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
