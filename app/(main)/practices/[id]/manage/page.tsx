import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPracticeCapabilities } from '@/lib/core/load-capabilities'
import { resolveEntityConsole } from '@/lib/admin/entity-console'
import { DashboardTemplate } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { EntityManageConsole } from '@/components/admin/modules/entity-manage-console'

// The practice OWNER CONSOLE (ADR-441 EM1-3). The unified `/{entity}/[id]/manage`
// surface: the practice's owner (its creator), staff, or whoever manages its parent space
// manages it here. It renders the SAME module set the standardized rail shows for a
// practice (resolveEntityConsole → appsForScope) via the shared EntityManageConsole — the
// Settings module (which embeds its own DangerDelete) plus the Insights module the thin
// `ENTITY_SURFACES` registry it replaced never surfaced.
//
// SECURITY: a Server Component gated server-side on `practice.editSettings` via the one
// resolver (getPracticeCapabilities → resolveCapabilities). A viewer who cannot manage
// this practice gets notFound(); every surface's mutation re-checks the SAME capability
// in its server action (the admin client bypasses RLS, so these gates are the authority).

export const metadata: Metadata = {
  title: 'Manage practice',
  description: 'Manage your practice: its basics and the danger zone.',
}

export default async function PracticeManagePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const admin = createAdminClient()

  const { data: practice } = await admin
    .from('practices')
    .select('id, title, category, duration_min')
    .eq('id', id)
    .maybeSingle()
  if (!practice) notFound()

  const caps = await getPracticeCapabilities(practice.id)
  const modules = resolveEntityConsole({ kind: 'practice', id: practice.id }, { caps })
  if (modules.length === 0) notFound()

  return (
    <DashboardTemplate
      eyebrow="Manage practice"
      title={practice.title}
      description="Your practice's settings in one place. Changes save as you make them and show up on the practice page."
      back={{ href: `/practices/${practice.id}`, label: 'Back to practice' }}
      width="default"
      stats={
        <>
          <StatCard label="Category" value={practice.category || 'Uncategorized'} />
          <StatCard
            label="Duration"
            value={practice.duration_min ? `${practice.duration_min} min` : '—'}
          />
        </>
      }
    >
      <EntityManageConsole caps={[...caps]} />
    </DashboardTemplate>
  )
}
