// The Funnel FLOW VIEW (EMAIL-CAMPAIGNS-FUNNELS-PLAN P4, ask #4/#5). One funnel drawn
// as a clean vertical flow: a Trigger banner, the stages as minimal draggable nodes,
// and a Goal banner, with every node's settings in a side panel. Reuses the same
// getFunnel read and the conversion rollup the growth builder uses; the full
// stage-by-stage builder still lives at /admin/growth/funnels/[id] for advanced wiring.
//
// Gate: re-checked here AND in every action (the admin client bypasses RLS).

import { Suspense } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Activity } from 'lucide-react'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { Banner } from '@/components/admin/status'
import { requireAdmin } from '@/lib/admin/guard'
import { getFunnel, getFunnelRollup } from '@/lib/funnels/store'
import { FunnelRollup } from '@/app/(main)/admin/growth/funnels/[id]/rollup'
import { FunnelFlow } from '@/components/admin/messaging/funnel-flow'

export const dynamic = 'force-dynamic'

export default async function MessagingFunnelFlowPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ vera?: string }>
}) {
  await requireAdmin('admin', { staff: 'marketing' })
  const { id } = await params
  const { vera } = await searchParams

  const funnel = await getFunnel(id)
  if (!funnel) notFound()

  return (
    <AdminTemplate
      eyebrow="Funnel"
      title={funnel.name}
      icon={Activity}
      width="wide"
      back={{ href: '/admin/marketing/messaging', label: 'Messaging' }}
      description={funnel.description ?? 'The journey people take once the trigger fires. Drag to reorder, click a step to edit it.'}
      actions={
        <Link
          href={`/admin/growth/funnels/${funnel.id}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:text-text"
        >
          Advanced builder
        </Link>
      }
    >
      {vera === 'pending' && (
        <Banner tone="info" title="Vera drafting is on the way" dismissible>
          We set up the best-practice series for you to write. When Vera drafting lands, it will fill in the subjects
          and copy from your answers.
        </Banner>
      )}

      <AdminSection
        title="Conversion"
        description="Distinct people reaching each step over the last 30 days, and where they drop off."
      >
        <Suspense fallback={<RollupSkeleton />}>
          <FunnelRollup promise={getFunnelRollup(funnel.id, 30)} />
        </Suspense>
      </AdminSection>

      <AdminSection title="The flow" description="Trigger, steps, and goal. Settings open on the right.">
        <FunnelFlow
          funnel={{
            id: funnel.id,
            name: funnel.name,
            status: funnel.status,
            goalEvent: funnel.goalEvent,
            persona: funnel.persona,
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
