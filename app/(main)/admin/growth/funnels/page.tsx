// Growth OS · Engine 2 — the Funnel builder home (GE2-3, ADR-455). A funnel is a
// first-class object (entry -> wedge -> capture -> convert with a goal event); this is
// the operator's list of funnels + the per-persona template gallery (GE2-4) to clone
// from. Composes the kit: AdminTemplate (Dashboard sibling), StatCard KPIs,
// AdminSection groups, EmptyState. Each funnel links into its own detail dashboard.
//
// Gate: a staff web_role OR the marketing capability (write), re-checked here AND in
// every action (the admin client bypasses RLS, so the action is the authority).

import { AdminTemplate, AdminSection } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { Activity, Rocket, FileEdit } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { listFunnels, funnelCounts } from '@/lib/funnels/store'
import { FUNNEL_TEMPLATES } from '@/lib/funnels/templates'
import { FunnelsManager } from './funnels-client'

export const dynamic = 'force-dynamic'

export default async function FunnelsPage() {
  await requireAdmin('admin', { staff: 'marketing' })

  const funnels = await listFunnels()
  const counts = await funnelCounts(funnels)

  return (
    <AdminTemplate
      eyebrow="Marketing"
      title="Funnels"
      icon={Activity}
      width="wide"
      description="Build a funnel as one object: an entry point, a wedge, a capture, and the goal it converts on. Clone a per-persona template or start blank, then wire each stage to the entry points, campaigns, pages, and flows you already have."
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard label="Funnels" value={counts.total} icon={Activity} />
        <StatCard label="Active" value={counts.active} icon={Rocket} />
        <StatCard label="Drafts" value={counts.draft} icon={FileEdit} />
      </div>

      <AdminSection
        title="Your funnels"
        description="Every funnel, newest first. Open one to wire its stages and read its conversion."
      >
        <FunnelsManager
          funnels={funnels.map((f) => ({
            id: f.id,
            name: f.name,
            status: f.status,
            persona: f.persona,
            goalEvent: f.goalEvent,
            stageCount: f.stages.length,
            linkCount: f.stages.reduce((n, s) => n + s.links.length, 0),
          }))}
          templates={FUNNEL_TEMPLATES.map((t) => ({
            key: t.key,
            label: t.label,
            blurb: t.blurb,
            persona: t.persona,
            goalEvent: t.goalEvent,
          }))}
        />
      </AdminSection>
    </AdminTemplate>
  )
}
