import { Lightbulb, Sparkles, History } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { Banner } from '@/components/admin/status'
import { EmptyState } from '@/components/ui/empty-state'
import { getStudioRead } from '@/lib/studio/recommendations'
import { SITE_ACTIONS, isSiteAction } from '@/lib/studio/site-actions'
import { RecommendationCard } from './recommendation-card'
import { StudioChangeTable } from './change-table'

export const dynamic = 'force-dynamic'

// AI Intelligence Studio — the QUEUE/INDEX template (ADR-233 §3.5/§3.3). A ranked spine
// of AI recommendations, each exposing its evidence and a propose-then-confirm
// accept/apply inline, over an index of the governed change log. Header + the AI read on
// the canvas; the recommendations and the change table live in white tiles.

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
  const db = createAdminClient()
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
    <AdminTemplate
      title="AI Intelligence Studio"
      icon={Lightbulb}
      eyebrow="Operations"
      description="What the platform's behavior, support, and help signals say to change, ranked, with evidence. Applyable fixes are one click and fully reversible."
    >
      {/* The read — Claude narrates the summary when AI is on, else a deterministic line. */}
      <AdminSection>
        <Banner
          tone="info"
          title={
            <span className="inline-flex items-center gap-1.5">
              <Sparkles className="h-4 w-4" aria-hidden />
              The read{read.aiNarrated ? '' : ' · deterministic'}
            </span>
          }
        >
          {read.summary}
        </Banner>
      </AdminSection>

      <AdminSection title="Recommendations" description={`${read.recs.length} from the live signal.`}>
        {read.recs.length === 0 ? (
          <EmptyState
            variant="cleared"
            title="Nothing to recommend"
            description="The live signal is clean. New recommendations appear here as behavior, support, and help data move."
          />
        ) : (
          <div className="space-y-3">
            {read.recs.map((rec) => (
              <RecommendationCard key={rec.id} rec={rec} />
            ))}
          </div>
        )}
      </AdminSection>

      <AdminSection title="Change log" description="Every governed change applied here. Who, what, and the result.">
        {changes.length === 0 ? (
          <EmptyState
            variant="first-use"
            icon={History}
            title="No changes yet"
            description="Applied recommendations will be logged here, with one-click revert for reversible ones."
          />
        ) : (
          <StudioChangeTable
            rows={changes.map((c) => ({
              id: c.id,
              label: isSiteAction(c.action_key) ? SITE_ACTIONS[c.action_key].label : c.action_key,
              reversible: isSiteAction(c.action_key) && SITE_ACTIONS[c.action_key].reversible,
              actor: c.actor?.display_name ?? 'System',
              status: c.status,
              detail: c.detail,
              createdAt: c.created_at,
            }))}
          />
        )}
      </AdminSection>
    </AdminTemplate>
  )
}
