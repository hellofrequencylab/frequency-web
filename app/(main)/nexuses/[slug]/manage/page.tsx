import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { MessageCircle } from 'lucide-react'
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
      actions={
        // The nexus's communication module (CRM Everywhere plan Phase 4 sibling, ADR-827), up
        // front on the primary dashboard. Shown only to viewers who pass the same nexus.manage
        // gate the /crm route enforces server-side.
        // NAMING: provisional. "Message Members" is not canon-ruled for nexuses yet.
        caps.has('nexus.manage') ? (
          <Link
            href={`/nexuses/${nexus.slug}/crm`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover"
          >
            <MessageCircle className="h-3.5 w-3.5" aria-hidden /> Message Members
          </Link>
        ) : undefined
      }
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
