// Growth OS · Engine 2 — one funnel's builder + conversion dashboard (GE2-3, ADR-455).
// The operator's cockpit for a single funnel: its identity + lifecycle, the stage
// rollup (entry -> wedge -> capture -> convert with drop-off, GE2-2), and the stage
// wiring (link each stage to an existing component, GE2-5). The slow rollup streams
// behind its own Suspense so the shell never blocks (PAGE-FRAMEWORK §5).
//
// Gate: re-checked here AND in every action (the admin client bypasses RLS).

import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { Activity } from 'lucide-react'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { requireAdmin } from '@/lib/admin/guard'
import { getFunnel, getFunnelRollup } from '@/lib/funnels/store'
import { FunnelBuilder } from './builder-client'
import { FunnelRollup } from './rollup'

export const dynamic = 'force-dynamic'

export default async function FunnelDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin('admin', { staff: 'marketing' })
  const { id } = await params

  const funnel = await getFunnel(id)
  if (!funnel) notFound()

  return (
    <AdminTemplate
      eyebrow="Funnel"
      title={funnel.name}
      icon={Activity}
      width="wide"
      back={{ href: '/admin/growth/funnels', label: 'Funnels' }}
      description={funnel.description ?? 'Wire each stage to a component you already have, then read where the funnel converts and where it jams.'}
    >
      <AdminSection
        title="Conversion"
        description="Distinct people reaching each stage over the last 30 days, and where they drop off."
      >
        <Suspense fallback={<RollupSkeleton />}>
          <FunnelRollup promise={getFunnelRollup(funnel.id, 30)} />
        </Suspense>
      </AdminSection>

      <AdminSection
        title="Stages"
        description="The four stages of this funnel. Link each one to an entry point, campaign, page, lead flow, or nurture sequence."
      >
        <FunnelBuilder
          funnel={{
            id: funnel.id,
            name: funnel.name,
            description: funnel.description,
            persona: funnel.persona,
            goalEvent: funnel.goalEvent,
            status: funnel.status,
            stages: funnel.stages,
          }}
        />
      </AdminSection>
    </AdminTemplate>
  )
}

function RollupSkeleton() {
  return (
    <div className="space-y-2.5">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-9 animate-pulse rounded-lg bg-surface-elevated/70" />
      ))}
    </div>
  )
}
