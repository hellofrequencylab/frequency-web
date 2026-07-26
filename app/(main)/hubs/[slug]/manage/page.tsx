import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { MessageCircle } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { getHubCapabilities } from '@/lib/core/load-capabilities'
import { resolveEntityConsole } from '@/lib/admin/entity-console'
import { DashboardTemplate } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { EntityManageConsole } from '@/components/admin/modules/entity-manage-console'

// The hub OWNER CONSOLE (ADR-441 EM1-3). The unified `/{entity}/[id]/manage` surface: a
// guide of this hub, a mentor of its parent nexus, or a janitor manages it here, organized
// by the 9-category spine. It renders the SAME module set the standardized rail shows for a
// hub (resolveEntityConsole → appsForScope) via the shared EntityManageConsole — including
// the hub People / Layout / Insights / Danger (archive) modules the thin `ENTITY_SURFACES`
// registry it replaced never surfaced.
//
// SECURITY: a Server Component gated server-side on `hub.manage` via the one resolver
// (getHubCapabilities → resolveCapabilities). A viewer who cannot manage this hub gets
// notFound() — we never reveal the route — and every surface's mutation re-checks the
// SAME capability in its server action (the admin client bypasses RLS, so these gates,
// not RLS, are the authority).

export const metadata: Metadata = {
  title: 'Manage hub',
  description: 'Manage your hub: its basics and the danger zone.',
}

export default async function HubManagePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const admin = createAdminClient()

  const { data: hub } = await admin
    .from('hubs')
    .select('id, name, slug, status')
    .eq('slug', slug)
    .maybeSingle()
  if (!hub) notFound()

  // GATE: resolve what the viewer can do on THIS hub. No manage gate ⇒ the console does
  // not exist for them (notFound, not a redirect — we never reveal the route).
  const caps = await getHubCapabilities(hub.id)
  const modules = resolveEntityConsole({ kind: 'hub', id: hub.slug }, { caps })
  if (modules.length === 0) notFound()

  const statusLabel = hub.status.charAt(0).toUpperCase() + hub.status.slice(1)

  return (
    <DashboardTemplate
      eyebrow="Manage hub"
      title={hub.name}
      description="Your hub's settings in one place. Changes save as you make them and show up on the hub page."
      back={{ href: `/hubs/${hub.slug}`, label: 'Back to hub' }}
      width="default"
      actions={
        // The hub's communication module (CRM Everywhere plan Phase 4 sibling, ADR-827), up
        // front on the primary dashboard. Shown only to viewers who pass the same hub.manage
        // gate the /crm route enforces server-side.
        // NAMING: provisional. "Message Members" is not canon-ruled for hubs yet.
        caps.has('hub.manage') ? (
          <Link
            href={`/hubs/${hub.slug}/crm`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover"
          >
            <MessageCircle className="h-3.5 w-3.5" aria-hidden /> Message Members
          </Link>
        ) : undefined
      }
      stats={<StatCard label="Status" value={statusLabel} />}
    >
      <EntityManageConsole caps={[...caps]} />
    </DashboardTemplate>
  )
}
