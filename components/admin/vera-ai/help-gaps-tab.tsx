import { MessageCircleQuestion, ShieldX, CheckCircle2 } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminSection } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'
import { Badge } from '@/components/admin/status'
import { createAdminClient } from '@/lib/supabase/admin'

// The "Help gaps" tab of the consolidated Vera & AI workspace (ADR-265) — formerly
// /admin/help-gaps. The demand side of the living-docs loop (docs/SUPPORT-SYSTEM.md §6):
// what members ask Vera that she can't confidently answer, ranked. JANITOR-ONLY — the
// gate is re-asserted here, and the workspace hides this tab from non-janitor staff.
export async function HelpGapsTab() {
  await requireAdmin('janitor')

  const admin = createAdminClient()
  const since = new Date()
  since.setDate(since.getDate() - 30)
  const { data } = await admin
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
    <>
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
    </>
  )
}
