import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'
import { getHubCapabilities } from '@/lib/core/load-capabilities'
import { surfacesFor } from '@/lib/admin/entities/registry'
import { DashboardTemplate } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { HubManageConsole } from './console'

// The hub OWNER CONSOLE (ADR-441 EM1-3). The unified `/{entity}/[id]/manage` surface,
// rolled onto hub from the circle template (app/(main)/circles/[slug]/manage/page.tsx):
// a guide of this hub, a mentor of its parent nexus, or a janitor manages it here,
// organized by the 9-category spine. Pass 1 composes Basics from the existing settings
// module; Danger is header-only until hub gets a delete action.
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
  const surfaces = surfacesFor('hub', caps)
  if (surfaces.length === 0) notFound()

  const statusLabel = hub.status.charAt(0).toUpperCase() + hub.status.slice(1)

  return (
    <DashboardTemplate
      eyebrow="Manage hub"
      title={hub.name}
      description="Your hub's settings in one place. Changes save as you make them and show up on the hub page."
      back={{ href: `/hubs/${hub.slug}`, label: 'Back to hub' }}
      width="default"
      stats={<StatCard label="Status" value={statusLabel} />}
    >
      <HubManageConsole surfaces={surfaces} />
    </DashboardTemplate>
  )
}
