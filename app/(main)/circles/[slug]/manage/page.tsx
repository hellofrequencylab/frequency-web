import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCircleCapabilities } from '@/lib/core/load-capabilities'
import { resolveEntityConsole } from '@/lib/admin/entity-console'
import { DashboardTemplate } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { EntityManageConsole } from '@/components/admin/modules/entity-manage-console'

// The circle OWNER CONSOLE (ADR-441 EM1-2). The unified `/{entity}/[id]/manage` Dashboard
// surface: a host (or a guide/mentor who leads the parent hub/nexus, or staff) manages
// their circle here, organized by the 9-category spine. It renders the SAME module set the
// standardized rail shows for a circle (resolveEntityConsole → appsForScope) via the shared
// EntityManageConsole — the thin two-row `ENTITY_SURFACES` registry it used to compose
// (Basics + Danger only) is retired, so the console no longer lags the rail.
//
// SECURITY: this is a Server Component, gated server-side on `circle.editSettings` via
// the one capability resolver (getCircleCapabilities → resolveCapabilities). A viewer
// who cannot manage this circle gets notFound() — no admin client read is exposed to
// them, and every surface's mutation re-checks the SAME capability in its server action
// (the admin client bypasses RLS, so these gates — not RLS — are the authority).

export const metadata: Metadata = {
  title: 'Manage circle',
  description: 'Manage your circle: its basics and the danger zone.',
}

export default async function CircleManagePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const admin = createAdminClient()

  // Resolve the circle by slug (same loader shape as the detail page; archived circles
  // are not manageable here).
  const { data: circle } = await admin
    .from('circles')
    .select('id, name, slug, member_count, member_cap, status')
    .eq('slug', slug)
    .neq('status', 'archived')
    .maybeSingle()
  if (!circle) notFound()

  // GATE: resolve what the viewer can do on THIS circle. No manage module ⇒ the console
  // does not exist for them (notFound, not a redirect — we never reveal the route). The
  // gate resolves the SAME module set the console renders (resolveEntityConsole), so
  // "reaches the console" and "sees at least one module" can never disagree.
  const caps = await getCircleCapabilities(circle.id)
  const modules = resolveEntityConsole({ kind: 'circle', id: circle.slug }, { caps })
  if (modules.length === 0) notFound()

  const cap = circle.member_cap || 0
  const pct = cap > 0 ? Math.min(100, Math.round((circle.member_count / cap) * 100)) : 0
  const statusLabel = circle.status.charAt(0).toUpperCase() + circle.status.slice(1)

  return (
    <DashboardTemplate
      eyebrow="Manage circle"
      title={circle.name}
      description="Your circle's settings in one place. Changes save as you make them and show up on the circle page."
      back={{ href: `/circles/${circle.slug}`, label: 'Back to circle' }}
      width="default"
      stats={
        <>
          <StatCard label="Members" value={`${circle.member_count} of ${cap}`} />
          <StatCard label="Capacity" value={`${pct}%`} />
          <StatCard label="Status" value={statusLabel} />
        </>
      }
    >
      <EntityManageConsole caps={[...caps]} />
    </DashboardTemplate>
  )
}
