import { Lightbulb, Sparkles, History } from 'lucide-react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { AdminPage, AdminSection } from '@/components/admin/admin-page'
import { EmptyState } from '@/components/ui/empty-state'
import { getStudioRead } from '@/lib/studio/recommendations'
import { SITE_ACTIONS, isSiteAction } from '@/lib/studio/site-actions'
import { RecommendationCard, RevertButton } from './recommendation-card'

export const dynamic = 'force-dynamic'

interface ChangeRow {
  id: string
  action_key: string
  params: Record<string, unknown> | null
  status: string
  detail: string | null
  created_at: string
  actor: { display_name: string | null } | null
}

async function recentChanges(): Promise<ChangeRow[]> {
  const db = createAdminClient() as unknown as SupabaseClient
  const { data } = await db
    .from('studio_site_changes')
    .select('id, action_key, params, status, detail, created_at, actor:profiles!actor_id ( display_name )')
    .order('created_at', { ascending: false })
    .limit(20)
  return (data ?? []) as unknown as ChangeRow[]
}

export default async function StudioPage() {
  // Admin OR Janitor (community 'admin' floor) — the operators allowed to apply changes.
  await requireAdmin('admin')

  const [read, changes] = await Promise.all([getStudioRead(), recentChanges()])

  return (
    <AdminPage
      title="AI Intelligence Studio"
      icon={Lightbulb}
      eyebrow="Insights"
      description="What the platform’s behavior, support, and help signals say to change, ranked, with evidence. Applyable fixes are one click and fully reversible."
    >
      {/* The read — Claude narrates the summary when AI is on, else a deterministic line. */}
      <div className="rounded-2xl border border-primary-bg/60 bg-primary-bg/20 p-4">
        <div className="mb-1 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary-strong" />
          <span className="text-xs font-bold uppercase tracking-wide text-primary-strong">
            The read{read.aiNarrated ? '' : ' · deterministic'}
          </span>
        </div>
        <p className="text-sm leading-relaxed text-text">{read.summary}</p>
      </div>

      <AdminSection title="Recommendations" description={`${read.recs.length} from the live signal.`}>
        <div className="space-y-3">
          {read.recs.map((rec) => (
            <RecommendationCard key={rec.id} rec={rec} />
          ))}
        </div>
      </AdminSection>

      <AdminSection title="Change log" description="Every governed change applied here. Who, what, and the result.">
        {changes.length === 0 ? (
          <EmptyState icon={History} title="No changes yet" description="Applied recommendations will be logged here, with one-click revert for reversible ones." />
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
            {changes.map((c) => {
              const label = isSiteAction(c.action_key) ? SITE_ACTIONS[c.action_key].label : c.action_key
              const reversible = isSiteAction(c.action_key) && SITE_ACTIONS[c.action_key].reversible
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-text">{label}</p>
                    <p className="truncate text-xs text-subtle">
                      {c.actor?.display_name ?? 'System'} · {new Date(c.created_at).toLocaleString()}
                      {c.detail ? ` · ${c.detail}` : ''}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-md px-2 py-0.5 text-2xs font-semibold uppercase ${
                      c.status === 'applied' ? 'bg-success-bg/40 text-success' : c.status === 'reverted' ? 'bg-surface-elevated text-muted' : 'bg-danger-bg/40 text-danger'
                    }`}
                  >
                    {c.status}
                  </span>
                  {c.status === 'applied' && reversible && <RevertButton logId={c.id} />}
                </li>
              )
            })}
          </ul>
        )}
      </AdminSection>
    </AdminPage>
  )
}
