import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'
import { getNexusCapabilities } from '@/lib/core/load-capabilities'
import { resolveEntityConsole } from '@/lib/admin/entity-console'
import { DashboardTemplate } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { EntityManageConsole } from '@/components/admin/modules/entity-manage-console'

// The nexus OWNER CONSOLE (ADR-441 EM1-3). The unified `/{entity}/[id]/manage` surface:
// the nexus's mentor (or a janitor) manages it here, organized by the 9-category spine. It
// renders the SAME module set the standardized rail shows for a nexus (resolveEntityConsole
// → appsForScope) via the shared EntityManageConsole — including the nexus People / Layout
// / Insights / Danger (archive) modules the thin `ENTITY_SURFACES` registry never surfaced.
//
// SECURITY: a Server Component gated server-side on `nexus.manage` via the one resolver
// (getNexusCapabilities → resolveCapabilities). A viewer who cannot manage this nexus
// gets notFound(); every surface's mutation re-checks the SAME capability in its server
// action (the admin client bypasses RLS, so these gates — not RLS — are the authority).

export const metadata: Metadata = {
  title: 'Manage nexus',
  description: 'Manage your nexus: its basics and the danger zone.',
}

export default async function NexusManagePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const admin = createAdminClient()

  const { data: nexus } = await admin
    .from('nexuses')
    .select('id, name, slug, member_cap, status')
    .eq('slug', slug)
    .maybeSingle()
  if (!nexus) notFound()

  const caps = await getNexusCapabilities(nexus.id)
  const modules = resolveEntityConsole({ kind: 'nexus', id: nexus.slug }, { caps })
  if (modules.length === 0) notFound()

  const statusLabel = nexus.status.charAt(0).toUpperCase() + nexus.status.slice(1)

  return (
    <DashboardTemplate
      eyebrow="Manage nexus"
      title={nexus.name}
      description="Your nexus's settings in one place. Changes save as you make them and show up on the nexus page."
      back={{ href: `/nexuses/${nexus.slug}`, label: 'Back to nexus' }}
      width="default"
      stats={
        <>
          <StatCard label="Member cap" value={String(nexus.member_cap ?? '—')} />
          <StatCard label="Status" value={statusLabel} />
        </>
      }
    >
      <EntityManageConsole caps={[...caps]} />
    </DashboardTemplate>
  )
}
