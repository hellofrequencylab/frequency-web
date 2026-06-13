import { MessageCircleQuestion, ShieldX, CheckCircle2 } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'
import { Badge } from '@/components/admin/status'
import { createAdminClient } from '@/lib/supabase/admin'

// Janitor-only: the demand side of the living-docs loop (docs/SUPPORT-SYSTEM.md §6).
// What members ask Vera that she can't confidently answer — the "to-write" list. The
// QUEUE template (ADR-233 §3.5): a frequency-ranked spine of deflected questions, each
// row exposing how often it's asked. Header + instructional copy on the canvas; the KPIs
// and the queue live in white tiles; the cleared state celebrates an empty queue.
export const dynamic = 'force-dynamic'

export default async function HelpGapsPage() {
  await requireAdmin('janitor')

  const admin = createAdminClient()
  const since = new Date()
  since.setDate(since.getDate() - 30)
  const db = admin
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
    <AdminTemplate
      title="Help gaps"
      eyebrow="Vera"
      icon={MessageCircleQuestion}
      description="What members asked Vera that she couldn't confidently answer in the last 30 days. The to-write list for the help center."
    >
      <AdminSection>
        <div className="grid grid-cols-2 gap-3 sm:max-w-md">
          <StatCard bordered label="Questions asked" value={total.toLocaleString()} icon={MessageCircleQuestion} />
          <StatCard bordered label="Deflected (no sure answer)" value={`${deflectRate}%`} icon={ShieldX} />
        </div>
      </AdminSection>

      <AdminSection
        title="To write"
        description="Deflected questions, grouped and ranked by how often they're asked."
      >
        {total === 0 ? (
          <EmptyState
            variant="first-use"
            icon={MessageCircleQuestion}
            title="No questions logged yet"
            description="Once AI search is live (see SUPPORT-SYSTEM §13), unanswered questions show up here, ranked by how often they're asked."
          />
        ) : gaps.length === 0 ? (
          <EmptyState
            variant="cleared"
            icon={CheckCircle2}
            title="Nothing deflected"
            description="Vera answered everything from the help center. No gaps to write."
          />
        ) : (
          <ul className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border bg-surface">
            {gaps.map((g, i) => (
              <li key={i} className="flex items-start justify-between gap-3 px-4 py-3">
                <span className="min-w-0 text-sm text-text">{g.sample}</span>
                <Badge>×{g.count}</Badge>
              </li>
            ))}
          </ul>
        )}
      </AdminSection>
    </AdminTemplate>
  )
}
